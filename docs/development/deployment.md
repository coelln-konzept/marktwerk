# Deployment (Scalingo)

Decision: [ADR 0006](../architecture/adr/0006-hosting.md). Status: **plan, to be verified in the M0.5 spike.**

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

## Spike checklist (M0.5)
- [ ] Create staging app + PostgreSQL 17 addon in osc-fr1
- [ ] Monorepo build with pnpm succeeds on the Node.js buildpack
- [ ] `web` serves login; `worker` logs scheduled jobs
- [ ] `postdeploy` migrations run
- [ ] Seed synthetic data
- [ ] PITR visible; manual backup download works
- [ ] Record monthly cost estimate here
