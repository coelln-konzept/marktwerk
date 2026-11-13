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
  1 overdue obligation, at most 2 late permits, at most 2 (`DECISION_OVERDUE`) permits whose decision is overdue,
  expected permit decisions spread over many days.
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
| `contacts` | 27 | Stadt Köln (Ordnungsamt, Straßen und Verkehr), Kerpen, Rösrath; the partners the sheets name: Ortsring Hoffnungsthal, DRK, the school's Hausmeister, Signalbau Lindner (Verkehrssicherung), Elektro Wendler, Schilder Reuter (banners, letters, signs), standpipe suppliers for Köln, Kerpen and Rösrath; other service providers, suppliers, two landowners |
| `staffMembers` | 14 | Owner, office manager, two office staff (logins), logistics lead, nine field crew |
| `employmentContracts` | 14 | Minijob rates 1390–1600 ct/h |
| `dutyRoles` | 11 | Marktleitung … Wasser/Strom, plus the sheets' market-day roles Einweisung, Tageswache (Ordner), Nachtwache and Verkehr. Each has a default holder (field crew for Einweisung, Ordner, Nachtwache; the logistics lead for Verkehr); the Ordner rotates through the Minijob crew per market |
| `eventPresets` | 17 | The 16 Coelln Konzept series + Hoffnungsthal (9 flea, 2 antique, 3 city festival, 3 food & wine), each with colour, Marktregeln (`rules`) and Zeitplan (`schedule`) |
| `events` | 134 | 67 per season (2026, 2027), January–November, 53 on Sundays, 1–3 per day. Two 2026 events cancelled |
| `eventAnchors` | 536 | `eventDay`, `setupDay`, `teardownDay`, `bookingCutoff` (Monday before) per event |
| `checklistTemplates` | 18 | The Grundvorlage (18 items) and every market's own copy (19–50 items, child items included; 457 items in all) |
| `tasks` | 2,624 | 1,806 tasks and 818 subtasks (≈ 20 per event, 13–50), due times in Berlin time |
| `permitRequirements` | 47 | Per place (`VENUE_PERMITS`): Marktgenehmigung and Festsetzung, the landowner's OK on private ground, PVBT, Plakatierung, Standrohr, Sperrung, Schaustellerliste, toilets; some only for one event type |
| `permits` | 180 | Season permits per market (also where markets share a place), PVBT, Standrohr and Schaustellerliste per date. 2026: 89 granted, 1 late example; 2027: 22 applied (2 with an overdue decision), 7 preparing, 61 not started |
| `eventPermits` | 524 | Event ↔ permit links |
| `vehicles` | 3 | Vans with 3,500 or 3,880 kg |
| `obligations` | 11 | HU, UVV (one overdue), service, insurance renewal, KSK report |
| `payables` | 109 | Location fees, Marktgenehmigung fees, Festsetzung fees (granted ones only), toilets, standpipes, vehicles, insurance, event costs |
| `installments` | 133 | Sum exactly to each payable's total |
| `shifts` | 281 | Field crew on past 2026 events |
| `vendors` | 1,500 | 75 % private, about 30 % regular |
| `bookingRequests` | 5,455 | 40–150 per bookable event (flea and antique, completed or confirmed 2026) |
| `bookingDates` | 4,573 | One per accepted request, with row placement and car grant |

## Rules the data follows

- **Events**: dates come from the markets' date rules (`lib/market-dates.ts`, `dictionaries/presets.ts`), which
  reproduce the 2027 wall calendar (research 13 §2.2): the n-th Sunday per month, Easter/Whitsun Sa–Mo, holiday
  Thursdays, the last weekend, Fr–So / Do–So. Easter Sunday, Whit Sunday, Allerheiligen, Volkstrauertag and
  Totensonntag are skipped unless the holiday is the point. At most 3 markets per day and no venue twice on one day:
  a Sunday date that would break this moves to another Sunday of its month. Single-day markets in winter open an hour
  later. Lifecycle status follows the reference date: ended more than 21 days ago → `closed`,
  ended before today → `completed`, current season upcoming → `confirmed`, next season → `planned`.
- **Task templates** (research 13, `dictionaries/checklist-items.ts`): the **Grundvorlage** (`isMaster`) is the
  common core of the client's sheets. **Altstadt, Riehler Gürtel, Nippes and Hoffnungsthal** get their own sheet as
  an owned copy of it (`ownerPresetId`, same stable keys where the item is the same) plus their additions; every
  other market gets a copy of the Grundvorlage plus items assumed for its event type, each described
  "Annahme – vom Team noch nicht bestätigt". Sub-lines are child items (`parentKey`, one level, ADR 0021) that take
  the parent's due date (`ownDue` false) and, without their own `dutyRoleKey`, its duty role. Every market-day line
  is its own `live` task on that day (`eventDay`, or `teardownDay` for the last day of a multi-day market; the events
  generator creates all four anchors). `CLIENT_MARKET_PRESET_KEYS` attaches the four sheets to the presets
  `altstadt`, `riehler-guertel`, `nippes` and `hoffnungsthal`; `CLIENT_DUTY` puts the market-day lines on their
  roles (Einweisung, Ordner, Nachtwache, Verkehr; Nachkassieren on Kasse).
