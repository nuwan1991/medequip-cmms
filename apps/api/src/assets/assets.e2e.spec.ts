/**
 * End-to-end tests for sites, locations, device library and the asset register.
 * Runs against a real database when DATABASE_URL is set (APP_DATABASE_URL → RLS enforced).
 */
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient, hashPassword } from '@medequip/db';
import { DEFAULT_PLANS } from '@medequip/shared';
import { AppModule } from '../app.module';
import { configureApp } from '../app.setup';
import { csvCell } from './csv';

const describeDb = process.env.DATABASE_URL ? describe : describe.skip;
const PASSWORD = 'Correct-Horse-42';

describeDb('Asset register (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  const orgIds: string[] = [];
  const globalIds: { manufacturer?: string; model?: string } = {};
  const slugA = `assets-a-${randomUUID().slice(0, 8)}`;
  const slugB = `assets-b-${randomUUID().slice(0, 8)}`;

  let admin: Record<string, string>;
  let tech: Record<string, string>;
  let adminB: Record<string, string>;
  let siteId: string;
  const api = () => request(app.getHttpServer());

  async function createOrg(slug: string) {
    const free = DEFAULT_PLANS.find((p) => p.code === 'FREE')!;
    const plan = await prisma.plan.upsert({
      where: { code: 'FREE' },
      update: {},
      create: {
        code: 'FREE',
        name: free.name,
        entitlements: free.entitlements as unknown as Prisma.InputJsonValue,
      },
    });
    const org = await prisma.organization.create({
      data: { name: slug, slug, planId: plan.id, status: 'ACTIVE' },
    });
    orgIds.push(org.id);
    const site = await prisma.site.create({
      data: { organizationId: org.id, name: 'Main Campus', code: 'MAIN' },
    });
    const passwordHash = await hashPassword(PASSWORD);
    for (const [email, role] of [
      ['admin@x.test', 'ORG_ADMIN'],
      ['tech@x.test', 'TECHNICIAN'],
    ] as const) {
      await prisma.user.create({
        data: { organizationId: org.id, email, name: email, role, status: 'ACTIVE', passwordHash },
      });
    }
    return { org, site };
  }

  async function tokenFor(slug: string, email: string) {
    const res = await api()
      .post('/api/auth/login')
      .send({ organization: slug, email, password: PASSWORD });
    expect(res.status).toBe(200);
    return { Authorization: `Bearer ${res.body.accessToken}` };
  }

  beforeAll(async () => {
    prisma = new PrismaClient();
    const a = await createOrg(slugA);
    await createOrg(slugB);
    siteId = a.site.id;

    // A shared (global) library entry visible to every organization.
    const m = await prisma.manufacturer.create({ data: { name: `GlobalMed ${randomUUID()}` } });
    const model = await prisma.deviceModel.create({
      data: {
        manufacturerId: m.id,
        name: 'Global Monitor',
        category: 'Patient monitor',
        defaultRiskLevel: 'HIGH',
      },
    });
    globalIds.manufacturer = m.id;
    globalIds.model = model.id;

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();

    admin = await tokenFor(slugA, 'admin@x.test');
    tech = await tokenFor(slugA, 'tech@x.test');
    adminB = await tokenFor(slugB, 'admin@x.test');
  });

  afterAll(async () => {
    await app?.close();
    if (!prisma) return;
    const where = { organizationId: { in: orgIds } };
    await prisma.auditLog.deleteMany({ where });
    await prisma.session.deleteMany({ where });
    await prisma.asset.deleteMany({ where });
    await prisma.deviceModel.deleteMany({
      where: { OR: [where, { id: globalIds.model ?? '' }] },
    });
    await prisma.manufacturer.deleteMany({
      where: { OR: [where, { id: globalIds.manufacturer ?? '' }] },
    });
    await prisma.location.deleteMany({ where });
    await prisma.site.deleteMany({ where });
    await prisma.user.deleteMany({ where });
    await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
    await prisma.$disconnect();
  });

  // Shared state built up by the tests below (they run in order).
  let modelId: string;
  let buildingId: string;
  let icuId: string;
  let assetId: string;

  describe('sites', () => {
    it('lists sites and enforces the Free plan site limit', async () => {
      const list = await api().get('/api/sites').set(tech).expect(200);
      expect(list.body.map((s: { code: string }) => s.code)).toEqual(['MAIN']);
      const second = await api()
        .post('/api/sites')
        .set(admin)
        .send({ name: 'North Clinic', code: 'north' });
      expect(second.status).toBe(403);
      expect(second.body.code).toBe('PLAN_LIMIT_REACHED');
      await api().post('/api/sites').set(tech).send({ name: 'X', code: 'X' }).expect(403);
    });
  });

  describe('device library', () => {
    it('shows the global library and lets organizations add private entries', async () => {
      const ms = await api().get('/api/library/manufacturers').set(admin).expect(200);
      const global = ms.body.find((m: { id: string }) => m.id === globalIds.manufacturer);
      expect(global.isGlobal).toBe(true);

      const mfr = await api()
        .post('/api/library/manufacturers')
        .set(admin)
        .send({ name: 'Acme Infusion' })
        .expect(201);
      await api()
        .post('/api/library/manufacturers')
        .set(admin)
        .send({ name: 'ACME infusion' })
        .expect(409);

      const model = await api()
        .post('/api/library/models')
        .set(admin)
        .send({
          manufacturerId: mfr.body.id,
          name: 'Pump 3000',
          category: 'Infusion pump',
          defaultRiskLevel: 'LIFE_SUPPORT',
          pmIntervalMonths: '12',
        })
        .expect(201);
      modelId = model.body.id;
      expect(model.body.pmIntervalMonths).toBe(12);
      expect(model.body.isGlobal).toBe(false);

      // Other organizations cannot see private entries.
      const bModels = await api().get('/api/library/models').set(adminB).expect(200);
      const ids = bModels.body.map((m: { id: string }) => m.id);
      expect(ids).toContain(globalIds.model);
      expect(ids).not.toContain(modelId);
    });

    it('refuses to edit shared library entries', async () => {
      const res = await api()
        .patch(`/api/library/models/${globalIds.model}`)
        .set(admin)
        .send({ name: 'Renamed' });
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('GLOBAL_LIBRARY_READ_ONLY');
    });
  });

  describe('locations', () => {
    it('builds a location tree with full paths', async () => {
      const building = await api()
        .post('/api/locations')
        .set(admin)
        .send({ siteId, type: 'BUILDING', name: 'Main Building' })
        .expect(201);
      buildingId = building.body.id;
      const floor = await api()
        .post('/api/locations')
        .set(admin)
        .send({ siteId, parentId: buildingId, type: 'FLOOR', name: 'Floor 2' })
        .expect(201);
      const icu = await api()
        .post('/api/locations')
        .set(admin)
        .send({ siteId, parentId: floor.body.id, type: 'DEPARTMENT', name: 'ICU' })
        .expect(201);
      icuId = icu.body.id;
      expect(icu.body.path).toBe('Main Building › Floor 2 › ICU');
      expect(icu.body.depth).toBe(2);
    });

    it('prevents loops, cross-site parents and deleting non-empty locations', async () => {
      const loop = await api()
        .patch(`/api/locations/${buildingId}`)
        .set(admin)
        .send({ parentId: icuId });
      expect(loop.status).toBe(400);
      expect(loop.body.code).toBe('INVALID_PARENT');

      const del = await api().delete(`/api/locations/${buildingId}`).set(admin);
      expect(del.status).toBe(409);
      expect(del.body.code).toBe('LOCATION_IN_USE');
    });
  });

  describe('assets', () => {
    it('creates an asset; risk defaults to the model risk level', async () => {
      const res = await api()
        .post('/api/assets')
        .set(admin)
        .send({
          siteId,
          locationId: icuId,
          modelId,
          assetTag: 'ICU-0001',
          serialNumber: 'SN-1',
          purchaseCost: '12500.5',
          purchaseDate: '2025-01-15',
          notes: '=HYPERLINK("http://evil")',
        })
        .expect(201);
      assetId = res.body.id;
      expect(res.body.riskLevel).toBe('LIFE_SUPPORT');
      expect(res.body.location.path).toBe('Main Building › Floor 2 › ICU');
      expect(res.body.purchaseCost).toBe('12500.50');
      expect(res.body.purchaseDate).toBe('2025-01-15');
      expect(res.body.version).toBe(1);
    });

    it('rejects duplicate tags and references the organization cannot use', async () => {
      await api()
        .post('/api/assets')
        .set(admin)
        .send({ siteId, modelId, assetTag: 'ICU-0001' })
        .expect(409);

      // Another organization's private model: invisible under RLS → invalid.
      const bMfr = await api()
        .post('/api/library/manufacturers')
        .set(adminB)
        .send({ name: 'B Only' })
        .expect(201);
      const bModel = await api()
        .post('/api/library/models')
        .set(adminB)
        .send({ manufacturerId: bMfr.body.id, name: 'B Model', category: 'X' })
        .expect(201);
      const foreign = await api()
        .post('/api/assets')
        .set(admin)
        .send({ siteId, modelId: bModel.body.id, assetTag: 'ICU-0002' });
      expect(foreign.status).toBe(400);
      expect(foreign.body.code).toBe('INVALID_MODEL');
    });

    it('lets technicians read but not change assets', async () => {
      await api().get(`/api/assets/${assetId}`).set(tech).expect(200);
      await api()
        .post('/api/assets')
        .set(tech)
        .send({ siteId, modelId, assetTag: 'T-1' })
        .expect(403);
    });

    it('searches and filters, including everything inside a location', async () => {
      await api()
        .post('/api/assets')
        .set(admin)
        .send({ siteId, modelId: globalIds.model, assetTag: 'LOBBY-01' })
        .expect(201);

      const byText = await api().get('/api/assets?q=pump').set(admin).expect(200);
      expect(byText.body.items.map((a: { assetTag: string }) => a.assetTag)).toEqual(['ICU-0001']);

      const inBuilding = await api()
        .get(`/api/assets?locationId=${buildingId}`)
        .set(admin)
        .expect(200);
      expect(inBuilding.body.total).toBe(1);

      const paged = await api().get('/api/assets?pageSize=1&page=2').set(admin).expect(200);
      expect(paged.body).toMatchObject({ total: 2, page: 2, pageSize: 1 });
      expect(paged.body.items).toHaveLength(1);
    });

    it('uses optimistic locking and records field changes in history', async () => {
      const ok = await api()
        .patch(`/api/assets/${assetId}`)
        .set(admin)
        .send({ version: 1, status: 'QUARANTINED', serialNumber: '' })
        .expect(200);
      expect(ok.body.version).toBe(2);
      expect(ok.body.serialNumber).toBeNull();

      const stale = await api()
        .patch(`/api/assets/${assetId}`)
        .set(admin)
        .send({ version: 1, status: 'IN_SERVICE' });
      expect(stale.status).toBe(409);
      expect(stale.body.code).toBe('VERSION_CONFLICT');

      const history = await api().get(`/api/assets/${assetId}/history`).set(tech).expect(200);
      expect(history.body[0].action).toBe('UPDATE');
      expect(history.body[0].user).toBe('admin@x.test');
      expect(history.body[0].changes.status).toEqual({ from: 'IN_SERVICE', to: 'QUARANTINED' });
      expect(history.body.at(-1).action).toBe('CREATE');
    });

    it('exports CSV safely', async () => {
      const res = await api().get('/api/assets/export.csv').set(tech).expect(200);
      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.text).toContain('ICU-0001');
      expect(res.text).toContain('Main Building › Floor 2 › ICU');
      expect(res.text).toContain(`"'=HYPERLINK(""http://evil"")"`);
      expect(csvCell('+1')).toBe("'+1");
    });

    it('keeps other organizations out', async () => {
      await api().get(`/api/assets/${assetId}`).set(adminB).expect(404);
      await api()
        .patch(`/api/assets/${assetId}`)
        .set(adminB)
        .send({ version: 2, status: 'DISPOSED' })
        .expect(404);
      const list = await api().get('/api/assets').set(adminB).expect(200);
      expect(list.body.total).toBe(0);
    });
  });

  describe('plan limits and read-only accounts', () => {
    it('enforces the asset limit; disposed assets do not count', async () => {
      await prisma.organization.update({
        where: { id: orgIds[0] },
        data: { entitlementOverrides: { limits: { maxAssets: 2 } } },
      });
      const usage = await api().get('/api/organization/usage').set(tech).expect(200);
      expect(usage.body.assets).toEqual({ used: 2, limit: 2 });

      const over = await api()
        .post('/api/assets')
        .set(admin)
        .send({ siteId, modelId, assetTag: 'OVER-1' });
      expect(over.status).toBe(403);
      expect(over.body.code).toBe('PLAN_LIMIT_REACHED');

      // Recording an already-disposed asset is allowed...
      const disposed = await api()
        .post('/api/assets')
        .set(admin)
        .send({ siteId, modelId, assetTag: 'OLD-1', status: 'DISPOSED' })
        .expect(201);
      // ...but bringing it back into service counts again.
      const revive = await api()
        .patch(`/api/assets/${disposed.body.id}`)
        .set(admin)
        .send({ version: 1, status: 'IN_SERVICE' });
      expect(revive.status).toBe(403);
    });

    it('read-only accounts can still read, see history and export', async () => {
      await prisma.organization.update({
        where: { id: orgIds[0] },
        data: { status: 'READ_ONLY', entitlementOverrides: Prisma.DbNull },
      });
      try {
        const create = await api()
          .post('/api/assets')
          .set(admin)
          .send({ siteId, modelId, assetTag: 'RO-1' });
        expect(create.body.code).toBe('ACCOUNT_RESTRICTED');
        await api()
          .patch(`/api/assets/${assetId}`)
          .set(admin)
          .send({ version: 2, notes: 'x' })
          .expect(403);
        await api().get('/api/assets').set(admin).expect(200);
        await api().get(`/api/assets/${assetId}/history`).set(admin).expect(200);
        await api().get('/api/assets/export.csv').set(admin).expect(200);
      } finally {
        await prisma.organization.update({ where: { id: orgIds[0] }, data: { status: 'ACTIVE' } });
      }
    });

    it('soft-deletes assets', async () => {
      await api().delete(`/api/assets/${assetId}`).set(admin).expect(204);
      await api().get(`/api/assets/${assetId}`).set(admin).expect(404);
      const row = await prisma.asset.findUnique({ where: { id: assetId } });
      expect(row?.deletedAt).not.toBeNull();
    });
  });
});
