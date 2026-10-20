# 0005: Background jobs with pg-boss in a separate worker

**Status:** accepted

## Context
We need cron (deadline sweep every 15 min, 07:00 digests), async jobs (bulk market generation, emails,
PDFs, mailbox sync) and EU data residency. Options: Inngest, Trigger.dev (run data partly in the US),
graphile-worker, pg-boss.

## Decision
**pg-boss 12** in `apps/worker`, a long-running Node process. Queue tables live in the `pgboss` schema of
the same Postgres database. Handlers are idempotent; reminders use deterministic dedupe keys.

## Consequences
- No extra infrastructure and no third-party data processor; jobs can be enqueued in the same transaction as data.
- Needs an always-on process. It can't run on serverless functions, which affects hosting (ADR 0006).
- The pg-boss dashboard (`@pg-boss/dashboard`) can be added for ops visibility.
