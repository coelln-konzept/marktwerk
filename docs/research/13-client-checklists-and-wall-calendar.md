# Research 13 — The client's own checklists and wall calendar (November 2026)

*Session 2026-11-13. Numbered 13 because user test 2 took 12 the same day; its §5 (data shape) is part of this scope. Sources: five plain-text checklists written by the client
(Altstadt 2-Tage, Riehler Gürtel, Nippes 1-Tag, Hoffnungsthal twice: the "1 day event" file is the newer one and
adds "PVBT und Werbung abhängen") and a photo of the office wall calendar "Jahresübersicht 2027" with its legend.
This is the first real description of how the markets are run. Unless the client changes it, it becomes the source of
truth for the checklists (Grundvorlage and per-market templates) and for the synthetic dataset.*

## 1. What the checklists say

### 1.1 Shape
Every sheet has the same shape: **a heading with a time offset, then sub-lines** (two levels, never three).

| Level | Example | Maps to |
|---|---|---|
| Heading + offset | "Genehmigung 6 months before the first Termin" | a task (template item) |
| Sub-line | "Antrag stellen", "Festsetzung" | a **subtask** of that task (ADR 0021: `template_item.parent_key`, `task.parent_task_id`; check items are gone) |
| "execution day" line | einweisen, flyer verteilen, nachkassieren, Tageswache "Ordner", Verkehr regeln, Reinigung | **its own task** (phase `live`, on that market day; decided 2026-11-13) |

### 1.2 Three kinds of timing
1. **Season level, relative to the first date of next season**: "Terminplanen 8 months before the first Termin
   next year — repetitive 1 monthly", "Genehmigung 6/7 months before the first Termin". These happen **once per market
   series per season**, not once per date. Termine planen happens before the dates exist, so it cannot hang on an event.
2. **Event level, relative to the market day**: −2 months (Schichtplan, Schaustellerliste), −30 days (Werbung
   aufhängen, Standrohr), −2 weeks, −1 week, −6 days (PVBT), −1 day (einzeichnen, einladen, abflattern, Leihstände),
   the day itself, +1 day (Nachbereitung).
3. **Per market day of a multi-day market**: Altstadt has day 1, a **Nachtwache** between the days, and day 2 with
   Abbau (Leihstände, Strom/Wasser), Reinigung.

Units are months, days and hours ("96 hours before is the deadline, reminder 6 days before"). The product stores days
(and shows weeks); months become 30-day steps, hours become a day offset plus a due time.

### 1.3 The common core (→ Grundvorlage)
Items that appear on all four markets:

