# UX audit, round 1 (2026-11-13)

Method: 17 research digests (multiple sources each) → 3 evaluation frameworks ([F1 heuristic scorecard](frameworks/F1-heuristic-scorecard.md), [F2 task efficiency](frameworks/F2-task-efficiency.md), [F3 robustness/a11y](frameworks/F3-robustness-a11y.md)) → 30 simulated flows driven with Playwright against a seeded local app → 353 raw findings, deduplicated and checked against the source into 72 findings.

## Summary

Synthesis of 30 simulated flows for marktwerk, deduplicated into 62 findings (UX-001 to UX-062). They are sorted by severity, then by how many flows hit them.

No severity-4 issue is left. The Finanzen "flow blocked" finding was rated 4, but HIDDEN_MODULES.finance=true is deliberate (src/lib/modules.ts, client decision 2026-10-22). I downgraded it into the hidden-modules finding (UX-031) plus product decision 7.

I checked these claims against the source:
- **Search umlaut folding (UX-014):** foldText in apps/web/src/lib/search-query.ts and translate() in search-core.ts fold ä to a and ß to s. They never map "oe" or "ue", so "Koeln" never matches "Köln".
- **Template apply sheet (UX-019):** apply-sheet.tsx renders "Weiter" and "Auf N anwenden" in the same position of a ternary, so React reuses one button node. A double-click skips the preview.
- **Moving a Termin (UX-018):** event-details.ts has no reference to applyBy, so a move never recomputes permit deadlines.
- **Hidden modules:** team, finance, globalBoard and notificationBell are all hidden.
- **Dropped claim:** the Kontakte flow said a double-click on "Kontakt anlegen" creates two records. The input-edge-cases flow saw exactly one POST and one record, so I dropped it and kept only the "no duplicate warning" part (UX-028).

The app's mechanics are mature: URL-addressable views and drawers, an undo toast on most actions, fast feedback, German specific validation, colour + icon + text status, and no console errors. Weaknesses cluster in four places:
1. **Deadline monitoring gaps (MISS-RISK).** Marking a Genehmigung applied never asks for the expected decision date, so it can never go "Antwort überfällig". Moving a Termin leaves "Antrag bis" unchanged. A new Ort with no requirements reads as "Keine Genehmigung nötig". Permit dates are not cross-validated. A Pflicht with no due date shows green. Critical Mängel never reach the Übersicht.
2. **Silent data loss or silent no-op.** Native date inputs drop half-typed or cleared dates. Unsaved notes, forms and sheets are discarded with no notice. A network failure crashes the form and loses the input. Rapid subtask entry drops text. A double-click on template apply skips the preview, and template apply cannot be undone.
3. **Mobile and field readiness.** Most controls are 28–36 px. Wide tables (Mängel, Benutzer, template grid, board, month grid) clip on phones. Heute sits about 2 screens down on the Übersicht. Addresses and contacts have no maps or tel: links. Nothing shows which tasks are mine.
4. **Wayfinding and consistency.** Settings and Vorlagen are only reachable via the avatar menu. Stammdaten is collapsed. Hidden modules answer inconsistently (silent 404 or redirect). Dates use five formats. Status words drift between screens. Focus drops to BODY after drawers and inline editors close.

The fix batches are split by area so they can run in parallel without sharing files. B01 (UI primitives) and B02 (shell) hold the shared components; the area batches use them without editing them.

Three batches overlap work that other branches are doing right now:
- **High risk:** B08 (Markt planen wizard) and B12 (Kalender).
- **Medium risk:** B06, B11 and B14, which touch the Ort-create permit dialog and the market editor.

Measured budgets:
- **Over budget:**
  - Ticking a task costs 2 clicks per item because of the confirm dialog.
  - Finding a permit takes 3–4 clicks against a budget of 2.
  - Reaching a phone number from the event page takes 5 taps against 3.
  - Reaching the Ort address and starting navigation is a manual copy against 2 taps.
  - Making permits appear for a new market takes 4 clicks and 3 page loads.
  - Reaching the Saison panel takes 4 clicks against 2.
  - Keyboard paths are 19–35 Tab stops against 10.
- **Within budget:** planning a season (6 clicks), moving a Termin (3 clicks), creating a task (2 clicks) and bulk template apply (4 clicks).

## Scores (0–4)

| Area | Score | Note |
|---|---|---|
| Übersicht | 3 | First desktop viewport answers 'what is due'. Tick costs 2 clicks (D1), Überfällig is unbounded, and Heute sits about 2 screens down on phones. |
| Kalender | 3 | URL state, popovers and keys are solid. Missing: Markt filter and date jump. A 9999 URL crashes it, the month grid adds 42 Tab stops, and Sa/So are clipped on phones. |
| Board | 2 | Event Checkliste works, but its 'Verschieben nach' is a silent no-op. The global kanban is hidden yet opened by search, and its manual columns contradict due dates. |
| Drawer | 2 | Fast, deep-linkable, with undo. Silent failures: cleared due date, half-typed date, rapid subtasks. Focus is lost, the permit drawer is not a dialog, and there is no assignee. |
| Planung | 2 | Markt planen is fast (6 clicks), but the rule defaults ignore the market's rhythm. Seasons are born overdue, the permit gap is reported as 'none needed', and wizard state is lost on reload. |
| Genehmigungen | 2 | Quick status steps with undo, but 'beantragt' is never monitored (no decision date), dates are not validated, moves do not update Antrag bis, and fees have nowhere to go. |
| Orte/Kontakte | 2 | Forms are clean, with good validation and create-in-place. No duplicate detection, no maps or tel: on the Ort, no sorting, and requirements are disconnected from the Ort. |
| Vorlagen | 2 | The offset hints and draft/publish model are excellent. Apply has no undo, a double-click skips the preview, row operations have no undo, and versions show no diff. |
| Mobile | 1 | No horizontal page scroll, but targets are 28–36 px, several tables clip (Mängel actions unreachable), there is no persistent nav, and field needs are unmet (my tasks, address, call). |
| A11y | 2 | Strong base: skip link, names, live regions, combobox. Focus is lost to BODY, modals are not inert, Esc is inconsistent, tab paths are long, and single-key shortcuts cannot be turned off. |
| Microcopy | 3 | Germanic, specific and neutral (no Login, little 'bitte'). Drift: five date formats, Fehlt/Noch nicht beantragt, gelöscht/entfernt/archiviert, unnamed toasts, raw audit codes. |
| IA | 2 | One view, one URL works well. Settings and Vorlagen sit behind the avatar menu, Stammdaten is collapsed, hidden modules behave inconsistently, and undated tasks have no home. |

## Measured flows vs budget

| Task | Clicks | Budget | Over |
|---|---|---|---|
| Clear 5 tasks on Übersicht (tick + confirm) | 10 | Class A: tick = 1 click + undo (5) | yes |
| Answer 'what is due today' (desktop first viewport) | 0 | 0 clicks, ≤60 s |  |
| Reach Heute and tick a task on phone (cold open) | 2 | Field: ≤3 taps; Heute in first viewport | yes |
| Wartet with reason from drawer | 3 | ≤3 interactions |  |
| Plan next season for a market (Markt planen, rule) | 6 | Class B: ≤6 clicks, 0 PL |  |
| New market + new Ort + plan dates | 9 | Class B: ≤6 clicks (+3 create-in-place) |  |
| Click mode multi-day event incl. paging back | 10 | Class B: ≤6 clicks | yes |
| Make permits appear for a new market (add requirement + apply) | 4 | Class D find ≤2, 0 extra PL (3 PL measured) | yes |
| Create städtischer Ort with inline Eigentümer | 5 | Class B: ≤4 + 3 create-in-place |  |
| Add 3 rows to a zone | 6 | Bulk must not scale linearly | yes |
| Move a Termin to a new date | 3 | Class C: ≤4 clicks, ≤2 PL |  |
| Check move effect on permits and notifications | 2 | Visible in preview, 0 context switches | yes |
| Cancel a Termin with reason | 4 | Cross-class ≤8 clicks |  |
| Restore a cancelled Termin after the toast (back to bestätigt) | 6 | ≤2 interactions | yes |
| Find the first permit to apply for and mark it applied | 4 | Find ≤2 + log step ≤3, ≤2 PL | yes |
| Mark granted + Aktenzeichen + validity | 3 | Log step ≤3 clicks |  |
| Open event popover in Kalender | 1 | 1 click |  |
| Jump to a month in another year | 3 | ≤3 interactions |  |
| Keyboard: reach the first Kalender chip | 0 | ≤10 Tab stops (28 measured) | yes |
| Move a card via menu (global board) | 3 | Class A: ≤2 interactions | yes |
| Open and close the task drawer | 1 | 1 click, 0 PL |  |
| Create a standalone task (Neu › Aufgabe) | 2 | Class B: ≤4 clicks |  |
| Find an undated standalone task again | 2 | Find ≤2 clicks from any page (only via Strg+K) | yes |
| Delete a task and undo | 2 | 2–3 clicks |  |
| Add a Saison task with T-240 and a permit link | 3 | ≤8 clicks, ≤3 PL |  |
| Edit an offset, publish, open the apply sheet | 8 | ≤8 clicks, ≤3 PL (5 PL measured) | yes |
| Apply a template version to 7 Veranstaltungen | 4 | Class C bulk ≤5 clicks + batch undo (no undo) | yes |
| Reach the Saison panel from the Übersicht | 4 | Find ≤2 clicks | yes |
| Change Saison status with undo | 2 | ≤4 clicks |  |
| Snooze one notification to tomorrow | 3 | ≤3 interactions |  |
| Find a Termin by name via Strg+K | 0 | Cross-class ≤8 interactions (8 keystrokes) |  |
| Create a Kontakt | 4 | Class B: ≤4 clicks |  |
| Create a Fahrzeug | 3 | Class B: ≤4 clicks |  |
| Complete a Pflicht (dialog) | 2 | Class A: 1 + undo (dialog carries data) | yes |
| Find a past event via Archiv | 3 | Class A find ≤2 | yes |
| Upload a PDF to a Termin (via Mehr) | 4 | Class B: ≤4 clicks |  |
| Open Einstellungen from the Übersicht | 2 | Find ≤2 (hidden control) |  |
| Reach Vorlagen/Märkte from the Übersicht | 3 | Find ≤2 clicks | yes |
| Reach a contact's phone number from the event page (phone) | 5 | Field: ≤3 taps | yes |
| See the Ort address and start navigation (phone) | 1 | ≤2 taps (no maps link; manual copy) | yes |
| Delete an event permanently (typed name) | 2 | Rare high-stakes: acceptable |  |
| Recover after a failed offline submit | 3 | RE = 0 (all fields retyped) | yes |

## Findings

### UX-001 · S3 · bug · M · needs decision
**Date fields are native pickers that silently drop half-typed or cleared dates and cannot take typed German dates**

Flows: task-drawer, adhoc-task-delete, input-edge-cases, overview-triage, board-kanban, move-event-date, saison-panel, firma, kalender, visual-consistency, mobile-field

Evidence: Observed in several places:
- **Half-typed date saved as empty:** typing '0503' into 'Fällig am' in Neue Aufgabe gave value='' with badInput, and the task was saved as 'Kein Datum' with no warning.
- **Clearing does nothing:** clearing Fällig in the task drawer showed no toast, and the date was unchanged after reload.
- **Typed German dates rejected:** filling '13.11.' or '5.3.' throws 'Malformed value' everywhere.
- **Odd years accepted:** typing '31022026' produced the year 31022.
- **ISO display:** the drawer shows 2026-11-09 next to German chips.

The UXC class B rule says dates are typed as '5.3.', with the picker as a second option.

Recommendation: B01 builds one shared German date field. It accepts typed '5.3.', '05.03.26', 'heute' and 'morgen', echoes the weekday and KW, has a picker button, and takes min/max. Area batches then adopt it.
- Treat badInput as an error tied to the field ('Bitte das Datum vollständig angeben').
- In the drawer, a cleared due date either saves null with undo or resets with the message 'Eine Aufgabe braucht ein Fälligkeitsdatum' (product decision).
- Show subtask dates as a chip that opens the field on click, instead of a full empty input row.

Files: `apps/web/src/components/ui/date-field.tsx (new)`, `apps/web/src/components/ui/input.tsx`, `apps/web/src/components/task/due-input.tsx`, `apps/web/src/components/task/task-drawer.tsx`, `apps/web/src/components/task/subtask-list.tsx`, `apps/web/src/components/board/new-task-dialog.tsx`, `apps/web/src/components/event-detail/move-dialog.tsx`, `apps/web/src/components/presets/season-controls.tsx`, `apps/web/src/components/company/obligation-form.tsx`, `apps/web/src/components/permits/permit-edit-form.tsx`

### UX-002 · S3 · error-handling · M · needs decision
**Unsaved input is discarded silently (notes tab, forms, sheets, drawer drafts)**

Flows: event-page-tabs, einstellungen, template-editor, markt-planen, template-propagation, new-ort, keyboard-a11y, input-edge-cases

