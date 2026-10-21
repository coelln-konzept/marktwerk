# @marktwerk/synthetic

Deterministic, seeded synthetic data for development. The real data is months away, so this package
generates a realistic dataset for one fictional German event company, **Demo Märkte GmbH** (Köln area).
It covers flea markets (Flohmarkt) and antique markets (Antikmarkt), plus Stadtfeste and Food & Wine markets,
for the 2026 season and the planned 2027 season. Nothing else is generated.

The output follows `docs/architecture/data-model.md` (v0.3): camelCase fields, money in integer cents, lengths
in integer centimetres, business dates as `YYYY-MM-DD` (Europe/Berlin), times as `HH:mm`, instants as UTC ISO strings.

## Run

```bash
pnpm --filter @marktwerk/synthetic generate   # writes out/*.json and out/manifest.json
pnpm --filter @marktwerk/synthetic test       # determinism, integrity, privacy and business-rule tests
pnpm --filter @marktwerk/synthetic typecheck
```

`generateDataset()` (exported from `src/index.ts`) returns the whole dataset in memory. `generate` only serializes it.

### Determinism

- `SEED = 20261021` and `REFERENCE_DATE = "2026-10-21"` live in `src/constants.ts`. The reference date stands in for
  "today" for every status and due date. The real clock is never read.
- Every random decision goes through one seeded Faker instance (German locale stack, the same as `fakerDE`).
  All ids come from `faker.string.uuid()` after seeding.
- Two runs produce byte-identical output. A test checks this. Changing generator code or dictionaries changes the output.

## Output

`out/` is gitignored. Each entity is one file, `out/<entity>.json`, plus `out/manifest.json` (seed, reference date,
counts). The seed script (M1) loads these files in dependency order: `settings`, `legalParameters`, `eventTypes`,
`contacts`, `venues`, `dutyRoles`, `staffMembers`, `employmentContracts`, `checklistTemplates`, `eventPresets`,
`events`, `eventAnchors`, `tasks`, `permitRequirements`, `permits`, `eventPermits`, `vehicles`, `obligations`,
`payables`, `installments`, `shifts`, `vendors`, `bookingRequests`, `bookingDates`.

| Entity (file) | Records | Notes |
|---|---:|---|
| `settings` | 1 | Company data, fictional address in Köln, fake IBAN, Europe/Berlin, NW |
| `legalParameters` | 8 | Minimum wage, Minijob limit (2026 and 2027), HU intervals |
| `eventTypes` | 4 | `flea`, `antique`, `city_festival`, `food_wine` (exactly these) |
| `venues` | 12 | Köln, Bonn, Neuss, Düsseldorf, Leverkusen, Bergisch Gladbach, Brühl, Siegburg, Linz, Troisdorf (one indoor). 2–5 zones with rows |
| `contacts` | 30 | Authorities, service providers, suppliers, landowners |
| `staffMembers` | 14 | Owner, office manager, two office staff (logins), logistics lead, nine field crew |
| `employmentContracts` | 14 | Minijob rates 1390–1600 ct/h |
| `dutyRoles` | 7 | Marktleitung … Wasser/Strom, each with a default holder |
| `eventPresets` | 14 | 8 flea, 3 antique, 1 city festival, 2 food & wine. RFC 5545 `rrule` |
| `events` | 148 | 2026 (74) and 2027 (74). Two 2026 events cancelled |
| `eventAnchors` | 444 | `eventDay`, `setupDay`, `bookingCutoff` (Monday before) per event |
| `checklistTemplates` | 4 | One published version per event type, 39–40 German items each |
| `tasks` | 5,774 | Instantiated per event, due times in Berlin time |
| `permitRequirements` | 63 | City permits per venue, external ones where the ground is not public |
| `permits` | 234 | 2026 granted; 2027 applied, preparing or not started |
| `eventPermits` | 742 | Event ↔ permit links |
| `vehicles` | 3 | Vans with 3,500 or 3,880 kg |
| `obligations` | 11 | HU, UVV (one overdue), service, insurance renewal, KSK report |
| `payables` | 90 | Location fees, permit fees, toilets, standpipes, vehicles, insurance, event costs |
| `installments` | 120 | Sum exactly to each payable's total |
| `shifts` | 287 | Field crew on past 2026 events |
| `vendors` | 1,500 | 75 % private, about 30 % regular |
| `bookingRequests` | 6,411 | 40–150 per bookable event (flea and antique, completed or confirmed 2026) |
| `bookingDates` | 5,817 | One per accepted request, with row placement and car grant |

