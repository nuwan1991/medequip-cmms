/**
 * End-to-end tests for login, sessions, roles and user management against a real
 * PostgreSQL database. Skipped when DATABASE_URL is not set.
 * Requires migrations applied (pnpm db:deploy).
 */
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { PrismaClient, hashPassword, type Prisma } from '@medequip/db';
import { DEFAULT_PLANS } from '@medequip/shared';
import { AppModule } from '../app.module';
import { configureApp } from '../app.setup';
import { REFRESH_COOKIE } from '../config/env';

const describeDb = process.env.DATABASE_URL ? describe : describe.skip;

const PASSWORD = 'Correct-Horse-42';

function refreshCookie(res: request.Response): string {
  const raw = res.headers['set-cookie'] as unknown as string[] | undefined;
  const cookie = raw?.find((c) => c.startsWith(`${REFRESH_COOKIE}=`));
  if (!cookie) throw new Error('No refresh cookie set');
  return cookie.split(';')[0];
}

describeDb('Auth & users (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  const slug = `e2e-${randomUUID().slice(0, 8)}`;
  const otherSlug = `${slug}-other`;
  const orgIds: string[] = [];

  const login = (email: string, password = PASSWORD, organization = slug) =>
    request(app.getHttpServer()).post('/api/auth/login').send({ organization, email, password });

  async function createOrg(orgSlug: string) {
    const free = DEFAULT_PLANS.find((p) => p.code === 'FREE')!;
    const plan = await prisma.plan.upsert({
      where: { code: 'FREE' },
      update: {},
      create: {
        code: 'FREE',
        name: free.name,
        priceMonthlyUsdCents: 0,
        entitlements: free.entitlements as unknown as Prisma.InputJsonValue,
      },
    });
    const org = await prisma.organization.create({
      data: { name: `E2E ${orgSlug}`, slug: orgSlug, planId: plan.id, status: 'ACTIVE' },
    });
    orgIds.push(org.id);
    await prisma.user.create({
      data: {
        organizationId: org.id,
        email: 'admin@e2e.test',
        name: 'E2E Admin',
        role: 'ORG_ADMIN',
        status: 'ACTIVE',
        passwordHash: await hashPassword(PASSWORD),
      },
    });
    return org;
  }

  beforeAll(async () => {
    prisma = new PrismaClient();
    await createOrg(slug);
    await createOrg(otherSlug);

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    if (prisma) {
      const where = { organizationId: { in: orgIds } };
      await prisma.auditLog.deleteMany({ where });
      await prisma.session.deleteMany({ where });
      await prisma.user.deleteMany({ where });
      await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
      await prisma.$disconnect();
    }
  });

  describe('login', () => {
    it('rejects a wrong password and an unknown organization with the same error', async () => {
      const wrong = await login('admin@e2e.test', 'Wrong-password-1');
      const unknownOrg = await login('admin@e2e.test', PASSWORD, 'no-such-org');
      expect(wrong.status).toBe(401);
      expect(unknownOrg.status).toBe(401);
      expect(wrong.body.code).toBe('INVALID_CREDENTIALS');
      expect(unknownOrg.body.code).toBe('INVALID_CREDENTIALS');
    });

    it('validates input', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ organization: slug, email: 'not-an-email', password: 'x' });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_FAILED');
    });

    it('signs in, sets an httpOnly refresh cookie and returns permissions', async () => {
      const res = await login('ADMIN@e2e.test');
      expect(res.status).toBe(200);
      expect(res.body.accessToken).toEqual(expect.any(String));
      expect(res.body.user.role).toBe('ORG_ADMIN');
      expect(res.body.user.permissions).toContain('users:manage');
      expect(res.body.user.organization.slug).toBe(slug);

      const cookie = (res.headers['set-cookie'] as unknown as string[]).join(';');
      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('Path=/api/auth');
      expect(cookie).toContain('SameSite=Strict');
    });

    it('requires a token for protected routes', async () => {
      await request(app.getHttpServer()).get('/api/auth/me').expect(401);
      await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Authorization', 'Bearer not-a-jwt')
        .expect(401);
      await request(app.getHttpServer()).get('/api/health').expect(200);
    });
  });

  describe('sessions', () => {
    it('rotates refresh tokens and detects reuse of an old token', async () => {
      const first = await login('admin@e2e.test');
      const cookie1 = refreshCookie(first);

      const second = await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .set('Cookie', cookie1)
        .expect(200);
      const cookie2 = refreshCookie(second);
      expect(cookie2).not.toBe(cookie1);

      // Same old token again within the grace period: a tab race, not theft.
      const race = await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .set('Cookie', cookie1);
      expect(race.status).toBe(401);
      expect(race.body.code).toBe('REFRESH_RACE');

      // Move the rotation into the past, then replay the old token: session is revoked.
      await prisma.session.updateMany({
        where: { organizationId: orgIds[0], previousTokenHash: { not: null } },
        data: { rotatedAt: new Date(Date.now() - 60_000) },
      });
      await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .set('Cookie', cookie1)
        .expect(401);
      await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${second.body.accessToken}`)
        .expect(401);
      await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .set('Cookie', cookie2)
        .expect(401);
    });

    it('logout invalidates the session immediately', async () => {
      const res = await login('admin@e2e.test');
      const token = res.body.accessToken as string;
      await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      await request(app.getHttpServer())
        .post('/api/auth/logout')
        .set('Cookie', refreshCookie(res))
        .expect(204);
      await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(401);
    });
  });

  describe('roles and user management', () => {
    let adminToken: string;
    let techId: string;

    beforeAll(async () => {
      adminToken = (await login('admin@e2e.test')).body.accessToken;
    });

    const asAdmin = () => ({ Authorization: `Bearer ${adminToken}` });

    it('admin creates a technician who must change their password', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/users')
        .set(asAdmin())
        .send({ email: 'tech@e2e.test', name: 'Tech One', role: 'TECHNICIAN', password: PASSWORD })
        .expect(201);
      techId = res.body.id;
      expect(res.body.mustChangePassword).toBe(true);
      expect(res.body).not.toHaveProperty('passwordHash');

      await request(app.getHttpServer())
        .post('/api/users')
        .set(asAdmin())
        .send({ email: 'tech@e2e.test', name: 'Dup', role: 'TECHNICIAN', password: PASSWORD })
        .expect(409);
    });

    it('forces a password change, then enforces role permissions', async () => {
      const first = await login('tech@e2e.test');
      expect(first.body.user.mustChangePassword).toBe(true);
      const tech = { Authorization: `Bearer ${first.body.accessToken}` };

      const blocked = await request(app.getHttpServer()).get('/api/users').set(tech);
      expect(blocked.status).toBe(403);
      expect(blocked.body.code).toBe('PASSWORD_CHANGE_REQUIRED');

      const wrong = await request(app.getHttpServer())
        .post('/api/auth/change-password')
        .set(tech)
        .send({ currentPassword: 'Not-the-password', newPassword: 'Brand-New-Pass-7' });
      expect(wrong.status).toBe(400);

      const changed = await request(app.getHttpServer())
        .post('/api/auth/change-password')
        .set(tech)
        .send({ currentPassword: PASSWORD, newPassword: 'Brand-New-Pass-7' })
        .expect(200);
      expect(changed.body.mustChangePassword).toBe(false);

      const denied = await request(app.getHttpServer()).get('/api/users').set(tech);
      expect(denied.status).toBe(403);
      expect(denied.body.code).toBe('MISSING_PERMISSION');

      await request(app.getHttpServer())
        .post('/api/users')
        .set(tech)
        .send({ email: 'x@e2e.test', name: 'X', role: 'ORG_ADMIN', password: PASSWORD })
        .expect(403);
    });

    it('role changes apply immediately and disabling a user signs them out', async () => {
      const techLogin = await login('tech@e2e.test', 'Brand-New-Pass-7');
      const tech = { Authorization: `Bearer ${techLogin.body.accessToken}` };

      await request(app.getHttpServer())
        .patch(`/api/users/${techId}`)
        .set(asAdmin())
        .send({ role: 'BIOMED_ENGINEER' })
        .expect(200);
      await request(app.getHttpServer()).get('/api/users').set(tech).expect(200);

      await request(app.getHttpServer())
        .patch(`/api/users/${techId}`)
        .set(asAdmin())
        .send({ status: 'DISABLED' })
        .expect(200);
      await request(app.getHttpServer()).get('/api/auth/me').set(tech).expect(401);
      expect((await login('tech@e2e.test', 'Brand-New-Pass-7')).status).toBe(401);
    });

    it('protects admins from locking themselves or the organization out', async () => {
      const me = await request(app.getHttpServer()).get('/api/auth/me').set(asAdmin()).expect(200);
      const own = await request(app.getHttpServer())
        .patch(`/api/users/${me.body.id}`)
        .set(asAdmin())
        .send({ role: 'VIEWER' });
      expect(own.status).toBe(400);
      expect(own.body.code).toBe('CANNOT_CHANGE_OWN_ACCESS');

      await request(app.getHttpServer())
        .delete(`/api/users/${me.body.id}`)
        .set(asAdmin())
        .expect(400);
    });

    it('enforces the plan user limit (Free = 5 active users)', async () => {
      // Active now: admin only (technician is disabled). Add 4 more → 5.
      for (let i = 1; i <= 4; i++) {
        await request(app.getHttpServer())
          .post('/api/users')
          .set(asAdmin())
          .send({ email: `u${i}@e2e.test`, name: `User ${i}`, role: 'VIEWER', password: PASSWORD })
          .expect(201);
      }
      const over = await request(app.getHttpServer())
        .post('/api/users')
        .set(asAdmin())
        .send({ email: 'u5@e2e.test', name: 'User 5', role: 'VIEWER', password: PASSWORD });
      expect(over.status).toBe(403);
      expect(over.body.code).toBe('PLAN_LIMIT_REACHED');

      // Re-enabling a disabled user also counts toward the limit.
      const reenable = await request(app.getHttpServer())
        .patch(`/api/users/${techId}`)
        .set(asAdmin())
        .send({ status: 'ACTIVE' });
      expect(reenable.status).toBe(403);
    });

    it('keeps organizations isolated', async () => {
      const other = await login('admin@e2e.test', PASSWORD, otherSlug);
      const otherAdmin = { Authorization: `Bearer ${other.body.accessToken}` };

      const list = await request(app.getHttpServer()).get('/api/users').set(otherAdmin).expect(200);
      expect(list.body).toHaveLength(1);

      await request(app.getHttpServer())
        .patch(`/api/users/${techId}`)
        .set(otherAdmin)
        .send({ name: 'Hijacked' })
        .expect(404);
    });

    it('writes an audit trail without secrets', async () => {
      const logs = await prisma.auditLog.findMany({ where: { organizationId: orgIds[0] } });
      const actions = new Set(logs.map((l) => l.action));
      for (const a of ['LOGIN', 'LOGIN_FAILED', 'LOGOUT', 'CREATE', 'UPDATE', 'PASSWORD_CHANGE']) {
        expect(actions).toContain(a);
      }
      expect(JSON.stringify(logs)).not.toMatch(/passwordHash|scrypt\$/);
    });
  });

  describe('account lockout', () => {
    it('locks the account after 5 failed attempts', async () => {
      await prisma.user.create({
        data: {
          organizationId: orgIds[1],
          email: 'lock@e2e.test',
          name: 'Lock Test',
          role: 'VIEWER',
          status: 'ACTIVE',
          passwordHash: await hashPassword(PASSWORD),
        },
      });
      for (let i = 0; i < 5; i++) {
        expect((await login('lock@e2e.test', 'Wrong-password-1', otherSlug)).status).toBe(401);
      }
      // Correct password is now refused too.
      expect((await login('lock@e2e.test', PASSWORD, otherSlug)).status).toBe(401);
    });
  });
});