Evidence: Observed in each case:
- **Notes tab:** text typed into Notizen is gone when switching to Checkliste and coming back with Back.
- **Firma form:** clicking the Bibliothek tab discards edits.
- **Template row drawer:** Esc or X closes a 14-field form with no warning.
- **Markt planen sheet:** Esc or a backdrop click discards 8 picked dates.
- **Ort edit:** 'Abbrechen' leaves without a guard.
- **Task drawer field:** the first Esc moves focus to BODY, and the second Esc closes the drawer and drops the draft.

The undo model cannot help, because nothing was saved.

Recommendation: Add a dirty-state guard for long forms and sheets: an inline 'Ungespeicherte Änderungen – Verwerfen / Weiter bearbeiten' bar plus beforeunload. A sessionStorage draft per record id is also an option for notes and the drawer subtask field. Autosave on blur is the simplest fix for Notizen. Keep the rule 'undo instead of confirm' for saved changes; this guard is the documented exception for unsaved changes.

Files: `apps/web/src/components/event-detail/notes-form.tsx`, `apps/web/src/components/settings/`, `apps/web/src/components/templates/item-drawer.tsx`, `apps/web/src/components/events/generate-sheet.tsx`, `apps/web/src/components/venues/venue-form.tsx`, `apps/web/src/components/task/task-drawer.tsx`, `apps/web/src/components/events/manual-event-form.tsx`

### UX-003 · S3 · mobile · L
**Wide tables and grids are not responsive on phones; Mängel actions unreachable**

Flows: firma, einstellungen, template-editor, board-kanban, kalender, archiv-wissen-aussteller, kontakte

Evidence: Observed at 390 px:
- **Mängel:** the table is clipped, and 'In Reparatur', 'Behoben' and the photo buttons are off screen. Field staff are the people who report defects.
- **Benutzer:** the role select is cut off and Deaktivieren is hidden.
- **Template grid:** 1044 px wide, so the Fällig column needs a sideways scroll.
- **Board:** an 880 px strip, and a status chip overflows its card.
- **Kalender month view:** Sa and So are hidden.
- **Aussteller:** about two screens of filters before the first row.
- **Kontakte:** the first card starts at y≈830.

Recommendation: Add a card layout below 640 px to the shared table, or give each affected list its own card version. Do Mängel first, since field staff report defects from the phone. On phones, collapse filter chips and the A–Z strip behind 'Filter'. In the month view, hide the Monat segment below md or show dots per day.

Files: `apps/web/src/components/company/issues-table.tsx`, `apps/web/src/app/(app)/einstellungen/benutzer/page.tsx`, `apps/web/src/components/templates/item-grid.tsx`, `apps/web/src/components/board/board-view.tsx`, `apps/web/src/components/kalender/month-grid.tsx`, `apps/web/src/app/(app)/aussteller/page.tsx`, `apps/web/src/app/(app)/kontakte/page.tsx`, `apps/web/src/components/ui/table.tsx`

### UX-004 · S3 · bug · S
**Creating a task leaves ?neu=1 in the URL; reload or Back reopens 'Neue Aufgabe'**

Flows: overview-triage, task-drawer, adhoc-task-delete, mobile-field, keyboard-a11y

Evidence: Observed after creating a task from the Übersicht:
- The URL becomes /?neu=1&aufgabe=<id>.
- Reloading reopens the dialog on top of the drawer.
- After deleting the task, the URL stays /?neu=1.

Source: submit() calls setOpen(false) and router.push(...?aufgabe=) using the current query. Only changeOpen(false) runs withoutRequest().

Recommendation: In submit(), build the target from withoutRequest() before adding aufgabe=. Make drawer.open ignore `neu`. Add a Playwright test: create a task from the Übersicht, reload, and expect no 'Neue Aufgabe' dialog.

Files: `apps/web/src/components/board/new-task-dialog.tsx`, `apps/web/src/components/board/use-task-actions.tsx`

### UX-005 · S3 · ia · L · needs decision
**No assignee or 'my tasks' anywhere while Team is hidden**

Flows: mobile-field, task-drawer, board-kanban, move-event-date

Evidence: Observed:
- The task drawer has no Zuständig row.
- The board's ?ansicht=person falls back to the default view, and the card menu has no Zuweisen.
- The Übersicht shows all company tasks.
- Field staff cannot answer 'which tasks are mine'.
- notifyDatesShifted only notifies assignees, so in practice nobody is notified.

Source: the Zuständig block is gated by isModuleVisible('team').

Recommendation: Product decision. Options:
- (a) A simple Zuständig picker over users, independent of the Team module.
- (b) Scope the field role's Übersicht to the events they work, with today's event first.
- (c) Say on the page that assignment comes with the Team module.

Recommendation: (a) plus (b) before field staff onboard.

Files: `apps/web/src/lib/modules.ts`, `apps/web/src/components/task/task-drawer.tsx`, `apps/web/src/components/overview/`, `apps/web/src/server/services/task-schedule.ts`

### UX-006 · S3 · ia · M · needs decision
**Überfällig grows without limit and buries 'Heute', especially on phones**

Flows: overview-triage, mobile-field, firma

Evidence: Observed:
- Überfällig reached 14 to 38 items, with permit rows and Pflichten mixed in.
- On iPhone 13 the 'Heute' heading sits at y=1444 of a 3566 px page, and the first task tick at y≈805.
- An overdue UVV Pflicht only appears after '+ 17 weitere'.
- Rows overdue by 4 weeks look the same as rows overdue by 1 day.

Recommendation: Cap each group at about 5 rows with '+ N weitere'. Put overdue permits in a separate strip. Sort oldest first. On phones, put Heute and today's event first and collapse Überfällig to a one-line count. Rank statutory Pflichten above ordinary tasks. Optionally add a bulk snooze per event.

Files: `apps/web/src/components/overview/today-card.tsx`, `apps/web/src/components/overview/due-groups.tsx`, `packages/core/src/deadlines/due-ranking.ts`, `apps/web/src/server/queries/overview.ts`

### UX-007 · S3 · error-handling · M
**Network or server failure crashes forms (input lost), sends offline navigation to the browser error page, and reports a 500 as 'no connection'**

Flows: input-edge-cases, permit-lifecycle, states-performance

Evidence: Observed:
- **Forms:** with Kontakt anlegen offline, 'TypeError: Failed to fetch' hit the ErrorBoundary and all fields were gone.
- **Permits:** an offline 'Als genehmigt markieren' replaced the whole page with the boundary.
- **Navigation:** offline navigation went to chrome-error:// and stayed there.
- **500:** a POST answered with 500 showed 'Keine Verbindung zum Server'.

Recommendation: Wrap server-action calls in try/catch inside each form. Keep the state and show an inline message: 'Nicht gespeichert – keine Verbindung. Deine Eingaben sind noch da.' with Retry. Add a shell-level offline banner and block link clicks while offline. Use separate copy for a server error: 'Das hat nicht geklappt. Nichts wurde gespeichert.'

Files: `apps/web/src/components/contacts/contact-form.tsx`, `apps/web/src/components/venues/venue-form.tsx`, `apps/web/src/components/events/manual-event-form.tsx`, `apps/web/src/components/board/new-task-dialog.tsx`, `apps/web/src/components/permits/permit-status-flow.tsx`, `apps/web/src/app/(app)/error.tsx`, `apps/web/src/components/shell/`, `apps/web/messages/de/shell.json`

### UX-008 · S3 · error-handling · S
**Permit dates are not cross-validated: impossible dates, decision before application, grant before application, invented application date**

Flows: permit-lifecycle, new-ort, input-edge-cases

Evidence: Observed:
- **Impossible date:** a requirement saved with 'Entscheidung um 31.02.' (month-day.ts only checks day ≤ 31). A one-sided Antragsfenster was also accepted.
- **Decision before application:** Entscheidung erwartet 01.11 with Beantragt am 13.11 was saved and instantly showed '12 Tage überfällig' on the Übersicht.
- **Grant before application:** Erteilt am 01.10 before Beantragt am 02.11 was saved.
- **Antrag bis in the past** was accepted with no hint.
- **Invented date:** stepping back from 'Genehmigt' to 'Beantragt' filled in today's date.
- **Wrong field:** a server invalid_month_day error always focuses 'Antragsfenster ab'.

Recommendation: Validate day-per-month (with leap-year handling). Require both window ends or neither. Warn inline, on blur and on save:
- Entscheidung ≥ Beantragt
- Erteilt ≥ Beantragt
- Beantragt ≤ heute
- Antrag bis in the past

Enforce the same rules in the service. A backward step must not invent Beantragt am. Return the offending field name with the error.

Files: `apps/web/src/lib/month-day.ts`, `apps/web/src/components/permits/requirement-form.tsx`, `apps/web/src/components/permits/permit-edit-form.tsx`, `apps/web/src/components/permits/new-permit-dialog.tsx`, `apps/web/src/app/(app)/genehmigungen/actions.ts`, `packages/core/src/permits/status.ts`

### UX-009 · S3 · clarity · M · needs decision
**A new or late Saison starts with overdue, unassigned season tasks; default 'Erwartet ab 01.01.' and the task counts mislead**

Flows: new-market-e2e, saison-panel, move-event-date

Evidence: Observed:
- **Wizard:** creating a market through the wizard auto-creates Saison 2027. 'Termine planen' is 3 months overdue and 'Genehmigung beantragen' 5 weeks overdue. Both are 'Niemand zuständig' and land on Jerome's Überfällig seconds after he planned the dates.
- **Saison anlegen:** for 2026 this creates tasks '18 Monate überfällig'. The default 'Erwartet ab 01.01.' is shown as a fact.
- **Counts:** toasts say '6 Aufgaben' or '6 Aufgaben verschoben' while the panel shows 2. The other 4 are subtasks.

Recommendation: Product decision. When season tasks would already be overdue at creation, either clamp them to today, skip them, or ask. Auto-complete 'Termine planen' when the wizard just planned the dates. Ask for 'Erwartet ab' when creating a season. Count top-level tasks in toasts, e.g. '2 Aufgaben (+4 Unteraufgaben)'.

Files: `apps/web/src/server/services/seasons.ts`, `apps/web/src/components/presets/season-controls.tsx`, `packages/core/src/events/season.ts`, `apps/web/messages/de/templates.json`

### UX-010 · S3 · consistency · M · needs decision
**Benachrichtigungen: no 'new' signal outside the page, a 15-minute lag behind the Übersicht, and three different 'Überfällig' counts**

Flows: notifications, visual-consistency, overview-triage

Evidence: Observed:
- **No signal:** the bell is hidden, and the Übersicht link 'Benachrichtigungen öffnen' carries no count.
- **Lag:** a task created with a past due date appeared on the Übersicht at once but not in the center. The rows are written by a */15 cron sweep.
- **Counts:** Übersicht 'Überfällig 38', center 'Überfällig 3', sidebar badge 13.

Recommendation: Show the open and new count on the Übersicht link and in the page subtitle. Either derive the open list live from task and permit queries (keeping notification rows only for read and snooze state), or show 'Stand: HH:MM'. Name what each count includes. Decide what the center is for (see product decision 11).

Files: `packages/jobs/src/company-notifications.ts`, `apps/web/src/server/queries/notifications-company.ts`, `apps/web/src/components/notifications/company-center.tsx`, `apps/web/src/components/overview/today-card.tsx`, `apps/web/messages/de/notifications.json`

### UX-011 · S3 · ia · M · needs decision
**An Ort with no permit requirements reads as 'Keine Genehmigung nötig'; requirements added later only apply after a hidden manual step**

Flows: new-market-e2e, new-ort

Evidence: Observed:
- **Wizard step 3:** 'Keine Genehmigungen nötig'.
- **Event summary:** 'es fehlt keine Genehmigung'.
- **Matrix:** does not list the new Ort.
- **Applying later:** after adding a requirement, the permits only appear after 'Auf kommende Veranstaltungen anwenden' (4 clicks, 3 page loads).
- **No next step:** after 'Ort anlegen' nothing points to the requirements.

For a städtisch Ort the correct state is 'unknown'. This is a MISS-RISK.

Recommendation: Separate 'Anforderungen noch nicht hinterlegt' from 'keine nötig' in step 3, in the event summary and in 'Was fehlt', with a link 'Anforderungen anlegen'. List Orte without requirements in the matrix. After saving a requirement, offer 'Auf N kommende Veranstaltungen anwenden' in the toast, or apply it by default. After creating a städtisches Ort, show a 'Nächste Schritte' strip.

Files: `apps/web/src/components/events/generate-sheet.tsx`, `apps/web/src/server/services/event-details.ts`, `apps/web/messages/de/event-detail.json`, `apps/web/messages/de/generate.json`, `apps/web/src/components/permits/requirements-section.tsx`, `apps/web/src/app/(app)/orte/[id]/page.tsx`

### UX-012 · S3 · error-handling · L · needs decision
**Applying a template version, and editing template rows, cannot be undone**

Flows: template-editor, template-propagation

Evidence: Observed:
- **Apply:** the toast 'Angewendet auf …: 2 neue, 3 geändert, 1 entfällt' has no Rückgängig, and the header undo stays disabled.
- **Row actions:** Nach oben is silent with no undo. Duplizieren has no undo. Löschen uses a confirm dialog and also has no undo.

The F2 class C budget asks for one undo covering the whole batch.

Recommendation: Snapshot the touched tasks in the apply transaction and offer a batch Rückgängig (8 s toast plus global undo). If that is not feasible, say so plainly in step 2. For draft rows, replace the delete confirm with an undo toast and add toasts for move and duplicate.

