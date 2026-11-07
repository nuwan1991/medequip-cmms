# ADR 0001: TypeScript monorepo (NestJS, React, PostgreSQL, Prisma)

- Status: accepted
- Date: 2026-11-07

## Context

The system is built mostly with AI-assisted development by a small team and must later run
as cloud SaaS, on-prem and hybrid edge nodes, with a web app and a mobile app.

## Decision

- One language end to end: **TypeScript**.
- **pnpm workspaces + Turborepo** monorepo.
- **NestJS** API, **React + Vite** web, **React Native (Expo)** mobile later.
- **PostgreSQL** with **Prisma** ORM; **Zod** schemas shared between API and clients.

## Consequences

- Shared types and validation across all apps; one toolchain; large hiring pool.
- PostgreSQL enables Row-Level Security for tenant isolation and runs anywhere.
- Prisma migrations are committed and applied with `prisma migrate deploy` in every environment.
