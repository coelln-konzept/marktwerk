# 0006: Hosting on Scalingo (EU-owned managed PaaS)

**Status:** accepted (2026-10-21, product owner). Supersedes the "stay portable, decide later" draft.

## Context
The product owner wants a **managed cloud** set up from scratch, and chose an **EU-owned** provider. Constraints:
GDPR/EU jurisdiction, a long-running worker (ADR 0005), managed Postgres with backups, small team without ops.
The client asked in the meeting: *"If the cloud breaks, do they have backups?"*, and wants a local copy.

## Decision
- **Scalingo** (French, no US parent), region **`osc-fr1`** (3DS Outscale, Paris).
- **One Scalingo app per environment** (`marktwerk-staging`, `marktwerk-prod`) with two process types from a
  `Procfile`: `web` (Next.js standalone server) and `worker` (pg-boss, `apps/worker/dist/index.mjs`).
- **Scalingo for PostgreSQL** addon. **Postgres 17** (the newest major Scalingo offers as of Oct 2026, so local dev
  and CI use 17 too). Point-in-time recovery (7 days on shared plans; longer on dedicated plans).
- **Backups beyond the provider:** a nightly worker job exports an encrypted `pg_dump` (+ uploaded files) to the
  company's own server/NAS; quarterly restore test documented.
- File storage: an S3-compatible EU bucket (e.g. Outscale OOS or Scaleway, decided in the spike) behind our storage adapter.
- Secrets via Scalingo environment variables; deploy from GitHub (`main` → staging; tagged releases → prod).

## To verify in the M0.5 spike (sources were thin; see docs/development/deployment.md)
- pnpm workspace support in the Scalingo Node.js buildpack (fallback: build step with `corepack enable`, or a
  custom/multi buildpack).
- Next.js standalone output started from the monorepo root (copy `.next/static` and `public`).
- Running `pnpm db:migrate` in the `postdeploy` hook.
- PITR retention on the chosen plan; pricing for web + worker + Postgres at our size.

## Consequences
- Full EU jurisdiction (no CLOUD Act exposure via a US parent).
- No preview deployments per branch out of the box (Scalingo review apps exist; evaluate in the spike).
- Smaller ecosystem than US platforms; the app stays a plain Node app, so moving later stays cheap.