Files: `apps/web/src/components/templates/apply-sheet.tsx`, `apps/web/src/components/templates/item-grid.tsx`, `apps/web/src/app/(app)/vorlagen/ablauf/actions.ts`, `apps/web/src/server/services/template-propagation.ts`

### UX-013 · S3 · ia · M · needs decision
**Undated standalone tasks and Saison subtasks appear in no list; search opens them on the hidden /board**

Flows: adhoc-task-delete, search

Evidence: Observed:
- **Standalone task:** an undated task created without an event shows nowhere on the Übersicht. Strg+K is the only way back, and it navigates to /board?aufgabe=, a hidden module, with Übersicht no longer highlighted.
- **Saison subtasks:** a subtask added under a Saison task is not shown on the Saison panel.
- **No direct path:** there is no way to create an ad-hoc task for a Saison.

Recommendation: Add a 'Weitere Aufgaben' or 'Ohne Datum' group to the Übersicht. Make search results open the task drawer on the Übersicht (/?aufgabe=) instead of /board. Decision: allow a '+ Aufgabe' on the Saison panel, and show subtask counts there.

Files: `apps/web/src/components/shell/command-palette.tsx`, `apps/web/src/components/overview/due-groups.tsx`, `apps/web/src/app/(app)/page.tsx`, `apps/web/src/components/presets/season-panel.tsx`

### UX-014 · S3 · bug · S
**Search does not match ASCII spellings (Koeln, Huerth, Troedel, Strasse)**

Flows: search, archiv-wissen-aussteller

Evidence: Verified in source: foldText strips diacritics and maps ß→s, and SQL translate() maps ä→a. Neither maps ae/oe/ue/ss.

Observed results:
- 'Koeln' finds only 3 Kontakte, against about 190 Köln records.
- 'Huerth' returns 0 in Aussteller.
- 'Mueller' returns 1 against 2 for 'Müller'.

The palette footer promises 'Umlaute egal'.

Recommendation: Fold ae→a, oe→o, ue→u and ss→s on both the query and the haystack, in JS and in SQL. Alternatively, expand each query token into its spelling variants. Use the same helper in the Archiv and Aussteller list queries. Add tests for Koeln, Huerth, Strasse and Troedelmarkt.

Files: `apps/web/src/lib/search-query.ts`, `apps/web/src/server/search-core.ts`, `apps/web/src/app/(app)/archiv/page.tsx`, `apps/web/src/app/(app)/aussteller/page.tsx`

### UX-015 · S3 · bug · M · needs decision
**Markt planen rule ignores the market's rhythm: generic '1. Sonntag Apr–Okt', marks only the start day, and asks for rhythm twice**

Flows: markt-planen, new-market-e2e

Evidence: Observed:
- **Rudolfplatz:** a Fr–So market whose rrule is null. The prefill was '1. Sonntag Apr–Okt' and the preview showed 'So–Di … keine Hinweise' for all 7 dates.
- **Weiter disabled:** step 2 shows a filled rule but Weiter stays disabled until Übernehmen is clicked.
- **Rhythm asked twice:** step 1 has an optional Rhythmus section, and step 2 shows an unrelated default rule.

Recommendation: When the rrule is null, derive the default from the market's last events (weekday, start offset, duration). Shade the full span of each event. Label the weekday as 'Beginn'. Add a hint when the start weekday differs from all past events of the market. Apply the stored rhythm on entry. Ask for weekday and duration in the new-market form. RISK: overlaps the branch changing Markt planen.

Files: `apps/web/src/components/events/generate-sheet.tsx`, `apps/web/src/components/events/new-market-form.tsx`, `apps/web/src/server/queries/presets.ts`

### UX-016 · S3 · efficiency · M
**Ort and contact addresses are plain text; the event page shows no address or on-site contacts**

Flows: mobile-field, new-ort

Evidence: Observed:
- **Event header:** shows only the Ort name.
- **Ort page:** 'Adresse & Zufahrt' sits below about 12 list rows. The stored coordinates are never shown.
- **No links:** there is no maps, geo: or 'Route' link.
- **Calling:** reaching the Ordnungsamt phone number from the event takes 5 taps (budget 3).

Recommendation: Show street and PLZ under the Ort name on the event page as a maps link (using coordinates when set), with a 'Route' button. Move Adresse & Zufahrt to the top of the Ort page. On the event Zusammenfassung, add 'Ansprechpartner vor Ort' with tap-to-call for the Ort owner and the permit authority. Make contact addresses maps links.

Files: `apps/web/src/app/(app)/orte/[id]/page.tsx`, `apps/web/src/components/event-detail/overview-panels.tsx`, `apps/web/src/components/catalogue/contact-vorschau.tsx`

### UX-017 · S3 · bug · M · needs decision
**Marking a permit 'beantragt' never asks for the expected decision date, so 'Antwort überfällig' never fires**

Flows: permit-lifecycle

Evidence: Observed: one click on 'Als beantragt markieren' sets Beantragt am = today and leaves 'Entscheidung erwartet' at –. packages/core/src/permits/status.ts states that without that date the permit is never overdue, so a filed permit can stay at 'Beantragt' indefinitely. This is a MISS-RISK, and permits are the product's top goal ('0 missed permits').

Recommendation: In the same step, show an inline optional 'Entscheidung erwartet bis' field. Prefill it from the typical processing time of the authority or permit type, or from Beantragt + N days. If it is left empty, set a default follow-up date, or at least show the hint 'Antwort wird nicht überwacht'.

Files: `apps/web/src/components/permits/permit-status-flow.tsx`, `apps/web/src/components/permits/permit-drawer.tsx`, `packages/core/src/permits/status.ts`, `apps/web/src/app/(app)/genehmigungen/actions.ts`

### UX-018 · S3 · bug · M · needs decision
**Moving a Termin does not recompute permit 'Antrag bis'; the preview never mentions permits**

Flows: move-event-date

Evidence: Verified: event-details.ts has no applyBy logic (applySchedule shifts anchors, tasks and seasons only). Observed: moving a Termin 3 weeks earlier left Antrag bis unchanged on all 3 permits. user-flows.md §4 promises '1 permit apply-by moves'. Moving earlier silently shortens the real lead time (MISS-RISK).

Recommendation: Recompute applyBy, and the due date of the matching permit task, for permits whose first covered Termin changed. Leave hand-edited ones and say so. Add a preview line: 'Genehmigungen: Antrag bis 21.01. → 14.01.'. If the decision is 'never auto-move', at least warn when the lead time shrinks or the deadline falls in the past.

Files: `apps/web/src/server/services/event-details.ts`, `apps/web/src/server/services/permits.ts`, `apps/web/src/components/event-detail/move-dialog.tsx`, `docs/product/user-flows.md`

### UX-019 · S3 · bug · S
**Double-click on 'Weiter zur Vorschau' applies the template without showing the preview**

Flows: template-propagation

Evidence: Verified in source: the footer ternary renders 'next' and 'confirm' Buttons in the same child position with no key, so React reuses the DOM node. Observed: a dblclick applied the version immediately (toast 'Angewendet auf …'). Focus also stays on the commit button, so a second Enter commits too. Combined with UX-012 (no undo), this is irreversible.

Recommendation: Give the two buttons distinct keys. Move focus to the step-2 heading on the step change. Ignore clicks on 'Anwenden' for about 300 ms after switching steps.

Files: `apps/web/src/components/templates/apply-sheet.tsx`

### UX-020 · S3 · bug · S
**Pressing Enter in Strg+K before results arrive opens a stale first row**

Flows: search

Evidence: Observed: typing 'markt' and pressing Enter immediately opened the 'Markt planen' action. The cause is a 150 ms debounce plus a server round trip, during which only the static actions are in the list. Typing 'Nippes' and pressing Enter fast did nothing. Typo queries take up to 916 ms, and the old list stays shown with no pending state.

Recommendation: While the shown results belong to an older query, queue Enter and run it once the results for the current query arrive. Dim stale rows and show a visible pending state.

Files: `apps/web/src/components/shell/command-palette.tsx`

### UX-021 · S3 · bug · M
**Typing subtasks quickly loses entries**

Flows: task-drawer

Evidence: Observed: three titles typed with Enter and no pause produced only the first subtask. There was no error. subtask-list.tsx swallows Enter while the shared useTransition is pending. The pending flag also disables the status, due and snooze controls.

Recommendation: Add subtasks optimistically: clear the input, show the row at once, and queue the saves. Give subtask adds their own pending flag. Never ignore Enter silently.

Files: `apps/web/src/components/task/subtask-list.tsx`, `apps/web/src/components/task/task-drawer.tsx`

### UX-022 · S3 · error-handling · S · needs decision
**A Pflicht can be saved without a due date and then shows green 'in Ordnung' forever**

Flows: firma

Evidence: Observed: the HU/TÜV shortcut, saved without touching the date, gave 'in Ordnung' with Nächste Fälligkeit '–'. dueItems never lists it, so the reminder is never sent (MISS-RISK).

Recommendation: Require either nextDueOn or nextDueKm, or offer 'Zuletzt erledigt am' to compute the first due date. If a missing date stays allowed, add a warn-colour state 'Fälligkeit fehlt' that is listed on the Übersicht.

Files: `apps/web/src/components/company/obligation-form.tsx`, `apps/web/src/server/services/company.ts`, `apps/web/src/server/queries/company.ts`

### UX-023 · S3 · ia · M · needs decision
**Mängel (even 'kritisch') and Pflichten are missing from the Übersicht and Benachrichtigungen**

Flows: firma

Evidence: Observed: a defect reported as kritisch appears only as a tab badge inside Firma. dueItems feeds obligations only, and the notification centre counts tasks and permits only. The defect form itself says kritisch means the vehicle must not be used.

Recommendation: Feed open erheblich and kritisch defects into dueItems (kritisch under Überfällig or Heute). Decide whether Pflichten and Mängel belong in the centre and the digest.

Files: `apps/web/src/server/queries/company.ts`, `apps/web/src/server/queries/overview.ts`

### UX-024 · S3 · bug · S
**'Verschieben nach …' on the event Checkliste changes a hidden kanban column; the row does not move**

Flows: board-kanban

Evidence: Observed: in the Checkliste row menu, Verschieben nach then 'Diese Woche' gives the toast '… nach Diese Woche verschoben', but the row stays in its phase group. The menu offers kanban column names although the list has no columns.

Recommendation: Hide this menu item in the 'ablauf' layout, or replace it with 'Fälligkeit ändern'.

Files: `apps/web/src/components/board/card-menu.tsx`, `apps/web/src/components/board/board-view.tsx`

### UX-025 · S3 · efficiency · M · needs decision
**Word, Excel and other office files are rejected as event documents**

Flows: documents

Evidence: Observed: .docx and .xlsx return 415 with 'Nur PDF, JPEG, PNG und HEIC …', and they are greyed out in the OS picker. The same whitelist serves both receipts and event documents.

Recommendation: Decision: for event, permit, Ort and contract documents, allow DOCX, XLSX, ODT, CSV, TXT, EML/MSG and ZIP. Check them by magic number and serve them as attachments. Keep the strict list for receipts. If the restriction stays, say 'Word/Excel bitte als PDF speichern'.

Files: `packages/core/src/finance/files.ts`, `apps/web/src/components/documents/upload.tsx`, `apps/web/messages/de/finance.json`

### UX-026 · S3 · error-handling · S
**Multi-file upload shows only the last error; the other failures are lost**

Flows: documents

Evidence: Observed: of 4 files, 1 was saved and 3 failed. Only the error for fake.pdf was shown (setError is overwritten in a loop), and the toast said only '1 Datei gespeichert.'

Recommendation: Collect the errors per file into a list that stays until dismissed. Toast: '1 gespeichert, 3 nicht gespeichert'.

Files: `apps/web/src/components/documents/upload.tsx`

### UX-027 · S3 · efficiency · M
**Archiv › Dokumente search matches only the file name; 'Gehört zu' is ambiguous for recurring markets**

Flows: documents

Evidence: Observed: ?q=Nippes returns 0, although a Nippes document exists. The search covers only fileName and caption. 'Gehört zu' reads 'Nippes, Wilhelmplatz' with no date. There are no Markt or year filters.

Recommendation: Also search the owner's name (event, permit, Ort, vehicle, task) and the Markt name, with umlaut folding. Add Markt and year filters. Show the event date in 'Gehört zu'.

Files: `apps/web/src/server/queries/archive.ts`, `apps/web/src/app/(app)/archiv/dokumente/page.tsx`

### UX-028 · S2 · error-handling · M · needs decision
**Duplicate records are accepted silently (Kontakt, Ort, Markt, zone row label, vehicle plate)**

Flows: kontakte, new-ort, new-market-e2e, input-edge-cases, firma, einstellungen

Evidence: Observed:
- An identical Kontakt (same name, phone and e-mail) was saved, and case and whitespace variants were saved as well.
- Identical Orte were saved, so pickers show three identical 'UX … Ort2' entries.
- A Markt with a seeded name was saved.
- Row label 'A1' was saved twice in one zone.
- 'KUX1000' and 'K UX 1000' were both saved as plates.

