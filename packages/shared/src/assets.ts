import { z } from 'zod';

/** Keep in sync with the `AssetStatus` enum in packages/db/prisma/schema.prisma. */
export const ASSET_STATUSES = [
  'IN_SERVICE',
  'UNDER_MAINTENANCE',
  'OUT_OF_SERVICE',
  'QUARANTINED', // failed safety/performance test - must not be used on patients
  'CONDEMNED',
  'DISPOSED',
] as const;
export type AssetStatus = (typeof ASSET_STATUSES)[number];

export const ASSET_STATUS_LABELS: Record<AssetStatus, string> = {
  IN_SERVICE: 'In service',
  UNDER_MAINTENANCE: 'Under maintenance',
  OUT_OF_SERVICE: 'Out of service',
  QUARANTINED: 'Quarantined',
  CONDEMNED: 'Condemned',
  DISPOSED: 'Disposed',
};

/** Disposed assets no longer count toward the plan's asset limit. */
export const STATUSES_NOT_COUNTED: readonly AssetStatus[] = ['DISPOSED'];

/** Keep in sync with the `RiskLevel` enum in packages/db/prisma/schema.prisma. */
export const RISK_LEVELS = ['LOW', 'MEDIUM', 'HIGH', 'LIFE_SUPPORT'] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

export const RISK_LEVEL_LABELS: Record<RiskLevel, string> = {
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
  LIFE_SUPPORT: 'Life support',
};

// ---------------------------------------------------------------------------
// Field helpers: forms send '' for empty inputs.
// ---------------------------------------------------------------------------
const blankToUndefined = (v: unknown) => (v === '' ? undefined : v);
const blankToNull = (v: unknown) => (v === '' ? null : v);

const text = (max: number) => z.preprocess(blankToUndefined, z.string().trim().max(max).optional());
const textOrNull = (max: number) =>
  z.preprocess(blankToNull, z.string().trim().max(max).nullable().optional());
const date = () => z.preprocess(blankToUndefined, z.coerce.date().optional());
const dateOrNull = () => z.preprocess(blankToNull, z.coerce.date().nullable().optional());
const money = z.coerce.number().nonnegative().max(1_000_000_000_000).multipleOf(0.01);
const uuidOrNull = z.preprocess(blankToNull, z.string().uuid().nullable().optional());

/** Asset tags: letters, digits, dash, dot, slash, underscore (printed on QR labels). */
export const assetTagSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9._/-]+$/, 'Use letters, numbers and - . / _ only');

/** Input for creating an asset (validated in API and web forms). */
export const assetCreateSchema = z.object({
  siteId: z.string().uuid(),
  locationId: z.preprocess(blankToUndefined, z.string().uuid().optional()),
  modelId: z.string().uuid(),
  assetTag: assetTagSchema,
  serialNumber: text(128),
  udi: text(255),
  status: z.enum(ASSET_STATUSES).default('IN_SERVICE'),
  /** Defaults to the device model's risk level when omitted. */
  riskLevel: z.preprocess(blankToUndefined, z.enum(RISK_LEVELS).optional()),
  purchaseDate: date(),
  purchaseCost: z.preprocess(blankToUndefined, money.optional()),
  warrantyEndsAt: date(),
  commissionedAt: date(),
  notes: text(4000),
});
export type AssetCreateInput = z.infer<typeof assetCreateSchema>;

/**
 * Update: send only changed fields plus the `version` you loaded (optimistic locking -
 * if someone else saved in between, the API answers 409 and nothing is overwritten).
 * Send null (or '') to clear an optional field.
 */
export const assetUpdateSchema = z
  .object({
    version: z.number().int().positive(),
    siteId: z.string().uuid().optional(),
    locationId: uuidOrNull,
    modelId: z.string().uuid().optional(),
    assetTag: assetTagSchema.optional(),
    serialNumber: textOrNull(128),
    udi: textOrNull(255),
    status: z.enum(ASSET_STATUSES).optional(),
    riskLevel: z.enum(RISK_LEVELS).optional(),
    purchaseDate: dateOrNull(),
    purchaseCost: z.preprocess(blankToNull, money.nullable().optional()),
    warrantyEndsAt: dateOrNull(),
    commissionedAt: dateOrNull(),
    notes: textOrNull(4000),
  })
  .refine((d) => Object.keys(d).length > 1, { message: 'Nothing to update' });
export type AssetUpdateInput = z.infer<typeof assetUpdateSchema>;

export const assetListQuerySchema = z.object({
  q: text(100),
  siteId: z.preprocess(blankToUndefined, z.string().uuid().optional()),
  locationId: z.preprocess(blankToUndefined, z.string().uuid().optional()),
  status: z.preprocess(blankToUndefined, z.enum(ASSET_STATUSES).optional()),
  riskLevel: z.preprocess(blankToUndefined, z.enum(RISK_LEVELS).optional()),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});
export type AssetListQuery = z.infer<typeof assetListQuerySchema>;

export interface AssetSummaryDto {
  id: string;
  assetTag: string;
  serialNumber: string | null;
  status: AssetStatus;
  riskLevel: RiskLevel;
  site: { id: string; name: string };
  location: { id: string; name: string } | null;
  model: { id: string; name: string; category: string; manufacturer: string };
  updatedAt: string;
}

export interface AssetListResponse {
  items: AssetSummaryDto[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AssetDetailDto extends Omit<AssetSummaryDto, 'location'> {
  udi: string | null;
  location: { id: string; name: string; path: string } | null;
  purchaseDate: string | null; // YYYY-MM-DD
  purchaseCost: string | null; // decimal as string, e.g. "12500.00"
  warrantyEndsAt: string | null;
  commissionedAt: string | null;
  notes: string | null;
  version: number;
  createdAt: string;
}

export interface AssetHistoryEntry {
  at: string;
  action: string;
  user: string | null;
  /** Changed fields: { field: { from, to } } */
  changes: Record<string, { from: unknown; to: unknown }>;
}
