# 0006: Hosting stays portable; decided before the pilot

**Status:** open, leaning towards *cloud + local backup*. **Decide before the M6 pilot.**

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

## Input from the client meeting (2026-10-21)
- Worry: *"If the cloud breaks, do they have backups?"* and *"you can't reach it immediately sometimes"*.
- Recommendation given in the meeting: **cloud hosting for the first year** (low cost) **plus a local copy**
  on the company's own server.
- Implication: whichever option, add a **nightly encrypted database dump + file sync to the company server**
  (and a documented restore test). Option B (Hetzner, German jurisdiction) fits this well.
- They also want a shared drive (Nextcloud was mentioned): out of scope for marktwerk, but documents could be
  linked from there.