The Kontakte flow claimed a double-click creates two records. input-edge-cases observed exactly one POST and one record, so I dropped that claim.

Recommendation: Warn while typing, ignoring case, whitespace and diacritics: 'Ähnlicher Kontakt: … (Link) – trotzdem anlegen'. Match on name, phone or e-mail for Kontakte; name or street+PLZ for Orte; label within zone for rows. Normalise plates before the uniqueness check. Prefill the next row label (A4).

Files: `apps/web/src/components/contacts/contact-form.tsx`, `apps/web/src/server/services/contacts.ts`, `apps/web/src/components/venues/venue-form.tsx`, `apps/web/src/components/venues/row-dialog.tsx`, `apps/web/src/server/services/venues.ts`, `apps/web/src/components/events/new-market-form.tsx`, `apps/web/src/server/services/company.ts`

### UX-029 · S2 · mobile · M
**Touch targets are 20–36 px across the app (field target is 44 px)**

Flows: overview-triage, markt-planen, new-market-e2e, new-ort, move-event-date, cancel-restore-event, permit-lifecycle, kalender, board-kanban, task-drawer, adhoc-task-delete, saison-panel, notifications, search, kontakte, firma, documents, template-editor, template-propagation, mobile-field, undo-destructive, event-page-tabs, nav-ia

Evidence: Observed at 390 px:
- **Buttons:** default buttons are 32 px; sm buttons and drawer chips 28 px.
- **Rows:** Checkliste tick and row menu 28 px; board grip 20 px.
- **Toasts and top bar:** toast Rückgängig 96x32; top-bar search and Neu 32 px; nav rows 32 px.
- **Forms:** fields 36 px; a checkbox 13x16.

All pass WCAG 2.5.8 (24 px) but fail the app's own 44 px phone rule.

Recommendation: In B01, apply a touch/max-sm variant: min-h-11 and min-w-11 hit areas (padding, not bigger glyphs) on Button, Input, Select, checkboxes, toast actions, menu items and nav rows, regardless of density. Make whole leading row areas tappable for ticks.

Files: `apps/web/src/components/ui/button.tsx`, `apps/web/src/components/ui/input.tsx`, `apps/web/src/app/globals.css`, `apps/web/src/components/shell/toast-region.tsx`, `apps/web/src/components/shell/topbar.tsx`

### UX-030 · S2 · a11y · M
**Focus is lost to BODY after drawers, editors and menus close; dialogs start focus on the wrong control**

Flows: board-kanban, adhoc-task-delete, task-drawer, saison-panel, move-event-date, cancel-restore-event, keyboard-a11y, template-editor, undo-destructive, new-market-e2e

Evidence: Observed:
- **Board drawer:** Esc puts focus on 'Bereitschaft', not the card.
- **Checkliste drawer:** Esc puts focus on BODY.
- **Title editor:** opening and saving put focus on BODY.
- **Saison panel:** after a status change and after Esc in the date editor, focus is on BODY.
- **Dialogs:** the move dialog starts on the close button, not the date. The cancel-reason dialog starts on X. 'Genehmigung anlegen' starts on Abbrechen, while 'Neue Aufgabe' starts on Titel. Neuen Markt starts on the dialog container.
- **Archive or delete:** after a drawer-closing archive or delete, focus is on BODY.

Recommendation: Drawer and Modal store the opener on open and restore it on close, or focus the next row after a delete. Rule: dialogs focus the first field. Inline editors focus their input on open and return focus to their trigger on save or cancel.

Files: `apps/web/src/components/ui/drawer.tsx`, `apps/web/src/components/ui/modal.tsx`, `apps/web/src/components/task/task-drawer.tsx`, `apps/web/src/components/presets/season-controls.tsx`, `apps/web/src/components/event-detail/move-dialog.tsx`, `apps/web/src/components/event-detail/status-menu.tsx`, `apps/web/src/components/events/new-market-form.tsx`, `apps/web/src/components/permits/new-permit-dialog.tsx`

### UX-031 · S2 · microcopy · S
**Toasts often do not name the object, stack over sheet footers, and have noisy accessible names**

Flows: task-drawer, adhoc-task-delete, kalender, permit-lifecycle, new-market-e2e, undo-destructive, new-ort, keyboard-a11y, mobile-field

Evidence: Observed:
- **No object named:** 'Gespeichert', 'Rückgängig gemacht' (×3), 'Besprechung angelegt' (×2, identical) and the fragment 'Status: Beantragt Aufgabe abgeschlossen.' do not say what was affected.
- **Footers covered:** the 'Markt angelegt' toast covers the step-3 footer summary.
- **Stacking:** up to 3 toasts stack, and older ones lose their Undo.
- **Accessible name:** the button reads 'Rückgängig Strg Z'.
- **Esc:** focus goes to BODY after Esc.
- **Silent Strg+Z:** with nothing to undo, Strg+Z does nothing and says nothing.

Recommendation: Every toast names the object and what changed. Replace an earlier toast for the same object, and dismiss a step-1 toast once the sheet moves on. Keep toasts clear of sheet and drawer footers. Mark the Kbd hint aria-hidden and give the button an aria-label naming the change. With an empty history, Strg+Z shows 'Nichts zum Rückgängigmachen'.

Files: `apps/web/src/components/shell/toast-region.tsx`, `apps/web/src/components/shell/shell-context.tsx`, `apps/web/messages/de/board.json`, `apps/web/messages/de/permits.json`, `apps/web/messages/de/appointments.json`

### UX-032 · S2 · ia · S · needs decision
**Hidden modules behave inconsistently: soft 404 with the module title, silent redirects, reachable /board and /wissen**

Flows: finanzen, einstellungen, states-performance, nav-ia, visual-consistency, archiv-wissen-aussteller, event-page-tabs, keyboard-a11y

Evidence: Verified: modules.ts hides team, finance, globalBoard and notificationBell. Observed:
- **Soft 404:** /finanzen and /team answer 200 with 'Nicht gefunden', but the tab titles read 'Finanzen · marktwerk' and 'Team · marktwerk', and the copy says 'Link ist unvollständig'.
- **Settings:** /einstellungen/rechtliches returns 404.
- **Silent redirect:** /veranstaltungen/<id>/team and /geld redirect to Zusammenfassung without a message, and a stale comment says 'Board'.
- **Still reachable:** /board and /wissen render with no nav entry.

The original Finanzen severity-4 'flow blocked' is deliberate (client decision) and is downgraded here.

Recommendation: Use one hidden-module response: a real 404 status with the title 'Nicht gefunden', or a dedicated page saying 'Dieser Bereich ist noch nicht freigeschaltet'. Apply it to /board and /wissen too. Fix the stale comments. Product decision on when Finanzen returns.

Files: `apps/web/src/lib/modules.ts`, `apps/web/src/app/(app)/not-found.tsx`, `apps/web/src/app/(app)/finanzen/layout.tsx`, `apps/web/src/app/(app)/wissen/page.tsx`, `apps/web/src/app/(app)/einstellungen/rechtliches/page.tsx`, `apps/web/src/app/(app)/veranstaltungen/[id]/team/layout.tsx`, `apps/web/src/app/(app)/veranstaltungen/[id]/geld/layout.tsx`

### UX-033 · S2 · ia · M · needs decision
**Settings, Vorlagen and Stammdaten are hard to find; the 'Neu' menu lacks Ort, Kontakt, Pflicht, Fahrzeug and Markt**

Flows: einstellungen, nav-ia, archiv-wissen-aussteller, firma, new-ort, new-market-e2e, mobile-field

Evidence: Observed:
- **Settings:** Einstellungen is reachable only via the avatar menu or Strg+K.
- **Vorlagen:** live under Einstellungen › Bibliothek, 3 clicks and 3 page loads away, with no sidebar highlight.
- **Stammdaten:** collapsed by default, hiding Kontakte, Orte, Archiv and 'Pflichten' (11 due, no badge).
- **Name clash:** the Pflichten link points to /firma, while Einstellungen › Firma is a different page.
- **Strg+K:** has no page commands for Archiv, Orte, Kontakte or Pflichten.
- **Neu menu:** has no Ort or Markt entry, and the Bibliothek has no 'Neuer Markt'.

Recommendation: Add a visible Einstellungen link in the sidebar footer. Add 'Märkte & Vorlagen' to the nav. Expand Stammdaten by default or split out 'Pflichten' (with a due badge) and 'Archiv'. Rename the /firma area. Add 'X öffnen' palette commands for every page. Add Ort, Kontakt and Pflicht to Neu.

Files: `apps/web/src/components/shell/sidebar-nav.tsx`, `apps/web/src/components/shell/app-sidebar.tsx`, `apps/web/src/components/shell/profile-menu.tsx`, `apps/web/src/components/shell/create-menu.tsx`, `apps/web/src/components/shell/command-palette.tsx`

### UX-034 · S2 · consistency · S · needs decision
**Status vocabulary drifts between screens**

Flows: visual-consistency, permit-lifecycle, cancel-restore-event, event-page-tabs, template-editor, firma

Evidence: Observed:
- **Genehmigung:** 'Fehlt' in lists versus 'Noch nicht beantragt' in the drawer stepper. Overdue answers are grouped under 'Beantragt und erledigt'. 'Als ersetzt markieren' is shown as the next step after Genehmigt.
- **Pflichten:** 'überfällig/bald fällig/in Ordnung' are outside the UXC §7 vocabulary.
- **Status menu:** items are adjectives ('bestätigt', 'abgesagt', 'Entwurf').
- **Template versions:** a superseded version is called 'zurückgezogen'.
- **Removal wording:** gelöscht, entfernt and archiviert are used for the same action, with mixed punctuation.

Recommendation: One word per state: use 'Fehlt' in the stepper. Add a group 'Antwort überfällig (nachfragen)'. Show no primary action after Genehmigt. Add Pflichten to UXC §7 and capitalise chip labels. Use verb-first menu items ('Absagen…', 'Absage aufheben'). Rename 'zurückgezogen' to 'ersetzt'. Define the gelöscht/archiviert rule in the glossary.

Files: `apps/web/messages/de/permits.json`, `apps/web/messages/de/company.json`, `apps/web/messages/de/event-detail.json`, `apps/web/messages/de/tasks-templates.json`, `apps/web/src/components/event-detail/status-menu.tsx`, `docs/product/ux-concept.md`

### UX-035 · S2 · a11y · S
**Drawer contract is inconsistent: the Genehmigung drawer is an <aside>, and Esc fails in two drawers**

Flows: keyboard-a11y, nav-ia, archiv-wissen-aussteller, einstellungen, permit-lifecycle, task-drawer

Evidence: Observed:
- **No dialog role:** the Genehmigung drawer has role=complementary, and the page has no role=dialog.
- **Esc ignored:** Esc does not close the permit drawer in Archiv › Alte Genehmigungen, nor the Markt Vorschau on Bibliothek, although both show an 'Esc' hint.
- **Title:** document.title does not change when a drawer opens.

The Aufgabe drawer and the Vorschau elsewhere follow the contract.

Recommendation: Make DrawerFrame use the same <section role=dialog aria-modal=false aria-labelledby> as Drawer. Wire Esc to close through the shared component everywhere. Set the title to '<Name> · <Seite> · marktwerk' while a drawer is open.

Files: `apps/web/src/components/permits/drawer-frame.tsx`, `apps/web/src/components/ui/drawer.tsx`, `apps/web/src/components/ui/vorschau.tsx`, `apps/web/src/components/settings/`

### UX-036 · S2 · a11y · M
**Long keyboard paths: grids and pages have no roving tabindex**

Flows: kalender, keyboard-a11y, template-editor, kontakte, permit-lifecycle, board-kanban

Evidence: Observed (budget ≤10 Tab stops or a skip link):
- **Kalender:** 42 per-day '+' links; the first chip is the 28th stop.
- **Genehmigungen matrix:** 60+ stops; J/K do nothing.
- **Template ruler:** adds about 10 stops (31 to the grid).
- **Kontakte:** 35 stops; permit list 30; board grip 18.
- **Übersicht:** Space on a row without a Vorschau scrolls the page; tick has no key.

Recommendation: Apply the KeyboardRows roving model to the month grid, the matrix and the ruler, with arrow keys between cells and Enter to open. Take the '+' links out of the tab order. Space falls back to opening the drawer (preventDefault). Add a tick key on focused rows and document it in the hint line.

Files: `apps/web/src/components/kalender/month-grid.tsx`, `apps/web/src/app/(app)/genehmigungen/page.tsx`, `apps/web/src/components/templates/timeline-ruler.tsx`, `apps/web/src/components/ui/keyboard-rows.tsx`

### UX-037 · S2 · consistency · S · needs decision
**Confirm dialog on tick (decision D1) applies on some paths and not others, and its focus starts on 'Abbrechen'**

Flows: overview-triage, board-kanban, mobile-field, states-performance, notifications

Evidence: Observed:
- **Übersicht:** clearing 5 tasks takes 10 clicks; the class A rule is 'tick = 1 click + undo'.
- **Inconsistent paths:** the Übersicht, the 'Was fehlt' block and the global board tick or E key ask 'Aufgabe erledigt?'. The Checkliste, the drawer and a move into the Erledigt column do not.
- **Focus:** the dialog focuses Abbrechen, so Enter cancels silently.
- **Benachrichtigungen:** Erledigt on a task with open subtasks opens the drawer without saying why.

