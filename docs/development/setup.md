# Development setup

## Prerequisites
- Node.js **24** (see `.nvmrc`; minimum 22.18)
- pnpm **10** (`npm i -g pnpm@10.34.7` or `corepack enable`)
- Docker (for Postgres + Mailpit)

## First run
```bash
pnpm install
cp .env.example .env            # then set BETTER_AUTH_SECRET: openssl rand -base64 32
pnpm db:up                      # Postgres 17 on :5432 (= production major), Mailpit on :1025 / UI :8025
pnpm db:migrate                 # apply migrations
pnpm db:seed                    # synthetic dataset + logins (owner, manager, 2 staff, 1 field; dev password only for a local DB)
pnpm dev                        # web on http://localhost:3000 + worker
```
Log in with `owner@marktwerk.local` / `marktwerk-dev-123` (from `.env`). The field login for checking the
restricted view (only the events they have a duty at, no write access) is `logistik@marktwerk.local` with the same
password (the logistics lead of the synthetic data); other seeded logins: `burak.lax@example.com` (manager),
`natalia.schulze@example.com` and `annabel.green@example.com` (staff). On a non-local database no login is created
without `SEED_OWNER_PASSWORD` / `SEED_STAFF_PASSWORD`.

## Everyday commands
| Command | What |
|---|---|
| `pnpm dev` | web + worker in watch mode (Turborepo) |
| `pnpm check` | lint + typecheck + tests, run before every commit |
| `pnpm lint:fix` | Biome lint + format with fixes |
| `pnpm test` | Vitest in all packages + message check (no database needed) |
| `pnpm test:integration` | service tests against Postgres (`marktwerk_test`), see [testing.md](./testing.md) |
| `pnpm test:e2e` | Playwright smoke test against a running app, see [testing.md](./testing.md) |
| `pnpm build` | production build (web standalone + worker bundle) |
| `pnpm db:generate --name <change>` | create a migration after editing `packages/db/src/schema` |
| `pnpm db:migrate` | apply migrations |
| `pnpm db:studio` | Drizzle Studio (DB browser) |
| `pnpm synth` | generate the synthetic development dataset into `packages/synthetic/out/` (ADR 0016) |
| `pnpm --filter @marktwerk/web <script>` | run a script in one package |

## Adding shadcn/ui components
The repo has `apps/web/components.json`. From `apps/web`:
```bash
pnpm dlx shadcn@latest add tooltip
```
**Don't overwrite** the existing files in `src/components/ui/`: they are hand-written to match the Claude Design
tokens (see `docs/design/component-inventory.md`). Restyle anything new to the tokens in `src/app/globals.css`.
Overlays and menus use Base UI (`@base-ui/react`) directly.

## Services in dev
- **Mailpit** catches all outgoing mail: http://localhost:8025
- **Postgres**: `postgres://marktwerk:marktwerk@localhost:5432/marktwerk`
- **pg-boss** tables live in schema `pgboss`
