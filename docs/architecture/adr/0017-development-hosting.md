# 0017: Development hosting on free tiers (Vercel + Supabase)

**Status:** accepted (2026-10-21, product owner). Production hosting is decided later (ADR 0006: Scalingo is
the documented candidate; revisit before the pilot with real data).

## Context
To get going without cost, development and demo deployments use free tiers. All data in these environments is
**synthetic** (ADR 0016), so EU data-residency requirements for real personal data don't apply yet.

## Decision
- **Web app:** Vercel (team "Arda's projects"), project root `apps/web`, functions in `fra1`. Hobby plan is
  officially for non-commercial use, which is acceptable for prototyping only. Move to Vercel Pro or the production
  host before the client's team uses it with real data.
- **Database:** Supabase free project `marktwerk-dev` (eu-central-1, Postgres 17). The app connects with a dedicated
  role `marktwerk_app` through the Supavisor pooler (transaction mode, port 6543); migrations use session mode
  (port 5432) via `DATABASE_MIGRATION_URL`. Supabase-specific features (Auth, Storage, RLS, Data API) are **not used**;
  it's plain Postgres so we stay portable.
- **All tables live in the Postgres schema `app`** (Drizzle `pgSchema("app")`, `schemaFilter: ["app"]`). That keeps
  them out of Supabase's automatically exposed `public` API, and `anon`/`authenticated` have no privileges on it.
- **Scheduled jobs:** no long-running worker on Vercel. Job handlers live in `@marktwerk/jobs`; a GitHub Actions
  schedule calls `POST /api/cron/<job>` with `Authorization: Bearer $CRON_SECRET` (`.github/workflows/cron.yml`).
  The pg-boss worker (`apps/worker`) remains for local development and for a future always-on host.
- **Migrations** run during the Vercel build (`apps/web/vercel.json`).

## Consequences
- €0 hosting while building; one manual step (importing the GitHub repo into Vercel) because the Vercel connector
  can't create projects.
- Supabase free projects pause after a week without activity; restore from the dashboard.
- Moving to another host later = change connection strings, run the worker as a process, drop the cron workflow.