Recommendation: Product decision (see decisions). Whatever is chosen:
- Use the same rule on every path that completes a task.
- Focus 'Ja, erledigt' (the action is reversible).
- Explain a blocked completion with an inline hint.

Files: `apps/web/src/components/board/use-task-actions.tsx`, `apps/web/src/components/event-detail/overview-rows.tsx`, `apps/web/src/components/event-detail/overview-task-actions.tsx`, `apps/web/src/components/shell/confirm-dialog.tsx`, `docs/product/ux-concept.md`

### UX-038 · S2 · efficiency · M
**Search fields apply only on Enter, search text is not in the URL, and list context is lost after create or edit**

Flows: kontakte, archiv-wissen-aussteller, new-market-e2e, nav-ia

Evidence: Observed:
- **Enter only:** typing 'Ordnungsamt' or 'Koeln' changes nothing after 1–2.5 s, and there is no hint or search button.
- **Lost on save:** after saving a Kontakt edit, ?q= is dropped.
- **Not linkable:** the typed Kontakte search is not in the URL, so it is lost on reload and with the ← button.
- **Placeholders:** truncated.

Recommendation: Apply a 300 ms debounce and write ?q= with replaceState. Carry the list query through the create and edit pages and back. Shorten the placeholders.

Files: `apps/web/src/app/(app)/kontakte/page.tsx`, `apps/web/src/components/contacts/contact-form.tsx`, `apps/web/src/app/(app)/archiv/page.tsx`, `apps/web/src/app/(app)/aussteller/page.tsx`, `apps/web/src/app/(app)/veranstaltungen/page.tsx`

### UX-039 · S2 · ia · S · needs decision
**Event page tabs: same browser title on every tab, clipped mobile tab strip, Dokumente hidden in 'Mehr', mixed area names**

Flows: event-page-tabs, mobile-field, documents, visual-consistency

Evidence: Observed:
- **Title:** document.title is 'Kerpener Trödelmarkt · marktwerk' on all 6 tabs.
- **Mobile strip:** at 390 px the strip opens scrolled to x=-290, clips 'Checkliste … 2 überfä…' and shows no scroll hint.
- **Dokumente:** sits inside 'Mehr' with no count, although the key documents.count exists.
- **Names:** the tab says Checkliste but the URL is /board; Zusammenfassung versus the Übersicht in docs.

Recommendation: Use per-tab titles ('Checkliste · <Name> · <Datum>'). Add an edge fade or short counts on phones and min-h 44 px. Promote Dokumente to its own tab with a count. Align labels, URLs and glossary.

Files: `apps/web/src/app/(app)/veranstaltungen/[id]/layout.tsx`, `apps/web/src/components/event-detail/event-tabs.tsx`, `apps/web/src/components/event-detail/event-header.tsx`, `docs/product/glossary.md`

### UX-040 · S2 · consistency · M · needs decision
**Dates appear in five formats across screens**

Flows: visual-consistency, move-event-date, mobile-field

Evidence: Observed:
- **Permits:** 'bis 06.10.' (matrix), 'Di 06.10.' (list), '06.10.2026' (drawer, no weekday).
- **Pflichten:** bare '26.10.2026'.
- **Archiv:** drops the current year even when filtering 'Alle Jahre'.
- **Inputs:** native inputs show ISO.

Recommendation: One rule in UXC §8, enforced through lib/format.ts:
- Lists and cards: 'Sa 16.05.', with the year when not the current year.
- Drawers and detail views: 'Sa 16.05.2026'.
- Always show the year when the list spans years.

Files: `apps/web/src/lib/format.ts`, `apps/web/src/components/permits/`, `apps/web/src/components/company/issues-table.tsx`, `apps/web/src/components/archive/`

### UX-041 · S2 · error-handling · S
**Extreme years crash or are accepted (9999 → HTTP 500 in Kalender, move and event form)**

Flows: move-event-date, input-edge-cases, kalender

Evidence: Observed:
- **Kalender:** ?monat=9999-12 gives a raw DB error from addDays overflowing to +010000, and the error boundary.
- **Move:** the preview for 9999-12-31 returns 500, and Esc stops working afterwards.
- **Event form:** 9999 makes the hint check return 500, but the event is still created; 0001 is accepted.
- **Year missing:** hints show no year.

Recommendation: Clamp the range (for example the current year −1 to +5) in parsers, services and the month-jump arrows. Fall back with an inline hint. Show the year in hints.

Files: `apps/web/src/app/(app)/kalender/page.tsx`, `apps/web/src/components/kalender/month-jump.tsx`, `apps/web/src/server/services/event-details.ts`, `apps/web/src/components/events/event-fields.tsx`, `apps/web/src/components/events/schedule-hints.tsx`

### UX-042 · S2 · clarity · M
**Markt planen preview and venue-conflict hints are hard to read**

Flows: markt-planen

Evidence: Observed:
- **Preview:** 7 of 11 rows are 'Gibt es schon', interleaved with the new ones.
- **Primary button:** reads '4 neue · 7 gibt es schon' (no verb).
- **Conflicts:** 'Ort belegt: Altstadt' gives no dates and no link, and the legend uses 'Ort belegt' for the market's own dates too.
- **Calendar:** pages by one month, and the start month can be later than needed (+2 clicks).
- **Past dates:** skipped silently.
- **Undo:** after a reload undo is gone, and the 'angelegt' banner has no undo.

Recommendation: List new dates first and collapse the existing ones. Button: '4 Veranstaltungen anlegen'. Make the conflict a link with dates, and give own existing dates a separate marker. Page by the visible window. Say '11 vergangene Termine ausgelassen'. RISK: Markt planen branch.

Files: `apps/web/src/components/events/generate-sheet.tsx`, `apps/web/src/components/events/candidate-notes.tsx`, `apps/web/src/server/queries/generation-preview.ts`, `apps/web/messages/de/generate.json`

### UX-043 · S2 · efficiency · L · needs decision
**Markt planen does not scale or keep state: one weekday per rule, 17 markets planned one by one, state lost on reload, no template choice**

Flows: markt-planen, new-market-e2e

Evidence: Observed:
- **One weekday:** a Sa+So market needs 2 clicks per weekend.
- **Season rollover:** about 100 clicks for 17 markets.
- **Reload:** after the Markt is created, a reload returns to step 1 and leaves an orphan market.
- **Step 1:** 'Markt anlegen' sits below the fold (y=1157/900) and its error is shown far from the field.
- **Template:** none can be chosen. Counts disagree: 18 versus 9 versus 63.

Recommendation: Allow several weekdays or a 'Wochenende' option. Decide on multi-market planning or 'Saison fortschreiben'. Reflect ?markt=&schritt= in the URL. Use a sticky step-1 footer with field-level errors. Show 'Startet mit Grundvorlage (18 Aufgaben)' with 'Andere Vorlage wählen', and explain the counts. RISK: Markt planen branch.

Files: `apps/web/src/components/events/generate-sheet.tsx`, `apps/web/src/components/events/new-market-form.tsx`, `apps/web/src/server/services/events.ts`

### UX-044 · S2 · clarity · M · needs decision
**Template editor: permit link invisible, offset errors appear late, no version diff, apply preview lacks old→new dates**

Flows: template-editor, template-propagation

Evidence: Observed:
- **Permit link:** not shown in the grid, and accepted on non-permit categories.
- **Offset:** 'abc' or -9999 shows nothing or a fake hint until Speichern, then the error sits below the fold.
- **Phase:** can contradict the offset.
- **Versions:** no diff, and 'zurückgezogen' is misleading.
- **Apply preview:** shows '(Fälligkeit)' without old→new dates and repeats 7 identical cards (about 2000 px). The 'bleiben unverändert' count only appears in step 2.

Recommendation: Add a permit chip and filter. Validate the offset on input. Derive or warn about the phase. Generate a diff summary per version. Show the before→after date and group identical change sets. Show the kept count in step 1.

Files: `apps/web/src/components/templates/item-grid.tsx`, `apps/web/src/components/templates/item-drawer.tsx`, `apps/web/src/components/templates/version-bar.tsx`, `apps/web/src/components/templates/apply-sheet.tsx`, `apps/web/src/server/services/template-propagation.ts`

### UX-045 · S2 · error-handling · M · needs decision
**Template propagation edge cases: stale selection breaks the dialog, removed tasks are unmarked, overdue additions cannot be avoided**

Flows: template-propagation

Evidence: Observed:
- **Stale selection:** after another tab applied the same target, step 2 shows ': keine Änderungen' and an enabled 'Auf anwenden'.
- **Removed tasks:** 'Nicht mehr in der Vorlage' tasks look normal on the Checkliste.
- **Overdue additions:** new tasks that are overdue on creation can only be avoided by deselecting the whole Termin.
- **Footer text:** the row drawer footer omits the separate apply step.

Recommendation: On not_applicable, reset to step 1, prune the selection and disable the button when nothing is chosen. Show a neutral badge on removed tasks. Offer per-preview handling of overdue additions. Extend the footer copy.

Files: `apps/web/src/components/templates/apply-sheet.tsx`, `apps/web/src/server/services/template-propagation.ts`, `apps/web/src/components/board/task-card.tsx`

### UX-046 · S2 · clarity · S
**Moving a Termin hides its effects on season tasks, notifications and kept tasks; a concurrent move leaves a stale preview**

Flows: move-event-date

Evidence: Observed:
- **Season:** season tasks and the season start move, but seasonShifting is never rendered and the toast does not count them.
- **Kept tasks:** the preview gives no counts for tasks that stay; a kept date now lies a month after the event.
- **Notifications:** nothing says who is notified, and undo would notify a second time.
- **Conflict:** after a concurrent move the old preview stays and can be confirmed.
- **Constant warning:** the 'schon angekündigt' warning is always shown.

Recommendation: Render seasonShifting and include it in the overdue and toast counts. Add counts for tasks that stay. Add a line naming who gets a notification, and suppress it when the move is undone. Reset the preview on conflict.

Files: `apps/web/src/components/event-detail/move-dialog.tsx`, `apps/web/src/server/services/event-details.ts`, `apps/web/src/server/services/task-schedule.ts`, `apps/web/messages/de/event-detail.json`

### UX-047 · S2 · efficiency · M · needs decision
**Genehmigungen logbook: decision date hidden in list and matrix, no follow-up action, filters reset on save, badge opens the matrix**

Flows: permit-lifecycle

Evidence: Observed:
- **Wrong date shown:** 'Antwort überfällig' rows show the old Antrag bis date; the matrix cells show no date.
- **No follow-up:** there is no 'Nachgefragt – neue Antwort bis'.
- **Filters reset:** marking applied rewrites the URL to saison=alle (180 permits).
- **Badge:** goes to the matrix, so the work list takes 3 clicks (budget 2).
- **Errors:** shown 300 px below the field.

Recommendation: Show 'Antwort erwartet bis … · seit N Tagen überfällig'. Add a follow-up action that resets the expected date. Keep the filters after a save. Link the badge to ?fokus=fehlt&ansicht=liste. Place errors at the field.

Files: `apps/web/src/components/permits/logbook-list.tsx`, `apps/web/src/components/permits/logbook-matrix.tsx`, `apps/web/src/components/permits/permit-drawer.tsx`, `apps/web/src/components/permits/permit-status-flow.tsx`, `apps/web/src/app/(app)/genehmigungen/page.tsx`

### UX-048 · S2 · ia · M · needs decision
**A permit fee cannot be recorded; granting does not ask for Aktenzeichen or validity**

Flows: permit-lifecycle, finanzen

Evidence: Observed: the edit form has no fee field. Gebühren reads finance payables only, and Finanzen is hidden (307/404). The seeded task 'Gebühr als Zahlung anlegen' points to an unreachable module. Grant is one click, with Gültig 'noch nicht eingetragen'.

Recommendation: Add 'Gebühr (€)' on the permit, or allow creating payables from the drawer while Finanzen is hidden. The grant step asks for Aktenzeichen, Erteilt am and Gültig von/bis inline.

Files: `apps/web/src/components/permits/permit-edit-form.tsx`, `apps/web/src/components/permits/permit-drawer.tsx`, `apps/web/src/components/permits/permit-status-flow.tsx`

### UX-049 · S2 · clarity · M · needs decision
**Cancellation is opaque and hard to reverse after the undo toast**

Flows: cancel-restore-event

Evidence: Observed:
- **Live-looking page:** a cancelled event still shows the countdown, 'Alles im Plan', 'Noch keine Aufgaben' and '2/2 erledigt'.
- **No counts:** neither the toast nor Verlauf says that 12 tasks were cancelled.
- **Restore:** after the toast is gone, only 'Entwurf' is offered. Getting back to bestätigt takes 6 clicks and does not happen by itself.
- **List:** cancelled events vanish from the list without a hint.
- **Dialog:** the reason dialog starts focus on X.

Recommendation: Add an Abgesagt banner with the reason, the task count and 'Absage aufheben', which restores the previous status from the audit entry. Hide the countdown and 'Was fehlt'. Name the event and task count in the dialog and toast. Add an 'N abgesagt' chip to the list.

