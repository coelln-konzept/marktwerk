# Shift allocator (Schichtplanung) — design

Date: 2026-11-26 · Status: approved design, plan pending · Branch: `research/shift-allocator` (off `exp/stand-allocation`)
Research: [`docs/research/14-shift-allocator.md`](../../research/14-shift-allocator.md) · Decisions: `docs/open-questions.md`
(rows "Shift allocator: …", 2026-11-26)

## 1. Goal

Jerome wants to put team members, mostly Minijob workers, on individual market days and always see how many hours
each person has used and has left. That way he can fill every market day without anyone going over their Minijob
budget. v1 is deliberately small. The office plans from what it hears on WhatsApp. Nothing is sent to staff, and
there is no self-service.

**Done when:**
- the office can see a month at a glance: who works which market day, which slots are still open, and how many
  hours each person has used and has left;
- the office can fill an open slot in two clicks, with the usual people suggested first and any conflict flagged
  before it happens.

## 2. Decisions (all 2026-11-26, product owner)

| # | Topic | Decision |
|---|---|---|
| 1 | Hours left | Monthly hour budget, default **40 h**, adjustable per person. The 40 h leaves a margin below the legal ≈ 43.4 h |
| 2 | Views | People grid (office) **and** market-day list (event Team tab, mobile), on one data model |
| 3 | Needs | From the preset (role × headcount, times from the Zeitplan), editable per day; open slots show as gaps |
| 4 | Times | Pre-filled from the Zeitplan row of that day, editable per shift |
| 5 | State | No draft/publish. angefragt → bestätigt / abgesagt (`requested`/`confirmed`/`declined`) |
| 6 | Unavailability | Office records "nicht verfügbar" per person and date, with a note. It warns and never blocks |
| 7 | Filling | Slots start empty. The picker ranks the usual people first; no auto-fill |
| 8 | Who | Owner and manager only (existing `team` permission) |
| 9 | Visibility | Split the flag: new `staffPlanning` shows the people and shift area; `team` hides task assignment only |
| 10 | Week | The month is the budget. Week totals are shown for information only, with no limit |
| 11 | € check | Hours only in the planner. The € Minijob check is not shown there |
| 12 | Limits | Nothing blocks. Over budget, unavailable, ArbZG problems and overlaps each ask for one confirmation |
| 13 | Date moves | Needs and linked shifts move with the event; confirmed shifts go back to angefragt |
| 14 | Existing events | No backfill. The event Team tab offers "Personalbedarf aus Vorlage übernehmen" (a deliberate click) |

## 3. Data model

**`event_preset.staffing`**: jsonb `StaffingRow[]` = `{ dutyRoleId, count, scheduleKind: "setup" | "open" |
"teardown" }`. It defaults to `[]`. It is copied into **`event.staffing`** when an event is created (the same
pattern as the Zeitplan, ADR 0022). Later preset edits never reach existing events.

**`shift_need`** (new): what one event day needs for one role.

| column | type | notes |
|---|---|---|
| `id` | uuid | |
| `event_id` | uuid → event, cascade | |
| `work_date` | date | within the event's days |
| `duty_role_id` | uuid → duty_role, restrict | |
| `schedule_kind` | enum setup/open/teardown | which Zeitplan part; the same role can be needed for Aufbau and Abbau |
| `headcount` | integer ≥ 0 | 0 = role not needed that day |
| `planned_start`, `planned_end` | time, nullable | from the Zeitplan row of `scheduleKind` that day |
| timestamps | | |

Unique `(event_id, work_date, duty_role_id, schedule_kind)`. Times come from the team row of that kind that day,
or else from any row of that kind that day (default Zeitplans have no team rows).

**`shift.need_id`** (new): nullable uuid → `shift_need`, `on delete set null`. A shift without a need (office
hours, an extra helper) keeps working. Nothing else on `shift` changes, so the hours, payroll and ArbZG code is
untouched.

**`staff_unavailability`** (new): `id`, `staff_member_id` → staff_member (cascade), `date`, `note` (nullable),
`created_by_staff_member_id`, timestamps. Unique `(staff_member_id, date)`. A from–to entry writes one row per day.

**`employment_contract.monthly_hour_budget`** (new): numeric(5,2), nullable, ≥ 0. Null means the company
default.

**Setting `staff.defaultMonthlyHourBudget`** = 40. It is company policy, not a legal value, so it lives in
`settings` and not in `legal_parameter`.

