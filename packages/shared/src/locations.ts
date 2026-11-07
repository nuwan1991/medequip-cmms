import { z } from 'zod';

const blankToUndefined = (v: unknown) => (v === '' ? undefined : v);
const blankToNull = (v: unknown) => (v === '' ? null : v);

// ---------------------------------------------------------------------------
// Sites (hospitals / campuses of an organization)
// ---------------------------------------------------------------------------
export const siteCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .min(1)
  .max(16)
  .regex(/^[A-Z0-9-]+$/, 'Use letters, numbers and - only');

export const siteCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  code: siteCodeSchema,
  address: z.preprocess(blankToUndefined, z.string().trim().max(500).optional()),
  timezone: z.preprocess(blankToUndefined, z.string().trim().max(64).optional()),
});
export type SiteCreateInput = z.infer<typeof siteCreateSchema>;

export const siteUpdateSchema = siteCreateSchema
  .partial()
  .refine((d) => Object.keys(d).length > 0, { message: 'Nothing to update' });
export type SiteUpdateInput = z.infer<typeof siteUpdateSchema>;

export interface SiteDto {
  id: string;
  name: string;
  code: string;
  address: string | null;
  timezone: string;
}

// ---------------------------------------------------------------------------
// Locations: building → floor → department → room (any nesting), plus stores
// ---------------------------------------------------------------------------
/** Keep in sync with the `LocationType` enum in packages/db/prisma/schema.prisma. */
export const LOCATION_TYPES = ['BUILDING', 'FLOOR', 'DEPARTMENT', 'ROOM', 'STORE'] as const;
export type LocationType = (typeof LOCATION_TYPES)[number];

export const LOCATION_TYPE_LABELS: Record<LocationType, string> = {
  BUILDING: 'Building',
  FLOOR: 'Floor',
  DEPARTMENT: 'Department',
  ROOM: 'Room',
  STORE: 'Store',
};

export const locationCreateSchema = z.object({
  siteId: z.string().uuid(),
  parentId: z.preprocess(blankToUndefined, z.string().uuid().optional()),
  type: z.enum(LOCATION_TYPES),
  name: z.string().trim().min(1).max(120),
  code: z.preprocess(blankToUndefined, z.string().trim().max(32).optional()),
});
export type LocationCreateInput = z.infer<typeof locationCreateSchema>;

export const locationUpdateSchema = z
  .object({
    parentId: z.preprocess(blankToNull, z.string().uuid().nullable().optional()),
    type: z.enum(LOCATION_TYPES).optional(),
    name: z.string().trim().min(1).max(120).optional(),
    code: z.preprocess(blankToNull, z.string().trim().max(32).nullable().optional()),
  })
  .refine((d) => Object.keys(d).length > 0, { message: 'Nothing to update' });
export type LocationUpdateInput = z.infer<typeof locationUpdateSchema>;

export interface LocationDto {
  id: string;
  siteId: string;
  parentId: string | null;
  type: LocationType;
  name: string;
  code: string | null;
  /** Full path, e.g. "Main Building › Floor 2 › ICU". */
  path: string;
  depth: number;
}

/** Builds display paths for a flat list of locations (parents may appear in any order). */
export function withLocationPaths<T extends { id: string; parentId: string | null; name: string }>(
  rows: T[],
): (T & { path: string; depth: number })[] {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const resolve = (row: T): { path: string; depth: number } => {
    const names: string[] = [];
    const seen = new Set<string>();
    let current: T | undefined = row;
    while (current && !seen.has(current.id)) {
      seen.add(current.id);
      names.unshift(current.name);
      current = current.parentId ? byId.get(current.parentId) : undefined;
    }
    return { path: names.join(' › '), depth: names.length - 1 };
  };
  return rows.map((r) => ({ ...r, ...resolve(r) })).sort((a, b) => a.path.localeCompare(b.path));
}
