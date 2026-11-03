# Handwritten Notes (November 2026) Implementation Plan

> **For agentic workers:** this is the **overview plan**. The notes cover nine independent areas, so
> each work package (WP) gets its own detailed step-by-step TDD plan (`superpowers:writing-plans`)
> right before it is built, saved next to this file as `2026-11-03-hn-<wp>-<name>.md`. Build with
> `superpowers:subagent-driven-development` or `superpowers:executing-plans`, one package per branch/PR.

**Goal:** Turn the handwritten notes from the November 2026 user test into shipped changes, without
the parts the product owner dropped.

**Architecture:** Mostly UI work in `apps/web` on existing services. New domain rules (grouping
consecutive days, expanding a rule over several years) go to `packages/core` with Vitest tests.
Every mutation goes through an existing or extended service (permission → transaction → `audit_log`).

**Tech Stack:** Next.js 16 (read `apps/web/node_modules/next/dist/docs/` first), Better Auth,
Drizzle/Postgres, pg-boss jobs (mail), next-intl, Vitest, Playwright (`apps/web/e2e/smoke.spec.ts`).

## Global Constraints
- `pnpm check` (lint + typecheck + tests) passes before every commit.
- Protected pages, actions and routes start with `requireUser()` / `requirePermission()`.
- No inline UI strings: new keys in **both** `apps/web/messages/de/*.json` and `en/*.json`.
- Status = colour + icon + text. Every drag has a menu or keyboard alternative. Undo toasts over
  confirmation dialogs, except where D1 (UT-05) says otherwise: confirm only where the task disappears.
- Code says `event`, never `market`. UI German-first, neutral wording, German date formats incl. KW.
- Event instantiation has exactly **one** service path: `instantiateEvents`
  (`apps/web/src/server/services/events.ts:111`). Extend it; never add a second path.
- Template and preset changes never propagate automatically.
- Never edit applied migrations; generate new ones with `pnpm db:generate --name <change>`.
- Update `docs/product/ux-concept.md` and `docs/open-questions.md` in the same change when behaviour changes.

## The notes, read and sorted

| ID | Note (page) | Reading | Today | WP |
|---|---|---|---|---|
| HN-01 | Login: "pass. forgotten" button | Password reset flow | Email + password only, no reset (`server/auth.ts`, `login-form.tsx`) | WP1 (postponed) |
| HN-02 | Übersicht/Veranstaltung: "done button changes places and form" | One done control, same look and place everywhere | 3–4 variants: square icon (Übersicht), toggle (overview rows), round tick (Checkliste), text buttons (drawer) | WP2 |
| HN-03 | Task: "done/erledigt → undo click again" | The done control is a toggle | Drawer swaps "Erledigt" ↔ "Wieder öffnen"; Übersicht only completes | WP2 |
| HN-04 | Task: "Status, maybe not ⋯ button, clickable to see all options" | The status badge itself opens a menu with every status | Read-only badge + "⋯" with 4 of 6 statuses (`task-drawer.tsx:287-323`) | WP3 |
| HN-05 | Übersicht: "+145 weitere ← not clickable" | "+N weitere" must clearly work, and large N needs a real list | It is a `<details>` opening in place (`due-groups.tsx:211-229`), which looks like text and is useless at 145 | WP4 |
| HN-06 | Veranstaltung: eye (Vorschau) "maybe add on other pages (Übersicht)" | Visible eye on Übersicht market rows | Eye only on list pages; Übersicht peek by row click/Space | WP4 |
| HN-07 | Veranstaltung: "add location TAG" | Location as a chip that filters | Plain text (`veranstaltungen/page.tsx:368-373`) | WP5 |
| HN-08 | Veranstaltung: "column sorting" | Sortable columns | None; fixed date order under month headers | WP5 |
| HN-09 | Veranstaltung: "Event bearbeiten" | Edit reachable from the list, incl. event type | Edit only in the event "…" menu; type not editable | WP5 (+ UT-14) |
| HN-10 | Kalender: "max 4/5 lines, can't expand +MORE, maybe click to unfold" | "+N weitere" opens the day's full list in place | Link jumps to the Liste view (`month-grid.tsx:124-135`) | WP6 |
| HN-11 | Kalender: "Feiertage default on?" | Keep holidays on by default | Already on (`layers.ts:30-37`) | no change |
| HN-12 | Events: "merge days to one Event" | Consecutive selected days → one multi-day event | Every date = its own event (`generate-sheet.tsx:98-104`). = UT-16 | WP7 |
| HN-13 | Events: "create a Preset from old Event" | "Als Vorlage speichern" on an event | No such flow | WP8 |
| HN-14 | Events: "create Event over multi Year" | Yearly series created ahead for several years (decided) | Rule expands within one year only (`generate-sheet.tsx:379-388`) | WP9 |
| HN-15 | Orte: Veranstaltung / Märkte boxes → Events / Presets | Ort detail shows two card sections linking to events and presets | Plain tables/lists (`orte/[id]/page.tsx:306-350`) | WP10 |
| HN-16 | Genehmigung: "add Task/Genehmigung BUTTON" | Both buttons on the event's Genehmigungen tab | Tab is read-only; permits only from `/genehmigungen` | WP11 |

