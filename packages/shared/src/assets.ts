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

/** Keep in sync with the `RiskLevel` enum in packages/db/prisma/schema.prisma. */
export const RISK_LEVELS = ['LOW', 'MEDIUM', 'HIGH', 'LIFE_SUPPORT'] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

/** Input for creating an asset (validated in API and web forms). */
export const assetCreateSchema = z.object({
  siteId: z.string().uuid(),
  locationId: z.string().uuid().optional(),
  modelId: z.string().uuid(),
  assetTag: z.string().trim().min(1).max(64),
  serialNumber: z.string().trim().max(128).optional(),
  udi: z.string().trim().max(255).optional(),
  status: z.enum(ASSET_STATUSES).default('IN_SERVICE'),
  riskLevel: z.enum(RISK_LEVELS).default('MEDIUM'),
  purchaseDate: z.coerce.date().optional(),
  purchaseCost: z.number().nonnegative().optional(),
  warrantyEndsAt: z.coerce.date().optional(),
  notes: z.string().max(4000).optional(),
});

export type AssetCreateInput = z.infer<typeof assetCreateSchema>;
