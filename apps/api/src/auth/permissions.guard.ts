import {
  ForbiddenException,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { hasPermission, type Permission } from '@medequip/shared';
import type { AppRequest } from '../common/request';
import { PERMISSIONS_KEY } from './decorators';

/** Global guard: enforces @RequirePermissions(...) using the role → permission map. */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Permission[] | undefined>(PERMISSIONS_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!required?.length) return true;

    const user = ctx.switchToHttp().getRequest<AppRequest>().user;
    const missing = user ? required.filter((p) => !hasPermission(user.role, p)) : required;
    if (missing.length) {
      throw new ForbiddenException({
        code: 'MISSING_PERMISSION',
        message: 'You do not have permission to do this',
        missing,
      });
    }
    return true;
  }
}
