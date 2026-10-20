# Development setup

## Prerequisites
- Node.js **24** (see `.nvmrc`; minimum 22.18)
- pnpm **10** (`npm i -g pnpm@10.34.7` or `corepack enable`)
- Docker (for Postgres + Mailpit)

## First run
```bash
pnpm install
cp .env.example .env            # then set BETTER_AUTH_SECRET: openssl rand -base64 32
pnpm db:up                      # Postgres 18 on :5432, Mailpit on :1025 / UI :8025
pnpm db:migrate                 # apply migrations
pnpm db:seed                    # company settings + owner account (see SEED_OWNER_* in .env)
pnpm dev                        # web on http://localhost:3000 + worker
```
Log in with `owner@marktwerk.local` / `marktwerk-dev-123` (from `.env`).

## Everyday commands
| Command | What |
|---|---|
| `pnpm dev` | web + worker in watch mode (Turborepo) |
| `pnpm check` | lint + typecheck + tests, run before every commit |
| `pnpm lint:fix` | Biome lint + format with fixes |
| `pnpm test` | Vitest in all packages |
| `pnpm build` | production build (web standalone + worker bundle) |
| `pnpm db:generate --name <change>` | create a migration after editing `packages/db/src/schema` |
| `pnpm db:migrate` | apply migrations |
| `pnpm db:studio` | Drizzle Studio (DB browser) |
| `pnpm --filter @marktwerk/web <script>` | run a script in one package |

## Adding shadcn/ui components
The repo has `apps/web/components.json`. From `apps/web`:
```bash
pnpm dlx shadcn@latest add dialog table dropdown-menu
```
`button`, `input`, `label`, `card` are hand-written stand-ins (the registry was unreachable when the
repo was scaffolded); re-add them with `--overwrite` to get the official versions.

## Services in dev
- **Mailpit** catches all outgoing mail: http://localhost:8025
- **Postgres**: `postgres://marktwerk:marktwerk@localhost:5432/marktwerk`
- **pg-boss** tables live in schema `pgboss`