- **Season tasks (INTERIM)**: "Termine planen" and "Genehmigung" happen once per market and season, relative to its
  first date (research 13 §1.2). Until the Saison record exists (research 13 §6) they are template items with
  `scope: "season"` that only the **first non-cancelled event of each series per season** gets as tasks. In the
  database they are marked three ways so they can be moved later: stable key `saison_…`, title "Saison: …" and a
  description saying so. The app itself does not know `scope` yet: "Markt planen" and template propagation would
  create them on other events of the market too.
- **Tasks**: past tasks are `done` (3 % `skipped`), except 4 overdue ones on current markets and 1 on the last past market (`rolloverCount` 1–5); up to 2 recent permit tasks without a filed permit wait on an authority (`waiting_external`). Future tasks are `todo` or `in_progress`. A task whose item applies for a permit (`permitType`: Genehmigung → Marktgenehmigung, its Festsetzung subtask → Festsetzung, Plakatierung, Standrohr bestellen, Schaustellerliste) is `done` once that permit is applied for or granted, as the app's `linkPermitTasks` does; the seed links them. Counts are of top-level tasks, as in the app's lists.
- **Subtasks** follow their parent: a done, skipped or cancelled parent has all subtasks the same; an open parent has
  some done (in progress: at least one; overdue: all but the last); a parent waiting on an authority has its first
  subtask done and the others waiting. A done subtask may be due later (done early), never completed after today.
- **Permits** (research 13 §4, `dictionaries/permits.ts`): every market applies for its own **Marktgenehmigung
  (Sondernutzung)** and **Festsetzung (§ 69 GewO)** per season at the Ordnungsamt; on private ground (Stadion, P6,
  Südbrücke) the **landowner's OK** replaces the Marktgenehmigung, the Festsetzung stays. The rest follows the
  client's sheets: **PVBT** per date (Riehler Gürtel, Hoffnungsthal 96 h; assumed for Südstadt and the Rodenkirchen
  Straßenfest), **Plakatierung** with city stickers (Riehler Gürtel, Hoffnungsthal, Kerpen), **Standrohr** per date
  at the water supplier (Altstadt, Hoffnungsthal, festivals and wine markets), a road closure (verkehrsrechtliche
  Anordnung: Altstadt, Riehler Gürtel, Hoffnungsthal, Rodenkirchen Straßenfest), the **Schaustellerliste** (type
  `other`, Hoffnungsthal), toilets everywhere except Hoffnungsthal (school toilets). Lead times follow the sheets
  (Genehmigung 6 months, Altstadt 7; Standrohr 30 days; Schaustellerliste 2 months). The office prepares a month
  before filing and files 3–14 days before apply-by; the Festsetzung goes in with the Marktgenehmigung and is
  decided one to three weeks after it; the city decides both some weeks before the market's first date. Altstadt
  keeps the collective window (October–November, decision mid-January), the Stadion its date request by end of
  October (decision mid-December). A decision date in the past means granted; current-season permits of past events
  are granted. Deliberate exceptions: at most 2 late permits (PVBT, toilets or road closure, not filed) and 2
  applied permits whose expected decision passed (Festsetzung, road closure, landowner or poster permit, note
  "nachfragen"). A granted Festsetzung becomes a payable (fee due a month after the decision).
- **Bookings**: placements are first-fit along the venue rows, so they never overlap. Car requests are placed first. A car
  is granted only if it is not longer than the booked stall and a car slot is free.
- **Payables**: instalments sum to the total. Rates due up to today are paid, except 2 deliberate overdue ones; at least one falls due within 14 days.
- **Minijob**: monthly earnings stay under that year's limit (`MINIJOB_LIMIT_CENTS_BY_YEAR`) except one person in August, who goes slightly over.

## Privacy

- Email addresses only on `example.com`, `example.org` or `example.net`.
- Phone numbers only from the German ranges reserved for fiction and film:
  `+49 30 23125 xxx`, `+49 40 66969 xxx`, `+49 69 90009 xxx`, `+49 89 99998 xxx`, `+49 176 04069 xxx` (E.164, e.g. `+493023125123`).
- Names come from the German Faker locale. Organisations are fictional, except the public authorities, which keep
  their official types (Ordnungsamt, Stadtwerke …) with fiction contact details. The Ortsring Hoffnungsthal and the
  DRK keep their type of name like the authorities (research 13 §5 q3); their people and details are fictional.
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
