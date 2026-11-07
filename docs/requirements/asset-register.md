# Asset Register (with sites, locations and device library)

## Scope (v1, implemented)

| Area           | What users can do                                                                                            | Permission                               |
| -------------- | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------- |
| Sites          | List; add/rename (plan `maxSites`)                                                                           | read: `assets:read`; write: `org:manage` |
| Locations      | Tree per site (building › floor › department › room, stores); add, rename, move, remove when empty           | `assets:read` / `assets:write`           |
| Device library | Shared global manufacturers/models + organization's own; add manufacturer/model; edit own models             | `assets:read` / `assets:write`           |
| Assets         | List with search/filters/paging; add; edit; soft-remove; detail with QR label and change history; CSV export | `assets:read` / `assets:write`           |

## Business rules

- Asset tag is unique per organization (letters, numbers, `- . / _`), printed on the QR label.
- Risk level defaults to the device model's default risk.
- Location must belong to the asset's site; moving an asset to another site clears its location.
- Filtering by a location includes everything inside it (e.g. a building → all its departments).
- **Optimistic locking:** edits send the `version` they loaded; a stale edit gets 409 and nothing is overwritten.
- **Plan limit:** `maxAssets` counts assets not removed and not `DISPOSED`. Recording a disposed asset is allowed at the limit; returning it to service counts again.
- **Read-only / suspended accounts:** no changes, but list, detail, **history and CSV export always work** (safety-critical access, rule 5).
- Remove = soft delete (kept in DB and audit). For equipment leaving the hospital use status `DISPOSED`.
- History comes from the audit log and shows field-level changes with who/when.
- CSV export is audited and protected against spreadsheet formula injection.

## Later

- Bulk QR label sheets, Excel import, parent/child assets (e.g. monitor + modules)
- Photos and documents per asset (MinIO / S3)
- Fault reporting from the QR scan page, work orders and PM schedules
