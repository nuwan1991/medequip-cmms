/**
 * Proves tenant isolation is enforced by PostgreSQL itself (Row-Level Security),
 * independently of application `where` filters.
 * Requires DATABASE_URL (owner) and APP_DATABASE_URL (restricted medequip_app role).
 */
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { PrismaClient, type Prisma } from '@medequip/db';
import { DEFAULT_PLANS } from '@medequip/shared';
import { TenantPrismaService } from './tenant-prisma.service';

const describeRls =
  process.env.DATABASE_URL && process.env.APP_DATABASE_URL ? describe : describe.skip;

describeRls('Row-Level Security (e2e)', () => {
  let owner: PrismaClient;
  let tenant: TenantPrismaService;
  let orgA: string;
  let orgB: string;
  const created: string[] = [];

  beforeAll(async () => {
    owner = new PrismaClient();
    tenant = new TenantPrismaService(new ConfigService(process.env));
    const free = DEFAULT_PLANS.find((p) => p.code === 'FREE')!;
    const plan = await owner.plan.upsert({
      where: { code: 'FREE' },
      update: {},
      create: {
        code: 'FREE',
        name: free.name,
        entitlements: free.entitlements as unknown as Prisma.InputJsonValue,
      },
    });
    for (const label of ['a', 'b']) {
      const org = await owner.organization.create({
        data: {
          name: `RLS ${label}`,
          slug: `rls-${label}-${randomUUID().slice(0, 8)}`,
          planId: plan.id,
        },
      });
      created.push(org.id);
      await owner.site.create({
        data: { organizationId: org.id, name: `Site ${label}`, code: 'MAIN' },
      });
    }
    [orgA, orgB] = created;
  });

  afterAll(async () => {
    const where = { organizationId: { in: created } };
    await owner.deviceModel.deleteMany({ where });
    await owner.manufacturer.deleteMany({ where });
    await owner.site.deleteMany({ where });
    await owner.organization.deleteMany({ where: { id: { in: created } } });
    await owner.$disconnect();
    await tenant.$disconnect();
  });

  it('uses the restricted role', () => {
    expect(tenant.rlsEnforced).toBe(true);
  });

  it('returns only the current organization rows, even without a where filter', async () => {
    const sites = await tenant.run(orgA, (tx) => tx.site.findMany());
    expect(sites.length).toBeGreaterThan(0);
    expect(sites.every((s) => s.organizationId === orgA)).toBe(true);
    const orgs = await tenant.run(orgA, (tx) => tx.organization.findMany());
    expect(orgs.map((o) => o.id)).toEqual([orgA]);
  });

  it('returns nothing when no organization is set (fails closed)', async () => {
    expect(await tenant.site.findMany()).toEqual([]);
    expect(await tenant.user.findMany()).toEqual([]);
  });

  it('refuses to write rows into another organization', async () => {
    await expect(
      tenant.run(orgA, (tx) =>
        tx.site.create({ data: { organizationId: orgB, name: 'Sneaky', code: 'X' } }),
      ),
    ).rejects.toThrow();
  });

  it('cannot update another organization rows (they are invisible)', async () => {
    const result = await tenant.run(orgA, (tx) =>
      tx.site.updateMany({ where: { organizationId: orgB }, data: { name: 'Hijacked' } }),
    );
    expect(result.count).toBe(0);
  });

  it('cannot hard-delete business records or rewrite the audit log', async () => {
    await expect(tenant.run(orgA, (tx) => tx.site.deleteMany())).rejects.toThrow(
      /permission denied/i,
    );
    await expect(
      tenant.run(orgA, (tx) => tx.auditLog.updateMany({ data: { entity: 'tampered' } })),
    ).rejects.toThrow(/permission denied/i);
  });

  it('shares the global device library but keeps private entries private', async () => {
    const global = await owner.manufacturer.create({ data: { name: `Global ${randomUUID()}` } });
    try {
      const priv = await tenant.run(orgA, (tx) =>
        tx.manufacturer.create({ data: { organizationId: orgA, name: 'Private to A' } }),
      );
      const seenByB = await tenant.run(orgB, (tx) => tx.manufacturer.findMany());
      expect(seenByB.map((m) => m.id)).toContain(global.id);
      expect(seenByB.map((m) => m.id)).not.toContain(priv.id);

      // Tenants cannot change shared library rows.
      const changed = await tenant.run(orgB, (tx) =>
        tx.manufacturer.updateMany({ where: { id: global.id }, data: { name: 'Changed' } }),
      );
      expect(changed.count).toBe(0);
    } finally {
      await owner.manufacturer.delete({ where: { id: global.id } });
    }
  });

  it('every table with organization_id has Row-Level Security enabled', async () => {
    const rows = await owner.$queryRaw<{ table_name: string; rls: boolean }[]>`
      SELECT c.table_name, cls.relrowsecurity AS rls
      FROM information_schema.columns c
      JOIN pg_class cls ON cls.relname = c.table_name
      JOIN pg_namespace ns ON ns.oid = cls.relnamespace AND ns.nspname = c.table_schema
      WHERE c.table_schema = 'public' AND c.column_name = 'organization_id'`;
    expect(rows.length).toBeGreaterThan(0);
    const missing = rows.filter((r) => !r.rls).map((r) => r.table_name);
    expect(missing).toEqual([]);
  });
});
