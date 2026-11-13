# @marktwerk/synthetic

Deterministic, seeded synthetic data for development. The real data is months away, so this package
generates a realistic dataset for one German event company (company record: **Demo Märkte GmbH**). Since research 13
it uses Coelln Konzept's **real market and place names** (Köln, Kerpen, Rösrath-Hoffnungsthal) and real authority types
(Stadt Köln, Stadt Kerpen, Stadt Rösrath); people, contact details and private organisations stay fictional. It covers
flea markets (Flohmarkt) and antique markets (Antikmarkt), plus Stadtfeste and Food & Wine markets, for the current
season (the reference date's year) and the planned next season. Nothing else is generated.

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

- `SEED = 20261021` and `REFERENCE_DATE` live in `src/constants.ts`. The reference date stands in for "today" for
  every status and due date; the generator never reads the real clock. It is `SYNTHETIC_REFERENCE_DATE` when set, else
  the fixed `2026-10-21` (tests, `pnpm generate`). `pnpm db:seed` sets it to the seed day, so a fresh seed looks
  current. **Every date and both seasons derive from it** (`lib/clock.ts`); only legal parameters keep real dates.
  A well-run company's normal day: 4 overdue tasks on current markets and 1 forgotten one on the last market that
  ended more than a week ago (`OVERDUE_CURRENT`, `OVERDUE_LEFTOVERS` in `generators/tasks.ts`), 2 overdue instalments,
  1 overdue obligation, at most 2 late permits, expected permit decisions spread over many days.
  `dataset.test.ts` checks this for several reference dates. The counts in the table below are for the default date.
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
| `venues` | 10 | 8 places in Köln, Kerpen Innenstadt, Rösrath-Hoffnungsthal; `kind` municipal (8) or private (Stadion, Südbrücke). Shared places have named zones (Stadion: Vorplatz + P6; Rodenkirchen: Hauptstraße + Maternusplatz), names derived from the address where the client only gives one |
| `contacts` | 19 | Stadt Köln / Kerpen / Rösrath, service providers, suppliers, two fictional landowners |
| `staffMembers` | 14 | Owner, office manager, two office staff (logins), logistics lead, nine field crew |
| `employmentContracts` | 14 | Minijob rates 1390–1600 ct/h |
| `dutyRoles` | 7 | Marktleitung … Wasser/Strom, each with a default holder |
| `eventPresets` | 17 | The 16 Coelln Konzept series + Hoffnungsthal (9 flea, 2 antique, 3 city festival, 3 food & wine), each with colour, Marktregeln (`rules`) and Zeitplan (`schedule`) |
| `events` | 134 | 67 per season (2026, 2027), January–November, 53 on Sundays, 1–3 per day. Two 2026 events cancelled |
| `eventAnchors` | 536 | `eventDay`, `setupDay`, `teardownDay`, `bookingCutoff` (Monday before) per event |
| `checklistTemplates` | 4 | One published version per event type, 39–40 German items each |
| `tasks` | 5,774 | Instantiated per event, due times in Berlin time |
| `permitRequirements` | 52 | City permits per venue, external ones where the ground is not public |
| `permits` | 214 | 2026 granted; 2027 applied, preparing or not started |
| `eventPermits` | 690 | Event ↔ permit links |
| `vehicles` | 3 | Vans with 3,500 or 3,880 kg |
| `obligations` | 11 | HU, UVV (one overdue), service, insurance renewal, KSK report |
| `payables` | 82 | Location fees, permit fees, toilets, standpipes, vehicles, insurance, event costs |
| `installments` | 106 | Sum exactly to each payable's total |
| `shifts` | 279 | Field crew on past 2026 events |
| `vendors` | 1,500 | 75 % private, about 30 % regular |
| `bookingRequests` | 5,145 | 40–150 per bookable event (flea and antique, completed or confirmed 2026) |
| `bookingDates` | 4,676 | One per accepted request, with row placement and car grant |

## Rules the data follows

- **Events**: dates come from the markets' date rules (`lib/market-dates.ts`, `dictionaries/presets.ts`), which
  reproduce the 2027 wall calendar (research 13 §2.2): the n-th Sunday per month, Easter/Whitsun Sa–Mo, holiday
  Thursdays, the last weekend, Fr–So / Do–So. Easter Sunday, Whit Sunday, Allerheiligen, Volkstrauertag and
  Totensonntag are skipped unless the holiday is the point. At most 3 markets per day and no venue twice on one day:
  a Sunday date that would break this moves to another Sunday of its month. Single-day markets in winter open an hour
  later. Lifecycle status follows the reference date: ended more than 21 days ago → `closed`,
  ended before today → `completed`, current season upcoming → `confirmed`, next season → `planned`.
- **Tasks**: past tasks are `done` (3 % `skipped`), except 4 overdue ones on current markets and 1 on the last past market (`rolloverCount` 1–5); exactly 2 recent permit tasks wait on an authority (`waiting_external`). Future tasks are `todo` or `in_progress`.
- **Permits**: next season's permits move `not_started` → `preparing` (75 days before apply-by) → `applied` (about 45 days before); the expected decision is the filing day plus a per-type turnaround, and a decision date in the past means granted. Current-season permits of past events are granted.
- **Bookings**: placements are first-fit along the venue rows, so they never overlap. Car requests are placed first. A car
  is granted only if it is not longer than the booked stall and a car slot is free.
- **Payables**: instalments sum to the total. Rates due up to today are paid, except 2 deliberate overdue ones; at least one falls due within 14 days.
- **Minijob**: monthly earnings stay under that year's limit (`MINIJOB_LIMIT_CENTS_BY_YEAR`) except one person in August, who goes slightly over.

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
