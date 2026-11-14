# Research 14 — Plan for the remaining gaps G8, G11, G12, G13 (Fahrplan R26)

*Session 2026-11-14, docs only. Sources: the gap table in [research 13 §3](13-client-checklists-and-wall-calendar.md)
(the client's five checklist sheets and the wall calendar), the client meeting ([research 05](05-client-meeting-2026-10.md)),
the user test ([research 11](11-user-test-2026-11.md)), inventory research ([research 07](07-inventory-finance-fleet.md)),
and the code as of `origin/main` (2026-11-14). Nothing here is built yet. The product owner decides the questions
in section 6 first (also listed in [open-questions.md](../open-questions.md), block "R26 remaining gaps").*

**Numbering.** This document uses the gap numbers of research 13 §3: **G12 = deadlines with a time ("96 hours
before")** and **G13 = the status step geplant → bereit**. (The R26 task description had the two the other way round.)
**G10** (other people's events on the calendar) stays **parked** (decided 2026-11-13) and is not planned here. G1–G7
and G9 are built or planned elsewhere (Saison R6–R18, Jahresübersicht R22, Kürzel R15, stille Feiertage R23,
Fürs nächste Mal R25).

## 1. Summary

| Gap | What the client needs | Smallest useful feature | Schema | Size |
|---|---|---|---|---|
| G8 Bringto | The market's packing list for the van. Other tasks add to it | A **Bringto list per market**, with extra rows for a single date. Shown on the market page and on the date, printable, filled from any task | new table `packing_item` | 3 steps |
| G11 Nachtwache | Somebody guards the site in the night between market days | **One task per night** between the market days, from a template row that repeats "every night". The same mechanism gives the middle day of 3-day markets its own market-day tasks | `template_item.repeat`, `task.occurrence` | 3 steps |
| G12 Times | "Deadline 96 h before, reminder 6 days before" | **Show and edit the due time** where it matters, and a **reminder "N Tage vorher"** per template row that the deadline sweep uses | `template_item/task.remind_days_before` | 2 steps |
| G13 geplant → bereit | After talking to the city and the Ortsring the date is "bereit" | A **status step**: a template row that, when ticked, sets the date's status (with undo). Setting the status by hand ticks the task | `template_item/task.sets_event_status` | 1 question + 2 steps |

Recommended order: **G12 → G13 → G8 → G11**. G12 is the smallest and its data already exists. G13 waits for one
answer from Jerome. G8 is self-contained. G11 touches instantiation, so it goes last.

## 2. G8 — Bringto (packing list per market)

### 2.1 What the sources say
- Every sheet has the line "Bringto einladen" (−1 day): load the van from the market's packing list. It is in the
  common core of the Grundvorlage ([research 13 §1.3](13-client-checklists-and-wall-calendar.md)).
- Altstadt has it as part of "Orga am Vortag" (Strom und Wasser, Bringto). Hoffnungsthal adds the Ortsring's needs
  (Strom/Wasser/equipment) one week before, and they go "into the Bringto list". One sheet says "add list to market
  bringto" ([research 13 §1.4, §3 G8](13-client-checklists-and-wall-calendar.md)).
- Client meeting: an inventory of cables, electric boxes and tables plus "per-market needs" is wanted. Start small
  (cables, electric boxes), and no barcodes ([research 05 §10](05-client-meeting-2026-10.md)).
- Research 07 §1 and its proposal call a packing list "just a printout of the requirements", with optional loaded and
  returned counts later ([research 07](07-inventory-finance-fleet.md)).
- Today the seed has the task `bringto_einladen` (Grundvorlage, Kernaufgabe) and subtasks such as "Kabel und Verteiler
  in die Bringto übernehmen", but there is **no list** to take anything into.

### 2.2 Smallest useful feature
A **Bringto** is a short list of things with an optional count ("Kabeltrommel 50 m · 4", "Flatterband", "Kreide").
- **Market list** (standing): kept on the market page and valid for every date of the market.
- **Extra rows for one date**: "nur für diesen Termin" (e.g. three beer-table sets for the Ortsring in 2027).
- **On the date** the Bringto shows the market rows and the date's own rows in one list, and it can be printed on one
  A4 page.
- **From a task**: "Zur Bringto hinzufügen" in the task drawer of any task of a market's date. This is the client's
  "add list to market bringto". The "Bringto einladen" task links straight to the list.
- Not in this slice: stock, shortages and rentals (M12), and "eingeladen"/"zurück" ticks (question Q2).

### 2.3 Data model
New table **`packing_item`** (UI "Bringto"):
- `id`, `preset_id?` → `event_preset` (on delete cascade), `event_id?` → `event` (on delete cascade), with a check
  that **exactly one** is set (`num_nonnulls = 1`, like `checklist_one_owner`).
- `label` (1–120 characters, trimmed), `quantity?` (integer 1–9999; null means no count), `note?` (≤ 200), `sort`
  (double, the fractional ordering used for `board_sort`), `archived_at?`, `created_by_id?`, timestamps. Index
  `(preset_id, archived_at)` and `(event_id, archived_at)`.
- **Live reference, no copy.** A date shows the current market rows plus its own. Changing the market list changes
  every date at once. This is market master data like the Marktregeln (`preset.rules`), not a template, so the rule
  "template changes never propagate automatically" does not apply. Past dates show the current list. That is
  acceptable while there are no ticks (with ticks, Q2, the tick row would keep a label snapshot).
- Link from the task: **`template_item.opens_bringto`** (bool, default false), copied to **`task.opens_bringto`** by
  instantiation and propagation. The flag avoids matching on stable keys (`bringto_einladen`, Altstadt's
  `orga_vortag__bringto`).
- Forward to M12: later `packing_item.item_type_id?` → `item_type`, and the market rows become the
  `preset_requirement` of research 07 (quantity per market). Nothing here has to be thrown away.
- Services in `apps/web/src/server/services/packing.ts`: `addPackingItem` (target = market | date), `updatePackingItem`,
  `archivePackingItem` / restore (the undo), `movePackingItem`. Audit `packing_item.create|update|archive|restore|move`.
  Permission resource `packing`: read/write on dates for every role that sees the date (field users only on their
  dates, like `nextTimeNote`). The market list needs `template:write` (owner, manager).
- Pure rules in `packages/core/src/events/packing.ts`: `packingItemProblem` (label, quantity), `packingListForDate`
  (merge and order the market rows and the date rows).

### 2.4 UI placement (ux-concept)
- **Market page** (`/vorlagen/<id>`): section **"Bringto"** (Panel with its title outside the card, §6 "Section
  headings") below "Fürs nächste Mal", above the edit form. Rows: label, count muted after it, "…" menu (Bearbeiten,
  Nach oben/unten, Entfernen). An add row at the end (label + "Anzahl" + "Hinzufügen", Enter works). Removing shows an
  undo toast and never asks first. Every drag has the menu alternative.
- **Event page**: **Mehr ▾ → "Bringto"** with its own URL `/veranstaltungen/[id]/bringto` (classic screens, ADR 0019).
  Two groups: "Für jeden Termin von „<Markt>“" (edit link to the market page for owner/manager) and "Nur für diesen
  Termin" (editable here). The **Drucken** button reuses the Kalender's print button. An Einzeltermin without a market
  has only its own rows.
- **Task drawer**: a quiet button **"Zur Bringto hinzufügen"** next to "Fürs nächste Mal notieren" (above Aktivität).
  It opens the field in place, with the choice "Nur für diesen Termin" (default) / "Für jeden Termin des Markts" (only
  with `template:write`). A task with `opens_bringto` shows one line instead: "Bringto · 14 Teile → öffnen".
- No change to the Übersicht or the Kalender.

### 2.5 Steps

| Step | Title | Done-check |
|---|---|---|
| R26e | Bringto: core rules, schema and services | Core tests for `packingItemProblem` and `packingListForDate` (order, archived rows, date-only rows). Migration `packing_item` (+ `opens_bringto` on template_item/task) applied locally. Service tests: add to market and to date, archive + restore, move, audit rows, field user refused on a date they do not see. `pnpm check` green |
| R26f | Bringto on the market page and the date (Mehr → Bringto, print) | The market page section and `/veranstaltungen/[id]/bringto` work: add, edit, reorder by menu, remove with undo. Print gives one A4 page. Phone width (390 px) does not overflow. DE + EN strings. ux-concept §5 updated |
| R26g | Bringto from tasks + seed | "Zur Bringto hinzufügen" in the drawer adds to the date or the market. "Bringto einladen" (`opens_bringto`) links to the list. The seed gives the four client markets a plausible list (cables, Verteiler, Flatterband, Kreide …, marked as assumptions) and Hoffnungsthal one date-only Ortsring row. Data model + glossary updated |

## 3. G11 — Nachtwache (night watch at multi-day markets)

### 3.1 What the sources say
- Altstadt has day 1, a **Nachtwache** between the days, and day 2 with Abbau ([research 13 §1.2 kind 3, §1.4](13-client-checklists-and-wall-calendar.md)).
  Altstadt runs **3 days** on Easter and Whitsun and 2 days otherwise ([research 13 §2.2](13-client-checklists-and-wall-calendar.md)),
  so there are one or two nights. Rudolfplatz (Fr–So) and Kerpen Weintage (Do–So) are multi-day too, but they sent no
  sheet.
- Research 13 §3 rates G11 as "Team module (hidden)". Shifts must be filled per market, and most staff are
  Minijobber ([research 05 §9](05-client-meeting-2026-10.md)).
- **Today**: the seed has one task "Nachtwache stellen" per Altstadt date (market day, 20:00, duty role
  `night_watch`, `checklist-items.ts`). A 3-day date gets **no task for night 2**. The same gap hits the market-day
  lines of the **middle day**: the seed copies the day-1 lines only for the last day (`lastDay`, `teardown_day`), so
  Sunday of Easter has no Einweisen, Tageswache or Nachkassieren. Anchors are `event_day`, `setup_day`,
  `teardown_day` and `booking_cutoff` only.
- Shifts (`shift`, Team hidden) already allow past-midnight times, and `worktime.ts` checks the ArbZG rest time. That
  matters once a night watch is also on the day-2 crew.
- Not known: own staff or a security firm, the hours, and how many people per night.

### 3.2 Smallest useful feature
**One task per night between the market days**, e.g. "Nachtwache · Nacht 1 · Sa 27.03. → So 28.03.", due at the
start of the night (20:00), duty role Nachtwache. A template row gets **"Wiederholen"**: *einmal* (today) · *jeden
Markttag* · *jede Nacht zwischen den Markttagen*. A 1-day date gets no night task, a 2-day date one and a 3-day date
two. *Jeden Markttag* fixes the middle-day gap with the same mechanism and replaces the seed's `lastDay` copies.

No shifts yet. When Team returns (M7 shift planning), a night task can prefill a shift past midnight, and its hours
then count toward the Minijob limit.

### 3.3 Data model
- **`template_item.repeat`** (enum `template_item_repeat`: `once | each_day | each_night`, default `once`). Only for
  `scope = event`, phase `live` and anchor `event_day` (core check `repeatFits`; a child row takes its parent's).
- **`task.occurrence`** (smallint, null for `once`; 1…n). The idempotency index changes from
  `(checklist_id, template_stable_key)` to `(checklist_id, template_stable_key, coalesce(occurrence, 0))` (new
  migration; the old index is dropped, no applied migration is edited).
- Due date: occurrence *k* = `starts_on + (k − 1)` days at the row's `due_time`. For a night, *k* runs over 1…n−1.
- **One path each** (CLAUDE.md): instantiation expands the occurrences. Changing the event's length (Verschieben,
  Eckdaten) adds the missing ones and cancels the surplus open ones through the existing shift path
  (`planTaskShift` / `shiftTasks`, preview lists them). Done tasks stay. Propagation matches by
  `(stable_key, occurrence)`.
- The label ("Nacht 1 · Sa → So", "Tag 2") is derived in core (`occurrenceLabel`), not stored in the title.
- **DST edge**: Easter 2027 is 27–29 March, and summer time starts on 28 March 2027 at 02:00, so night 1 of that
  Altstadt date is one hour shorter. Core tests cover it (the task due time itself is 20:00 on the 27th and does not
  move).
- Assignee: through the market's default duty `night_watch` (set on the market page). The drawer shows the assignee
  only while Team is visible. That is the existing open question **UX-D6**, not a new one.

### 3.4 UI placement
- **Template editor** item drawer (`?zeile=<key>`): for top-level live rows on Veranstaltungstag, a select
  **"Wiederholen"** with "Einmal · Jeden Markttag · Jede Nacht zwischen den Markttagen", and the example line
  "Bei 3 Tagen: 2 Aufgaben (Sa → So, So → Mo)". The grid shows a small repeat icon with the text "jede Nacht".
- **Checkliste / Übersicht / Was fehlt**: the occurrence label sits after the title in the row's muted meta line
  ("Nacht 1 · Sa 27.03. → So 28.03."), so the two nights can be told apart. No new screen.
- **Verschieben** preview: "1 Nachtwache kommt hinzu" / "1 entfällt" when the length changes.

### 3.5 Steps

| Step | Title | Done-check |
|---|---|---|
| R26h | Repeat per market day / per night: core rules | Core tests for `occurrences` (1-, 2-, 3-day dates; each_day vs each_night; length change adds/removes; DST night 27→28 March 2027) and `repeatFits`, `occurrenceLabel`. `pnpm --filter @marktwerk/core test` green |
| R26i | Repeat: schema, instantiation, length change, propagation | Migration (`template_item.repeat`, `task.occurrence`, new unique index) applied. Integration tests: a 3-day date gets 3 day tasks and 2 night tasks; shortening to 2 days cancels night 2 (open) and keeps it when done; propagation matches by occurrence; instantiation runs twice without duplicates. Data model updated |
| R26j | Repeat in the template editor + seed | "Wiederholen" select in the item drawer, icon in the grid, label in the lists and in the Verschieben preview. The seed's Altstadt uses `each_night` for Nachtwache and `each_day` for the market-day lines. The `lastDay` copies stay only for teardown-only rows. Reseeded: an Easter Altstadt date shows Nacht 1 and Nacht 2. ux-concept updated |

## 4. G12 — Deadlines with a time ("96 Stunden vorher", "bis 8 Uhr")

### 4.1 What the sources say
- Units are months, days and **hours**: "96 hours before is the deadline, reminder 6 days before" (Hoffnungsthal PVBT,
  [research 13 §1.2, §1.4](13-client-checklists-and-wall-calendar.md)). Also "Verkehrssicherung 09:00 after the fire
  brigade". Research 13 already decided that hours become a day offset plus a due time, so the seed's PVBT task is
  −4 days at 08:00. The example "bis 12 Uhr" from the R26 brief is not in the sheets, but it is the same pattern.
- **Today**: `template_item.due_time` exists (Berlin; null means the company default 09:00), and `task.due_at` is an
  instant that carries it. But **every screen shows only the day**: `DueBadge` works on days, and the drawer edits
  the date and keeps the time without showing it. The deadline sweep reminds by priority (`DEFAULT_TASK_REMINDER_DAYS`:
  high = 3 and 1 days), so "6 days before" cannot be expressed. The per-task notify setting (CF9-3: Mail/WhatsApp,
  1/3/7 days, custom) is saved only, is not on template rows, and nothing is sent yet.

### 4.2 Smallest useful feature
1. **Show the time when it matters**: a task whose due time differs from the company default reads "Heute · bis
   08:00", "Mi 08.09. · bis 08:00", and so on (DueBadge with time, tooltip, drawer). The drawer gets an optional
   **"Uhrzeit"** field next to the date. Rule (core `hasOwnDueTime`): the time is shown when it is not the default.
   Known limit: a real "bis 9 Uhr" looks like the default. A `due_time_set` flag only follows if that bites.
2. **Reminder per template row**: **"Erinnerung: N Tage vorher"** on the row, copied to the task. The deadline sweep
   uses it instead of the priority defaults. The PVBT row says 6, so for Hoffnungsthal (So 12.09.2027, PVBT due Mi 08.09. 08:00) the reminder
   comes on Do 02.09. The drawer shows "Erinnerung 6 Tage vorher (Do 02.09.)".
3. Not in this slice: an hour unit in the template editor ("96 h vor Aufbau"). The editor keeps days + time, and the
   description says "96 Stunden". Overdue colours stay **day-based** (question Q6).

### 4.3 Data model
- No change for the time: `task.due_at` already holds it. `updateTask` gets a `dueTime` patch ("HH:mm" or null =
  default) next to `dueOn`, audited in `task.update` and undoable.
- **`template_item.remind_days_before`** and **`task.remind_days_before`** (smallint 1–90, null = the priority
  defaults). They are copied by instantiation and propagation like `due_time`. The sweep calls `dueState` with `[n]`
  (or `[n, 1]`, Q7), and `reminderDedupeKey` already includes the due instant.
- Later, once mail and WhatsApp are connected, the task's notify setting may default from `remind_days_before`
  (Q7). Nothing changes there now.

### 4.4 UI placement
- `DueBadge` gains `withTime` (all lists), so the Übersicht, Was fehlt, the Checkliste and the market page show "bis
  08:00" in the same vocabulary (§7 due-ness).
- Task drawer: "Fällig" date field + "Uhrzeit" (empty = "Standard (09:00)"), and the reminder line under it.
- Template editor item drawer: "Uhrzeit" exists. The new field "Erinnerung" ("Standard" · number of days) goes next
  to it. The grid's "Fällig" column shows "T-4 · 08:00".

### 4.5 Steps

| Step | Title | Done-check |
|---|---|---|
| R26a | Due time visible and editable | Core tests for `hasOwnDueTime` and the time label (DST days, default 09:00). DueBadge shows "bis 08:00" on the seed's PVBT task in the Übersicht, Was fehlt and the Checkliste. The drawer time field saves with an undo toast, and moving the date keeps the time. DE + EN. `pnpm check` green |
| R26b | Reminder "N Tage vorher" per template row | Migration (`remind_days_before` on template_item and task) applied. Editor field + drawer line. Sweep test: PVBT due Wed 08:00 with 6 reminds once on the Thursday six days before, not at 3 days. Instantiation and propagation copy it. The seed's PVBT row uses 6. Data model updated |

## 5. G13 — The status step geplant → bereit

### 5.1 What the sources say
- Hoffnungsthal: "status geplant → bereit −180 d after talking to the city and the Ortsring" ([research 13 §1.4](13-client-checklists-and-wall-calendar.md)).
  Research 13 §3 asks for a manual step, "not only automatic on granted permits".
- Old website statuses: **planned** (published but not bookable, because the permit is not confirmed yet), bookable,
  fully booked, done ([research 05 §7](05-client-meeting-2026-10.md)). In the user test: "The website reads
  'bestätigt'" ([research 11 UT-14](11-user-test-2026-11.md)).
- **Today**: new dates start **geplant**. They become **bestätigt** automatically once at least one required permit
  exists and all are granted (`shouldAutoConfirm`), and they never move back. Without a required permit they stay
  geplant until someone confirms them. The status can be changed in one click (event menu, list "…", Kalender
  popover: Entwurf / geplant / bestätigt, undo).
- The seed's Hoffnungsthal template carries the task "Termin von „geplant“ auf „bestätigt“ setzen" (−180 d) with the
  subtask "Status auf „bestätigt“ ändern". That is a task telling you to change a status somewhere else: double
  bookkeeping.
- **"bereit" is ambiguous.** The client applies for the permits at −180 d in the same breath, so "bereit" at −180 d is
  *before* the permit is granted. It can mean (a) our **bestätigt**, set by hand before the permits, (b) our
  **geplant** ("agreed, may go online"), with the client's "geplant" being our Entwurf, or (c) **buchbar** (the
  booking flag, Phase 2). Jerome has to say which (Q8).

### 5.2 Smallest useful feature (works for (a) and (b))
A **status step on a task**: a template row can say "Beim Erledigen: Termin auf „bestätigt“ setzen" (or „geplant“).
- Ticking the task sets the date's status in the same transaction, if the transition is allowed
  (`canTransition`). The toast reads "Erledigt · Termin bestätigt" and its Rückgängig undoes both.
- Setting the status by hand (menu, list, popover) ticks the date's open status-step task for that status, so
  nothing is left saying "please change the status".
- An already confirmed date (e.g. auto-confirmed by permits) just has the task ticked. The status never moves back.
- The seed's Hoffnungsthal row becomes "Mit Stadt und Ortsring sprechen" with this step, and the subtask "Status
  ändern" goes away.
- If (b) is chosen, a second, separate small change follows: a market setting "Neue Termine starten als: geplant ·
  Entwurf" (`event_preset.initial_status`), so Hoffnungsthal dates wait as Entwurf until the talk. It is not planned
  as a step until the answer arrives.

### 5.3 Data model
- **`template_item.sets_event_status`** and **`task.sets_event_status`** (nullable, values `planned | confirmed` of
  `event_status`, check constraint; only `scope = event`, a Saison has no event status). They are copied by
  instantiation and propagation.
- Core rule `statusStepEffect(task, eventStatus)`: which status to set, or nothing. `setTaskStatus` / `moveTask` call
  it. `changeEventStatus` ticks the matching open tasks. Both stay the single paths, in one transaction. Audit
  `event.status` with `viaTaskId`, and `task.status` with `viaEventStatus`.

### 5.4 UI placement
- Template editor item drawer: section "Beim Erledigen" with the checkbox "Termin auf „bestätigt“ setzen" (select if
  (b) is chosen), for event rows only.
- Task drawer: one muted line under the title, "Erledigen setzt den Termin auf „bestätigt“." The status vocabulary
  (§7) stays: the website reads "bestätigt", so there is no new word "bereit" in the UI (Q8 may change that).
- The tick-confirm dialog (D1) and the subtask done gate apply unchanged.

### 5.5 Steps

| Step | Title | Done-check |
|---|---|---|
| — | Ask Jerome what "bereit" means (Q8) | Answer logged in open-questions.md (Decided). No code |
| R26c | Status step: core rule, schema, both directions | Core tests for `statusStepEffect` (allowed, already confirmed, cancelled date, Saison task). Migration (`sets_event_status`) applied. Integration tests: ticking sets bestätigt with audit `viaTaskId`; undo restores both; setting bestätigt by hand ticks the open task; auto-confirm ticks it too. `pnpm check` green |
| R26d | Status step in the template editor, drawer, toast + seed | Editor checkbox, drawer line, combined toast. The seed's Hoffnungsthal row uses the step (no "Status ändern" subtask). Reseeded: ticking it on a Hoffnungsthal date shows "Termin bestätigt". ux-concept + data model updated |

## 6. Open product questions (owner; Jerome where marked)

Each question lists options. The recommendation comes first and is marked.

1. **Q1 Bringto shape (G8):** **(rec.) its own small list per market plus extra rows per date** (§2.3) · subtasks of
   "Bringto einladen" in the market's template (no schema, but every list change is a new template version plus a
   deliberate propagation, and counts would be text only) · wait for M12 inventory.
2. **Q2 Ticks on the Bringto (G8):** **(rec.) not now**: print it and tick on paper. "Eingeladen" and "zurück" counts
   come with M12 rentals · an "eingeladen" tick per row and date now (a `packing_check` table with a label snapshot).
3. **Q3 Who edits the market's Bringto (G8):** **(rec.) owner/manager on the market page, everyone on a date's
   extra rows** · everyone everywhere. *Jerome:* can we get today's list (photo) for the seed?
4. **Q4 Nachtwache facts (G11, Jerome):** own staff or a security firm? From when to when, how many people per
   night? Also on Rudolfplatz and Kerpen Weintage? If it is a firm, the plan adds a "Wachdienst beauftragen" row
   (−2 weeks) and the night task only checks that they came.
5. **Q5 Night tasks (G11):** **(rec.) template rows that repeat "jede Nacht" / "jeden Markttag"** (§3.3, also fixes
   the middle day of 3-day markets) · one task "Nachtwache organisieren" with hand-made subtasks per night (no
   schema) · wait for shift planning (M7).
6. **Q6 When a timed task turns red (G12):** **(rec.) day-based as today, with the time shown** ("Heute · bis 08:00",
   amber all day) · red from the time on the day itself (changes `isOverdue` everywhere).
7. **Q7 Reminder per row (G12):** **(rec.) "Erinnerung N Tage vorher" replaces the priority defaults for that row,
   plus the usual 1-day reminder** · adds to the defaults · only the task's notify setting (no template field). And
   no hour unit in the editor (days + time; **rec.**) · an hours helper ("96 h vor Aufbau 08:00" → T-4 · 08:00).
8. **Q8 What "bereit" means (G13, Jerome):** **(assumed until answered) "bereit" = bestätigt**, set by hand before
   the permits are in · "bereit" = our geplant, with dates starting as Entwurf until agreed (market setting
   `initial_status`) · "bereit" = buchbar (booking flag, Phase 2).
9. **Q9 Status step (G13):** **(rec.) ticking the task sets the status (undo), and setting the status ticks the
   task** · the task only offers a button "Termin bestätigen" · wording only (keep the task as it is).
10. **Q10 Order:** **(rec.) G12 → G13 → G8 → G11** · G8 first (most visible for the field crew).

## 7. Step list (Fahrplan)

Steps are about one PR each. Labels follow the tracker's split convention for R26 (R26a …); renumber if the tracker
prefers new numbers. Every step ends with `pnpm check` green and its docs (data model, ux-concept, glossary)
updated in the same PR.

| Step | Gap | Title | Done-check (short) |
|---|---|---|---|
| R26a | G12 | Due time visible and editable | "bis 08:00" on the PVBT task in all lists; drawer time field with undo |
| R26b | G12 | Reminder "N Tage vorher" per template row | Sweep test: PVBT reminds 6 days before; editor field + drawer line |
| R26c | G13 | Status step: core, schema, both directions | Tick → bestätigt (undo both); manual bestätigt → task ticked; tests |
| R26d | G13 | Status step in editor, drawer, toast + seed | Hoffnungsthal row uses it; reseeded and checked by hand |
| R26e | G8 | Bringto: core, schema, services | Core + service tests, migration, audit, permissions |
| R26f | G8 | Bringto on market page and date, print | Add/edit/reorder/remove with undo; one A4 print; 390 px OK |
| R26g | G8 | Bringto from tasks + seed | Drawer "Zur Bringto hinzufügen"; Bringto task links; seed lists |
| R26h | G11 | Repeat per day / night: core rules | `occurrences` tests incl. the DST night of 27→28 March 2027 |
| R26i | G11 | Repeat: schema, instantiation, length change, propagation | 3-day date → 3 day + 2 night tasks; shortening cancels night 2 |
| R26j | G11 | Repeat in editor + seed | Easter Altstadt shows Nacht 1 and Nacht 2; `lastDay` copies gone |

Before R26c, Q8 must be answered. Before R26e, Q1–Q3. Before R26h, Q4–Q5. R26a can start at once (Q6 has a safe
default).
