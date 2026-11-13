# 0023: Test environments: the deployed dev app plus Neon branch environments

**Status:** accepted (2026-11-13, product owner). Replaces the proposed test-environment design of PR #24
(closed unmerged).

## Context
PR #24 (2026-11-04) designed a full test platform: a permanent staging deployment with a reset button, a branch
environment per branch under test, one simulated business clock ("advance to day X", every `new Date()` refactored),
fenced outbound mail, a simulated inbound mailbox behind `MailboxSource`, and `packages/simulation` with personas and
scenarios that every new module would extend.

Since then, branch environments were built by hand for `exp/stand-allocation`: a Neon project with a seed parent and a
live child per environment, Vercel preview variables scoped to the git branch (`docs/development/deployment.md`). The
deployed dev app (Vercel + Supabase, ADR 0017) already serves as the shared test system with synthetic data, and the
seed can generate data "as of" any day (`SYNTHETIC_REFERENCE_DATE`). Outbound mail is switched off
(`settings.email_enabled = false`).

## Decision
**Keep**
- The **deployed dev app** on `main` as the shared test system; "reset" is the documented reseed.
- **Branch environments on Neon** for branches that need their own deployment and schema, set up and removed by hand
  (deployment.md). No cron there; jobs are run by hand.
- Seeding **"as of" a day** (`SYNTHETIC_REFERENCE_DATE`) instead of a simulated clock.
- One small piece of the old design, built **before mail is switched on anywhere but production**: an **outbound mail
  fence**. Outside production, recipients not on an allowlist are rewritten to a catch-all address and synthetic
  addresses use the `.test` TLD. An `APP_ENV` variable (`local` · `preview` · `production`) drives it.

**Drop (for now)**
- A separate staging deployment.
- The simulated business clock and the refactor of every `new Date()` / `now()`.
- The simulated inbound mailbox and `MailboxSource` (comes with the M365 integration, ADR 0008, if needed).
- `packages/simulation`, personas, scenarios and "a scenario per module" in the definition of done.

## Consequences
- No clock refactor and no simulation package to maintain; testing of date-driven jobs relies on seeding as of a day
  and on running jobs by hand (`POST /api/cron/<job>`).
- If the pilot shows that reminder chains need end-to-end tests over weeks, the simulated clock comes back as its own ADR.
- The Fahrplan phase "Test environment" shrinks to keeping the branch environments and building the mail fence.
