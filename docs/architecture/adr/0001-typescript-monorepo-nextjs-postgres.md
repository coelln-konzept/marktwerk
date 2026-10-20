# 0001: TypeScript monorepo: Next.js + PostgreSQL + Drizzle

**Status:** accepted (2026-10-20, chosen by the product owner)

## Context
A CRUD-heavy back office, a public booking form, an offline-capable field PWA and background jobs,
built by one developer with Claude. Relational integrity matters (bookings, invoices, permits).

## Decision
- **pnpm workspace + Turborepo**: `apps/web`, `apps/worker`, `packages/core`, `packages/db`.
- **Next.js 16** (App Router, Server Actions, Turbopack) + React 19 for all UI surfaces.
- **PostgreSQL** + **Drizzle ORM** (0.45.x; 1.0 is still RC). Snake-case columns, SQL migrations in git.
- Pure domain logic in `packages/core` (no I/O, unit-tested); both apps import it.

## Consequences
- One language end to end. Domain rules exist once, shared by the web app and the worker.
- Internal packages ship TS source (`transpilePackages` in Next, bundled by tsdown in the worker): no build step for packages.
- Drizzle 1.0 migration will be needed later (mostly API-compatible).
