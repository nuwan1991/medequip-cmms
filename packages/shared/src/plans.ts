/**
 * Subscription plans and entitlements.
 *
 * Limits and features are DATA, not code: the API reads a tenant's plan
 * entitlements (plus per-tenant overrides) and enforces them in
 * EntitlementsService. These defaults seed the `plans` table.
 */

export const PLAN_CODES = ['FREE', 'PROFESSIONAL', 'FLEET', 'ENTERPRISE'] as const;
export type PlanCode = (typeof PLAN_CODES)[number];

/** Numeric limits. `null` means unlimited. */
export type LimitKey = 'maxAssets' | 'maxSites' | 'maxUsers' | 'maxStorageMb';

/** Feature switches that can be turned on/off per plan. */
export type FeatureKey =
  | 'spareParts'
  | 'contracts'
  | 'advancedReports'
  | 'mobileOffline'
  | 'interSiteTransfers'
  | 'apiAccess'
  | 'sso'
  | 'auditExport'
  | 'edgeNode';

/**
 * Safety-critical capabilities that must NEVER be blocked by plan limits,
 * expired subscriptions or unpaid invoices.
 */
export const ALWAYS_ALLOWED = [
  'recallAlerts',
  'viewMaintenanceHistory',
  'dataExport',
  'faultReporting',
] as const;
export type AlwaysAllowedKey = (typeof ALWAYS_ALLOWED)[number];

export interface PlanEntitlements {
  limits: Record<LimitKey, number | null>;
  features: Record<FeatureKey, boolean>;
}

export interface PlanDefinition {
  code: PlanCode;
  name: string;
  priceMonthlyUsdCents: number | null; // null = custom / contract
  entitlements: PlanEntitlements;
}

const noFeatures: Record<FeatureKey, boolean> = {
  spareParts: false,
  contracts: false,
  advancedReports: false,
  mobileOffline: false,
  interSiteTransfers: false,
  apiAccess: false,
  sso: false,
  auditExport: false,
  edgeNode: false,
};

/** Default plan catalogue. Prices are placeholders - adjust before launch. */
export const DEFAULT_PLANS: readonly PlanDefinition[] = [
  {
    code: 'FREE',
    name: 'Free',
    priceMonthlyUsdCents: 0,
    entitlements: {
      limits: { maxAssets: 300, maxSites: 1, maxUsers: 5, maxStorageMb: 1024 },
      features: { ...noFeatures },
    },
  },
  {
    code: 'PROFESSIONAL',
    name: 'Professional',
    priceMonthlyUsdCents: 9900,
    entitlements: {
      limits: { maxAssets: 5000, maxSites: 2, maxUsers: 50, maxStorageMb: 50 * 1024 },
      features: {
        ...noFeatures,
        spareParts: true,
        contracts: true,
        advancedReports: true,
        mobileOffline: true,
        apiAccess: true,
        auditExport: true,
      },
    },
  },
  {
    code: 'FLEET',
    name: 'Hospital Group',
    priceMonthlyUsdCents: 49900,
    entitlements: {
      limits: { maxAssets: 50000, maxSites: 20, maxUsers: 500, maxStorageMb: 500 * 1024 },
      features: {
        ...noFeatures,
        spareParts: true,
        contracts: true,
        advancedReports: true,
        mobileOffline: true,
        interSiteTransfers: true,
        apiAccess: true,
        sso: true,
        auditExport: true,
      },
    },
  },
  {
    code: 'ENTERPRISE',
    name: 'Enterprise / Hybrid',
    priceMonthlyUsdCents: null,
    entitlements: {
      limits: { maxAssets: null, maxSites: null, maxUsers: null, maxStorageMb: null },
      features: {
        spareParts: true,
        contracts: true,
        advancedReports: true,
        mobileOffline: true,
        interSiteTransfers: true,
        apiAccess: true,
        sso: true,
        auditExport: true,
        edgeNode: true,
      },
    },
  },
];

export function getPlan(code: PlanCode): PlanDefinition {
  const plan = DEFAULT_PLANS.find((p) => p.code === code);
  if (!plan) throw new Error(`Unknown plan: ${code}`);
  return plan;
}