Files: `apps/web/src/components/event-detail/overview-panels.tsx`, `apps/web/src/components/event-detail/status-menu.tsx`, `apps/web/src/server/services/event-lifecycle.ts`, `packages/core/src/events/lifecycle.ts`, `apps/web/src/server/queries/event-overview.ts`, `apps/web/src/app/(app)/veranstaltungen/page.tsx`

### UX-050 · S2 · ia · M · needs decision
**Saison panel is buried, unexplained, and accepts contradictory states**

Flows: saison-panel

Evidence: Observed:
- **Buried:** reaching the panel takes 4 clicks and 3 page loads, on the Markt edit form beside an unrelated Speichern button.
- **Unexplained:** no explanation once a season exists.
- **Contradictory states:** 'Termine stehen' is accepted while the panel says 'noch keine Termine'; 'Abgeschlossen' is accepted with overdue tasks open.
- **History:** no previous seasons, and no 'Saison 2027 anlegen'.
- **Tick:** ticking a task with subtasks only shows a refusal toast.
- **Creation:** 'Saison anlegen' has no undo.

Recommendation: Reach the Saison from the Markt or Vorschau. Add a one-line explanation and status descriptions. Disable impossible statuses with a reason. Add collapsed 'Frühere Saisons' and an action to create the next season. Show subtask progress and open the drawer when a tick is refused. Add undo for creation. RISK: market editor branch.

Files: `apps/web/src/components/presets/season-panel.tsx`, `apps/web/src/components/presets/season-controls.tsx`, `apps/web/src/app/(app)/vorlagen/[id]/page.tsx`, `apps/web/src/server/queries/seasons.ts`

### UX-051 · S2 · efficiency · M · needs decision
**Kalender has no Markt filter, no typed date jump, and permit rows have no status badge**

Flows: kalender, visual-consistency

Evidence: Observed:
- **Filters:** Ebenen filter only by Art and one Ort.
- **Date jump:** a typed date cannot be entered, and ?ab= has no UI.
- **Permit rows:** the Liste shows a permit's status only as small grey text.
- **Counters:** when a layer is off, its counter shows 0, which reads as 'nothing there'.

Recommendation: Add a Markt multi-select (markt= in the URL). Accept a typed date in the Zeitraum popover. Use the permit status badge on permit rows. Count each layer whether or not it is on. RISK: Kalender Kürzel and holiday-marker branches.

Files: `apps/web/src/components/kalender/layer-panel.tsx`, `apps/web/src/components/kalender/layers.ts`, `apps/web/src/components/kalender/month-jump.tsx`, `apps/web/src/components/kalender/list-view.tsx`, `apps/web/src/server/queries/kalender.ts`

### UX-052 · S2 · clarity · M · needs decision
**Global board (hidden, but opened by search) has a manual column that contradicts the date and no event filter**

Flows: board-kanban

Evidence: Observed:
- **Column versus date:** a card moved to 'Überfällig & heute' still says 'In 4 Tagen'. A manual 'Später' can hide a task due within 7 days.
- **Volume:** Später holds 960+ cards and there is no filter by Veranstaltung.
- **URL:** the slug is English (kategorie=permits).
- **Mobile:** the chip overflows its card.

Recommendation: Decide whether a move sets the due date or marks the card 'manuell'. Never let a manual move hide a task due within 7 days. Add an event filter, or remove or redirect the route while the module is hidden.

Files: `packages/core/src/tasks/board.ts`, `apps/web/src/components/board/task-card.tsx`, `apps/web/src/components/board/board-screen.tsx`, `apps/web/src/server/queries/tasks.ts`, `apps/web/src/lib/task-ui.ts`

### UX-053 · S2 · a11y · M
**Modals are not inert, Tab leaves the dialog, and Esc on a toast also closes the drawer behind it**

Flows: cancel-restore-event, keyboard-a11y

Evidence: Observed in headless Chromium:
- **Not inert:** the body children have aria-hidden=true and inert=false.
- **Tab escapes:** after the last control, Tab reaches the skip link and the logo before wrapping.
- **Esc on toast:** Esc on a focused toast Undo closed the toast and the task drawer, and focus jumped 2155 px down.

Recommendation: Make the app root inert while a modal is open. Stop Esc propagation in the toast. Have the drawer Esc handlers ignore events coming from the toast region. Verify in headed Chrome and Safari.

Files: `apps/web/src/components/ui/modal.tsx`, `apps/web/src/components/ui/drawer.tsx`, `apps/web/src/components/shell/toast-region.tsx`, `apps/web/src/components/permits/drawer-frame.tsx`

### UX-054 · S2 · a11y · M
**Single-key shortcuts cannot be turned off (WCAG 2.1.4)**

Flows: keyboard-a11y

Evidence: Observed: J/K, C, E, A, T/M/L and the arrow keys fire globally outside inputs, and there is no setting to turn them off or remap them.

Recommendation: Add a profile toggle 'Tastenkürzel mit einzelnen Tasten', on by default. Strg+K and Strg+Z stay active.

Files: `apps/web/src/components/kalender/shortcuts.tsx`, `apps/web/src/components/ui/keyboard-rows.tsx`, `apps/web/src/components/shell/topbar.tsx`, `apps/web/src/components/shell/shortcuts-dialog.tsx`

### UX-055 · S2 · ia · M · needs decision
**Kontakte: no sorting, 'Ort' column means city, no link to Orte, form error far from the field**

Flows: kontakte

Evidence: Observed:
- **Sorting:** none; the list is A–Z only.
- **Column name:** the 'Ort' column is the contact's city, which can be confused with venues.
- **Ort link:** no way to link a contact as Eigentümer from the contact side.
- **Form:** Art defaults to Behörde, and the empty-name error sits below the fold.
- **Layout:** city names hyphenate ('Rös-rath') while Notizen is truncated.

Recommendation: Make columns sortable (sort= in the URL, aria-sort). Rename the column 'Stadt'. Add 'Als Eigentümer bei Ort eintragen…' in the Vorschau. Put errors under the field. Give the Ort column a minimum width.

Files: `apps/web/src/app/(app)/kontakte/page.tsx`, `apps/web/src/server/queries/contacts.ts`, `apps/web/src/components/catalogue/contact-vorschau.tsx`, `apps/web/src/components/contacts/contact-form.tsx`, `apps/web/messages/de/contacts.json`

### UX-056 · S2 · efficiency · M · needs decision
**Ort details: adding many rows is slow, empty capacity shows '0,00 m', Art changes nothing in the form, coordinate errors are vague**

Flows: new-ort, input-edge-cases

Evidence: Observed:
- **Rows:** the dialog closes after every row, with nothing prefilled; 20 rows take about 100 interactions. Focus falls to the skip link.
- **Capacity:** an empty capacity shows 'Kapazität 0,00 m'.
- **Art:** Städtisch only offers Eigentümer contacts, not Behörden.
- **Coordinates:** one message covers 4 different coordinate errors and always focuses Breitengrad.

Recommendation: Add 'Hinzufügen und weitere', prefill the next label and the last length and depth, and keep focus on the trigger. Show 'Kapazität offen' when empty. Allow Behörden for Städtisch. Split the coordinate messages.

Files: `apps/web/src/components/venues/row-dialog.tsx`, `apps/web/src/components/venues/zone-controls.tsx`, `apps/web/src/components/venues/venue-form.tsx`, `apps/web/src/app/(app)/orte/[id]/page.tsx`, `apps/web/messages/de/venues.json`

### UX-057 · S2 · clarity · S · needs decision
**Einstellungen: role changes apply instantly without role descriptions, 'Benutzer einladen' is a developer note, no 'Neuer Markt', no Bibliothek search**

Flows: einstellungen

Evidence: Observed:
- **Roles:** Mitarbeiter→Büroleitung applies on select, with no role descriptions.
- **Invite:** 'Kommt später: Wie neue Benutzer angelegt werden, ist noch nicht entschieden.'
- **Bibliothek:** 29 Märkte with 5 links per row, no search and no 'Neuer Markt'.
- **Garbled text:** 'Letzte Geschäftsführung : Letzte aktive …'.
- **Duplicate announcement:** 'gespeichert' is announced twice.

Recommendation: Add role descriptions and an extra confirm for promotion to Geschäftsführung. Replace the developer note with owner-facing instructions. Add a 'Neuer Markt' button and a search box. Fix the hint and the double live region.

Files: `apps/web/src/app/(app)/einstellungen/benutzer/page.tsx`, `apps/web/src/app/(app)/einstellungen/bibliothek/page.tsx`, `apps/web/src/components/settings/`

### UX-058 · S2 · microcopy · M
**Aktivität log shows raw event codes and empty 'Betrifft' cells**

Flows: archiv-wissen-aussteller

Evidence: Observed: 35 of 50 rows read 'Geändert (template.item_add)', '(contact.create)' and similar, and 28 of 50 have an empty Betrifft. The Bereich filter has no visible label.

Recommendation: Write German labels and targets for every action type, falling back to a plain 'Geändert'. Show the label visibly. Consider filters for person and date.

Files: `apps/web/src/app/(app)/archiv/aktivitaet/page.tsx`, `apps/web/messages/de/archive.json`

### UX-059 · S2 · efficiency · M · needs decision
**Documents: no rename or description, sticky Art choice, no upload progress, small remove target, no restore after undo**

Flows: documents

Evidence: Observed:
- **No rename or caption:** the service supports a caption, but the UI has no field.
- **Sticky Art:** stays on 'Genehmigung' for the next file.
- **Slow uploads:** a 14 MB upload on a slow link shows no progress and no cancel.
- **Small target:** remove is 24 px next to the link.
- **No restore:** after the undo toast there is no way back.
- **Duplicate message:** does not name the matching file.

Recommendation: Add caption, rename and per-row Art. Reset Art after each upload. Show XHR progress with cancel. Make the remove target 44 px on touch. Add 'Entfernte anzeigen' with Wiederherstellen. Name the matching duplicate.

Files: `apps/web/src/components/documents/upload.tsx`, `apps/web/src/components/documents/document-list.tsx`, `apps/web/src/components/documents/archive-document-button.tsx`, `apps/web/src/server/services/documents.ts`

### UX-060 · S2 · error-handling · M · needs decision
**Nothing to recover after the undo window: deleted tasks, archived vehicles and the undo stack after reload**

Flows: adhoc-task-delete, undo-destructive, firma, markt-planen, nav-ia

Evidence: Observed:
- **Deleted task:** still found by Strg+K, and it opens with status Abgebrochen, an active Löschen and a status menu that only return a generic error.
- **Archived vehicle:** shows only an icon and has no restore. Archiv has no tab for Fahrzeuge or Pflichten.
- **Reload:** the undo history is in memory only and is lost on reload.

Recommendation: Hide deleted tasks from search, or mark them 'Gelöscht' with Wiederherstellen in the drawer. Add banners on archived records ('Archiviert am … · Wiederherstellen'). Make the disabled undo tooltip point to Verlauf and Archiv.

Files: `apps/web/src/components/task/task-drawer.tsx`, `apps/web/src/server/services/tasks.ts`, `apps/web/src/components/shell/command-palette.tsx`, `apps/web/src/app/(app)/firma/fahrzeuge/[id]/page.tsx`, `apps/web/src/components/company/archive-buttons.tsx`, `apps/web/src/components/shell/shell-context.tsx`

### UX-061 · S2 · clarity · S · needs decision
**Permanent event delete dialog does not show the date or what will be lost**

Flows: undo-destructive

Evidence: Observed: the dialog asks you to type 'Südbrücke', a name shared by many events, and shows no date and no counts (12 Aufgaben, 2 Genehmigungen). The toast also has no date.

Recommendation: Put the date in the title and the toast, and list what will be removed. Decide whether the typed confirmation should be the date or 'LÖSCHEN' instead of a non-unique name.

Files: `apps/web/src/components/event-detail/delete-dialog.tsx`, `apps/web/messages/de/event-detail.json`

### UX-062 · S2 · microcopy · S · needs decision
**Benachrichtigungen row actions mislead: 'Erledigt' on a permit only dismisses it, 'Alle als gelesen' has no visible effect, permit rows leave the page**

Flows: notifications

Evidence: Observed:
- **Permit Erledigt:** the toast says '„Marktgenehmigung …“ erledigt' but the permit stays open.
- **Alle als gelesen:** leaves the Offen list unchanged.
- **Permit rows:** open by full navigation, while task rows open a drawer.
- **Rows:** have no Saison context and no timestamp.

Recommendation: Use 'Ausblenden' for permit rows and say the permit stays open, or make 'Genehmigung öffnen' the primary action. Drop the unread state or give it meaning. Open permits in place. Show context and a 'neu seit' time.

Files: `apps/web/src/components/notifications/company-row-actions.tsx`, `apps/web/src/components/notifications/use-company-actions.ts`, `apps/web/src/components/notifications/company-row.tsx`, `apps/web/src/components/notifications/mark-all-company-button.tsx`, `apps/web/messages/de/notifications.json`

### UX-063 · S2 · performance · S
**No visible pending state on slow navigation or slow actions**

Flows: states-performance

Evidence: Observed with a 2.5 s RSC delay: the old page stays put, and only the nav icon pulses faintly. With a 4 s POST delay on 'Ja, erledigt', the dialog closes and the row is unchanged with no indicator until the toast. Measured on the dev server; production needs a re-check.

