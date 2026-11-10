# 0021: Test environment: staging, simulated clock, fenced mail, scenarios

**Status:** proposed (2026-11-04). Hosting of the staging database and the staging mail sink are open
(spec §9, D1/D2). Design: [`development/test-environment.md`](../../development/test-environment.md).

## Context
Before the company uses marktwerk, and after every big change, the whole product must be exercised end to end:
mail in and out, booking requests and payments, permits, market planning, the market day, hours and money. Most of
it depends on dates (T-180 … T+7, 4 working-day reservation release, Minijob month, payroll by the 15th), and much
of it involves people outside the company (vendors, authorities, the bank). Today there is one deployed dev
environment whose synthetic data drifts, no way to move "today", outbound mail without a recipient guard, and no
inbound mail source behind an interface.

## Decision
- **`APP_ENV`** (`local` · `test` · `staging` · `production`) is required; all safety guards key off it.
- A permanent **staging** deployment with its own database, synthetic data only, and a guarded **reset** (admin
  button + workflow) that reseeds for a chosen reference date and optional starting scenario.
- **Several environments side by side**, one per branch under test: staging is the environment `main`; any other
  branch (e.g. `exp/stand-allocation`) gets its own deployment, database (own migrations), clock, simulated mailbox
  and catch-all inbox, created/reset/removed by one workflow and listed in a registry. Removed automatically when
  the branch is merged or deleted, or after 30 idle days. Only `main` runs the cron; branch environments run jobs
  when the clock is advanced.
- **One business clock** (`core/clock.ts`): real in production; real time + offset elsewhere. Due dates,
  reminders and jobs use it; auth, column defaults and audit timestamps stay real. **"Advance to day X"** runs every
  scheduled job for each day in production order.
- **Outbound mail is fenced** outside production: recipients outside an allowlist are rewritten to a catch-all,
  synthetic addresses use the reserved `.test` TLD.
- **Inbound mail behind `MailboxSource`**: `SimulatedMailbox` (schema `sim`) for local/test/staging, `GraphMailbox`
  (ADR 0008) for production and an optional real M365 test mailbox on staging.
- **`packages/simulation`**: deterministic personas (vendor, authority, staff, bank), hand-written mail fixtures,
  and scenarios that combine clock moves, persona actions, office actions through the real services, and checks.
  Runnable against throwaway `*_test` databases (CI) and against staging.
- In production the clock override, reset, simulation endpoints and simulated mailbox are **not built in**, and
  startup fails if `SIM_*` variables are set.

## Consequences
- A one-time refactor of direct `new Date()` / SQL `now()` in app code to the clock, plus a lint check to keep it.
- One database per active environment, created and dropped by a workflow (host decision D1: Supabase branching,
  Neon branches, or a database per environment on one server) and a hosted mail sink with an API and an inbox or
  tag per environment (D2).
- Every new module adds at least one scenario to its definition of done.
- Scenario texts are fixtures, not generated, so runs are reproducible and ADR 0014 is untouched.
