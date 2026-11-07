import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'node:crypto';
import {
  DUMMY_PASSWORD_HASH,
  hashPassword,
  verifyPassword,
  type Organization,
  type User,
} from '@medequip/db';
import {
  permissionsFor,
  type AuthResponse,
  type AuthUser,
  type ChangePasswordInput,
  type LoginInput,
} from '@medequip/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { ClientMeta, RequestUser } from '../common/request';

export interface AccessTokenPayload {
  sub: string; // user id
  org: string; // organization id
  sid: string; // session id
}

export interface IssuedSession {
  response: AuthResponse;
  refreshToken: string;
  refreshExpiresAt: Date;
}

export const MAX_FAILED_LOGINS = 5;
export const LOCKOUT_MINUTES = 15;
/** Two browser tabs refreshing at the same moment is normal - not token theft. */
export const REFRESH_RACE_GRACE_MS = 30_000;

const INVALID_CREDENTIALS = () =>
  new UnauthorizedException({
    code: 'INVALID_CREDENTIALS',
    message: 'Invalid organization, email or password',
  });

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

@Injectable()
export class AuthService {
  private readonly accessTtlSeconds: number;
  private readonly refreshTtlDays: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
    config: ConfigService,
  ) {
    this.accessTtlSeconds = Number(config.get('ACCESS_TOKEN_TTL_SECONDS') ?? 900);
    this.refreshTtlDays = Number(config.get('REFRESH_TOKEN_TTL_DAYS') ?? 14);
  }

  async login(input: LoginInput, meta: ClientMeta): Promise<IssuedSession> {
    const org = await this.prisma.organization.findFirst({
      where: { slug: input.organization, deletedAt: null },
    });
    const user = org
      ? await this.prisma.user.findFirst({
          where: { organizationId: org.id, email: input.email, deletedAt: null },
        })
      : null;

    // Always run a hash comparison so response time does not reveal whether the user exists.
    const passwordOk = await verifyPassword(
      input.password,
      user?.passwordHash ?? DUMMY_PASSWORD_HASH,
    );
    const now = new Date();
    const locked = !!user?.lockedUntil && user.lockedUntil > now;

    if (!org || !user || !user.passwordHash || !passwordOk || locked || user.status !== 'ACTIVE') {
      if (org && user) await this.recordFailedLogin(user, passwordOk, locked, meta);
      throw INVALID_CREDENTIALS();
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: now },
    });
    const issued = await this.createSession(user, org, meta);
    await this.audit.log({
      organizationId: org.id,
      userId: user.id,
      entity: 'User',
      entityId: user.id,
      action: 'LOGIN',
      meta,
    });
    return issued;
  }

  async refresh(refreshToken: string | undefined, meta: ClientMeta): Promise<IssuedSession> {
    if (!refreshToken) throw this.refreshError('NO_REFRESH_TOKEN');
    const hash = hashToken(refreshToken);
    const now = new Date();

    const session = await this.prisma.session.findUnique({
      where: { tokenHash: hash },
      include: { user: { include: { organization: true } } },
    });

    if (!session) {
      // Not the current token. Was it a previous (already rotated) one?
      const previous = await this.prisma.session.findFirst({ where: { previousTokenHash: hash } });
      if (previous && !previous.revokedAt) {
        const rotatedAgo = now.getTime() - (previous.rotatedAt?.getTime() ?? 0);
        if (rotatedAgo < REFRESH_RACE_GRACE_MS) throw this.refreshError('REFRESH_RACE');
        // An old refresh token is being replayed: likely stolen. Kill the session.
        await this.prisma.session.update({ where: { id: previous.id }, data: { revokedAt: now } });
        await this.audit.log({
          organizationId: previous.organizationId,
          userId: previous.userId,
          entity: 'Session',
          entityId: previous.id,
          action: 'LOGOUT',
          after: { reason: 'refresh_token_reuse_detected' },
          meta,
        });
      }
      throw this.refreshError('INVALID_REFRESH_TOKEN');
    }

    const { user } = session;
    if (
      session.revokedAt ||
      session.expiresAt <= now ||
      user.status !== 'ACTIVE' ||
      user.deletedAt
    ) {
      throw this.refreshError('INVALID_REFRESH_TOKEN');
    }

    // Rotate: the presented token becomes "previous"; a new one is issued.
    const newToken = randomBytes(32).toString('base64url');
    const rotated = await this.prisma.session.updateMany({
      where: { id: session.id, tokenHash: hash, revokedAt: null },
      data: {
        tokenHash: hashToken(newToken),
        previousTokenHash: hash,
        rotatedAt: now,
        lastUsedAt: now,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      },
    });
    if (rotated.count !== 1) throw this.refreshError('REFRESH_RACE');

    return {
      response: await this.buildResponse(user, user.organization, session.id),
      refreshToken: newToken,
      refreshExpiresAt: session.expiresAt,
    };
  }

  /** Revokes the session that owns this refresh token. Safe to call with no/unknown token. */
  async logout(refreshToken: string | undefined, meta: ClientMeta): Promise<void> {
    if (!refreshToken) return;
    const session = await this.prisma.session.findUnique({
      where: { tokenHash: hashToken(refreshToken) },
    });
    if (!session || session.revokedAt) return;
    await this.prisma.session.update({
      where: { id: session.id },
      data: { revokedAt: new Date() },
    });
    await this.audit.log({
      organizationId: session.organizationId,
      userId: session.userId,
      entity: 'Session',
      entityId: session.id,
      action: 'LOGOUT',
      meta,
    });
  }

  async me(userId: string): Promise<AuthUser> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { organization: true },
    });
    return toAuthUser(user, user.organization);
  }

  async changePassword(
    actor: RequestUser,
    input: ChangePasswordInput,
    meta: ClientMeta,
  ): Promise<AuthUser> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: actor.userId } });
    const ok =
      !!user.passwordHash && (await verifyPassword(input.currentPassword, user.passwordHash));
    if (!ok) {
      throw new BadRequestException({
        code: 'WRONG_PASSWORD',
        message: 'Current password is incorrect',
      });
    }

    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: {
          passwordHash: await hashPassword(input.newPassword),
          mustChangePassword: false,
          passwordChangedAt: now,
          version: { increment: 1 },
        },
      });
      // Sign out every other device; keep the current session.
      await tx.session.updateMany({
        where: { userId: user.id, revokedAt: null, id: { not: actor.sessionId } },
        data: { revokedAt: now },
      });
      await this.audit.log(
        {
          organizationId: user.organizationId,
          userId: user.id,
          entity: 'User',
          entityId: user.id,
          action: 'PASSWORD_CHANGE',
          meta,
        },
        tx,
      );
    });
    return this.me(user.id);
  }

  private async createSession(
    user: User,
    org: Organization,
    meta: ClientMeta,
  ): Promise<IssuedSession> {
    const refreshToken = randomBytes(32).toString('base64url');
    const refreshExpiresAt = new Date(Date.now() + this.refreshTtlDays * 24 * 60 * 60 * 1000);
    const session = await this.prisma.session.create({
      data: {
        organizationId: org.id,
        userId: user.id,
        tokenHash: hashToken(refreshToken),
        expiresAt: refreshExpiresAt,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      },
    });
    return {
      response: await this.buildResponse(user, org, session.id),
      refreshToken,
      refreshExpiresAt,
    };
  }

  private async buildResponse(user: User, org: Organization, sid: string): Promise<AuthResponse> {
    const payload: AccessTokenPayload = { sub: user.id, org: org.id, sid };
    return {
      accessToken: await this.jwt.signAsync(payload, { expiresIn: this.accessTtlSeconds }),
      expiresIn: this.accessTtlSeconds,
      user: toAuthUser(user, org),
    };
  }

  private async recordFailedLogin(
    user: User,
    passwordOk: boolean,
    locked: boolean,
    meta: ClientMeta,
  ): Promise<void> {
    let reason = 'wrong_password';
    if (locked) reason = 'account_locked';
    else if (user.status !== 'ACTIVE') reason = 'user_not_active';
    else if (!user.passwordHash) reason = 'no_password_set';

    if (!locked && !passwordOk) {
      const updated = await this.prisma.user.update({
        where: { id: user.id },
        data: { failedLoginCount: { increment: 1 } },
      });
      if (updated.failedLoginCount >= MAX_FAILED_LOGINS) {
        await this.prisma.user.update({
          where: { id: user.id },
          data: {
            failedLoginCount: 0,
            lockedUntil: new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000),
          },
        });
        reason = 'locked_after_failed_attempts';
      }
    }

    await this.audit.log({
      organizationId: user.organizationId,
      userId: user.id,
      entity: 'User',
      entityId: user.id,
      action: 'LOGIN_FAILED',
      after: { reason },
      meta,
    });
  }

  private refreshError(code: string) {
    return new UnauthorizedException({ code, message: 'Please sign in again' });
  }
}

export function toAuthUser(user: User, org: Organization): AuthUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    permissions: permissionsFor(user.role),
    mustChangePassword: user.mustChangePassword,
    organization: { id: org.id, name: org.name, slug: org.slug, status: org.status },
  };
}
