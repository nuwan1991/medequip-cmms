# MedEquip CMMS

Medical equipment management system for hospitals and hospital groups: asset register,
maintenance, calibration, spare parts, contracts, recalls and KPIs.

- **Free plan** plus paid subscriptions with higher limits
- Runs **on-prem**, **multi-hospital** or **hybrid cloud + local**, all from one codebase

> Status: early development (v0.1 starter). See [docs/roadmap.md](docs/roadmap.md).

## Tech stack

TypeScript monorepo (pnpm + Turborepo) · NestJS API · React + Vite web · PostgreSQL + Prisma ·
Zod · Docker Compose · GitHub Actions CI

## Getting started

Requirements: Node.js 22+, pnpm 10+, Docker.

```bash
pnpm install
docker compose -f infra/docker-compose.yml up -d
cp .env.example .env
cp .env.example packages/db/.env
pnpm db:deploy
pnpm db:seed
pnpm dev
```

> Upgrading an existing local database created before Row-Level Security? Create the app
> role once: `docker compose -f infra/docker-compose.yml exec postgres psql -U medequip -c "CREATE ROLE medequip_app LOGIN PASSWORD 'medequip_app'"`

- Web app: http://localhost:5173. Demo sign-in: organization `demo-hospital`,
  email `admin@demo.local`, password `ChangeMe-2026!` (or `SEED_ADMIN_PASSWORD`).
  You will be asked to change it at first sign-in.
- API health: http://localhost:3000/api/health (database check: `/api/health/db`)
- MinIO console: http://localhost:9001

## Project structure

| Path              | Purpose                                        |
| ----------------- | ---------------------------------------------- |
| `apps/api`        | NestJS REST API                                |
| `apps/web`        | React web application                          |
| `packages/shared` | Shared Zod schemas, roles, subscription plans  |
| `packages/db`     | Prisma schema, migrations, seed data           |
| `infra`           | Docker Compose for local services              |
| `docs`            | Requirements, architecture, decisions, roadmap |
| `CLAUDE.md`       | Rules and conventions for AI-assisted coding   |

## Development workflow

1. Pick or create a GitHub issue.
2. Create a branch: `feat/<short-name>`.
3. Build with tests. Run `pnpm lint && pnpm typecheck && pnpm test`.
4. Open a pull request. CI must pass before merging to `main`.

## License

Proprietary. All rights reserved. See [LICENSE](LICENSE).
