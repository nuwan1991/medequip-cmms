import type { Request } from 'express';
import type { Role } from '@medequip/shared';

/** The authenticated user attached to each request by JwtAuthGuard. */
export interface RequestUser {
  userId: string;
  organizationId: string;
  sessionId: string;
  role: Role;
  mustChangePassword: boolean;
}

export type AppRequest = Request & { user?: RequestUser };

/** Client details stored on sessions and audit records. */
export interface ClientMeta {
  ipAddress?: string;
  userAgent?: string;
}

export function clientMeta(req: Request): ClientMeta {
  return {
    ipAddress: req.ip,
    userAgent: req.headers['user-agent']?.slice(0, 255),
  };
}