**Gaps are computed, never stored:** gap = headcount − linked shifts with status `requested` or `confirmed`.

**Module flags** (`apps/web/src/lib/modules.ts`):
- new `staffPlanning: false` gates `/team`, the event Team tab and TeamSummaryPanel, Einstellungen → Rechtliches,
  and staff in search;
- `team: true` now only gates task assignment: avatars and the assignee on cards, the new-task dialog, the Ablauf
  list, "Nur meine" in the Kalender, and `canAssign`;
- the archive entries for contracts and payroll follow `staffPlanning`.

## 4. Domain rules (`packages/core/src/staff/planning.ts`, pure, Vitest)

These rules reuse `shiftCounts`/`shiftWork`/`personMonth`: requested, confirmed and worked shifts count, using
actual times when they are recorded and planned times otherwise.

1. **`hourBudget(contracts, month, defaultHours)`**: takes the contract valid on the last day of the month that has
   one and returns its `monthlyHourBudget`, or `defaultHours`. With no contract at all it returns `defaultHours`
   plus `noContract: true`.
2. **`budgetStatus(month figures, budget)`**: returns
   - `used`, split into worked / confirmed / requested;
   - `left` = budget − used;
   - `level`:
     - `ok`
     - `tight` when `left` ≤ 4 h
     - `over` when `left` < 0
3. **`weekTotals(shifts)`**: minutes per ISO week (KW), for information only. A KW that spans two months shows all
   of its days; the month budget still counts only that month's days.
4. **`needGaps(need, shifts)`**: `max(0, headcount − active)` plus `over = max(0, active − headcount)`, where
   `active` means requested + confirmed.
5. **`rankCandidates(need, people, context)`**: sorts people into three groups:
   1. usual: `event_duty` holder for this role, or the role is in their `preferredDutyRoleIds`;
   2. other active staff;
   3. unavailable on that date.

   Within each group: hours left after this shift, descending, then name. Flags per candidate:
   - `leftBefore` / `leftAfter`
   - `unavailable` (+ note)
   - `alreadyScheduled` (any shift that day; `overlaps` if the times overlap)
   - `overBudgetAfter`
   - `worktime` issues from `checkWorkingTime`: more than 10 h a day, less than 11 h rest, break
6. **`shortNotice(workDate, today)`**: true when `workDate − today < 4` days (§12 TzBfG). The dates are Berlin
   calendar dates, so DST does not matter.

**Confirmation:** every flag except `alreadyScheduled` without an overlap needs `confirmOverrides`. The server
checks this again, and an override that wasn't confirmed returns the warnings instead of saving.

## 5. Services (`apps/web/src/server/services/shift-planning.ts`)

Every function follows the same path: `requirePermission("team","manage")` → transaction → `audit_log`.

- **`assignToNeed(actor, needId, staffMemberId, confirmOverrides)`**: creates a `shift` with
  - status `requested`, `needId`, the role, and the need's times as planned times;
  - `breakMinutes` from `requiredBreakMinutes`.
- **`setShiftStatus(actor, shiftId, status)`**: `requested ↔ confirmed`, `→ declined`, `→ cancelled`
  ("Entfernen"). The row is never deleted. Undo restores the previous status, and the action returns that status
  for the toast.
- **Time edits**: go through the existing `updateShift`, which bumps `version` and writes `shift_revision`.
- **`updateNeed(actor, needId, { headcount, plannedStart, plannedEnd })`**: changes one day's need.
- **`setUnavailability(actor, staffMemberId, from, to, note)`** / **`clearUnavailability`**.
- **`applyPresetStaffing(actor, eventId)`**: creates the missing needs from the preset. It is called by the button
  on existing events and by `instantiateEvents`, the single instantiation path, for new events.
- **`moveEvent` (existing, the single anchor-shift path)**:
  - also moves the event's needs and their linked `requested`/`confirmed` shifts by the same day offset;
  - sets moved `confirmed` shifts back to `requested`;
  - returns them, so a banner can say "N Zusagen neu einholen".
- **Concurrency:** two people filling the same slot at once is not prevented. The result is shown as "+1 über
  Bedarf".

## 6. Screens

All screens follow the UX concept:
- each view has its own URL;
- status is shown as colour + icon + text;
- mistakes are undone with undo toasts, not confirmation dialogs;
- dates use German formats including KW;
- there is no drag in v1.

