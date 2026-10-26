# 0016: Synthetic, deterministic data for development

**Status:** accepted (2026-10-21, product owner)

## Context
Access to the old website's database and the company's real records won't come soon. Development, demos and
UX testing need realistic volumes (a full season, ~1,500 vendors, booking history).

## Decision
- `packages/synthetic` generates a **fictional but realistic dataset** with a fixed seed and reference date
  (`2026-10-21`), so every run is identical and tests can rely on it. *Amended 2026-10-26:* `pnpm db:seed` passes the
  seed day as the reference date (`SYNTHETIC_REFERENCE_DATE`), so a fresh seed shows a realistic current state (the
  team is on top of its list: 4 overdue tasks, 2 forgotten on the last past market); output stays deterministic for a
  given date. It was built by a low-cost model as code
  (curated German domain dictionaries + Faker `de`), not as hand-written rows.
- **Privacy by construction:** fictional company; emails only at `example.com/.org/.net`; phone numbers only from
  ranges reserved for film/fiction; no real persons.
- The M1 seed script loads it into the database (`pnpm db:seed`); staging uses it until the pilot.
- When real data arrives, it is imported through the same services (never mixed with synthetic data in one database).

## Consequences
- Realistic edge cases (overdue tasks, Minijob overruns, overdue instalments, car-space conflicts) exist from day one.
- The generator must evolve with the schema; its tests check referential integrity and domain rules.
