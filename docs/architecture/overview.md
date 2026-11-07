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

## Authentication & authorization (implemented)

- **Login:** organization slug + email + password (`POST /api/auth/login`). Passwords hashed
  with scrypt (`packages/db/src/password.ts`). Same error for every failure, constant-time
  comparison even for unknown users. 5 failed attempts → 15 min lockout. Rate-limited.
- **Tokens:** short-lived JWT access token (15 min, in memory in the web app) carrying
  `sub` (user), `org`, `sid` (session). Refresh token is random, stored only as a SHA-256 hash
  in `sessions`, sent as an httpOnly `SameSite=Strict` cookie on `/api/auth`, rotated on every
  refresh. Replaying an old refresh token (after a 30 s grace for tab races) revokes the session.
- **Every request** (`JwtAuthGuard`) verifies the JWT and loads the session + user, so logout,
  disabling a user and role changes take effect immediately. `@Public()` opts out.
- **Permissions:** roles map to permissions in `packages/shared/src/permissions.ts`; endpoints
  declare `@RequirePermissions(...)`, enforced by `PermissionsGuard`.
- **Forced password change:** `mustChangePassword` users can only call routes marked
  `@AllowPendingPasswordChange()` (me, change-password).
- **Safeguards:** admins cannot change/remove their own access; an organization always keeps
  one active admin; user seats are checked against the plan (`maxUsers`).

## Tenant isolation plan (to implement before tenant data endpoints)

1. Auth resolves the user → `organizationId` per request (request-scoped context).
2. API wraps queries in a transaction that runs `SET LOCAL app.organization_id = '<id>'`.
3. RLS policies on tenant tables: `organization_id = current_setting('app.organization_id')::uuid`
   (shared library rows: `organization_id IS NULL` readable by all).
4. App DB role has no `BYPASSRLS`; migrations run with a separate owner role.

## Core data model (current)

```
Plan ─< Organization ─< Site ─< Location (tree) ─< Asset
Organization ─< User ─< Session
Manufacturer ─< DeviceModel ─< Asset          (org NULL = shared library)
AuditLog (append-only)
```

Next: WorkOrder, PmSchedule, PmProcedure/Checklist, TestResult, Part/Stock, Vendor/Contract, Recall.