Recommendation: Add a top progress bar or a pending state on the active nav item. Keep rows in a pending state ('Wird gespeichert …') from confirm until the server answers, and disable re-submit.

Files: `apps/web/src/components/shell/sidebar-nav.tsx`, `apps/web/src/app/(app)/loading.tsx`, `apps/web/src/components/overview/`

### UX-064 · S2 · clarity · M · needs decision
**Übersicht details: reminder Pflicht under Heute has no chip, waiting reason is invisible, weekend box lacks permit status**

Flows: overview-triage

Evidence: Observed:
- **Reminder:** 'Kfz-Versicherung … Fr 01.01.2027' sits under Heute with no 'Erinnerung' chip.
- **Waiting:** the row shows only 'Wartet seit 4 Tagen', not the reason. A waiting task due today stays a normal row.
- **Weekend box:** shows progress only, not whether the permit is granted or missing.
- **Greeting:** 'Guten Abend' at about 17:00; check the timezone.

Recommendation: Add an 'Erinnerung · fällig in 49 Tagen' chip. Show 'Wartet auf <Grund> · seit N Tagen' and mark the task waiting immediately. Add a permit status line per weekend event. Use Europe/Berlin for the greeting.

Files: `apps/web/src/components/overview/today-card.tsx`, `apps/web/src/components/overview/weekend-card.tsx`, `apps/web/src/server/queries/overview.ts`, `packages/core/src/tasks/waiting.ts`

### UX-065 · S2 · ia · S
**The ← button pushes history, so browser Back loops; filter chips add history entries**

Flows: nav-ia

Evidence: Observed: going contact → ← → browser Back reopens the contact. The history length grows with every chip click.

Recommendation: Use history.back() when the stored URL matches the previous entry, otherwise router.replace. Use replaceState for chip filters.

Files: `apps/web/src/components/shell/back-button.tsx`

### UX-066 · S2 · clarity · S · needs decision
**Search results are hard to tell apart (same-named permits and events, no year), counts do not match the list behind 'Alle N', and empty results are a dead end**

Flows: search, nav-ia

Evidence: Observed:
- **Same names:** two identical 'Festsetzung … Wilhelmplatz' rows; 12 events titled 'Altstadt' with no date in the title or breadcrumb.
- **Counts:** 'Alle 26 anzeigen' opens a list of 16 (past events are filtered out).
- **Empty result:** 'Keine Treffer.' with no next step. Searching 'flohmarkt' finds nothing.
- **Typo matches:** list pages do not apply them.

Recommendation: Show season, year and state in hits. Put the date in event titles and breadcrumbs. Link 'Alle N' with matching filters. On empty results, echo the query and link the lists. Index Markt and Art names.

Files: `apps/web/src/server/search-core.ts`, `apps/web/src/components/shell/command-palette.tsx`, `apps/web/src/app/(app)/veranstaltungen/[id]/layout.tsx`

### UX-067 · S2 · error-handling · M · needs decision
**Firma details: only the first form error is shown, odometer checks are inconsistent, late completion shifts the cycle, defects cannot be undone**

Flows: firma

Evidence: Observed:
- **Errors:** only the first error shows, below the fold. The defect title error says 'Bitte einen Namen eingeben'.
- **Odometer:** completing a duty accepts 100 km on a vehicle at 45.000 km.
- **Cycle:** the next due date rolls from the completion date, not the old due date.
- **Defects:** a reported defect cannot be undone.
- **Defaults:** Verantwortlich defaults to the current user, and Abbrechen always returns to the list.

Recommendation: Place errors at the field. Apply the same odometer check in both dialogs. Preview the next due date with an option to keep the rhythm. Add undo or an 'Irrtümlich gemeldet' status for defects. Use smarter defaults and return to where the user started.

Files: `apps/web/src/components/company/vehicle-form.tsx`, `apps/web/src/components/company/issue-dialog.tsx`, `apps/web/src/components/company/complete-dialog.tsx`, `apps/web/src/components/company/obligation-form.tsx`, `apps/web/messages/de/company.json`

### UX-068 · S2 · efficiency · M · needs decision
**Task drawer details: no subtask reordering, no inline title errors, wrong 'follows the event' hint, counter lags, past events in the picker**

Flows: task-drawer, adhoc-task-delete

Evidence: Observed:
- **Reordering:** subtasks have no move control.
- **Title errors:** an empty title only disables Speichern.
- **Wrong hint:** 'folgt dem Veranstaltungstermin nicht mehr' is shown on a task with no event.
- **Counter lag:** the x/6 counter updates about 0.8 s after the tick.
- **Picker:** the event select is native, lists past events, and Neu › Aufgabe ignores the page context outside event pages.
- **Blocked done:** the error toast offers 'Öffnen' for the drawer that is already open.

Recommendation: Add 'Nach oben/unten' for subtasks. Show the title error inline with Enter to save. Show the hint only for event tasks. Compute progress optimistically. Use a searchable event combobox that starts at upcoming events and prefills the page context. Show the blocked-done state inline.

Files: `apps/web/src/components/task/subtask-list.tsx`, `apps/web/src/components/task/task-drawer.tsx`, `apps/web/src/components/board/new-task-dialog.tsx`

### UX-069 · S2 · performance · M
**Very large list payloads (Veranstaltungen 1.77 MB HTML, 4546 nodes)**

Flows: states-performance

Evidence: Observed on the dev build: /veranstaltungen 1.77 MB and /kontakte 1.12 MB. h1 appears at 3.0 s on Fast 3G and 10.4 s on Slow 3G.

Recommendation: Re-measure on a production build with compression. If still heavy, paginate or window the lists and fetch Vorschau data on demand.

Files: `apps/web/src/app/(app)/veranstaltungen/page.tsx`, `apps/web/src/app/(app)/kontakte/page.tsx`

### UX-070 · S1 · consistency · S
**Microcopy and pattern drift: keyboard hints, empty states, verbs, button sizes, type scale**

Flows: visual-consistency, archiv-wissen-aussteller, states-performance

Evidence: Observed:
- **Hint footers:** three different versions.
- **Empty states:** 'Keine Orte für diese Suche' versus 'für diese Filter'. Archiv shows a duplicated empty line and has no reset.
- **Verbs:** 'anlegen' and 'hinzufügen' for the same action.
- **Sizes:** three Erledigt button sizes, 56 hard-coded px font sizes, and --control-h 36 in the docs versus 32 px buttons.

Recommendation: Use one empty-state component (query echo + reset), one hint string, and a verbs table in the glossary. Map text-[Npx] to tokens and align the density doc.

Files: `apps/web/messages/de/vendors.json`, `apps/web/messages/de/events.json`, `apps/web/messages/de/venues.json`, `apps/web/src/components/ui/states.tsx`, `apps/web/src/components/ui/segmented-links.tsx`, `apps/web/src/components/ui/chip.tsx`

### UX-071 · S1 · clarity · S · needs decision
**'Benachrichtigung senden an' (Mail/WhatsApp) is shown although it sends nothing**

Flows: adhoc-task-delete, notifications, event-page-tabs

Evidence: Observed: every new-task dialog shows the Mail and WhatsApp checkboxes with 'Versand folgt, sobald … angebunden'. The center does not explain how it relates to the daily digest.

Recommendation: Hide the checkboxes until sending exists. Add one line in the centre about the 07:00 digest.

Files: `apps/web/src/components/task/notify-fields.tsx`, `apps/web/src/components/task/notify-section.tsx`, `apps/web/src/components/board/new-task-dialog.tsx`

### UX-072 · S1 · a11y · S
**Kalender small accessibility gaps: today marked by outline only, unnamed toasts, grammar slip, silent bad ?vorschau**

Flows: kalender

Evidence: Observed:
- **Today:** the cell has only an outline and no aria-current.
- **Grammar:** 'Er ist keine Aufgabe.' should refer to Besprechung (feminine).
- **Unknown id:** an unknown vorschau id fails silently.
- **Saved filters:** the saved per-user Ebenen do not name what is hidden.

Recommendation: Add aria-current='date' and a dot. Fix the pronoun ('Sie'). Show a 'gibt es nicht mehr' card for unknown ids. Name the hidden layers in the 'geändert' chip.

Files: `apps/web/src/components/kalender/month-grid.tsx`, `apps/web/src/components/kalender/event-popover.tsx`, `apps/web/messages/de/appointments.json`

## Fix batches

