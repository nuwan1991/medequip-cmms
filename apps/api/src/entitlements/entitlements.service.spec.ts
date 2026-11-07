import { ForbiddenException } from '@nestjs/common';
import { getPlan } from '@medequip/shared';
import { EntitlementsService, type TenantEntitlementContext } from './entitlements.service';

describe('EntitlementsService', () => {
  const service = new EntitlementsService();
  const free: TenantEntitlementContext = {
    status: 'ACTIVE',
    entitlements: getPlan('FREE').entitlements,
  };
  const enterprise: TenantEntitlementContext = {
    status: 'ACTIVE',
    entitlements: getPlan('ENTERPRISE').entitlements,
  };

  it('allows adding assets below the free limit', () => {
    expect(() => service.assertWithinLimit(free, 'maxAssets', 299)).not.toThrow();
  });

  it('blocks adding assets above the free limit', () => {
    expect(() => service.assertWithinLimit(free, 'maxAssets', 300)).toThrow(ForbiddenException);
  });

  it('treats null limits as unlimited', () => {
    expect(() => service.assertWithinLimit(enterprise, 'maxAssets', 1_000_000)).not.toThrow();
    expect(service.usage(enterprise, 'maxAssets', 10)).toBeNull();
  });

  it('blocks paid features on the free plan', () => {
    expect(service.hasFeature(free, 'spareParts')).toBe(false);
    expect(() => service.assertFeature(free, 'sso')).toThrow(ForbiddenException);
  });

  it('applies per-tenant overrides', () => {
    const merged = service.merge(getPlan('FREE').entitlements, {
      limits: { maxAssets: 500 } as never,
    });
    expect(merged.limits.maxAssets).toBe(500);
    expect(merged.limits.maxUsers).toBe(5);
  });

  it('blocks new records when the account is read-only', () => {
    const readOnly = { ...enterprise, status: 'READ_ONLY' };
    expect(() => service.assertWithinLimit(readOnly, 'maxAssets', 0)).toThrow(ForbiddenException);
    expect(service.hasFeature(readOnly, 'apiAccess')).toBe(false);
  });

  it('never blocks safety-critical capabilities', () => {
    expect(service.isAlwaysAllowed('recallAlerts')).toBe(true);
    expect(service.isAlwaysAllowed('dataExport')).toBe(true);
    expect(service.isAlwaysAllowed('spareParts')).toBe(false);
  });
});
