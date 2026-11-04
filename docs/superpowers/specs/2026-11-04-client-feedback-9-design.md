# Client feedback 9 (2026-11-04): design

Five changes the product owner asked for on 2026-11-04. Decisions below were confirmed in the
brainstorming session the same day; log them in `docs/open-questions.md` (Decided) when building.

| ID | Request | Decision in one line |
|---|---|---|
| CF9-1 | A general "Appointment" in the create menu | New `appointment` record ("Termin"), own Kalender layer, shown in Übersicht "Heute" |
| CF9-2 | Swap the Übersicht columns, simplify the weekend | Heute & überfällig left (first), Dieses Wochenende right with a collapsed "Top 5" per market |
| CF9-3 | "Send notification to mail/WhatsApp" on tasks | Saved on the task now (channels + timing); nothing is sent until the connections exist |
| CF9-4 | Legible market colours; colour when creating a market | Colour dot before the name on the events list (option C; name not coloured, no row tint); distinct palette; optional picker with a usage legend |
| CF9-5 | Drop ▲/■ on the Checkliste tab | Tab count becomes text: "29 offen · 3 überfällig" (overdue part red + clock icon) |

## CF9-1 · Termin (appointment)

**Purpose.** A dated appointment for the business in general (Ordnungsamt meeting, site visit,
supplier call), with who to reach out to. Not a task: it has no status, does not count in checklists
or health, and never appears on a Board.

**Data (`packages/db/src/schema/appointments.ts`, new migration):**

| Column | Type | Notes |
|---|---|---|
| `id` | uuid v7 | |
| `title` | text not null | "Name" in the UI |
| `on_date` | date not null | Berlin calendar date |
| `starts_at_time` / `ends_at_time` | `time` null | Both null = all-day; end requires start; end > start (check constraint) |
| `venue_id` | uuid → `venue` null, `on delete set null` | "Wo": picked Ort … |
| `location_text` | text null | … or a free address. UI offers both; at most one is set (check) |
| `notes` | text null | |
| `contact_id` | uuid → `contact` null, `on delete set null` | Picked from Kontakte … |
| `contact_name` / `contact_phone_e164` / `contact_email` | text null | … or typed in by hand (used only when `contact_id` is null) |
| timestamps, `archived_at` | | as every table |

Index on `on_date`. Times are wall-clock `time` in Europe/Berlin (like event default times), not instants.

