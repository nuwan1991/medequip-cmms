import { z } from 'zod';
import { ROLES, type Role } from './roles';
import type { Permission } from './permissions';

/** Keep in sync with the `UserStatus` enum in packages/db/prisma/schema.prisma. */
export const USER_STATUSES = ['INVITED', 'ACTIVE', 'DISABLED'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

/** Length-based password policy (NIST SP 800-63B style). */
export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;
export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters`)
  .max(PASSWORD_MAX_LENGTH);

const emailSchema = z.string().trim().toLowerCase().email().max(254);

export const loginSchema = z.object({
  /** Organization "workspace" slug, e.g. "demo-hospital". */
  organization: z.string().trim().toLowerCase().min(1).max(64),
  email: emailSchema,
  password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1).max(PASSWORD_MAX_LENGTH),
    newPassword: passwordSchema,
  })
  .refine((d) => d.currentPassword !== d.newPassword, {
    message: 'New password must be different from the current password',
    path: ['newPassword'],
  });
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export const userCreateSchema = z.object({
  email: emailSchema,
  name: z.string().trim().min(1).max(120),
  role: z.enum(ROLES),
  /** Initial password set by the admin; the user must change it at first login. */
  password: passwordSchema,
});
export type UserCreateInput = z.infer<typeof userCreateSchema>;

export const userUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    role: z.enum(ROLES).optional(),
    status: z.enum(['ACTIVE', 'DISABLED']).optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: 'Nothing to update' });
export type UserUpdateInput = z.infer<typeof userUpdateSchema>;

export const passwordResetSchema = z.object({ password: passwordSchema });
export type PasswordResetInput = z.infer<typeof passwordResetSchema>;

/** The signed-in user as returned by /api/auth/login, /refresh and /me. */
export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  permissions: Permission[];
  mustChangePassword: boolean;
  organization: { id: string; name: string; slug: string; status: string };
}

export interface AuthResponse {
  accessToken: string;
  /** Access token lifetime in seconds. */
  expiresIn: number;
  user: AuthUser;
}

/** User row as returned by the users API (never includes password data). */
export interface UserDto {
  id: string;
  email: string;
  name: string;
  role: Role;
  status: UserStatus;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}