**Team → Planung (`/team/planung?month=YYYY-MM`)**, the new first tab: Planung · Personen · Stunden · Schichten.
`/team` opens Planung.
- **Rows:** active staff, with the usual people first. The name cell shows:
  - the budget bar, e.g. "28 / 40 h · 12 h frei", with its level;
  - a sub-line, e.g. "davon 6 h angefragt";
  - "kein Vertrag" where it applies.
- **Columns:** the month's days that have needs ("Alle Tage" toggle shows every day), grouped by KW. Each KW ends
  in a narrow total column ("14 h").
- **Day header:** the market's colour and Kürzel, plus the gap count: "2 offen" in amber, or ✓ when the day is
  fully staffed.
- **Cells:** one of
  - a shift chip: Kürzel · role · "9–18", with ? for angefragt and ✓ for bestätigt;
  - a hatched cell labelled "nicht verfügbar", with the note shown on hover or focus;
  - empty.
- **Cell menu** (click or Enter):
  - *Einplanen…*: picks that day's open need for this person; if there is only one, it is chosen directly;
  - *Nicht verfügbar* / *Wieder verfügbar*;
  - on a chip: *Bestätigt* · *Abgesagt* · *Zeiten ändern* · *Entfernen*.
- **Keyboard:** the arrow keys move between cells.
- **Toasts:** every action shows an undo toast, e.g. "Anna am Sa 12.12. eingeplant (angefragt) · Rückgängig". A
  short-notice shift adds "Kurzfristig".

**Event → Team tab (`/veranstaltungen/[id]/team`)**, the market-day list, also used on mobile:
- *Verantwortlich* (TeamTable, `event_duty`) stays at the top.
- Below it, one block per event day with one row per need, e.g. "Aufbau · 7–10 Uhr · 2 benötigt". Each row shows
  the filled slots (person, status, times) and its open slots ("+ Person").
- "+ Person" opens the picker: a popover on desktop, a sheet on mobile. It shows the ranked groups with their flags
  ("noch 8 h → 3 h", "nicht verfügbar: nur bis 15 Uhr") and a search box.
- The headcount and times of a need can be edited for that day only.
- Shifts without a need are listed under "Weitere Schichten". These day blocks replace `EventShifts` for planning.
  `EventShifts` (time recording) stays below them once the event has started.
- Without needs and with preset staffing available, the tab shows the button "Personalbedarf aus Vorlage
  übernehmen".
- TeamSummaryPanel shows "N offene Schichten".

**Smaller changes:**
- **Vorlage:** a new section "Personalbedarf" with rows of role · number · Aufbau/Markt/Abbau.
- **Contract form:** a field "Stundenbudget pro Monat" (empty = default) with the hint "≈ 40 h × 16,00 € = 640 €".
  The hint is text only, with no warning.
- **Person page:** a "Nicht verfügbar" list with *Hinzufügen* (from–to + note) and remove.
- **Einstellungen → Rechtliches:** a "Planung" block with the default budget.

**Out of v1:**
- auto-fill
- copying a week
- sending messages to staff
- drag and drop
- staff self-service (comes with the M7 magic links)
- recurring availability rules
- the € check in the planner

## 7. Rollout order

1. Split the module flag (no behaviour change for users).
2. Migration: the new tables and columns, plus the settings key (`pnpm db:generate --name shift_planning`).
3. Core rules and their tests.
4. Services, including the `instantiateEvents` and `moveEvent` hooks.
5. Screens: the Planung grid, the event Team tab, then the smaller changes. Every string goes into both `de.json`
   and `en.json`.
6. Synthetic seed (reference date 2026-11-25):
   - staffing on every preset;
   - December needs and shifts that mix angefragt and bestätigt, with some gaps left open;
   - 3–4 unavailable days;
   - one €16/h person with a 35 h budget;
   - one declined shift whose slot reopened.

## 8. Tests

- **Core:**
  - budget when the contract changes mid-month, and with no contract;
  - a KW spanning two months, and KW 53;
  - gaps and overfill;
  - the ranking order and its tie-break;
  - `shortNotice` at 3, 4 and 5 days and across the DST weekend.
- **Services:**
  - assign → decline → the slot reopens → undo;
  - an override that wasn't confirmed is rejected;
  - the `staff` and `field` roles are refused;
  - `moveEvent` resets confirmed shifts and moves the needs;
  - `applyPresetStaffing` is idempotent.
- **e2e smoke:** plan a person in the grid, then see the budget bar and the gap count update.
