import type { Role } from './roles';

/**
 * Fine-grained permissions. API endpoints require permissions (not roles), so roles can
 * be adjusted here without touching controllers. The web app uses the same map to
 * show/hide menus and buttons (the API is still the real enforcement point).
 */
export const PERMISSIONS = [
  'org:manage',
  'billing:manage',
  'settings:manage',
  'users:read',
  'users:manage',
  'audit:read',
  'assets:read',
  'assets:write',
  'workorders:read',
  'workorders:write',
  'workorders:execute',
  'faults:report',
  'reports:view',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  ORG_ADMIN: PERMISSIONS,
  BIOMED_ENGINEER: [
    'users:read',
    'audit:read',
    'assets:read',
    'assets:write',
    'workorders:read',
    'workorders:write',
    'workorders:execute',
    'faults:report',
    'reports:view',
  ],
  TECHNICIAN: ['assets:read', 'workorders:read', 'workorders:execute', 'faults:report'],
  DEPT_HEAD: ['assets:read', 'workorders:read', 'faults:report', 'reports:view'],
  CLINICAL_USER: ['assets:read', 'faults:report'],
  VIEWER: ['assets:read', 'workorders:read', 'reports:view'],
};

export function permissionsFor(role: Role): Permission[] {
  return [...ROLE_PERMISSIONS[role]];
}

export function hasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

/** Human-readable role labels for the UI. */
export const ROLE_LABELS: Record<Role, string> = {
  ORG_ADMIN: 'Organization admin',
  BIOMED_ENGINEER: 'Biomedical engineer',
  TECHNICIAN: 'Technician',
  DEPT_HEAD: 'Department head',
  CLINICAL_USER: 'Clinical user',
  VIEWER: 'Viewer (read-only)',
};
