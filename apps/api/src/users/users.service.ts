import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { hashPassword, Prisma, type User } from '@medequip/db';
import type {
  PasswordResetInput,
  UserCreateInput,
  UserDto,
  UserUpdateInput,
} from '@medequip/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { EntitlementsService } from '../entitlements/entitlements.service';
import type { ClientMeta, RequestUser } from '../common/request';

/** Users that count toward the plan's maxUsers limit. */
const countsTowardLimit = (organizationId: string): Prisma.UserWhereInput => ({
  organizationId,
  deletedAt: null,
  status: { not: 'DISABLED' },
});

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly entitlements: EntitlementsService,
  ) {}

  async list(actor: RequestUser): Promise<UserDto[]> {
    const users = await this.prisma.user.findMany({
      where: { organizationId: actor.organizationId, deletedAt: null },
      orderBy: [{ name: 'asc' }],
    });
    return users.map(toUserDto);
  }

  async create(actor: RequestUser, input: UserCreateInput, meta: ClientMeta): Promise<UserDto> {
    await this.assertSeatAvailable(actor.organizationId);

    const existing = await this.prisma.user.findUnique({
      where: { organizationId_email: { organizationId: actor.organizationId, email: input.email } },
    });
    if (existing) {
      throw new ConflictException({
        code: 'EMAIL_EXISTS',
        message: existing.deletedAt
          ? 'A removed user with this email exists. Contact support to restore it.'
          : 'A user with this email already exists',
      });
    }

    const passwordHash = await hashPassword(input.password);
    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          organizationId: actor.organizationId,
          email: input.email,
          name: input.name,
          role: input.role,
          status: 'ACTIVE',
          passwordHash,
          mustChangePassword: true,
        },
      });
      await this.audit.log(
        {
          organizationId: actor.organizationId,
          userId: actor.userId,
          entity: 'User',
          entityId: created.id,
          action: 'CREATE',
          after: toUserDto(created),
          meta,
        },
        tx,
      );
      return created;
    });
    return toUserDto(user);
  }

  async update(
    actor: RequestUser,
    id: string,
    input: UserUpdateInput,
    meta: ClientMeta,
  ): Promise<UserDto> {
    const user = await this.findInOrg(actor, id);

    const roleChanges = input.role !== undefined && input.role !== user.role;
    const statusChanges = input.status !== undefined && input.status !== user.status;
    if (id === actor.userId && (roleChanges || statusChanges)) {
      throw new BadRequestException({
        code: 'CANNOT_CHANGE_OWN_ACCESS',
        message: 'You cannot change your own role or status. Ask another admin.',
      });
    }

    const losesAdmin =
      user.role === 'ORG_ADMIN' &&
      user.status === 'ACTIVE' &&
      ((roleChanges && input.role !== 'ORG_ADMIN') || input.status === 'DISABLED');
    if (losesAdmin) await this.assertAnotherAdmin(actor.organizationId, user.id);

    if (user.status === 'DISABLED' && input.status === 'ACTIVE') {
      await this.assertSeatAvailable(actor.organizationId);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.user.update({
        where: { id: user.id },
        data: { ...input, version: { increment: 1 } },
      });
      if (input.status === 'DISABLED') await this.revokeSessions(tx, user.id);
      await this.audit.log(
        {
          organizationId: actor.organizationId,
          userId: actor.userId,
          entity: 'User',
          entityId: user.id,
          action: 'UPDATE',
          before: toUserDto(user),
          after: toUserDto(row),
          meta,
        },
        tx,
      );
      return row;
    });
    return toUserDto(updated);
  }

  /** Soft delete: the user disappears from lists and cannot sign in; history is kept. */
  async remove(actor: RequestUser, id: string, meta: ClientMeta): Promise<void> {
    const user = await this.findInOrg(actor, id);
    if (id === actor.userId) {
      throw new BadRequestException({
        code: 'CANNOT_REMOVE_SELF',
        message: 'You cannot remove your own account',
      });
    }
    if (user.role === 'ORG_ADMIN' && user.status === 'ACTIVE') {
      await this.assertAnotherAdmin(actor.organizationId, user.id);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: { status: 'DISABLED', deletedAt: new Date(), version: { increment: 1 } },
      });
      await this.revokeSessions(tx, user.id);
      await this.audit.log(
        {
          organizationId: actor.organizationId,
          userId: actor.userId,
          entity: 'User',
          entityId: user.id,
          action: 'DELETE',
          before: toUserDto(user),
          meta,
        },
        tx,
      );
    });
  }

  /** Admin sets a temporary password; the user must change it at next sign-in. */
  async resetPassword(
    actor: RequestUser,
    id: string,
    input: PasswordResetInput,
    meta: ClientMeta,
  ): Promise<void> {
    const user = await this.findInOrg(actor, id);
    const passwordHash = await hashPassword(input.password);

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: {
          passwordHash,
          mustChangePassword: true,
          failedLoginCount: 0,
          lockedUntil: null,
          version: { increment: 1 },
        },
      });
      await this.revokeSessions(tx, user.id);
      await this.audit.log(
        {
          organizationId: actor.organizationId,
          userId: actor.userId,
          entity: 'User',
          entityId: user.id,
          action: 'UPDATE',
          after: { passwordReset: true },
          meta,
        },
        tx,
      );
    });
  }

  private async findInOrg(actor: RequestUser, id: string): Promise<User> {
    const user = await this.prisma.user.findFirst({
      where: { id, organizationId: actor.organizationId, deletedAt: null },
    });
    if (!user) throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'User not found' });
    return user;
  }

  private async assertSeatAvailable(organizationId: string): Promise<void> {
    const ctx = await this.entitlements.forOrganization(organizationId);
    const count = await this.prisma.user.count({ where: countsTowardLimit(organizationId) });
    this.entitlements.assertWithinLimit(ctx, 'maxUsers', count);
  }

  private async assertAnotherAdmin(organizationId: string, excludeUserId: string): Promise<void> {
    const others = await this.prisma.user.count({
      where: {
        organizationId,
        role: 'ORG_ADMIN',
        status: 'ACTIVE',
        deletedAt: null,
        id: { not: excludeUserId },
      },
    });
    if (others === 0) {
      throw new BadRequestException({
        code: 'LAST_ADMIN',
        message: 'The organization must keep at least one active admin',
      });
    }
  }

  private revokeSessions(tx: Prisma.TransactionClient, userId: string) {
    return tx.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}

export function toUserDto(user: User): UserDto {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    status: user.status,
    mustChangePassword: user.mustChangePassword,
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
  };
}
