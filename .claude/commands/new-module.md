---
description: Plan and build a new MedEquip module end to end
argument-hint: <module name, e.g. "Asset Register">
---

Build the MedEquip module: **$ARGUMENTS**

1. Read CLAUDE.md, docs/requirements/overview.md, docs/architecture/overview.md and docs/roadmap.md.
2. If `docs/requirements/<module>.md` does not exist, draft it first (fields, roles, rules,
   screens, plan limits, acceptance criteria) and show it to me before coding.
3. Propose a plan: Prisma models/migration, shared Zod schemas, API endpoints, web screens, tests.
4. After I approve, implement in this order: schema + migration → shared schemas → API module
   (tenant-scoped, audited, EntitlementsService checks) → tests → web screens → docs.
5. Run `pnpm lint && pnpm typecheck && pnpm test` and fix failures.
6. Summarize what was built and what is left.
