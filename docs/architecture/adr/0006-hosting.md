# 0006: Hosting stays portable; decided before the pilot

**Status:** open. **Decide before milestone M4 (pilot).**

## Context
The product owner chose to keep hosting open. Constraints: EU/GDPR, a long-running worker (ADR 0005),
Postgres, file storage, small team without dedicated ops.

## Options
See [overview.md → Hosting options](../overview.md#hosting-options-decision-deferred-adr-0006):
A) Vercel fra1 + managed Postgres (Neon/Supabase FRA) + worker container;
B) everything on Hetzner with Coolify/Docker Compose;
C) Hetzner app servers + managed EU Postgres.

## Until decided
- Build with `output: "standalone"`; keep the web tier stateless; config via env only.
- No provider-specific APIs in code (storage behind an S3 adapter, email behind SMTP).
