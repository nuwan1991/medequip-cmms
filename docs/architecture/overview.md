# Architecture Overview

## Deployment phases (one codebase)

```
Phase 1 – Single hospital (on-prem):  browsers → API + web → PostgreSQL (+ MinIO, backups)
Phase 2 – Multi-hospital:             hospitals → VPN/WAN → central API + DB (multi-tenant)
Phase 3 – Hybrid:                     cloud central (API, DB, analytics, SSO)
                                         ▲ sync (outbox events over HTTPS / queue)
                                      edge node per hospital (same containers, local DB, offline)
```

## Key design decisions

- **Web app + REST API** (`/api`), no desktop client. Mobile app later uses the same API.
- **Multi-tenant from day 1:** `organization_id` / `site_id` on every tenant-owned table;
  PostgreSQL Row-Level Security (planned) as a second line of defence.
- **UUID keys + sync columns** (`version`, `updated_at`, `deleted_at`, `origin_site_id`) so
  records created on different edge nodes never collide.
- **Data ownership for sync:** each hospital owns its assets/work orders; the central system
  owns master data (plans, shared device library, PM procedures). Avoids most conflicts.
- **Entitlements as data:** plan limits/features in the `plans` table + per-tenant overrides,
  enforced by `EntitlementsService` in the API.
- **Licensing for on-prem/edge (planned):** signed license file (JWT) with plan and limits,
  refreshed on sync, offline grace period.
- **S3-compatible storage:** MinIO locally, S3/Azure Blob in cloud.
- **Containers:** Docker Compose for dev/on-prem; Kubernetes/k3s later.

## Tenant isolation plan (to implement before tenant data endpoints)

1. Auth resolves the user → `organizationId` per request (request-scoped context).
2. API wraps queries in a transaction that runs `SET LOCAL app.organization_id = '<id>'`.
3. RLS policies on tenant tables: `organization_id = current_setting('app.organization_id')::uuid`
   (shared library rows: `organization_id IS NULL` readable by all).
4. App DB role has no `BYPASSRLS`; migrations run with a separate owner role.

## Core data model (current)

```
Plan ─< Organization ─< Site ─< Location (tree) ─< Asset
Organization ─< User
Manufacturer ─< DeviceModel ─< Asset          (org NULL = shared library)
AuditLog (append-only)
```

Next: WorkOrder, PmSchedule, PmProcedure/Checklist, TestResult, Part/Stock, Vendor/Contract, Recall.
