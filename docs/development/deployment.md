# Deployment

## Development (now): Vercel + Supabase, ADR 0017
| Piece | Where | Notes |
|---|---|---|
| Web app | Vercel project `marktwerk` (root `apps/web`, region fra1) | Auto-deploy from `main` on GitHub; previews per branch |
| Database | Supabase `marktwerk-dev` (eu-central-1, Postgres 17) | Role `marktwerk_app`; schema `app`; pooler 6543 (app) / 5432 (migrations) |
| Jobs | GitHub Actions `.github/workflows/cron.yml` → `POST /api/cron/<job>` | Needs repo variable `APP_URL` and secret `CRON_SECRET` |
| Health | `GET /api/health` | `{ ok, db }` |

Vercel environment variables: `DATABASE_URL`, `DATABASE_MIGRATION_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`
(the production `*.vercel.app` URL), `APP_URL` (same), `CRON_SECRET`, `APP_TIMEZONE=Europe/Berlin`.

### Seeding the dev database (GitHub Actions)
The sandbox and most laptops cannot reach the Supabase pooler directly, so the synthetic development dataset
([ADR 0016](../architecture/adr/0016-synthetic-development-data.md): 148 events, 12 venues, 14 presets, 1,500 vendors, …)
is loaded by the manual workflow `.github/workflows/seed-dev.yml`.

1. Repository secret **`DATABASE_MIGRATION_URL`**: the Supabase *session* pooler URL (port 5432) of the role that owns
   schema `app`. The seed script prefers it over `DATABASE_URL`.
2. Optional secrets `SEED_OWNER_EMAIL`, `SEED_OWNER_PASSWORD` and `SEED_STAFF_PASSWORD` (manager/staff logins of the
   synthetic team). The development password in this repo is public, so the seed uses it **only for a local
   database**; against Supabase it creates no new login without the matching secret (existing users are never
   changed, only linked to their staff record).
3. GitHub → Actions → **Seed dev database** → *Run workflow* → type `seed` in the `confirm` field. Any other value
   skips the job.
4. The seed is idempotent (`ON CONFLICT DO NOTHING`, fixed ids), so a second run changes nothing. It does **not**
   migrate: migrations run in the Vercel build (`vercel.json`), so deploy first when the schema changed.

Locally the same thing is `pnpm db:seed` (reads the root `.env` if there is one; in CI the variables come from the
environment).

## Production (later): Scalingo candidate, ADR 0006
Status: **plan, to be verified before the pilot.**

## Topology
| Scalingo app | Region | Processes | Addons |
|---|---|---|---|
| `marktwerk-staging` | osc-fr1 | `web` ×1, `worker` ×1 | PostgreSQL 17 (Starter/Business) |
| `marktwerk-prod` | osc-fr1 | `web` ×1–2, `worker` ×1 | PostgreSQL 17 (Business, PITR) |

## Planned files (added during the spike)
`Procfile` at the repo root:
```
web: node apps/web/.next/standalone/apps/web/server.js
worker: node apps/worker/dist/index.mjs
postdeploy: pnpm db:migrate
```
- Build: `pnpm install --frozen-lockfile && pnpm build`, then copy `apps/web/.next/static` and `apps/web/public`
  into the standalone folder (Next.js standalone doesn't include them).
- Node version from `.nvmrc`/`engines`; pnpm from `packageManager` (verify buildpack support; fallback:
  `corepack enable` in a build hook or a multi-buildpack setup).
- Next.js listens on `$PORT` (set `HOSTNAME=0.0.0.0`).

## Environment variables
`DATABASE_URL` (from the addon: `SCALINGO_POSTGRESQL_URL`), `APP_URL`, `APP_TIMEZONE=Europe/Berlin`,
`BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `SMTP_*` (EU transactional mail provider), `STORAGE_DRIVER=s3` + `S3_*`
(EU bucket), later `M365_*`.

## Backups
1. Scalingo PITR (7 days shared / longer on dedicated plans) + daily backups.
2. **Nightly encrypted `pg_dump` + file sync to the company's server** (worker job; target and credentials
   decided with the client).
3. Restore test every quarter, documented in this file.

## Data
Staging is seeded from `packages/synthetic` ([ADR 0016](../architecture/adr/0016-synthetic-development-data.md)).
Production starts empty and receives real data during the pilot.

## Scalingo spike checklist (before the pilot)
- [ ] Create staging app + PostgreSQL 17 addon in osc-fr1
- [ ] Monorepo build with pnpm succeeds on the Node.js buildpack
- [ ] `web` serves login; `worker` logs scheduled jobs
- [ ] `postdeploy` migrations run
- [ ] Seed synthetic data
- [ ] PITR visible; manual backup download works
- [ ] Record monthly cost estimate here
