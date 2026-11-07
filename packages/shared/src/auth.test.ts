import { describe, expect, it } from 'vitest';
import {
  PERMISSIONS,
  ROLES,
  changePasswordSchema,
  hasPermission,
  loginSchema,
  permissionsFor,
  userUpdateSchema,
} from './index';

describe('permissions', () => {
  it('org admin has every permission', () => {
    expect(permissionsFor('ORG_ADMIN').sort()).toEqual([...PERMISSIONS].sort());
  });

  it('only org admins can manage users', () => {
    const managers = ROLES.filter((r) => hasPermission(r, 'users:manage'));
    expect(managers).toEqual(['ORG_ADMIN']);
  });

  it('every role except viewer can report faults', () => {
    for (const role of ROLES) {
      expect(hasPermission(role, 'faults:report')).toBe(role !== 'VIEWER');
    }
  });

  it('clinical users cannot change assets', () => {
    expect(hasPermission('CLINICAL_USER', 'assets:write')).toBe(false);
  });
});

describe('auth schemas', () => {
  it('normalizes login organization and email', () => {
    const parsed = loginSchema.parse({
      organization: ' Demo-Hospital ',
      email: ' Admin@Demo.Local ',
      password: 'x',
    });
    expect(parsed.organization).toBe('demo-hospital');
    expect(parsed.email).toBe('admin@demo.local');
  });

  it('rejects short new passwords and unchanged passwords', () => {
    expect(() =>
      changePasswordSchema.parse({ currentPassword: 'old-password', newPassword: 'short' }),
    ).toThrow();
    expect(() =>
      changePasswordSchema.parse({
        currentPassword: 'same-password',
        newPassword: 'same-password',
      }),
    ).toThrow();
  });

  it('rejects empty user updates', () => {
    expect(() => userUpdateSchema.parse({})).toThrow();
  });
});
