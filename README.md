# marktwerk

Internal operations platform for a German event company (mainly flea and antique markets, plus Stadtfeste
and Food & Wine markets): events, timelines & kanban, permit logbook, staff hours (Minijob), payables, and later
staff WhatsApp, bookings, the shared inbox, inventory, market-day field mode and stall maps.

> **Next session: start with [docs/HANDOFF.md](docs/HANDOFF.md).**
>
> **Status:** Phase 0 complete (foundation). Plan revised after the client meeting
> ([research 05](docs/research/05-client-meeting-2026-10.md)). Next: **Phase 1, "Digitise the work"**, starting with
> M0.5 (synthetic data + Scalingo spike), then M1. See the [roadmap](docs/product/roadmap.md).
> Dev hosting: Vercel + Supabase (free tiers); production host later. See [deployment](docs/development/deployment.md).

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
| `apps/worker` | pg-boss background jobs (deadline sweep, digests, mailbox sync) |
| `packages/core` | Pure domain logic: permissions, relative dates, reminders |
| `packages/db` | Drizzle schema, migrations, DB client |
| `docs/` | Research, product plan, architecture, ADRs, dev guides ([index](docs/README.md)) |

## Stack
Next.js 16 · React 19 · TypeScript 6 · Tailwind 4 + shadcn/ui · Better Auth · next-intl (DE/EN) ·
PostgreSQL 17 · Drizzle ORM · pg-boss · Vitest · Biome · pnpm + Turborepo. Rationale: [ADRs](docs/architecture/adr/README.md).
