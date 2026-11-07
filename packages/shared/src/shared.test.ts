import { describe, expect, it } from 'vitest';
import { ALWAYS_ALLOWED, DEFAULT_PLANS, PLAN_CODES, assetCreateSchema, getPlan } from './index';

describe('plans', () => {
  it('defines every plan code exactly once', () => {
    expect(DEFAULT_PLANS.map((p) => p.code).sort()).toEqual([...PLAN_CODES].sort());
  });

  it('free plan has finite limits and no paid features', () => {
    const free = getPlan('FREE');
    expect(free.entitlements.limits.maxAssets).toBe(300);
    expect(Object.values(free.entitlements.features).every((f) => f === false)).toBe(true);
  });

  it('safety-critical capabilities are never plan features', () => {
    for (const plan of DEFAULT_PLANS) {
      for (const key of ALWAYS_ALLOWED) {
        expect(Object.keys(plan.entitlements.features)).not.toContain(key);
      }
    }
  });
});

describe('assetCreateSchema', () => {
  const valid = {
    siteId: '6f1c1d5e-6d8b-4f4a-9a43-4c5f8d1b2a10',
    modelId: '0b8f0e4c-2f7e-4d0a-8f5c-1d2e3f4a5b6c',
    assetTag: ' BME-0001 ',
  };

  it('accepts a minimal asset and applies defaults', () => {
    const parsed = assetCreateSchema.parse(valid);
    expect(parsed.assetTag).toBe('BME-0001');
    expect(parsed.status).toBe('IN_SERVICE');
    expect(parsed.riskLevel).toBe('MEDIUM');
  });

  it('rejects an empty asset tag', () => {
    expect(() => assetCreateSchema.parse({ ...valid, assetTag: '  ' })).toThrow();
  });
});
