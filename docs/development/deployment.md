# Deployment

## Development (now): Vercel + Supabase, ADR 0017
| Piece | Where | Notes |
|---|---|---|
| Web app | Vercel project `marktwerk` (root `apps/web`, region fra1) | Auto-deploy from `main` on GitHub; previews per branch |
| Database | Supabase `marktwerk-dev` (eu-central-1, Postgres 17) | Role `marktwerk_app`; schema `app`; pooler 6543 (app) / 5432 (migrations) |
| Jobs | GitHub Actions `.github/workflows/cron.yml` → `POST /api/cron/<job>` | Needs repo variable `APP_URL` and secret `CRON_SECRET` |
| Health | `GET /api/health` | `{ ok, db }` |

Vercel environment variables: `DATABASE_URL`, `DATABASE_MIGRATION_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`
(the production `*.vercel.app` URL), `APP_URL` (same), `CRON_SECRET`, `APP_TIMEZONE=Europe/Berlin`, and the mail
fence variables below (`APP_ENV`, `MAIL_CATCH_ALL`, optional `MAIL_ALLOWLIST`). `MIGRATE_ON_PREVIEW=1` exists only as a
branch-scoped Preview variable of a branch environment (below).

### Migrations in the Vercel build
`apps/web/vercel.json` runs `pnpm --filter @marktwerk/db migrate:build` before `next build`.
`packages/db/scripts/migrate-on-build.ts` decides from Vercel's `VERCEL_ENV` whether to run `drizzle-kit migrate`
(rules in `migrate-gate.ts`, tested by `pnpm --filter @marktwerk/db test`):

| Build | Migrates? |
|---|---|
| `VERCEL_ENV=production` (pushes to `main`) | Yes |
| `VERCEL_ENV=preview` (every other branch) | **Only with `MIGRATE_ON_PREVIEW=1`.** Otherwise the log says `[migrate] Skipped: Vercel preview build without MIGRATE_ON_PREVIEW=1…` and the build goes on |
| No `VERCEL_ENV` (local, CI, a future host) | Yes, as before |

