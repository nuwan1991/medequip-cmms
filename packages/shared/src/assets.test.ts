import { describe, expect, it } from 'vitest';
import {
  assetCreateSchema,
  assetListQuerySchema,
  assetUpdateSchema,
  siteCreateSchema,
  withLocationPaths,
} from './index';

const SITE = '6f1c1d5e-6d8b-4f4a-9a43-4c5f8d1b2a10';
const MODEL = '0b8f0e4c-2f7e-4d0a-8f5c-1d2e3f4a5b6c';

describe('assetCreateSchema (form input)', () => {
  it('turns empty form fields into undefined and coerces numbers/dates', () => {
    const parsed = assetCreateSchema.parse({
      siteId: SITE,
      modelId: MODEL,
      assetTag: 'ICU-001',
      locationId: '',
      serialNumber: '',
      riskLevel: '',
      purchaseDate: '2025-03-01',
      purchaseCost: '1250.50',
      warrantyEndsAt: '',
    });
    expect(parsed.locationId).toBeUndefined();
    expect(parsed.serialNumber).toBeUndefined();
    expect(parsed.riskLevel).toBeUndefined();
    expect(parsed.purchaseCost).toBe(1250.5);
    expect(parsed.purchaseDate?.toISOString().slice(0, 10)).toBe('2025-03-01');
    expect(parsed.warrantyEndsAt).toBeUndefined();
  });

  it('rejects tags with spaces or symbols that do not print well on labels', () => {
    expect(() =>
      assetCreateSchema.parse({ siteId: SITE, modelId: MODEL, assetTag: 'ICU 001' }),
    ).toThrow();
  });

  it('rejects negative cost and invalid dates', () => {
    expect(() =>
      assetCreateSchema.parse({ siteId: SITE, modelId: MODEL, assetTag: 'A', purchaseCost: -1 }),
    ).toThrow();
    expect(() =>
      assetCreateSchema.parse({ siteId: SITE, modelId: MODEL, assetTag: 'A', purchaseDate: 'x' }),
    ).toThrow();
  });
});

describe('assetUpdateSchema', () => {
  it('requires a version and at least one change', () => {
    expect(() => assetUpdateSchema.parse({ status: 'QUARANTINED' })).toThrow();
    expect(() => assetUpdateSchema.parse({ version: 1 })).toThrow();
    expect(assetUpdateSchema.parse({ version: 1, status: 'QUARANTINED' }).status).toBe(
      'QUARANTINED',
    );
  });

  it('turns empty strings into null so fields can be cleared', () => {
    const parsed = assetUpdateSchema.parse({ version: 2, serialNumber: '', warrantyEndsAt: '' });
    expect(parsed.serialNumber).toBeNull();
    expect(parsed.warrantyEndsAt).toBeNull();
  });
});

describe('list query and sites', () => {
  it('applies paging defaults and limits', () => {
    expect(assetListQuerySchema.parse({})).toMatchObject({ page: 1, pageSize: 50 });
    expect(() => assetListQuerySchema.parse({ pageSize: '1000' })).toThrow();
  });

  it('upper-cases site codes', () => {
    expect(siteCreateSchema.parse({ name: 'North', code: 'north-1' }).code).toBe('NORTH-1');
  });
});

describe('withLocationPaths', () => {
  it('builds full paths regardless of order', () => {
    const rows = withLocationPaths([
      { id: 'c', parentId: 'b', name: 'ICU' },
      { id: 'a', parentId: null, name: 'Main Building' },
      { id: 'b', parentId: 'a', name: 'Floor 2' },
    ]);
    const icu = rows.find((r) => r.id === 'c')!;
    expect(icu.path).toBe('Main Building › Floor 2 › ICU');
    expect(icu.depth).toBe(2);
    expect(rows[0].id).toBe('a');
  });

  it('does not loop forever on a cycle', () => {
    const rows = withLocationPaths([
      { id: 'a', parentId: 'b', name: 'A' },
      { id: 'b', parentId: 'a', name: 'B' },
    ]);
    expect(rows).toHaveLength(2);
  });
});
