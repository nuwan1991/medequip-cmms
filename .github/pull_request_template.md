## What

<!-- What does this PR change? Link the issue: Closes #... -->

## Why

## Checklist

- [ ] Tenant-scoped (organization_id) and audited where data changes
- [ ] Plan limits enforced in API (EntitlementsService) if relevant
- [ ] Safety-critical features not blocked by plan/payment status
- [ ] Migration added (if schema changed)
- [ ] Tests added/updated; `pnpm lint && pnpm typecheck && pnpm test` pass
- [ ] Docs updated (docs/ or CLAUDE.md)
