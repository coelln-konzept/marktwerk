# marktwerk

Internal operations platform for a German event company (mainly flea and antique markets, plus Stadtfeste
and Food & Wine markets). Today it is a task monitoring panel for the office: events and market dates, Vorlagen and
checklists, the Genehmigungen logbook, company Pflichten, Kalender and Übersicht. Staff hours (Minijob), payables and
the kanban board are built but hidden in the UI for now; later come staff WhatsApp, bookings, the shared inbox,
inventory, market-day field mode and stall maps.

> **Next session: start with [docs/HANDOFF.md](docs/HANDOFF.md).**
>
> **Current state:** Phase 1 (M1–M6) is built and has been reshaped by user tests, the client's own checklists and a
> UX audit; the M6 exit (pilot with real data) is still open. Some modules are hidden in the UI
> (`apps/web/src/lib/modules.ts`, listed in the [roadmap](docs/product/roadmap.md#status)). **Steps and progress live in the
> [Marktwerk Fahrplan](https://claude.ai/artifact/Ei3Xy9VGSDWr5WsEujn639)**, the source of truth. Dev: Vercel +
> Supabase; production host later ([deployment](docs/development/deployment.md)).

## Quick start
```bash
pnpm install
cp .env.example .env     # set BETTER_AUTH_SECRET (openssl rand -base64 32)
pnpm db:up && pnpm db:migrate && pnpm db:seed
pnpm dev                 # http://localhost:3000 · owner@marktwerk.local / marktwerk-dev-123
```
Details: [docs/development/setup.md](docs/development/setup.md)

## Repository layout
| Path | What |
|---|---|
| `apps/web` | Next.js 16 back office (+ booking form & field PWA later) |
| `apps/worker` | pg-boss process that runs the `packages/jobs` handlers (deadline sweep, reminders, digest, mail) |
| `packages/core` | Pure domain logic: permissions, relative dates, reminders |
| `packages/db` | Drizzle schema, migrations, DB client |
| `packages/jobs` | Background job handlers, shared by the worker (pg-boss) and the cron HTTP endpoint (serverless dev hosting) |
| `packages/synthetic` | Deterministic, seeded synthetic development data (ADR 0016; never for production) |
| `docs/` | Research, product plan, architecture, ADRs, dev guides ([index](docs/README.md)) |

## Stack
Next.js 16 · React 19 · TypeScript 6 · Tailwind 4 + shadcn/ui · Better Auth · next-intl (DE/EN) ·
PostgreSQL 17 · Drizzle ORM · pg-boss · Vitest · Biome · pnpm + Turborepo. Rationale: [ADRs](docs/architecture/adr/README.md).
