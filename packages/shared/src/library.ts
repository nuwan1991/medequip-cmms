import { z } from 'zod';
import { RISK_LEVELS, type RiskLevel } from './assets';

const blankToUndefined = (v: unknown) => (v === '' ? undefined : v);
const blankToNull = (v: unknown) => (v === '' ? null : v);

/**
 * Device library: manufacturers and device models.
 * Global entries (shared by every organization) are maintained by MedEquip; organizations
 * can add their own private entries.
 */
export const manufacturerCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  website: z.preprocess(blankToUndefined, z.string().trim().url().max(255).optional()),
});
export type ManufacturerCreateInput = z.infer<typeof manufacturerCreateSchema>;

export interface ManufacturerDto {
  id: string;
  name: string;
  website: string | null;
  /** True for shared library entries that cannot be edited by organizations. */
  isGlobal: boolean;
}

export const deviceModelCreateSchema = z.object({
  manufacturerId: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  /** e.g. "Infusion pump", "Patient monitor", "Defibrillator" */
  category: z.string().trim().min(1).max(120),
  /** GMDN / UMDNS code */
  nomenclatureCode: z.preprocess(blankToUndefined, z.string().trim().max(32).optional()),
  defaultRiskLevel: z.enum(RISK_LEVELS).default('MEDIUM'),
  /** Preventive maintenance interval in months (empty = no scheduled PM). */
  pmIntervalMonths: z.preprocess(
    blankToUndefined,
    z.coerce.number().int().min(1).max(120).optional(),
  ),
});
export type DeviceModelCreateInput = z.infer<typeof deviceModelCreateSchema>;

export const deviceModelUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    category: z.string().trim().min(1).max(120).optional(),
    nomenclatureCode: z.preprocess(blankToNull, z.string().trim().max(32).nullable().optional()),
    defaultRiskLevel: z.enum(RISK_LEVELS).optional(),
    pmIntervalMonths: z.preprocess(
      blankToNull,
      z.coerce.number().int().min(1).max(120).nullable().optional(),
    ),
  })
  .refine((d) => Object.keys(d).length > 0, { message: 'Nothing to update' });
export type DeviceModelUpdateInput = z.infer<typeof deviceModelUpdateSchema>;

export interface DeviceModelDto {
  id: string;
  manufacturer: { id: string; name: string };
  name: string;
  category: string;
  nomenclatureCode: string | null;
  defaultRiskLevel: RiskLevel;
  pmIntervalMonths: number | null;
  isGlobal: boolean;
}

/** Plan usage shown in the UI ("12 of 300 assets"). `limit: null` = unlimited. */
export interface UsageDto {
  plan: { code: string; name: string };
  assets: { used: number; limit: number | null };
  users: { used: number; limit: number | null };
  sites: { used: number; limit: number | null };
}
