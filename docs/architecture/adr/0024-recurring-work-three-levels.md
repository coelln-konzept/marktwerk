# 0024: Recurring work lives on three levels; no Saison record

**Status:** accepted (2026-11-25, product owner, option A of the Saison rethink, Fahrplan SAI1); amended
2026-11-26 (SAI8: planning the dates creates the season permits, no nightly job, see "Amendment" below).
Replaces the Saison record of research 13 §6 (Fahrplan R6–R14, R18, R27, migration 0022).

## Context
The Saison record (`event_season`, one per market and year) held year-level work: "Termine planen" and
"Genehmigung beantragen" as season tasks timed from the market's first date, and the season permits. The product owner
was unsure about it, especially for permits that are applied for per date. Asked step by step (2026-11-25), the office
works on three levels:

| Level | Work | When |
|---|---|---|
| Per date | Halteverbot (PVBT), GEMA, and all practical tasks of a date | relative to the date |
| Per market (≈ per Ort) and season | Ordnungsbehördliche Erlaubnis, Festsetzung, Ausschankgenehmigung (city, one application per season); on private ground also the owner's agreement; planning the dates | fixed in the calendar: dates first, applications ~6 months before the season starts in March (≈ September) |
| Company, per year | Insurance (start of year, all markets), toilet booking (start of year, all markets, plus extra bookings when plans change), electricity (one contract), marketing (2–3 times a year) | fixed calendar points |

Further answers: almost every Ort holds one market; the few shared Orte are exceptions handled by hand. Dates are
mostly planned for all markets in one go, a few separately. The Saison timed work from each market's first date, so it
did not match a calendar-driven office, it mixed market work with permit logic, and company work had no home.

## Decision
No Saison record. Each level has one home:

1. **Per date: the event and its template** (unchanged). Halteverbot and GEMA are `per_event` permit requirements:
   every date gets its own permit and its own "… beantragen" task on that date (`fillLogbookForEvents`).
2. **Per season: the Genehmigungen logbook, from the Ort's requirements.** A requirement with a cadence that covers
   several dates (`per_season`, `per_year`, `multi_year`, `standing`) gets one permit per Ort and season. A nightly job
   creates next season's permit and its own "… beantragen" task (no event) in time, from the requirement's application
   window or lead time before the season start (1 March), even before any date is planned. Dates link to the permit
   when they are created. One permit per Ort (shared Orte are handled by hand), so the per-market split of R27 goes.
   Template items no longer apply for season permits; a template task only applies for a `per_event` permit.
3. **Per year: Pflichten** (`obligation`, existing). Company-wide (`scope = company`) or for an Ort (`scope = venue`),
   with an interval, the next due date and a lead time: "Termine für die neue Saison planen" (company, yearly, due
   before the applications), insurance, toilet booking, electricity, marketing (every 4 months). A market planned
   separately gets its own venue-scoped Pflicht if needed.

Removed: `event_season`, `event_season_anchor`, `task.season_id`, `checklist.season_id`, `permit.season_id`,
`template_item.scope`, the nightly `event-seasons` job, `ensureEventSeasonTx` / `syncSeasonsTx`, the Saison panel on the
market page, season labels in lists, "Gilt für: Ganze Saison" in the template editor and season propagation. Season
tasks and season-scoped template items are deleted by the migration (only synthetic data exists; production has not
started). `permit.season` (the year) stays.

## Consequences
- No task ever applies twice for the same permit: season permits have exactly their own task, date permits theirs.
- Year-level work shows where it already shows today: permits in the Genehmigungen logbook and the Übersicht's permit
  strip, Pflichten under Heute / Überfällig with reminders. No new screen.
- The synthetic data follows the levels: Halteverbot and GEMA `per_event`; Standrohr and Ausschank (`catering`) per
  season; the city's "Marktgenehmigung" is titled "Ordnungsbehördliche Erlaubnis"; company Pflichten as above.
- Open: whether the owner's agreement on private ground is per season (assumed) or multi-year; the exact application
  window per authority (taken from each requirement).
- Steps: Fahrplan SAI2–SAI6.

## Amendment 2026-11-26: the dates create the season permits (Fahrplan SAI8)
Asked where the event-less "… beantragen" tasks show, the product owner found them hard to find (they piled up under
"Weitere Aufgaben") and decided that **planning the Termine is what creates the need for a season permit**, not a
job. So:
- **No nightly `season-permits` job.** The first date of a season at an Ort creates the Ort's season permits with
  their own "… beantragen" tasks (`fillLogbookForEvents`); later dates link to them. An Ort without dates in a season
  gets none. The Pflicht "Termine für die neue Saison planen" (due before the applications) is the reminder to plan.
- **The apply-by stays fixed in the calendar** (core `fillApplyBy`): while the season has not started, the end of
  the last submission window before 1 March, else lead time before 1 March; a date in January or February can make
  it earlier; once the season runs, a new date's own deadline.
- **The Übersicht shows them as "Saison-Anträge"**: one line per Ort and season ("Kerpen · Saison 2027 · 3 Anträge
  offen", overdue first), opened in place to the permits; their tasks leave the Übersicht's task lists (for those
  who read permits), and "Genehmigungen demnächst" leaves them to that panel until they are due within 7 days.
- **The task and its permit stay in step**: the task drawer names the permit and its Ort; ticking the task done
  marks the permit "Beantragt" (undo takes both back), as "Als beantragt markieren" already closed the task.
- Reminders and the digest name the Ort.
- Migration 0027 archived the permits the job had made for Orte without dates (untouched only) and cancelled their
  tasks.
