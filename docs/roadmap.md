# Roadmap

## Done (v0.1 starter)

- [x] Monorepo, Docker Compose, CI
- [x] Prisma schema: plans, organizations, sites, users, locations, manufacturers, device models, assets, audit log
- [x] Plan catalogue + EntitlementsService (limits, features, never-blocked safety features)
- [x] API health endpoints, web shell

## Foundation (next)

- [ ] Authentication (login, password hashing, sessions/JWT), invite users
- [ ] Request tenant context + PostgreSQL Row-Level Security
- [ ] RBAC guards per role
- [ ] Audit log interceptor (automatic on create/update/delete)
- [ ] Organization sign-up + tenant provisioning

## MVP (pilot in one hospital)

- [ ] Locations (site → building → department → room)
- [ ] Device library (manufacturers, models)
- [ ] Asset register + QR label printing
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
