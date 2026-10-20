# marktwerk

Operations platform for a German flea-market company: markets, checklists, deadlines, permits,
and later vendors, bookings, the shared inbox, invoices, market-day field mode and stall maps.

> **Status:** Phase 0 complete (foundation). Next: **Phase 1, "Nothing slips"**: tasks, checklists,
> deadlines, permits, notifications, boss view. See the [roadmap](docs/product/roadmap.md).

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
PostgreSQL 18 · Drizzle ORM · pg-boss · Vitest · Biome · pnpm + Turborepo. Rationale: [ADRs](docs/architecture/adr/README.md).
