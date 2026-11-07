# Roadmap

## Done (v0.1 starter)

- [x] Monorepo, Docker Compose, CI
- [x] Prisma schema: plans, organizations, sites, users, locations, manufacturers, device models, assets, audit log
- [x] Plan catalogue + EntitlementsService (limits, features, never-blocked safety features)
- [x] API health endpoints, web shell

## Foundation (next)

- [x] Authentication: login, scrypt password hashing, JWT access tokens + rotating refresh cookie, logout, lockout
- [x] Roles → permissions, global auth + permission guards
- [x] User management (admin): create, change role, disable, reset password, remove; plan user limit
- [x] Forced password change for new users / resets
- [x] Audit log for logins, logouts, password changes and user changes
- [x] PostgreSQL Row-Level Security (database-level tenant isolation)
- [ ] Audit log interceptor (automatic on create/update/delete for all modules)
- [ ] Email invitations and self-service "forgot password" (needs email service)
- [ ] MFA (TOTP) for admins; SSO (OIDC) for Fleet/Enterprise plans
- [ ] Department-level scoping for DEPT_HEAD / CLINICAL_USER
- [ ] Organization sign-up + tenant provisioning

## MVP (pilot in one hospital)

- [x] Locations (site → building → department → room) and sites (plan site limit)
- [x] Device library (shared global + organization's own manufacturers/models)
- [x] Asset register: search/filters, add/edit (optimistic locking), history, CSV export, QR label printing
- [ ] Bulk QR label sheets, asset photos/documents, parent/child assets
- [ ] Corrective work orders + fault reporting by QR scan
- [ ] Preventive maintenance schedules and checklists
- [ ] Dashboard + basic KPIs
- [ ] Excel import of existing inventory

## After MVP

- [ ] Calibration & electrical safety testing
- [ ] Spare parts & inventory
- [ ] Vendors & contracts
- [ ] Recalls & alerts
- [ ] Billing (Stripe / Paddle), usage dashboard, upgrade flow
- [ ] Mobile app (offline)
- [ ] Multi-site / fleet features, SSO
- [ ] Hybrid edge node, sync service, license files
- [ ] Integrations (ERP, HIS, HL7 FHIR)