**Service (`apps/web/src/server/services/appointments.ts`):** `createAppointment`, `updateAppointment`,
`archiveAppointment`, `restoreAppointment`. Each: `requirePermission("event","write")` → transaction →
`audit_log` (entity `appointment`). When the form's "Als Kontakt speichern" is ticked and the contact was
typed in, the same transaction inserts a `contact` (kind `other`, name/phone/email) and stores its id
instead of the inline fields. Phone is normalised to E.164 the same way the Kontakte service does it (reuse that code, don't copy it).
Read access reuses `event` read; no new permission (default chosen 2026-11-04, revisit if asked).

**Validation (pure, `packages/core/src/appointments/`):** title required; date valid; end needs start
and must be after it; at most one of venue/location; inline contact needs a name when phone or email is
given; email shape. Vitest tests incl. midnight edges.

**Create UI.**
- "+ Neu" gets **Termin** (icon `CalendarClock`) in the event group, after Einzeltermin; the palette
  gets "Termin anlegen". `CREATABLE` gains `appointment` (grant: `event` write).
- Both open the dialog via `?neu=termin` on the current page (pattern of `use-new-param.ts`); on the
  Kalender, `?neu=termin&datum=YYYY-MM-DD` pre-fills the date (from a day cell's "+" / keyboard).
- Dialog fields: Name · Datum · Ganztägig toggle / Von–Bis · Wo (combobox: Orte, with "Adresse
  eingeben" switching to a text field) · Ansprechpartner (combobox searching Kontakte; "Neuer Kontakt"
  reveals Name, Telefon, E-Mail and a pre-ticked **Als Kontakt speichern**) · Notizen.
- Success: toast "Termin angelegt" with Rückgängig (archives it).

**Kalender.** New layer key `appointments` ("Termine") in the FRISTEN group, **on by default** (part of
`DEFAULT_LAYERS` and the "Märkte + Fristen" preset). Chip: `CalendarClock` icon + time (or
"ganztägig") + title, neutral colour. List view shows it too. Clicking opens a Vorschau
`?vorschau=termin:<id>` with all fields, the contact (phone as `tel:`, email as `mailto:`, link to the
Kontakte entry when linked), Bearbeiten (same dialog) and Archivieren (undo toast). "Nur meine
Zuständigkeit" has no effect on Termine (no assignee by decision). "Nur Achtung und Kritisch" hides them.

**Übersicht.** Today's non-archived Termine head the "Heute & überfällig" card as their own group
"Termine heute" (time-sorted, all-day first), each row opening the Vorschau. (Palette search for
Termine is out of scope for now.)

## CF9-2 · Übersicht layout

- Grid order flips: `TodayCard` is the **left/first** column (also first on phones), `WeekendCard`
  the right. Copy for the left card stays "Heute & überfällig"; it now starts with "Termine heute".
- `WeekendCard` per market: marker, name, date range, Vorschau eye, verdict line, nothing else visible.
  Below it a ghost button **"Top-5-Aufgaben anzeigen"** (`aria-expanded`, chevron), collapsed by default
  every visit (no persisted state). Expanded: the first 5 blockers in today's ranking, then, if more
  exist, a link "Alle N in der Zusammenfassung" to the event. `blockerRows`, the in-place
  `MoreDisclosure` and "+N weitere" are removed from this card.
- Keyboard: the market row stays a J/K row; the toggle is a normal button in tab order; expanded
  blockers are rows like before.
- "Nächstes Wochenende" unchanged.

## CF9-3 · Task notification (UI and storage only)

**Data (migration on `task`):**
- `notify_channels text[] not null default '{}'`: values `email`, `whatsapp` (check constraint).
- `notify_timing` enum `task_notify_timing` null: `on_create`, `due_day`, `before_1d`, `before_3d`,
  `before_7d`, `custom`.
- `notify_at timestamptz` null, required iff timing = `custom` (check).
- Empty channels ⇒ timing and `notify_at` must be null (check).

**Rules (`packages/core/src/tasks/notify.ts`, tested):** `notifyMoment(task, now)` resolves the planned
send instant in Europe/Berlin (relative timings at 08:00 local on the computed day, following the current
`dueAt`, so they move with the due date; null when the task has no due date and timing is relative).
Relative timings without a due date are a validation error in the form. Not called by any job yet.

**UI** (new component `components/task/notify-fields.tsx`, used in `new-task-dialog.tsx` and the task drawer):
- Section "Benachrichtigung senden an": checkboxes **Mail** and **WhatsApp**. When at least one is
  ticked: select "Wann" with the six options; "Eigenes Datum/Uhrzeit" reveals a datetime input.
- Recipient (decision 2026-11-04): while the Team module is hidden (`HIDDEN_MODULES.team`), the person who
  sets the notification, i.e. the signed-in user; stored as `task.notify_user_id` (→ `user`, set by the service
  from the actor whenever channels are saved, cleared when channels are emptied). Their email is the user's
  email, their phone the phone of the user's linked staff member (if any). Once Team is visible again the
  recipient is the assignee and `notify_user_id` stays only as a fallback. Recipient line: "An: dich
  (<email>)" while Team is hidden, else "An: <Zuständig>". Hints: no assignee → "Ohne Zuständige Person wird nichts
  gesendet."; assignee without email (for Mail) / phone (for WhatsApp) → "<Name> hat keine E-Mail-Adresse
  / Telefonnummer hinterlegt."
- Always-visible info note: "Versand folgt, sobald Mail und WhatsApp angebunden sind."
- The drawer shows the saved setting read-only with an edit affordance, like other drawer fields.
- Saved through the existing task create/update services (audit logged). Templates are untouched.

## CF9-4 · Market colours

**Palette.** Retune the 10 `--market-*` tokens (light + dark) in `globals.css` so neighbours are clearly
distinct (today slate/petrol/graphite/indigo blur together). Keys stay (no data migration); German/English
colour names in `templates.json` change where the hue changes. Target: every pair ΔE ≥ 20 in light mode,
3:1 contrast of the bar colour against the card in both modes. Starting proposal (light): plum #a2337f,
rose #d0455f, brown #8a5a2b, sand → amber #c48a12, olive #5f8a1c, petrol → teal #0f8a6e, cyan #1f86c4,
slate → blue #3157c9, indigo → violet #6a3fc9, graphite #4a4945. Dark values: same hues lightened.

**Events list (`/veranstaltungen`, option C — changed 2026-11-04 from option B after seeing it built).**
The 2026-10-22 "never a background" rule stands again:
- No row tint. Rows use the standard hover / selected / focus states of the other lists.
- Before the market name a round colour dot (12px, `rounded-full`) in the market colour replaces the thin
  `MarketMarker` bar on this list. The name stays in the normal text colour (not coloured). Rows without a
  colour: the event type's square as today. Cancelled rows: dot kept, row muted as today.
- Art tags (`EventTypeTag`): the stronger `--type-<key>-strong` text from the option B build stays.
- The retuned palette stays everywhere.

**Neuen Markt anlegen** (`new-market-form.tsx`): add the swatch row from `preset-form.tsx` (extract a
shared `MarketColorPicker`). Optional, "Keine" allowed; pre-selected is the colour `createMarket`
already assigns today (least used, `nextMarketColor`), so quick creation keeps getting a colour. Each swatch's tooltip and a
small legend under the row list the active markets already using that colour ("Petrol: Flohmarkt
Heumarkt, Antikmarkt Altstadt"); unused colours read "noch frei". Data: a query returning
`{color, presetNames[]}` for active presets, passed in from the sheet. The Marktvorlage form gets the
same picker (with legend).

## CF9-5 · Checkliste tab status

In `event-tabs.tsx`/event layout, the Checkliste tab count drops `HealthShape`. Text:
"29 offen" when nothing is overdue; "29 offen · 3 überfällig" otherwise, the second part in
`text-status-critical` with a `Clock` icon (sr text "3 überfällig"). Shapes elsewhere (Übersicht verdict
lines, Kalender, health summary) stay.

## Out of scope

Actually sending mail/WhatsApp; recurring Termine; assigning staff to Termine; linking Termine to events;
changing the health shape system elsewhere; tinting any list.

## Testing

- Core: appointment validation, `notifyMoment` (DST switch days, due date moves, no due date).
- Service tests: appointment create with "save contact" creates exactly one contact; archive/undo.
- E2E smoke (`apps/web/e2e/smoke.spec.ts`): create a Termin from "+ Neu", see it in the Kalender and,
  for today, in Übersicht; Übersicht left column is Heute; Top-5 toggle expands; Checkliste tab text.
- Visual check in the browser for the events list in light and dark (rest, hover, selected, focus).

## CF9-6 · "Genehmigungen demnächst" next to the weekend (added 2026-11-04)

The blue "Genehmigungen demnächst" group (due urgency `upcoming`: permits further out than 7 days but inside
the permit horizon) leaves the full-width "Diese Woche" card and becomes its own panel in the Übersicht's
right column, directly under "Dieses Wochenende" (same rows, same blue info styling, same keyboard rows and
snooze). "Diese Woche" keeps "soon" and "waiting". Empty → the panel shows a one-line empty state (no
upcoming permits). Phone order: Heute, Dieses Wochenende, Genehmigungen demnächst, Diese Woche.

## CF9-7 · A–Z selector on Aussteller and Kontakte (added 2026-11-04)

Above the lists on `/aussteller` and `/kontakte`: a row "Alle · A B C … Z · #". A letter filters the list to
entries whose display name (the name the list sorts by) starts with it, via the URL param `buchstabe=<A–Z|#>`
(classic screens: linkable, survives paging; combines with the existing search/filters; resets paging).
Umlauts and accents fold to their base letter (Ä→A, Ö→O, Ü→U, É→E); "#" = digits and anything else.
Letters with no entries under the other active filters are shown disabled (not links); the active letter is
marked (`aria-current`). Keyboard: normal links in tab order. Shared component
`components/ui/letter-filter.tsx`; letter folding as a pure function in packages/core/src/text/ with Vitest.
