import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import type { AppRequest } from '../common/request';
import { ALLOW_PENDING_PASSWORD_KEY, IS_PUBLIC_KEY } from './decorators';
import type { AccessTokenPayload } from './auth.service';

/**
 * Global guard: every route requires a valid access token unless marked @Public().
 *
 * Besides checking the JWT signature, it loads the session and user on every request, so:
 * - logout / revoked sessions take effect immediately,
 * - disabled or removed users lose access immediately,
 * - role changes apply immediately (role is read from the database, not the token).
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) return true;

    const req = ctx.switchToHttp().getRequest<AppRequest>();
    const token = bearerToken(req.headers.authorization);
    if (!token) throw unauthorized('Missing access token');

    let payload: AccessTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<AccessTokenPayload>(token);
    } catch {
      throw unauthorized('Invalid or expired access token');
    }

    const session = await this.prisma.session.findUnique({
      where: { id: payload.sid },
      include: { user: true },
    });
    const user = session?.user;
    if (
      !session ||
      !user ||
      session.revokedAt ||
      session.expiresAt <= new Date() ||
      session.userId !== payload.sub ||
      user.status !== 'ACTIVE' ||
      user.deletedAt
    ) {
      throw unauthorized('Session is no longer valid');
    }

    req.user = {
      userId: user.id,
      organizationId: user.organizationId,
      sessionId: session.id,
      role: user.role,
      mustChangePassword: user.mustChangePassword,
    };

    if (
      user.mustChangePassword &&
      !this.reflector.getAllAndOverride<boolean>(ALLOW_PENDING_PASSWORD_KEY, targets)
    ) {
      throw new ForbiddenException({
        code: 'PASSWORD_CHANGE_REQUIRED',
        message: 'You must change your password before continuing',
      });
    }
    return true;
  }
}

function bearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const [scheme, value] = header.split(' ');
  return scheme?.toLowerCase() === 'bearer' && value ? value : null;
}

function unauthorized(message: string) {
  return new UnauthorizedException({ code: 'UNAUTHENTICATED', message });
}
