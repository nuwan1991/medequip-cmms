import { ForbiddenException, Injectable, Optional } from '@nestjs/common';
import {
  ALWAYS_ALLOWED,
  type AlwaysAllowedKey,
  type FeatureKey,
  type LimitKey,
  type PlanEntitlements,
} from '@medequip/shared';
import { PrismaService } from '../prisma/prisma.service';

/** Tenant status values that put the organization into restricted mode. */
const RESTRICTED_STATUSES = ['READ_ONLY', 'SUSPENDED', 'CLOSED'] as const;

export interface TenantEntitlementContext {
  status: string;
  /** Plan entitlements merged with per-tenant overrides. */
  entitlements: PlanEntitlements;
}

/**
 * Single place where plan limits and features are enforced.
 * Always call this from the API layer - never rely on hiding UI buttons.
 */
@Injectable()
export class EntitlementsService {
  constructor(@Optional() private readonly prisma?: PrismaService) {}

  /** Load the organization's plan, overrides and status from the database. */
  async forOrganization(organizationId: string): Promise<TenantEntitlementContext> {
    if (!this.prisma) throw new Error('EntitlementsService needs PrismaService for this call');
    const org = await this.prisma.organization.findUniqueOrThrow({
      where: { id: organizationId },
      include: { plan: true },
    });
    return {
      status: org.status,
      entitlements: this.merge(
        org.plan.entitlements as unknown as PlanEntitlements,
        org.entitlementOverrides as Partial<PlanEntitlements> | null,
      ),
    };
  }

  /** Merge plan defaults with per-tenant overrides (custom deals, promos). */
  merge(plan: PlanEntitlements, overrides?: Partial<PlanEntitlements> | null): PlanEntitlements {
    return {
      limits: { ...plan.limits, ...(overrides?.limits ?? {}) },
      features: { ...plan.features, ...(overrides?.features ?? {}) },
    };
  }

  /** Safety-critical capabilities are never blocked, whatever the plan or status. */
  isAlwaysAllowed(capability: string): capability is AlwaysAllowedKey {
    return (ALWAYS_ALLOWED as readonly string[]).includes(capability);
  }

  hasFeature(ctx: TenantEntitlementContext, feature: FeatureKey): boolean {
    if (this.isRestricted(ctx)) return false;
    return ctx.entitlements.features[feature] === true;
  }

  assertFeature(ctx: TenantEntitlementContext, feature: FeatureKey): void {
    if (!this.hasFeature(ctx, feature)) {
      throw new ForbiddenException({
        code: 'FEATURE_NOT_IN_PLAN',
        feature,
        message: `Your current plan does not include "${feature}". Upgrade to enable it.`,
      });
    }
  }

  /**
   * Check before creating something that counts toward a limit.
   * @param currentCount how many already exist (e.g. active assets)
   * @param adding how many are being added (default 1)
   */
  assertWithinLimit(
    ctx: TenantEntitlementContext,
    limit: LimitKey,
    currentCount: number,
    adding = 1,
  ): void {
    if (this.isRestricted(ctx)) {
      throw new ForbiddenException({
        code: 'ACCOUNT_RESTRICTED',
        message: 'Your account is read-only. Existing data remains available and exportable.',
      });
    }
    const max = ctx.entitlements.limits[limit];
    if (max !== null && currentCount + adding > max) {
      throw new ForbiddenException({
        code: 'PLAN_LIMIT_REACHED',
        limit,
        max,
        current: currentCount,
        message: `Plan limit reached for ${limit} (${max}). Upgrade to add more.`,
      });
    }
  }

  /** Usage ratio 0..1 for "you are using 240 of 300 assets" banners (null = unlimited). */
  usage(ctx: TenantEntitlementContext, limit: LimitKey, currentCount: number): number | null {
    const max = ctx.entitlements.limits[limit];
    return max === null ? null : Math.min(currentCount / max, 1);
  }

  private isRestricted(ctx: TenantEntitlementContext): boolean {
    return (RESTRICTED_STATUSES as readonly string[]).includes(ctx.status);
  }
}
