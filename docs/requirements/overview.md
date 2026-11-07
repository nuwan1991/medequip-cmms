# Requirements Overview

## Vision

A medical equipment management system (CMMS / HTM) for single hospitals and hospital groups,
offered as a free plan plus paid subscriptions, deployable on-prem, multi-hospital or hybrid.

## Users and roles

| Role            | Can do                                                   |
| --------------- | -------------------------------------------------------- |
| ORG_ADMIN       | Organization, sites, users, plan/billing, settings       |
| BIOMED_ENGINEER | Full equipment management, approvals, reports            |
| TECHNICIAN      | Execute work orders, PM, tests; record parts and time    |
| DEPT_HEAD       | View department equipment, request/approve, view reports |
| CLINICAL_USER   | Report faults (QR scan), view own department's equipment |
| VIEWER          | Read-only (management, auditors)                         |

## Functional modules

| #   | Module                   | Key features                                                                         |
| --- | ------------------------ | ------------------------------------------------------------------------------------ |
| 1   | Asset Register           | Tag/QR, UDI, make/model/serial, classification, risk, location, status, parent/child |
| 2   | Procurement & Acceptance | Specs, PO, incoming inspection, commissioning, acceptance test                       |
| 3   | Preventive Maintenance   | Risk-based schedules, checklists per model, auto work orders, overdue tracking       |
| 4   | Corrective Maintenance   | Fault reporting, work orders, assignment, downtime, failure codes                    |
| 5   | Calibration & Safety     | IEC 62353 tests, performance tests, certificates, auto-quarantine on fail            |
| 6   | Spare Parts & Inventory  | Stock per store, min/max, consumption per work order, transfers                      |
| 7   | Vendors & Contracts      | Warranty, service contracts, SLA, vendor performance                                 |
| 8   | Recalls & Alerts         | Safety notices, match to affected assets, action tracking                            |
| 9   | Incidents                | Device-related incidents, investigation, regulator reporting                         |
| 10  | Training                 | User/technician competency per device model                                          |
| 11  | Financial & Lifecycle    | Cost, depreciation, TCO, replacement planning, disposal                              |
| 12  | Documents                | Manuals, certificates, photos per model/asset                                        |
| 13  | Loans & Transfers        | Between departments and hospitals                                                    |
| 14  | Dashboards & KPIs        | Uptime, MTBF, MTTR, PM compliance, backlog, cost of service ratio                    |
| 15  | Admin & Audit            | Users, roles, sites, master data, audit log                                          |
| 16  | Subscription & Billing   | Plans, limits, usage, upgrade/downgrade, invoices                                    |

## Subscription plans (defaults in `packages/shared/src/plans.ts`)

| Plan         | Assets | Sites | Users | Notes                                 |
| ------------ | ------ | ----- | ----- | ------------------------------------- |
| Free         | 300    | 1     | 5     | Core modules                          |
| Professional | 5,000  | 2     | 50    | + spare parts, contracts, mobile, API |
| Fleet        | 50,000 | 20    | 500   | + transfers, SSO                      |
| Enterprise   | ∞      | ∞     | ∞     | + edge node / hybrid, custom SLA      |

Recall alerts, maintenance history, fault reporting and data export are **never** blocked.

## Non-functional requirements

- Security: RBAC, MFA for admins, TLS, encryption at rest, append-only audit trail, no patient data.
- Availability: on-prem RPO ≤ 1 h / RTO ≤ 4 h; hybrid edge nodes work offline.
- Performance: pages < 2 s; 100k+ assets per organization.
- Usability: mobile-friendly, multi-language, minimal clicks for fault reporting.

## Standards to align with

WHO medical equipment maintenance guidance · ISO 55000 · IEC 62353 / 60601 · AAMI EQ56/EQ89 ·
Joint Commission EC.02.04.01/03 (or national accreditation) · ISO 27001 · GS1 UDI · HL7 FHIR Device