| When | Task | Subtasks |
|---|---|---|
| Season −8 months (first date) | Termine planen | Rhythmus (monthly), Notiz |
| Season −6 months (first date) | Genehmigung beantragen | Antrag stellen, Festsetzung (fee notice) |
| −2 months | Schichtplan erstellen | |
| −1 day (Nippes: on the day) | Einzeichnen (mark the stalls on the ground) | |
| −1 day | Bringto einladen (load the van from the market's packing list) | |
| Market day | Einweisen · Flyer verteilen · Nachkassieren · Tageswache "Ordner" · Reinigung | |
| +1 day | Nachbereitung | Ausladen, Vorbuchungen organisieren, Verbesserungsvorschläge in marktwerk übernehmen |

Our current Grundvorlage (39–40 invented items, 30 of them common) shares almost nothing with this list. Items such as
press releases, newsletter, social media, weather check, Kassenbuch, photos, Stundenzettel are **not** in the client's
lists and should leave the master (they can survive as optional library items if the client wants them).

### 1.4 What each market adds

| Market | Additions beyond the core |
|---|---|
| **Altstadt** (2–3 days) | Genehmigung −7 months; **Elektro Klein**: pass on the date; Orga −1 day (Strom und Wasser, Bringto); Leihstände aufbauen −1 day; Abflattern + Verkehr −1 day; Verkehr regeln each day; **Nachtwache**; day 2: Leihstände Abbau, Strom/Wasser Abbau |
| **Riehler Gürtel** | PVBT (Parkverbot) und Werbung aufhängen −6 days (Hohlkammerplatten); Abflattern + Verkehr −1 day; on the day PVBT und Werbung abhängen |
| **Nippes** | −1 week: organise how to bring the material; einzeichnen and Verkehr regeln on the day (nothing the day before) |
| **Hoffnungsthal** | Co-organised with the **Ortsring** (local association). Termine planen −350 d; Anträge −180 d (Festsetzung, Plakatierung); status geplant → bereit −180 d after talking to the city and the Ortsring; traffic-safety company −180 d (order confirmation); **DRK** −3 months; school toilets −4 months (Hausmeister number), keys −2 weeks; Druckwerbung −3 months (banner ok?, date on posters, order Hohlkammerplatten, Festplätze signs, banner letters); Schaustellerliste to the city −2 months; Werbung aufhängen −30 d (city stickers on the boards); Standrohr bestellen −30 d (pick-up appointment); Ortsring needs (Strom/Wasser/equipment) −1 week → into the Bringto list; PVBT set-up deadline 96 h, reminder −6 days; Verkehrssicherung 09:00 after the fire brigade, Abbau; Festplätze check for next year |

### 1.5 Client vocabulary (add to the glossary)
Einzeichnen (chalk the stall plots) · Abflattern (tape off the area with Flatterband) · PVBT (Parkverbot / no-parking
signs; set up ≥ 96 h before) · Bringto (the market's packing/loading list) · Leihstände (stalls lent to vendors) ·
Nachkassieren (collect fees on site from vendors who did not pay ahead) · Tageswache "Ordner" / Nachtwache (day
stewards, night watch) · Festsetzung (the authority's fee notice → a payable) · Hohlkammerplatten (corrugated plastic
sign boards) · Festplätze (fixed plots of regular vendors) · Standrohr (water standpipe) · Ortsring (local association) ·
Schausteller (fairground ride operators) · Vorbuchungen (bookings taken on site for the next date).
Still unclear: "Elektro Klein" (an electrician firm?), "Dobner" (banner letter supplier?), "repetitive 1 monthly".

## 2. What the wall calendar says (Jahresübersicht 2027)

### 2.1 Legend: two brands, 22 series
**Coelln Konzept** (coloured magnets): Altstadt · Altstadt Lifestyle (LS) · Riehler Gürtel · Nippes, Wilhelmplatz ·
RheinEnergie Stadion · P6 (stadium car park) · Südstadt · Südbrücke · Rudolfplatz · Rodenkirchen Haupt… (S) ·
Rodenkirchen Ma… (A) · Rodenkirchen Ma… (M) · Kerpen Stadtfest (S) · Kerpen Weintage (W) · Kerpen Bauernmarkt (B) ·
Kerpener Trödelmarkt (T).
**Coelln Antik & Design** (black magnets with letters): Neumarkt (N) · Rheinauhafen L… (RL) · Rheinauhafen S… (RF) ·
Flora (F) · Gürzenich (G) · Rodenkirchen Ma… (M).
Hoffnungsthal is **not** in the legend; it is handwritten on 12 Sep. It is a Coelln Konzept market (Arda, 2026-11-13).

**Scope (Arda, 2026-11-13): Coelln Antik & Design is a separate company and stays out of marktwerk for now.** The
ink colours and the unidentified tags are parked; every Coelln Konzept series will get dates.

### 2.2 Dates placed so far (read from the photo; weekdays checked against 2027)

| Series | Dates 2027 | Pattern | Events (days) |
|---|---|---|---:|
| Nippes | 17 Jan, 21 Feb, 21 Mar, 25 Apr, 23 May, 20 Jun, 18 Jul, 22 Aug, 19 Sep, 17 Oct, 28 Nov | Monthly **Jan–Nov**, Sunday, 3rd or 4th (hand-picked; 28 Nov avoids Totensonntag) | 11 (11) |
| Riehler Gürtel | 11 Apr, 9 May, 13 Jun, 11 Jul, 8 Aug, 5 Sep, 3 Oct, 7 Nov | Monthly Apr–Nov, Sunday, 1st or 2nd | 8 (8) |
| Südbrücke | 7 Mar, 11 Apr, 9 May, 6 Jun, 4 Jul, 8 Aug, 12 Sep, 10 Oct | Monthly Mar–Oct, Sunday, 1st or 2nd (often the same day as Riehler) | 8 (8) |
| Altstadt | 27–29 Mar (Easter Sa–Mo), 15–17 May (Whitsun Sa–Mo), 26–27 Jun, 24–25 Jul, 28–29 Aug, 25–26 Sep, 30–31 Oct | Holiday weekends 3 days, otherwise last weekend Sa–So Jun–Oct | 7 (17) |
| RheinEnergie Stadion | 14 Mar, 18 Apr, 30 May | Irregular Sundays | 3 (3) |
| P6 | 4 Apr, 6 May (Ascension, Thu), 13 Jun, 18 Jul | Irregular, incl. a holiday Thursday | 4 (4) |
| Südstadt | 18 Apr, 27 May (Corpus Christi, Thu), 20 Jun | Irregular | 3 (3) |
| Rudolfplatz | 5–7 Mar, 17–19 Sep | Twice a year, Fr–So | 2 (6) |
| ~~Neumarkt (Antik & Design)~~ | 19–21 Mar, 22–24 Oct | Out of scope (separate company) | — |
| Kerpen Weintage | 22–25 Jul | Once, Thu–Sun | 1 (4) |
| Rodenkirchen (grey) | 15–16 May | Once so far | 1 (2) |
| Hoffnungsthal | 12 Sep (handwritten) | Once a year | 1 (1) |
| **Identified total (Coelln Konzept)** | | | **49 (67)** |

Not identified (need the client): pink tag 11–12 Jun (Fr–Sa) · white tag "Duis…" 22–23 Apr · light-blue "A" magnet
15 Aug with tags "Bonn-Beuel" and "BM BM" · black magnet 31 Jul (with red "KL") and 1 Aug · grey letters on 15–16 May.
Handwritten without magnet, black ink: Kerpen (2 May), Bad Münstereifel (5–6 Jun), CSD (4 Jul), Lind… (22–23 May),
Linz (7–8 Aug), Hoffnungsthal (12 Sep). Red ink: Bonn (4 Apr, 20 Jun, 22 Aug, 3 Oct), Siegburg (11 Apr, 4 Jul),
Bad Honnef (25 Apr, 11 Jul), M (3 Oct), KL (31 Jul), **Volkstrauertag** (14 Nov). No legend for the ink colours.
Legend series with no date yet: Altstadt Lifestyle, Rodenkirchen (2 of 3), Kerpen Stadtfest, Bauernmarkt, Trödelmarkt,
Rheinauhafen ×2, Flora, Gürzenich, Rodenkirchen (Antik & Design). Flora and Gürzenich are indoor halls (winter?).

### 2.3 What the numbers mean for the dataset
- **~55 events / ~75 market days per season** once the unidentified tags are counted, likely **65–75 events** when the
  unplaced series get dates. Our current 74 per season is the right volume but the wrong composition.
- **Sundays dominate.** Saturdays appear only inside multi-day markets; Thursdays only on public holidays.
- **Load per day is 1–3 markets**, never 4. Typical pairs: Riehler + Südbrücke, Stadion + Südstadt, Nippes + P6,
  Altstadt + Weintage, Nippes + Neumarkt (its day 3).
- **The season is the calendar year**, not April–October: Nippes runs January–November, Südbrücke from March.
- **Dates are hand-picked**, not a clean RRULE: "monthly, 1st or 2nd Sunday" with exceptions for holidays, silent
  days and clashes. The client's "Termine planen" task is exactly this hand-picking.
- **One series can change length**: Altstadt is 3 days on Easter and Whitsun, 2 days otherwise.
- **Several series share a place**: Stadion + P6, three Rodenkirchen series, two Rheinauhafen series, Altstadt +
  Altstadt Lifestyle.
- It is **mid-November 2026 and 2027 is half planned** — consistent with "Termine planen 8 months before the first
  date". The synthetic next season should look like this: core series dated, some series still without dates.

## 3. Gaps in the product (found through this material)

| # | Gap | Evidence | Size |
|---|---|---|---|
| G1 | **Season-level tasks** (once per series and season, relative to the first date, existing before the dates do) | Terminplanen −8 months, Genehmigung −6/−7 months in every sheet; research 10 "one apply task per season permit" | **Architecture** |
| G2 | **Jahresübersicht** in the Kalender: 12 months at a glance, one dot per market in its colour and code | The wall calendar is the tool they actually plan with; we have Monat + Liste only | Medium |
| G3 | **Kürzel** (short code, 1–2 chars) on a market, shown in the dot and in a legend | N, RL, RF, F, G, M, S, A, W, B, T, LS, P6 | Small |
| ~~G4~~ | ~~Two brands on markets~~ — dropped: Antik & Design is a separate company, out of scope (2026-11-13) | Legend has two sections | — |
| G5 | **Stille Feiertage** (Volkstrauertag, Totensonntag, Karfreitag …) warned about in Markt planen and shown in the Kalender; today only statutory holidays | "Volkstrauertag" written on 14 Nov; Nippes moved to 28 Nov | Small |
| G6 | **Holiday-relative dates** (Easter Sa–Mo, Whitsun Sa–Mo, Ascension, Corpus Christi) in Markt planen | Altstadt, P6, Südstadt | Small–Medium |
| G7 | **Contact on a task** (call/mail from the task) | Elektro Klein, DRK, school Hausmeister, Ortsring, traffic-safety firm, city | Small |
| G8 | **Packing list per market ("Bringto")**, extended by tasks ("add list to market bringto") | Altstadt, Riehler, Hoffnungsthal | Medium (an early slice of M12) |
| G9 | **"Fürs nächste Mal"** notes per market, collected after the day and shown when the next date is prepared | "Besserungsvorschläge auflisten, bei marktwerk übernehmen" on every sheet (research 10 candidate) | Small–Medium |
| G10 | **Other people's events** on the calendar (competitors, city events like CSD, places to avoid) — parked 2026-11-13 | Red/black handwriting on 15+ days | Parked |
| G11 | **Night watch / overnight shift** between market days | Altstadt "Nachtwache" | Team module (hidden) |
| G12 | **Hour-based deadlines** with an earlier reminder | PVBT "96 hours before is the deadline, reminder 6 days before" | Small (offset + due time + notify setting exist) |
| G13 | Manual "geplant → bereit" after talking to city and Ortsring, not only automatic on granted permits | Hoffnungsthal | Wording/flow check |

Already covered: per-market template copies of the master (0007, `owner_preset_id`); subtasks (ADR 0021, being built);
`teardown_day` anchor for the last day of multi-day markets (exists in core, the seed does not create it yet);
planned → confirmed status; season permits (`cadence = per_season`); Termine (appointments).

## 4. Scope of the new synthetic dataset

Builds on PR #32 (every date relative to the reference date). Dates therefore become **rules that reproduce the 2027
wall calendar** (n-th Sunday with exceptions, holiday weekends, last weekend), and the same rules generate the current
season.

| Area | Today | New |
|---|---|---|
| Company | "Demo Märkte GmbH", fictional | One company (Coelln Konzept's markets only), real market and place names; fictional people, contact details and private organisations |
| Event types | flea, antique, city_festival, food_wine | Same four; Bauernmarkt and Lifestyle/Design only if the client confirms new types |
| Venues | 12 invented across NRW | 8 Köln places + Kerpen + Rösrath-Hoffnungsthal (the Antik & Design places Neumarkt, Rheinauhafen, Flora, Gürzenich are out with that company); shared venues with zones (Stadion: Vorplatz + P6; Rodenkirchen: Hauptstraße + Maternusplatz) |
| Presets (markets) | 14 | **~17** (16 Coelln Konzept + Hoffnungsthal), each with colour and Kürzel; markets without a date on the wall get plausible dates |
| Events / season | 74, Apr–Oct, ≤4 per weekend | **~60–70** (49 identified Coelln Konzept dates + the unplaced series), Jan–Nov, mostly Sundays, 1–3 per day, multi-day Fr–So / Sa–Mo / Do–So |
| Templates | 4 per-type templates (39–40 items) + derived master | **Grundvorlage** = the core of 1.3; **own templates** for Altstadt, Riehler Gürtel, Nippes, Hoffnungsthal verbatim from the client; every other market gets a master copy plus marked assumptions until the client sends its sheet |
| Season tasks | none (one apply task per covered event) | Termine planen and Genehmigung once per series and season (needs G1, or an interim) |
| Tasks | 5,774 | ≈ 15–25 per event → **~1,300–1,800** plus ~2 season tasks per series |
| Permits | 6 types, per venue | Genehmigung/Sondernutzung per series and season, **Festsetzung as its own type `market_fixing`** (§ 69 GewO, research 12 D2-8) with its fee → payable, Plakatierung, PVBT per event (96 h), Standrohr, Schaustellerliste (Hoffnungsthal) |
| Venue fields (Ort) | — | `kind` = `municipal` / `private`; `name` may be empty (derived from the address) — research 12 §5 |
| Market rules and times | `times` (4 fields), rules on the event type | `rules` per market (copied from the event type) and a **Zeitplan** (`schedule` rows, ADR 0022) on markets and events — research 12 §5 |
| Contacts | 30 generic | City offices (Köln, Kerpen, Rösrath), Ortsring, DRK, school Hausmeister, traffic-safety firm, electrician, banner/sign printer, Hohlkammerplatten supplier, water supplier — fictional names and numbers |
| Duty roles | 7 | Add Ordner/Tageswache, Nachtwache, Verkehr, Einweisung, Nachkassieren (or map them onto existing roles) |
| Vendors/bookings | 1,500 / 6,411 | Out of scope here (UT-12b already plans ≈5 per market) |

### Order of work (to be split into Fahrplan steps of ≤ 30 min once agreed)
1. Agree the open questions below with Arda (and Jerome where marked).
2. New dictionaries: venues, presets with date rules, brands, Kürzel.
3. Template dictionaries: Grundvorlage + four client templates with child items (`parent_key`); seed creates the master and the
   owned copies (instead of per-type templates).
4. Season tasks: interim (first event of the series per season carries them) or G1 proper.
5. Permits, contacts, duty roles, payables (Festsetzung) to match.
6. Tests: wall-calendar rules reproduce 2027; load per day ≤ 3; season Jan–Nov; counts.
7. Reseed local and dev; check Kalender, Übersicht, Genehmigungen against the photo.
8. Product gaps G2–G13 as their own steps (G1 decides the architecture and comes first).

## 5. Open questions

**For Arda (product decisions)**
1. ~~Season-level tasks (G1).~~ **Decided 2026-11-13: a Saison record per market and year** (see section 6).
2. ~~Market-day block.~~ **Decided 2026-11-13: each market-day line is its own task** (phase `live`, anchored on
   that market day, with its own duty role); sub-lines everywhere else become subtasks (ADR 0021).
3. ~~Real names in synthetic data.~~ **Decided 2026-11-13: real market and place names** (Nippes Wilhelmplatz,
   Riehler Gürtel, Südbrücke, RheinEnergie Stadion, Hoffnungsthal …) and real authority types (Stadt Köln, Stadt
   Rösrath, Stadt Kerpen). People, phone numbers, e-mail addresses and private organisations (traffic-safety firm,
   electrician, printers, the Ortsring's people, the school) stay fictional under the existing privacy rules.

**For Jerome (facts)** — answered by Arda 2026-11-13: Antik & Design is a separate company, not included now;
ink colours, unidentified tags and the client vocabulary ("Elektro Klein", "Dobner", "repetitive 1 monthly") are parked;
every series will get dates. Fahrplan R4:
4. **Hoffnungsthal is a Coelln Konzept market** (Arda, 2026-11-13), even though it is missing from the legend.
5. Sheets for the remaining markets: not answered yet. Until they arrive, those markets start as a copy of the
   Grundvorlage, with their extra items marked as assumptions.

## 6. Saison record — proposed design (decided in principle 2026-11-13)

### 6.1 Data
- **`event_season`** (UI "Saison"): `id`, `preset_id` → event_preset, `season` (integer, the calendar year), unique
  `(preset_id, season)`; `expected_start` (`date`, the first date we expect before any event exists), `status`
  (`planning | dates_set | closed`), `notes`, `archived_at`. Audit like every business record.
- **Anchor `season_start`** = the earliest non-cancelled event of that market in that season; while there is none, the
  `expected_start`. Optional `season_end` (last event day) for close-out items. Stored as anchors of the season
  (`event_season_anchor (season_id, key) → date`), the same shape as `event_anchor`.
- **Template items get `scope`** (`event | season`, default `event`). Season items use only season anchors. The
  Grundvorlage and every market's own copy can hold both kinds, so one template still describes one market.
- **Checklist and task point at the season**: `checklist.season_id?` (check: exactly one of event / permit / season),
  `task.season_id?`. The idempotency index on `(checklist_id, template_stable_key)` covers season checklists unchanged.
- **Season permits link to the season**: `permit.season_id?` next to the existing `venue_id`/`season`. An item with
  `permit_type` on season scope links to that permit through `linkPermitTasks`, so a season permit gets **one** apply
  task instead of one per covered market (research 10, Fahrplan 18).

### 6.2 Behaviour
- **Creation**: a nightly, idempotent job makes sure every active market has a record for the current and the next
  year and instantiates its season items. `expected_start` = last season's first date moved to the same weekday and
  week of next year (or 1 January when there is no history); editable on the market page. "Markt planen" also creates
  the record if missing (one service path: `ensureEventSeason`).
- **Instantiation**: the same path as events (`task-instantiation.ts`), with a season context instead of an event
  context. Holidays and due defaults as today.
- **Moving dates**: when the first event of a season is created, moved, cancelled or deleted, `season_start` is
  recomputed and open, not overridden season tasks follow through the existing `planTaskShift` / `shiftTasks` path
  (preview when the change comes from Verschieben). Done tasks never move.
- **Template propagation**: season items propagate like event items (deliberate, preview, nothing pre-selected);
  the target list shows seasons next to events.
- **Status**: `planning` → `dates_set` when the Termine planen task is done or the season has its dates (manual
  switch, undo toast); `closed` after the last day plus the close-out items. No auto-confirm here; event status rules
  stay as they are.

### 6.3 Where it shows
- **Market page** (`/vorlagen/<id>`): a "Saison 2027" panel with its anchor, status and tasks; the next season
  underneath once it exists.
- **Übersicht, Kalender (Aufgaben layer), notification center, digest, deadline sweep, carry-over, snooze**: season
  tasks behave like event tasks and are labelled "<Markt> · Saison 2027".
- **Genehmigungen**: the season permit's drawer shows its one apply task.

### 6.4 Sub-questions — decided 2026-11-13
1. UI name: **"Saison"** ("Saison 2027").
2. Records are created **automatically**: a nightly job keeps one for the current and the next year per active market.
3. A market with no history gets **`expected_start` = 1 January** of that season (editable on the market page).
4. Season Kernaufgaben show in the **due lists only** (Übersicht, Kalender, digest, market page), not in the
   Bereitschaft/Matrix views.

### 6.5 Build order (each becomes Fahrplan steps of ≤ 30 min)
Core rule `seasonStart` + tests → schema + migration (`event_season`, anchors, `scope`, `season_id` columns) →
`ensureEventSeason` + nightly job → season instantiation → anchor recompute on event changes → permit link (one apply
task) → market-page panel → season tasks in Übersicht/Kalender/digest → propagation → synthetic data and seed.

Progress (branch `feat/saison-backend`, 2026-11-13):

| Fahrplan | Step | State |
|---|---|---|
| R6 | Core rules `seasonStart`, `seasonEnd`, `expectedStartFromLastSeason`, status rules (`packages/core/src/events/season.ts`) | done |
| R7 | Schema + migration `0022_saison` (`event_season`, `event_season_anchor`, `template_item.scope`, `season_id` on checklist/task/permit) | done |
| R8 | `ensureEventSeason` + nightly job `event-seasons` (00:20 Berlin) + "Markt planen" hook | done |
| R9 | Season instantiation through the one instantiation path (season context); events skip season items | done |
| R10 | Anchors recomputed on create/move/cancel/reopen/delete/undo; season tasks follow through `planTaskShift`/`shiftTasks` | done |
| R12 | Market-page Saison panel (`/vorlagen/<id>`): start / "Erwartet ab" (editable without dates), status switch with undo, season tasks, "Saison anlegen" (ux-concept §5 "Market page and its Saison panel") | done (branch `feat/r12-season-panel`) |
| R11, R13, R14 | Permit link, lists/Kalender/digest labels, propagation | open |
| R18 | Synthetic data and seed: a Saison record per market and year with anchors (core rules), season items with `scope = 'season'` on `season_start`, season tasks on the record (no "Saison:" prefix, keys `saison_…` kept), season permits with `season_id`; the interim first-event carrier is gone (branch `feat/r18-season-data`) | done |

Choices made while building R6–R10 that this section left open (to confirm with the product owner):
1. **Week of next year** = the same ISO week and weekday; a date whose week position falls outside the season (KW 53,
   early-January days of the previous ISO year) moves by one week so `expected_start` stays inside the season.
2. **History** for `expected_start` = the market's first non-cancelled, not archived event of the previous year;
   a previous record's (edited) `expected_start` is not carried forward.
3. **`season_end`** has no anchor row while the season has no date; close-out tasks on it have no due date (or keep
   theirs).
4. **Initial status**: `planning` without dates, `dates_set` with dates, `closed` when the season's last date has
   already passed. A record created `closed` gets **no season tasks** (the current year's record made in November
   would otherwise start with a year of overdue work). Later changes are manual only.
5. **Archived events** do not count for the season (like cancelled ones); undoing a generation run recomputes too.
6. Season tasks are assigned through the market's **default duties** (`event_preset.default_duties`).
7. **No automatic propagation**: an existing record is never re-instantiated; a new template version reaches it only
   through propagation (R14). A market without season items gets no (empty) season checklist.
8. Moving an event into another year **creates that year's record** (`ensureEventSeason`, source `event_move`).
9. A season date change does **not** send the `dates_shifted` notification yet (it links to an event); the audit
   entry `season.anchors` records it. Revisit with the labels in R13.
