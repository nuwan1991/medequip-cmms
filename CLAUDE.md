# MedEquip CMMS – Instructions for Claude

## Product

MedEquip is a **multi-tenant SaaS for managing hospital medical equipment** (CMMS / HTM):
asset register, work orders, preventive maintenance, calibration & safety testing,
spare parts, contracts, recalls, KPIs.

- Business model: **Free plan + paid subscriptions with higher limits** (see `packages/shared/src/plans.ts`).
- Deployment targets, all from the **same code**: single on-prem server → multi-hospital
  central server → cloud + local edge nodes (hybrid, offline-capable).
- Read `docs/` before starting a new module: `docs/requirements/`, `docs/architecture/`, `docs/roadmap.md`.

## Monorepo layout

```
apps/api        NestJS REST API (prefix /api)
apps/web        React + Vite web app (proxies /api to :3000)
packages/shared Zod schemas, roles, plan entitlements (used by api + web)
packages/db     Prisma schema, migrations, seed, re-exported Prisma client
infra/          docker-compose for PostgreSQL + MinIO
docs/           requirements, architecture, ADRs, roadmap
```

## Non-negotiable rules

1. **Tenant isolation.** Every tenant-owned table has `organization_id` (and `site_id` when it
   belongs to a hospital). Tenant data is read/written only through
   `TenantPrismaService.run(orgId, tx => ...)` (restricted DB role + Row-Level Security).
   `PrismaService` (owner role, bypasses RLS) is only for auth/system code. Every new tenant
   table's migration must enable RLS, add the `tenant_isolation` policy and grant
   SELECT/INSERT/UPDATE to `medequip_app` (see docs/architecture/overview.md). Verify
   referenced ids (site, location, model, ...) inside the tenant transaction.
2. **UUID primary keys** and sync columns on business tables: `created_at`, `updated_at`,
   `version`, `deleted_at` (soft delete – never hard-delete business records).
3. **Audit everything.** Every create/update/delete of business data writes to `audit_logs`.
4. **Plan limits are enforced in the API** via `EntitlementsService` – never only in the UI.
5. **Never block safety-critical capabilities** (`ALWAYS_ALLOWED` in shared/plans.ts):
   recall alerts, maintenance history, fault reporting, data export – regardless of plan,
   limit or payment status.
6. **No patient data** in core tables.
7. **Secrets only from environment variables.** Never commit `.env` or credentials.
8. **Every endpoint is authenticated by default.** Use `@RequirePermissions(...)` on every
   route (permissions in `packages/shared/src/permissions.ts`); use `@Public()` only for
   health/auth routes. Take the tenant from `@CurrentUser().organizationId` - never from
   request bodies or query strings.
9. Validation schemas live in `packages/shared` and are reused by API and web.
10. Enums in `schema.prisma` and `packages/shared` must stay in sync.

## Conventions

- TypeScript strict mode everywhere.
- Each feature = NestJS module (`apps/api/src/<module>/`) + Prisma migration + tests +
  web screens + docs update.
- API tests: Jest (`*.spec.ts`). Shared/web tests: Vitest (`*.test.ts`).
  `*.e2e.spec.ts` tests run against a real database when `DATABASE_URL` is set
  (run `pnpm db:deploy` first); they create and clean up their own organizations.
- Database changes: edit `schema.prisma`, then `pnpm db:migrate --name <change>`;
  commit the generated migration. Never edit an applied migration.
- Conventional commits: `feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`.
- Small PRs: one feature or module per branch/PR.

## Commands

```bash
pnpm install                                   # install everything
docker compose -f infra/docker-compose.yml up -d   # PostgreSQL + MinIO
cp .env.example .env && cp .env.example packages/db/.env
pnpm db:deploy && pnpm db:seed                 # create tables + demo data
pnpm dev                                       # API :3000, web :5173
pnpm build | pnpm typecheck | pnpm test | pnpm lint | pnpm format
```

Before every commit: `pnpm lint && pnpm typecheck && pnpm test` must pass.