**Dropped (product owner, 2026-11-03):** both BOARD notes and "Wochenübersicht ≈ Board" (the global
Board is being removed); "Übersicht like Board (columns)"; task drag & drop "from all heights";
task/subtask tag colours and subtask tags; map view on Orte; "Genehmigungen move to Events" and
"need Genehmigung for each Event".

## Order
1. ~~**WP1** login reset~~: **postponed** (2026-11-03). The deployed dev app has no SMTP, so a reset mail can't reach anyone yet. When it comes back: send directly over SMTP (decided), not through `outbound_message`.
2. **WP2, WP3, WP4, WP6:** small UI packages. **WP2 and WP3 both touch `task-drawer.tsx`; build them in sequence.**
   WP2 also touches files UT-06 (restore from Verlauf) will touch, so coordinate with that work.
3. **WP5** together with UT-14 (both add the row "⋯" menu in the Veranstaltungen list).
4. **WP7, WP9, WP8:** event creation (WP7 and WP9 both touch `generate-sheet.tsx`; in sequence).
5. **WP10, WP11:** Orte and Genehmigungen.

---

### WP1: "Passwort vergessen" (HN-01) (postponed)

> Postponed 2026-11-03 until SMTP exists on the deployed app. Decided for later: the web app sends the
> mail **directly** via `createMailTransport` (`packages/jobs/src/mail/transport.ts`), not through the
> `outbound_message` queue, so the link is never stored and doesn't wait for the 5-minute job or `email_enabled`.

**Files:**
- Modify: `apps/web/src/server/auth.ts` (`emailAndPassword.sendResetPassword`, `resetPasswordTokenExpiresIn: 3600`)
- Modify: `apps/web/src/app/(auth)/login/login-form.tsx` (link under the password field)
- Create: `apps/web/src/app/(auth)/passwort-vergessen/page.tsx` + form
- Create: `apps/web/src/app/(auth)/passwort-zuruecksetzen/page.tsx` + form (reads `?token=`)
- Modify: `apps/web/src/proxy.ts` (both routes public)
- Mail: queue through the existing mail path (`packages/jobs/src/mail/*`, `send-emails.ts`), German + English text
- Messages: `messages/{de,en}/auth.json` (or the existing login namespace)
- Test: `apps/web/test/integration/` (reset email queued with a token link; unknown address queues nothing),
  `e2e/smoke.spec.ts` (request → Mailpit link → new password → login)

**Behaviour:** The request page always answers "Wenn es ein Konto gibt, kommt gleich eine E-Mail"
(no account enumeration). The link is valid for one hour and works once. After a reset, all sessions
are revoked (`revokeSessionsOnPasswordReset: true`) and an `audit_log` entry is written.
Check `docs/development/deployment.md` that production SMTP env vars exist; add them if not.

**Done when:** the full reset works locally against Mailpit and the link/route appear in the docs.

### WP2: One done control that toggles (HN-02, HN-03) (done 2026-11-03)

> Built: `components/task/task-tick.tsx` (`TaskTick`, `TickMark`) on the Übersicht, Was fehlt (tick moved to the
> front, snooze stays at the end), the Checkliste and the drawer toggle. Not touched: the global Board's
> `task-card.tsx` and `market-panel.tsx` (Board is being removed) and the hidden Kernaufgaben rows.
> E2E: "Task drawer: Erledigt is a toggle…".

**Files:**
- Modify: `apps/web/src/components/task/done-button.tsx` (`TaskDoneButton`, `TaskCheckToggle`) → one `TaskTick`
  built on the Checkliste `Tick` (`components/board/ablauf-list.tsx:251-273`): empty ring (open, check preview
  on hover), filled green check (done), filled grey dash (skipped), each with a text label for screen readers