- **B06 Genehmigungen logbook**: Close the permit monitoring gaps. Ask for or default the expected decision date when marking beantragt. Cross-validate permit dates. Add the fee and grant inputs. Show the decision date in list and matrix. Add follow-up. Keep filters after save. Make the drawer a dialog. Settle the Fehlt vocabulary. Catch offline errors. (UX-017, UX-008, UX-047, UX-048, UX-035, UX-034, UX-007, UX-011). Risk: MEDIUM: the Ort-create branch changes the permit dialog (new-permit-dialog / requirement-form). Coordinate or rebase. Highest value because these are deadline-critical MISS-RISK fixes.
- **B07 Termin page: move, cancel, tabs, delete**: Moving a Termin recomputes permit Antrag bis, and the preview shows season tasks, who is notified, kept tasks and stale conflicts. Cancellation gets a banner, counts and 'Absage aufheben'. Tabs get per-tab titles and a mobile-friendly strip, and Dokumente is promoted. The notes draft is kept. The delete dialog shows the date and what is lost. Event summary says 'Anforderungen noch nicht hinterlegt' instead of 'keine nötig'. Moves clamp the date range. (UX-018, UX-046, UX-049, UX-039, UX-061, UX-002, UX-011, UX-041, UX-034). Risk: Low conflict. The applyBy recompute needs a product decision (see decisions) before it ships.
- **B04 Task drawer and task creation**: Remove ?neu=1 after create. Handle cleared and half-typed due dates. Queue subtask adds. Show deleted-task state with Wiederherstellen. Name the object in task toasts. Fix title-edit focus and inline errors. Add subtask reordering, an optimistic counter and the correct event hint. Use a searchable event picker. Hide the inert notify fields. Apply the D1 decision consistently. (UX-004, UX-001, UX-021, UX-060, UX-031, UX-068, UX-071, UX-037, UX-030, UX-005). Risk: Adopts B01's date field. If B01 is not merged yet, keep validation local and swap the field in later. The D1 change waits for the owner's decision. The overview row call sites (overview-rows.tsx) belong to B07, which only passes the flag.
- **B01 Design-system primitives**: Shared building blocks that every other batch consumes without editing:
- 44 px touch variant on Button, Input, Select and checkboxes.
- A German typed date field with picker and min/max.
- Drawer and Modal that restore focus to the opener, are inert, and close on Esc.
- Vorschau that closes on Esc.
- KeyboardRows: Space falls back to open, plus a tick key.
- An empty-state component with query echo and reset.
- Responsive card mode for Table.
- One date format rule in lib/format.ts.
- Type tokens instead of hard-coded px. (UX-029, UX-001, UX-030, UX-053, UX-035, UX-036, UX-040, UX-070, UX-003). Risk: HIGH reach: every page uses these files. Agree on the date-field, Table and empty-state APIs before area batches start. Run a visual check of the main routes in both densities and in dark mode. Changing the date format rule changes many screens at once.
- **B02 Shell: toasts, undo, nav, hidden modules, offline**: Toasts that name the object, replace older toasts for the same object, keep clear of footers, use clean aria names, and stop Esc propagation. Strg+Z on an empty history gives feedback. Confirm dialog focuses the primary action. Hidden modules get one response. Settings and Vorlagen get sidebar entries, Stammdaten is reorganised, and Neu gets more entries. Back button does not push history. Nav shows a pending state. App gets an offline banner and distinct 500 copy. Single-key shortcuts get a toggle. Palette hint copy is updated. (UX-031, UX-032, UX-033, UX-065, UX-063, UX-007, UX-054, UX-037, UX-053, UX-029, UX-014). Risk: Shared shell with medium reach. Moving the sidebar and settings needs product decision 12. Owns shell.json, so B03 must not edit it.
- **B05 Übersicht**: Cap the groups and put Heute first on phones. Use a separate permit strip. Add a reminder chip, the waiting reason, and a permit status in the weekend box. Add a group for undated and standalone tasks. Show counts on the Benachrichtigungen link. Show pending state on tick. Use the Berlin timezone for the greeting. (UX-006, UX-064, UX-013, UX-010, UX-063). Risk: Low. Defects and Pflichten enter through company.dueItems (B15), so no file overlap.
- **B03 Global search**: Fold ae/oe/ue/ss spellings. Fix the Enter race with a visible pending state. Add season, year and state to hits. Make counts consistent with the list behind 'Alle N'. Make empty results helpful. Open tasks on the Übersicht instead of /board. Hide or mark deleted tasks. Add page commands. (UX-014, UX-020, UX-066, UX-013, UX-060, UX-033). Risk: Low. The hint copy lives in shell.json and is changed by B02. List pages adopt the shared folding helper in their own batches.
- **B10 Vorlagen editor and propagation**: Distinct keys on the apply buttons and focus on the step heading. Batch undo for apply, or an explicit irreversible notice. Undo toasts for row operations. A permit chip and filter. Inline offset validation. Version diff and the term 'ersetzt'. Old→new dates in the preview, grouped. Stale-selection reset. Handling of overdue additions. A dirty guard in the row drawer. (UX-019, UX-012, UX-044, UX-045, UX-002, UX-034). Risk: Low conflict. Batch undo is L effort and needs decision 9. Ship the double-click fix (UX-019) first; it is S.
- **B15 Firma (Pflichten, Fahrzeuge, Mängel)**: Require a due date or show a 'Fälligkeit fehlt' state. Feed kritisch and erheblich defects into dueItems. Show Mängel as cards on phones. Add a restore banner for archived vehicles. Normalise plates. Show errors at the field. Make odometer checks consistent. Preview the next due date. Add undo for defect reports. Use better defaults. (UX-022, UX-023, UX-003, UX-060, UX-028, UX-067). Risk: Low. Renaming the 'Pflichten' area belongs to B02 (sidebar) and needs a decision.
- **B13 Benachrichtigungen**: Show counts and freshness ('Stand'). Compute the open list live, or sweep on mutations. Align count rules with the Übersicht and the sidebar badge. Use 'Ausblenden' for permit rows. Make the unread state meaningful or remove it. Open permits in place. Show context and time on rows. Give a reason when Erledigt is blocked. (UX-010, UX-062, UX-037). Risk: Needs decision 11 (what the centre is for). The live-derivation route touches the jobs package.
- **B11 Saison panel**: Season tasks created late do not land overdue (clamp, skip or ask). Ask for 'Erwartet ab' when creating a season. Make counts consistent. Explain the panel. Guard against contradictory statuses. Show previous seasons and a 'next season' action. Add undo for creation. Refuse a tick by opening the drawer. Fix focus. Use 44 px on mobile. (UX-009, UX-050, UX-030). Risk: MEDIUM-HIGH: the market editor (Kürzel) branch edits /vorlagen/[id] and preset-form. Keep form changes minimal or wait for that merge.
- **B08 Markt planen wizard**: Derive the rule from the market's last events and shade multi-day spans. Allow several weekdays. Put the new dates first in the preview, with a verb on the button. Make the conflict hint a link. Keep state in the URL, with a dirty guard. Use a sticky step-1 footer. State the template and make counts consistent. Warn in step 3 when the Ort has no permit requirements. Show the 'Wochenende' rule in words. (UX-015, UX-042, UX-043, UX-011, UX-002, UX-028). Risk: HIGH: other branches are changing Markt planen (holiday markers) and the market editor. Schedule after those merge, or rebase carefully. Multi-market planning needs decision 16.
- **B14 Orte and Kontakte**: Duplicate warnings while typing. A maps link with coordinates and a 'Route' button on the Ort. Address shown first. 'Kapazität offen'. Bulk row add. Behörden allowed for Städtisch. Coordinate messages. Sortable Kontakte, a 'Stadt' column and a link to an Ort from the contact. Live search with ?q=. Filter context kept after create and edit. (UX-028, UX-016, UX-056, UX-055, UX-038, UX-002, UX-011). Risk: MEDIUM: another branch is changing the Ort-create flow (permit dialog). venue-form and the 'Nächste Schritte' strip overlap it; rebase onto that branch.
- **B16 Archiv, Aussteller, Dokumente**: Allow office document types (per decision 10). List every upload error. Search documents by owner, Markt and date. Show the date in 'Gehört zu'. Add caption, rename and progress. Restore removed documents. Use German Aktivität labels. Live search with umlaut folding. Collapse Aussteller filters on phones. Add a Wissen placeholder or redirect. (UX-025, UX-026, UX-027, UX-059, UX-058, UX-014, UX-038, UX-003, UX-032). Risk: Low. files.ts also serves receipts, so keep the strict list for receipts.
- **B09 Veranstaltungen list and manual event form**: Live search with ?q=. A 'N abgesagt' chip and a hint for past matches. A q-filter that matches the palette counts. Date range clamping and the year in hints. Field-level errors, live row validation and clearing of stale errors. Lighter payload or pagination. (UX-038, UX-049, UX-066, UX-041, UX-007, UX-069). Risk: Low-medium. Kalender holiday-marker work may touch schedule-hints.tsx; check before starting.
- **B12 Kalender**: A Markt filter and a typed date jump. Clamp ?monat=. A roving month grid with '+' links out of the tab order. A phone month view. Permit status badges in the Liste. Consistent layer counters. aria-current for today. Named Besprechung toasts and the grammar fix. A 'gibt es nicht mehr' card for unknown ids. (UX-051, UX-041, UX-036, UX-003, UX-072, UX-031). Risk: HIGH: active branches change the Kalender chips (Kürzel) and holiday markers in month-grid and list-view. Do this batch after they merge.
- **B18 Board**: Remove 'Verschieben nach' from the Checkliste. Resolve the manual column versus due date conflict. Add an event filter, or retire the hidden global board route. Mobile segmented columns with wrapping chips. A wider grip. German slugs. A badge for 'Nicht mehr in der Vorlage'. (UX-024, UX-052, UX-045, UX-003, UX-036). Risk: Low. Must not edit use-task-actions.tsx or board.json, which belong to B04.
- **B17 Einstellungen**: Role descriptions plus a guard on promotion. Owner-facing invite text. 'Neuer Markt' and a search box in the Bibliothek. Esc closes the Vorschau. A dirty guard on the Firma form. Benutzer as cards on phones. Fix the garbled lock hint and the double announcement. Make the Rechtliches route consistent with the hidden-module rule. (UX-057, UX-035, UX-002, UX-003, UX-032). Risk: Low. The Bibliothek market table links into /vorlagen/[id], which belongs to B11; leave the link targets alone.
- **B19 Product docs sync**: Record the decisions in the product docs:
- D1 tick rule and the confirm-only-when-irreversible rule.
- Status vocabulary, including Pflichten.
- Date format rule.
- Verbs table (anlegen/hinzufügen, gelöscht/archiviert).
- Checkliste naming.
- Permit apply-by behaviour on moves (fixes the drift in user-flows §4).
- Hidden-module behaviour. (UX-037, UX-034, UX-040, UX-070, UX-018, UX-039, UX-032). Risk: Low. Write it after the owner's decisions so the docs match the code.

## Product decisions raised

1. **D1: should ticking a task done keep the 'Aufgabe erledigt?' confirm dialog?** Options: Keep the dialog everywhere (consistent), with focus on 'Ja, erledigt' and Enter confirming / Drop the dialog; keep the row visible struck through for the 8 s undo window, then remove it / Keep the dialog only on the Übersicht and add a 'Nicht mehr fragen' setting. Recommendation: Drop the dialog. The reason for D1 was that the row vanished; a struck-through row with inline Rückgängig solves that, halves the clicks, and matches the undo principle. Apply it on every path and re-test with the Büroleitung. (UX-037)
2. **When a permit is marked 'beantragt', how is the answer monitored?** Options: Inline optional 'Entscheidung erwartet bis' field, prefilled from typical processing time / Automatic follow-up date (Beantragt + N days per permit type) when the field is left empty / Only show a 'nicht überwacht' hint. Recommendation: An inline field prefilled from the type or authority default, plus an automatic follow-up date when left empty. Every filed permit then eventually surfaces. (UX-017, UX-047)
3. **Should moving a Termin recompute 'Antrag bis' on its permits?** Options: Yes, automatically for permits not edited by hand, shown in the preview / Never automatically; warn when the lead time shrinks or the deadline is past / Ask per move. Recommendation: Recompute automatically, with a preview line and undo, and leave hand-edited permits alone. Update user-flows §4 to match. (UX-018)
4. **How should an Ort with no permit requirements be treated?** Options: Show 'noch nicht geklärt' (unknown) everywhere and list the Ort in the matrix / Ask for requirements inside Markt planen when they are missing / Apply new requirements to existing upcoming events automatically, or offer it in the toast. Recommendation: All three: unknown is never shown as 'keine nötig'; the wizard warns in step 3 with 'Anforderungen anlegen'; saving a requirement offers 'Auf N kommende Veranstaltungen anwenden' in the toast. (UX-011)
5. **What happens to season tasks that would already be overdue when a Saison is created late?** Options: Create them overdue (current behaviour) / Clamp the due date to today and say so / Skip them, and auto-complete 'Termine planen' when the dates were just planned / Ask at creation. Recommendation: Auto-complete 'Termine planen' when the wizard planned the dates. Clamp the remaining tasks to today, with a note in the toast. Ask for 'Erwartet ab' when creating a season. (UX-009)
6. **While the Team module is hidden, how do people know which tasks are theirs (field staff)?** Options: A simple Zuständig picker over users, independent of the Team module / Scope the field role to its events, with no per-task assignee / Wait for the Team module. Recommendation: Add a lightweight Zuständig field plus a 'Meine' filter, and scope the field role to its events, before field staff onboard. (UX-005)
7. **How should hidden modules (Finanzen, Team, Board, Wissen, Rechtliches) behave, and when does Finanzen return?** Options: A real 404 with the title 'Nicht gefunden' / A dedicated 'noch nicht freigeschaltet' page / Redirect to the Übersicht. Recommendation: A dedicated 'noch nicht freigeschaltet' page with a proper title, applied to all hidden routes including /board and /wissen. Set a target date for Finanzen, or record in the docs that payments stay outside the app. (UX-032)
8. **Where is a permit fee recorded while Finanzen is hidden?** Options: A 'Gebühr (€)' field on the permit / Payables created from the permit drawer even while Finanzen is hidden / Not recorded until Finanzen returns. Recommendation: A simple fee field on the permit now, migrated to payables when Finanzen returns. Reword the seeded 'Gebühr als Zahlung anlegen' task. (UX-048)
9. **Should applying a template version (and template draft edits) be undoable?** Options: Batch undo for the whole apply (snapshot in the transaction) / Keep it irreversible but say so explicitly in step 2 / Undo for row operations in drafts only. Recommendation: Batch undo for apply (the F2 class C budget requires it) and undo toasts for draft row operations. Until then, show an explicit irreversible notice. (UX-012, UX-019)
10. **Which file types may be attached to events, permits and Orte?** Options: Keep PDF and images only / Add DOCX/XLSX/ODT/CSV/TXT/EML/ZIP for non-receipt owners / Allow anything, served as a download. Recommendation: Add the common office formats for non-receipt owners, checked by magic number and served as attachments. Keep the strict list for receipts. (UX-025)
11. **What is the Benachrichtigungen centre for, given the Übersicht and the daily digest?** Options: Live list derived from tasks and permits, the same rule as the Übersicht / Sweep-based inbox of 'new since', with an unread state / Retire it into the Übersicht. Recommendation: A live list with the same rules as the Übersicht, plus a 'neu seit letztem Besuch' marker. Drop the separate unread state, and explain the 07:00 digest in one line. (UX-010, UX-062)
12. **Information architecture: where do Einstellungen, Märkte/Vorlagen, Pflichten and Archiv live?** Options: Keep: avatar menu, Bibliothek, a collapsed Stammdaten group / Add sidebar entries 'Märkte & Vorlagen' and 'Einstellungen'; split Pflichten (with a due badge) and Archiv out of Stammdaten / Expand Stammdaten by default only. Recommendation: Option 2, and rename the /firma area to match its content (e.g. 'Fuhrpark & Pflichten'). (UX-033)
13. **Duplicates: should the app warn or block?** Options: Warn while typing with a link to the existing record (non-blocking) / Block exact duplicates (unique constraint) / Do nothing. Recommendation: Warn while typing for Kontakt, Ort and Markt. Block exact duplicates for plates and row labels within a zone. (UX-028)
14. **Replace native date inputs with a typed German date field?** Options: Yes, one shared field (typed 5.3. / heute / morgen + picker) / Keep native inputs, but validate badInput and set lang=de. Recommendation: Yes. It matches the F2 class B rule, fixes the silent date failures and makes the date format consistent. (UX-001)
15. **Where do undated or standalone tasks live, and may a Saison get ad-hoc tasks?** Options: A 'Weitere Aufgaben' group on the Übersicht / Only through search / '+ Aufgabe' on the Saison panel plus a Saison choice in Neue Aufgabe. Recommendation: A 'Weitere Aufgaben' group on the Übersicht, and ad-hoc tasks on the Saison panel. (UX-013)
16. **Season rollover for about 17 markets: support multi-market planning?** Options: Multi-select markets in Markt planen with a combined preview / 'Saison fortschreiben': copy last year's dates to the same weekday / Keep planning one market at a time. Recommendation: 'Saison fortschreiben' per market with a combined preview. It fits how the company plans and avoids about 100 clicks each year. (UX-043)
17. **When applying a template, what happens to new tasks that would be overdue at once?** Options: Create them anyway (current) / Skip them / Create them due today / Let the user choose in the preview, default skip. Recommendation: Let the user choose in the preview, defaulting to 'nicht anlegen' for tasks whose window has passed. (UX-045)
18. **Wording: when is a removed record 'gelöscht' and when 'archiviert'?** Options: 'gelöscht' for whatever looks gone to the user; 'archiviert' only where an Archiv view exists / Use 'entfernt' everywhere. Recommendation: Option 1, recorded in the glossary, plus a Wiederherstellen path wherever 'archiviert' is used. (UX-034, UX-060)
