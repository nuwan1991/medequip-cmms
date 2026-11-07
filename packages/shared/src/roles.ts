/**
 * User roles within an organization (tenant).
 * Keep in sync with the `Role` enum in packages/db/prisma/schema.prisma.
 */
export const ROLES = [
  'ORG_ADMIN', // manages organization, sites, users, billing
  'BIOMED_ENGINEER', // full equipment management
  'TECHNICIAN', // executes work orders, PM, tests
  'DEPT_HEAD', // views department equipment, approves requests
  'CLINICAL_USER', // reports faults, views own department equipment
  'VIEWER', // read-only (management, auditors)
] as const;

export type Role = (typeof ROLES)[number];