- Modify: `components/board/ablauf-list.tsx` (use the shared component), `components/overview/due-groups.tsx:142-143`,
  `components/event-detail/overview-rows.tsx`, `components/task/task-drawer.tsx:240-266`
- Test: component test for the three states + toggle; e2e: tick and untick in the drawer and the Checkliste

**Behaviour:** Always the leading element of a row, same size (28px) and shape. Clicking a done tick
reopens the task (through the existing undo/reopen service path). In the drawer the primary button
becomes one toggle ("Erledigt" ✓ ⇄ "Erledigt" pressed state with "Wieder öffnen" as its accessible
name). Keep UT-05: `confirmDone` still asks on the Übersicht and Benachrichtigungen, but only when completing.
Reopening never asks. Rows that disappear on done (Übersicht) only ever show the open state.

**Done when:** a grep for `CircleCheck` done buttons outside `TaskTick` finds none, and the smoke suite passes.

### WP3: Status badge opens all statuses (HN-04) (done 2026-11-03)

> Built: the "Status:" badge in the drawer is the menu trigger (all six statuses, also for finished tasks);
> the "⋯" status button is gone. Erledigt and Wartet keep their own buttons. E2E: "Task drawer: Erledigt and
> Wartet are buttons, the status badge opens every state".

**Files:**
- Modify: `apps/web/src/components/task/task-drawer.tsx:53` (`MENU_STATUSES` → all statuses), `:287-323`
  (badge becomes the menu trigger; remove the "⋯" status entries, keep other "⋯" actions if any)
- Reuse: the existing reason dialog (`:207`) for Blockiert / Wartet / Übersprungen
- Test: e2e: open drawer → click status → see Offen, In Arbeit, Wartet, Blockiert, Übersprungen, Erledigt → pick one

**Behaviour:** The badge looks clickable (chevron), keyboard-operable (Enter/Space, arrow keys).
Erledigt goes through the same path as the tick (evidence check: missing check items or photo → the
existing toast). Finished tasks show the menu too (only "Wieder öffnen" and the current state enabled).

### WP4: Übersicht polish (HN-05, HN-06) (done 2026-11-03)

> Built: `MoreDisclosure` is a bordered button; above `MORE_IN_PLACE_MAX` (10) hidden rows it links to the
> market's Zusammenfassung ("Was fehlt" lists tasks and permits, the Checkliste only tasks). `PeekLink` eye on the
> weekend, next-weekend and per-market headings. The deployed app was not checked: the in-place opening
> (`49e1f92`) is merged, so the note most likely predates it.

**Files:**
- Modify: `apps/web/src/components/overview/due-groups.tsx:211-229` (`MoreDisclosure`), `components/overview/weekend-card.tsx:128-162`
- Modify: `components/overview/weekend-card.tsx:107` (eye button next to the market row, reusing the list pages' eye link)

**Behaviour:** "+ N weitere" is styled as a button (chevron, hover state). Up to 10 hidden items
open in place as today. Above 10, the button links to the event's Checkliste filtered to overdue/today
instead of opening. First check on the deployed dev app whether it really didn't react (the in-place
opening shipped in `49e1f92`; the note may predate it) and record the result in the PR.

### WP5: Veranstaltungen list: location chip, sorting, edit (HN-07, HN-08, HN-09)

**Files:**
- Modify: `apps/web/src/app/(app)/veranstaltungen/page.tsx` (location chip → `?ort=<id>` filter; sortable
  headers via `?sort=<col>&dir=asc|desc` read on the server; row "⋯" menu)
- Modify: `apps/web/src/components/ui/table.tsx:19-30` (`TH` gets an optional sort link with `aria-sort`)
- Modify: `apps/web/src/components/event-detail/basics-dialog.tsx:21` (event type select)
- Modify: the event service that backs the basics dialog (audit the type change)
- Test: integration test for the sorted query; e2e: sort by Name, filter by Ort chip, edit from the row menu

**Behaviour:** Sortable columns: Datum (default, with month headers), Name, Ort, Typ, Status. Month
headers only show when sorted by Datum. The row "⋯" menu holds Vorschau, Bearbeiten (opens the basics
dialog via the event page `?bearbeiten=1`) and the UT-14 status items.
**Decision needed at the start:** changing the event type does **not** re-create tasks or permits
(templates never propagate automatically); the dialog says so. Confirm with the product owner.

