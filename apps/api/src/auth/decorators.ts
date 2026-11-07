import { SetMetadata, createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Permission } from '@medequip/shared';
import type { AppRequest, RequestUser } from '../common/request';

export const IS_PUBLIC_KEY = 'auth:isPublic';
export const ALLOW_PENDING_PASSWORD_KEY = 'auth:allowPendingPassword';
export const PERMISSIONS_KEY = 'auth:permissions';

/** Route does not require login (health checks, login, refresh, logout). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** Route stays usable while the user still has to change their password. */
export const AllowPendingPasswordChange = () => SetMetadata(ALLOW_PENDING_PASSWORD_KEY, true);

/** Route requires ALL of these permissions (see ROLE_PERMISSIONS in @medequip/shared). */
export const RequirePermissions = (...permissions: Permission[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

/** Injects the authenticated user. */
export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): RequestUser => {
    const req = ctx.switchToHttp().getRequest<AppRequest>();
    if (!req.user) throw new Error('CurrentUser used on a route without authentication');
    return req.user;
  },
);