Why: a preview without its own branch database uses the **shared Preview** `DATABASE_URL`. The repo does not record
which database that is; as the only other hosted database is Supabase `marktwerk-dev`, assume it is the dev database
the deployed app uses. Migrating it from a PR build would change a shared database before the PR is reviewed or merged
(audit 2026-11-13, PR #47's `pg_trgm` migration). So a plain preview of a branch with a new migration runs against
the old schema: pages that need the new columns fail there until the branch has its own environment or is merged.

**Set `MIGRATE_ON_PREVIEW=1` only as a Preview variable scoped to the git branch of a branch environment**, next to
that branch's own `DATABASE_URL` / `DATABASE_MIGRATION_URL` (see *up* below). Never as a shared Preview value and never
on Production (production migrates anyway). Only the exact value `1` opts in. The script runs with Node's built-in type
stripping, so the Vercel project needs Node 22.18 or newer (`.nvmrc`: 24).

### Outbound mail fence (ADR 0023)
Every mail the SMTP transport sends (`createMailTransport` in `packages/jobs`, the one path for the queued mails and
for anything sent directly) passes the fence (`fenceMail` in `packages/core/src/mail/fence.ts`):

| Variable | Values | Effect |
|---|---|---|
| `APP_ENV` | `local` · `preview` · `production`, default **`local`** | Anything but `production` is fenced. Another value stops the web app and the worker at startup |
| `MAIL_CATCH_ALL` | one plain address | Outside production every recipient not on the allowlist is replaced by it. **Required** outside production when `SMTP_HOST` is set: without it no mail is sent (the queued message records the error and retries) |
| `MAIL_ALLOWLIST` | comma-separated addresses and `@domain` entries, case-insensitive | Outside production these still get their own mail. `@domain` matches that domain only, not subdomains |

A fenced mail keeps its intended recipient in the `X-Marktwerk-Original-To` header, and its subject starts with
`[local]` or `[preview]` (also for allowlisted recipients). The `outbound_message` row keeps the intended recipient.
In production nothing is changed. Without `SMTP_HOST` mail is only logged, so the fence does not apply.

Because the default is `local`, a deployment without `APP_ENV` is fenced, never the other way round. Where to set it:

| Where | `APP_ENV` | `MAIL_CATCH_ALL` / `MAIL_ALLOWLIST` |
|---|---|---|
| Vercel **Production** (today the deployed dev app with synthetic data) | `preview` while it holds synthetic data; `production` only for the real system | Catch-all mailbox; allowlist the team's own addresses if they should get the mails |
| Vercel **Preview** (shared, all branches) | `preview` | Same catch-all; branch-scoped values override them like the database variables |
| Local `.env` | `local` (or unset) | Any address, e.g. `catch-all@marktwerk.test`: Mailpit catches everything anyway |
| Production host (Scalingo, later) | `production` | Not needed |

`settings.email_enabled` stays the company's master switch on top of this: the fence decides *where* mail goes, the
switch *whether* the jobs queue and send any.

Sign-in origins: Better Auth accepts `BETTER_AUTH_URL`, `APP_URL` and the deployment's own Vercel URLs
(`VERCEL_URL`, `VERCEL_BRANCH_URL`, `VERCEL_PROJECT_PRODUCTION_URL`, set by Vercel automatically), so preview and
hash links can sign in. No wildcard: `marktwerk-*.vercel.app` would also match other people's projects. A rejected
address shows its own message on the login page ("Von dieser Adresse aus ist keine Anmeldung möglich").

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
4. Leave `reference_date` empty on an empty database: the data is generated as of today. Some ids depend on that
   day, so the seed **refuses a database that already holds synthetic data** ("The database already holds synthetic
   data…"). To run it again, enter the original seed day as `reference_date` (the deployed DB: `2026-10-26`); then
   the run is idempotent (`ON CONFLICT DO NOTHING`, fixed ids) and changes nothing that exists. Fresh data as of
   today needs the `app` data wiped first: type `wipe` in the `wipe` field (leave `reference_date` empty). That
   empties **every app table except the sign-in tables** (`user`, `session`, `account`, `verification`,
   `user_preference`; `apps/web/scripts/wipe-app-data.ts`), so logins keep working and are linked to the new staff
   records by e-mail. Everything else (templates, markets, dates, tasks, permits, contacts, vendors, money, settings)
   is replaced. Destructive: ask the product owner first. Re-running never changes existing logins or passwords. The
   seed does **not** migrate: migrations run in the Vercel production build (`vercel.json`, see *Migrations in the
   Vercel build*), so deploy `main` first when the schema changed.

Locally the same thing is `pnpm db:seed` (reads the root `.env` if there is one; in CI the variables come from the
environment); `pnpm db:wipe -- --yes` empties the app data first (logins kept).

## Branch environments on Neon (manual for now)
A branch under test gets its own deployment and database next to `main` ([ADR 0023](../architecture/adr/0023-test-environments.md)).
The database host is **Neon** (decided 2026-11-10); `main` stays on Supabase. These steps are done by hand; a script
(`pnpm env up | reset | down`) is only worth it if branch environments become frequent.

| Piece | Value |
|---|---|
| Neon project | `marktwerk-test` (`flat-rice-93609519`), owner: Arda's personal Neon org, free plan, `aws-eu-central-1`, Postgres 17, database `marktwerk` |
| Root branch `main` | Empty. Holds the roles only: `neon_admin` (created with the project, member of `neon_superuser`, used for setup) and **`marktwerk_app`** (created by SQL: `LOGIN`, `CREATE` on the database, no superuser / `CREATEROLE` / `CREATEDB` / `BYPASSRLS`, not in `neon_superuser`). Child branches inherit both roles and passwords |
| Per environment | `seed/<env>`: migrated with the **branch's own** migrations and seeded, then left alone (no connections, so no compute). `<env>`: child of it, the one the deployment uses |
| App URLs | `DATABASE_URL` = `marktwerk_app` on the child's **pooled** host (`ep-…-pooler…`, PgBouncer transaction mode); `DATABASE_MIGRATION_URL` = same role on the **direct** host. Use `sslmode=verify-full` (node-postgres warns about `require`) |
| Vercel | Preview variables **scoped to the git branch**: `DATABASE_URL`, `DATABASE_MIGRATION_URL`, `BETTER_AUTH_SECRET`, `CRON_SECRET` (own random values, marked sensitive) and `MIGRATE_ON_PREVIEW=1` (lets the branch's preview builds migrate its own database). They override the shared Preview values for that branch only; Production and other previews are untouched. `BETTER_AUTH_URL`/`APP_URL` stay shared: the branch URL is accepted through `VERCEL_BRANCH_URL` |
| Mail | Off: the seed writes `settings.email_enabled = false`. Before switching it on, make sure the branch's deployment has `APP_ENV=preview` and `MAIL_CATCH_ALL` (shared Preview values or branch-scoped ones, see *Outbound mail fence* above), then set `SMTP_*` |
| Jobs | No cron for branch environments; run a job by hand with `POST /api/cron/<job>` and the branch's `CRON_SECRET` if needed |
| Free-tier budget | 10 branches per project: root + 2 per environment, so at most 4 environments at once |

Why a seed parent per environment and not one shared base migrated with `main`'s migrations: Drizzle's migrator only
applies migrations whose timestamp is newer than the newest one recorded in the database. A base at `main`'s latest
migration would give a branch that is behind `main` a schema it doesn't know, and silently skip any branch migration
dated earlier.

Secrets never go into the repo or chat. Keep them in gitignored files in the worktree (`.env.*` is ignored):
`.env.neon-admin` (`NEON_PROJECT_ID`, `NEON_ADMIN_URL`, `APP_ROLE_PASSWORD`), `.env.neon-seed-<env>` and
`.env.neon-<env>` (`DATABASE_URL`, `DATABASE_MIGRATION_URL` for that branch), `.env.vercel-<env>` (`BETTER_AUTH_SECRET`,
`CRON_SECRET`). Quote the values (`KEY='…'`): the Neon URLs contain `&`.

### Current environments
| Environment | Git branch | URL | Neon branches | Reference date | Logins |
|---|---|---|---|---|---|
| `exp-stand-allocation` | `exp/stand-allocation` | `https://marktwerk-git-exp-stand-allocation-ardas-s-projects.vercel.app` | `seed/exp-stand-allocation` (`br-jolly-butterfly-b9cydjpx`) → `exp-stand-allocation` (`br-cool-feather-b9l37jd1`) | **2026-11-10** | Owner only (`SEED_OWNER_*` from the local `.env`); staff logins skipped |

Created 2026-11-10 from `exp/stand-allocation` at `0237e6a` (migrations 0000–0008).
`MIGRATE_ON_PREVIEW=1` (branch-scoped) is still to be added for this environment: until then its preview builds skip
migrations, so run `pnpm --filter @marktwerk/db migrate` with `.env.neon-exp-stand-allocation` loaded after a new
branch migration.

### One-time: project and app role
1. `npx neonctl@latest auth` (browser login), then
   `neonctl projects create --name marktwerk-test --region-id aws-eu-central-1 --pg-version 17 --database marktwerk --role neon_admin`.
2. As `neon_admin` on `main`:
   ```sql
   CREATE ROLE marktwerk_app LOGIN PASSWORD '<random, from .env.neon-admin>';
   GRANT CREATE ON DATABASE marktwerk TO marktwerk_app;
   ```
   The first migration creates schema `app` and Drizzle creates `drizzle`, so `marktwerk_app` owns both.

### up `<env>` (from a worktree of the branch)
1. `neonctl branches create --project-id <id> --name seed/<env> --parent main`
2. Build the two URLs for `marktwerk_app` from `neonctl connection-string seed/<env> --role-name neon_admin`
   (swap user and password; pooled host = endpoint id + `-pooler`) into `.env.neon-seed-<env>`.
3. Migrate and seed with the branch's code (the exported variables win over the root `.env`):
   ```bash
   set -a; . ./.env.neon-seed-<env>; set +a
   pnpm --filter @marktwerk/db migrate
   SEED_OWNER_EMAIL=… SEED_OWNER_PASSWORD=… [SEED_STAFF_PASSWORD=…] pnpm db:seed
   ```
   The seed prints `synthetic data as of <date>`: record it in the table above.
4. `neonctl branches create --project-id <id> --name <env> --parent seed/<env>`; build its URLs into `.env.neon-<env>`.
5. Generate `BETTER_AUTH_SECRET` (`openssl rand -base64 32`) and `CRON_SECRET` (`openssl rand -hex 32`) into
   `.env.vercel-<env>`.
6. Add the four secret variables, each piped from the files, never typed on the command line:
   `vercel env add <NAME> preview <git-branch> --sensitive` (in a directory linked to project `marktwerk`).
   Then the opt-in, **only after** the branch's `DATABASE_URL` / `DATABASE_MIGRATION_URL` are in place:
   `printf 1 | vercel env add MIGRATE_ON_PREVIEW preview <git-branch>`.
7. Redeploy the branch's latest deployment (`vercel redeploy <deployment-url> --target preview`) or push to the
   branch. The build log must show `[migrate] Vercel preview build with MIGRATE_ON_PREVIEW=1 (branch database)`; it
   migrates the child (no-op right after up).
8. Check: `vercel curl /api/health --deployment <branch-url>` → `{"ok":true,"db":"up"}` (previews are behind
   Vercel's deployment protection, hence `vercel curl`), and sign in as the seeded owner.

### reset `<env>`
1. `neonctl branches reset <env> --parent --project-id <id>`: the child is back to the seeded state in seconds
   (same reference date as at up).
2. Migrations the branch added since up are gone with it: run `pnpm --filter @marktwerk/db migrate` with
   `.env.neon-<env>` loaded, or redeploy.
3. **Rebuild the seed parent instead** when the branch's migration history changed (rebase onto newer `main`,
   edited branch migration) or when you want data as of a new date: delete both branches and run *up* again from
   step 1 (the Vercel variables need updating only if the endpoint host changed).

### down `<env>`
1. `vercel env rm <NAME> preview <git-branch> --yes` for the five variables (`MIGRATE_ON_PREVIEW` first).
2. `neonctl branches delete <env> --project-id <id>`, then `neonctl branches delete seed/<env> --project-id <id>`.
3. Delete the local `.env.neon-*<env>` and `.env.vercel-<env>` files and remove the row from the table above.

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
`BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `SMTP_*` (EU transactional mail provider), `APP_ENV=production` (only the
real production app; staging gets `preview` + `MAIL_CATCH_ALL`), `STORAGE_DRIVER=s3` + `S3_*` (EU bucket), later
`M365_*`.

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