### WP6: Kalender "+N weitere" opens in place (HN-10)

**Files:**
- Modify: `apps/web/src/components/kalender/month-grid.tsx:124-135` (popover listing all of the day's entries
  with the same chips; "In Liste öffnen" link kept at the bottom)
- Test: e2e: a day with 5+ entries → click "+N" → all entries visible → Escape closes, focus returns

**Behaviour:** Keep `maxPerDay = 4`. The popover is keyboard-reachable. Holidays stay on by default (HN-11, no change).

### WP7: Merge consecutive days into one event (HN-12, UT-16)

**Files:**
- Create: `packages/core/src/events/date-runs.ts` + `date-runs.test.ts`: `groupConsecutiveDates(dates: string[]): { startsOn: string; days: number }[]`
  (sorted, deduplicated, runs of consecutive calendar days; tests: across month end, year end, DST weekends, gaps, duplicates, runs over 14 days split at 14)
- Modify: `apps/web/src/server/services/events.ts:111` (`instantiateEvents` accepts `{ startsOn, durationDays }[]`;
  `createEventsFromPreset` passes runs when merging, the preset length otherwise; the one path stays one path)
- Modify: `apps/web/src/components/events/generate-sheet.tsx:98-104` (toggle "Aufeinanderfolgende Tage zu einer
  Veranstaltung zusammenfassen", on when the preset is multi-day; preview shows the resulting events)
- Test: core unit tests; integration: Sa+So selected → one 2-day event with its tasks anchored to both days

### WP8: Save an event as a preset (HN-13)

**Files:**
- Modify: `apps/web/src/components/event-detail/event-actions.tsx:19` ("Als Vorlage speichern")
- Modify: `apps/web/src/server/services/presets.ts:313` (`createPreset` gets a `fromEventId` source, or a small
  `createPresetFromEvent(actor, eventId, name)` that builds the input and calls `createPreset`)
- Test: integration: the preset copies name, type, venue, length, times/prices and the event's task template; the event is unchanged

**Behaviour:** Opens the preset form prefilled; nothing is saved until the user confirms. The new
preset doesn't touch existing events (no propagation). Audited.
**Check at the start:** how an event's tasks map back to a template (`event.presetId`, template items);
if the event's tasks were edited by hand, the preset uses the event's current task list.

### WP9: Yearly series over several years (HN-14)

**Files:**
- Modify: `packages/core/src/events/rrule.ts:61` (`expandRRule` already takes `from`/`to`; add a test over 3 years incl. leap year and DST)
- Modify: `apps/web/src/components/events/generate-sheet.tsx:379-388` ("Nach Regel": "von Jahr" / "bis Jahr", max 3 years ahead)
- Test: e2e: plan a rule for this year + 2 → preview lists all dates → creates the events → undo removes all

**Behaviour:** Creates separate events per date (decided), grouped in the preview by year. Same
warnings as today (holidays, weekend cap, venue booked). Permits follow their cadence as usual.

### WP10: Ort detail with event and preset cards (HN-15)

**Files:**
- Modify: `apps/web/src/app/(app)/orte/[id]/page.tsx:306-350, 380-420` (two card sections: "Veranstaltungen"
  (upcoming first, past collapsed) → `/veranstaltungen/<id>`; "Märkte" (presets) → preset Vorschau)
- Reuse: the event card style from the Übersicht if it fits, otherwise `Panel` + `LinkRow`

### WP11: Add a permit or task from the event's Genehmigungen tab (HN-16)

**Files:**
- Modify: `apps/web/src/app/(app)/veranstaltungen/[id]/genehmigungen/page.tsx:24-66` (buttons "Genehmigung hinzufügen" and "Aufgabe hinzufügen")
- Modify: `apps/web/src/components/permits/new-permit-dialog.tsx:26-30` (optional `eventId` + `venueId` prefill)
- Modify: `apps/web/src/server/services/permits.ts` (create links `event_permit` for the given event in the same transaction)
- Reuse: `NewTaskButton` from `components/board/board-screen.tsx:136-144` with the category preset to Genehmigungen
- Test: integration: the permit is created and linked to the event; e2e: add from the tab → appears in the tab and in /genehmigungen

---

## Self-review
- Every non-dropped note has an ID and a WP; HN-11 needs no change.
- Overlaps: HN-12 = UT-16; WP5's row menu = UT-14; WP2 must keep UT-05 behaviour.
- Open decision before WP5: event type change doesn't re-create tasks or permits.
