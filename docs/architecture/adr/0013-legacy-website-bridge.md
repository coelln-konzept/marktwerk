# 0013: The old website stays; marktwerk ingests its bookings

**Status:** proposed (2026-10-21). **Needs access to the old site (copy) and its database.**

## Context
Principle "internal first" (research 05): vendors must not notice changes until the internal system works.
The old PHP website holds presets, dates (planned/bookable/full), the booking form and the newsletter list.
Research 08: reading the database is far more robust than parsing emails; the booking emails are
system-generated, so deterministic parsing works as a fallback.

## Decision
1. Copy the website + DB into a sandbox; never touch production.
2. Preferred: read-only sync from (a replica/copy of) the database into `booking_request` / vendors.
3. Fallback: Graph subscription on the booking mailbox + **fixed-rule parser** (no AI), Message-ID idempotency,
   alert on parse failure.
4. Phase 4: marktwerk becomes the source of truth and feeds the new website.

## Consequences
- Double entry of dates (website + marktwerk) during Phases 1–3. Accepted; minimise by importing.