## Rules the data follows

- **Events**: at most 4 events touch any weekend. No venue hosts two events on the same day. Occurrences that break a
  rule are dropped, not moved. Lifecycle status follows the reference date: ended more than 21 days ago → `closed`,
  ended before today → `completed`, 2026 upcoming → `confirmed`, 2027 → `planned` (venue permit applied) or `draft`.
- **Tasks**: past tasks are mostly `done`, some `skipped`, about 5 % still open and overdue (`rolloverCount` 1–5).
  Permit tasks of recent events may be `waiting_external`. Future tasks are `todo` or `in_progress`.
- **Bookings**: placements are first-fit along the venue rows, so they never overlap. Car requests are placed first. A car
  is granted only if it is not longer than the booked stall and a car slot is free.
- **Payables**: instalments sum to the total. Three instalments are overdue, and several fall due within 14 days.
- **Minijob**: monthly earnings stay under the 2026 limit (603 €) except one person in August 2026, who goes slightly over.

## Privacy

- Email addresses only on `example.com`, `example.org` or `example.net`.
- Phone numbers only from the German ranges reserved for fiction and film:
  `+49 30 23125 xxx`, `+49 40 66969 xxx`, `+49 69 90009 xxx`, `+49 89 99998 xxx`, `+49 176 04069 xxx` (E.164, e.g. `+493023125123`).
- Names come from the German Faker locale. Organisations are fictional, except the public authorities, which keep
  their official types (Ordnungsamt, Stadtwerke …) with fiction contact details.
- The word "customer" or "Kunde" must not appear. The tests check this.

## Known simplifications

- **Login accounts are not generated.** `staffMembers.permissionRole` (`owner`, `manager`, `staff`) says which
  people need a Better Auth user. The seed script creates those users.
- **Shifts** are one per crew member per event day. Multi-day events get one shift for the first day.
  Shifts in the last seven days that have no recorded times are `confirmed`, not `worked`.
- **Payables for location fees** carry `venueId` and `season` (not in data-model v0.3). They are company-scope payables.
- **HU intervals** are 24 months up to 3.5 t and 12 months above (see `legalParameters`). Verify the 12-month rule
  against current traffic-law guidance before relying on it.
- **Car grants are rare** (about one in five car requests). Most stalls are shorter than a 6 m Transit, which is the
  rule, not a bug.
- **Event types**: rules store `newGoodsMaxShare`, `bannedGoods`, `onlineBookingAllowed` and `vendorContractModel`.
  Food vendors are not separate records, so yearly contracts are only expressed on the event type.

## Layout

```
src/
  constants.ts        SEED, REFERENCE_DATE, company name, season list, weekend cap
  types.ts            entity types (mirror data-model.md v0.3)
  dataset.ts          generateDataset(): fixed generator order
  manifest.ts         counts for out/manifest.json
  generate.ts         CLI: writes out/
  index.ts            public exports
  dictionaries/       curated German lists (event types, venues, contacts, staff, presets, checklist items, permits, texts)
  generators/         one module per entity group (catalogue, people, events, tasks, permits, money, shifts, vendors, bookings)
  lib/                dates (UTC + Berlin time), RRULE subset, seeded RNG, fiction phone and example email helpers
```
