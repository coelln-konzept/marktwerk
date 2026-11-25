# F3 – Robustness, Accessibility & Edge-Case Matrix (marktwerk)

Applies to one flow at a time. Reading time ~8 min. Run against the live sandbox (`http://localhost:3007`, DB `marktwerk_ux`, safe to mutate) with `.ux-sim/lib.mjs` (`session({mobile})` gives `page`, `act`, `clicks`; desktop 1440x900 de-DE, mobile = iPhone 13). Evaluate the running app, not the docs. Mark every finding **observed** (you saw it) or **predicted** (from code/docs).

**App rules that are the pass/fail baseline** (docs/product/ux-concept.md, vision.md, roles-and-personas.md):
P1 undo toast over "Sind Sie sicher?" (toast 5-8 s; only irreversible actions confirm, button names the consequence) · P2 status = colour + icon + text · P3 warn while typing, not after save · P4 every drag has a click path · P5 German first, ~30% longer labels, no fixed-width buttons, hyphenation on · P6 one view = one URL; Vorschau `?vorschau=<id>` (replaceState, Space/eye opens, Enter opens page, Esc closes, focus returns to row) and drawers `?aufgabe=<id>`, `?genehmigung=<id>` are linkable · P7 nothing hidden, Strg+K only an accelerator · P8 skeletons shaped like content, empty states that teach, filtered-empty "Keine Treffer – Filter zurücksetzen", errors with retry and no data loss · P9 "nothing slips": a missed Genehmigung deadline is never silent.

## 0. How to run (10-minute protocol)
1. Pick ONE flow (e.g. Genehmigung logbuch step, Aufgabe erledigen+undo, Markt planen, Kontakt anlegen).
2. Walk it once on desktop with keyboard only (Section A), once at 390 px (Section E).
3. For each screen in the flow fill the state grid (Section B), then run the edge inputs (Section C) on every field and the error checks (Section D) on every failure you can provoke.
4. Report with Section G. Severity 0-4 (Nielsen): 4 = data loss, missed permit deadline, or user blocked; 3 = AA fail on a core path / wrong silent result; 2 = workaround exists; 1 = cosmetic. Rate only after the walk.

Roles: test as `worker` (staff/field) AND `lead` (owner/manager) where permissions differ.

## A. WCAG 2.2 AA checks runnable with Playwright
Result per check: PASS / FAIL / N/A + evidence (selector, value, screenshot). Source in brackets.

| ID | Check (how) | Pass anchor | Fail anchor |
|---|---|---|---|
| A1 Keyboard path | Complete the whole flow with `page.keyboard` only (Tab, Shift+Tab, Enter, Space, Esc, arrows). Count Tab presses to reach first list row. [2.1.1, NN/g table keyboard] | Every action reachable; no trap; list reachable in <= 10 Tab stops or a skip link ("Zum Inhalt") exists | Any step needs the mouse; hover-only actions; `div onClick` with no role/tabindex/key handler |
| A2 Focus order | Collect `document.activeElement` after each Tab; compare bounding boxes to visual order. [2.4.3] | Order follows visual reading order; no tab stops on invisible/off-screen elements | Focus jumps backward/sideways; hidden elements focusable (`display:none` still tabbable via offscreen) |
| A3 Focus visible and not obscured | After each Tab, `getComputedStyle` outline/box-shadow; screenshot focused element; scroll long form with sticky header + toast visible. [2.4.7, 2.4.11, 1.4.11] | Visible ring with >= 3:1 contrast vs adjacent colours, >= 2px; focused element never entirely covered by sticky bar/toast/drawer footer | `outline:none` without replacement; ring invisible on Markt-colour chips or dark mode; focused row hidden behind toast |
| A4 Drawer/Vorschau focus contract | Open `?aufgabe=`/`?genehmigung=`/`?vorschau=` from a row by keyboard. Check: focus moves in; Tab wraps inside if modal; Esc closes; focus returns to the SAME row; `role=dialog`+`aria-labelledby` (title names object + parent); background inert if `aria-modal`. [APG dialog, ux-concept §5] | All six hold; if drawer deletes the trigger (archived row), focus lands on a logical neighbour | Focus stays behind overlay or goes to `body`; Esc closes drawer but loses typed text without warning; nested Esc closes drawer instead of an open popup |
| A5 Back button + drawer | Open drawer, press browser Back; reload with drawer URL; open URL in fresh tab. [P6, wayfinding] | Back closes only the drawer (or documented replaceState behaviour for Vorschau), list scroll/filters preserved, reload reopens same drawer, focus lands on drawer heading | Back leaves the list; filters/sort reset; reload shows blank/other page |
| A6 Combobox pickers (Ort, Kontakt, Markt, Zuständig) | Type, Down, Enter, Esc, Tab; inspect `role=combobox`, `aria-expanded`, `aria-controls`, `aria-activedescendant`. [APG combobox] | Highlight tracked by `aria-activedescendant`; Esc closes popup only; "Keine Treffer" announced; selection by keyboard | Options individually tabbable; arrows scroll page; no roles; empty result silent |
| A7 Accessible names | `page.getByRole('button')` etc.: list every control with empty accessible name (`locator.evaluate`); check icon-only (eye, "...", ×, Undo) have German `aria-label`; one `h1`; `html[lang=de]`; unique `<title>` per route AND per entity. [4.1.2, 2.4.2, 3.1.1] | 0 unnamed controls; title updates on client navigation ("Pflichten – marktwerk") | Unnamed icon buttons; same title on all routes; "Mehr", "Mehr" links without context; English `lang` |
| A8 Contrast | Computed colours via `getComputedStyle` + WCAG ratio formula, or `@axe-core/playwright` if installed (axe `color-contrast`), in light AND dark (`colorScheme`), default AND Kompakt. Sample: muted metadata, placeholders, DueBadge, status badges, text on every Markt colour dot, toast text, link in body copy. [1.4.3 4.5:1, large 3:1, 1.4.11 UI 3:1] | All text >= 4.5:1; input borders, checkbox outlines, focus ring >= 3:1 (never round 4.499) | Pale-grey dates/T-offsets; badge text on tinted background < 4.5; dark mode only tokens broken |
| A9 Not colour alone | Screenshot in greyscale (`page.emulateMedia` + CSS filter `grayscale(1)`), plus `forcedColors:'active'`. Check overdue, Genehmigung stage, Markt identity, today, cancelled, errors. [1.4.1, P2] | Each state still readable via icon or text; Markt dot always beside the name | Overdue only red; calendar chip distinguishable only by hue; error = red border only |
| A10 Target size | `locator.boundingBox()` for every interactive element (checkbox, row "...", eye, × close, Undo in toast, calendar chips, "+ N weitere", pager, A-Z letters). For < 24 px, test 24 px circle against neighbours. [2.5.8 AA] | >= 24x24 CSS px OR spacing exception; at 390 px primary controls >= 44 px (best practice, AAA 2.5.5) | 16-20 px icon buttons adjacent; hit area equals glyph only; Undo < 24 px |
| A11 Status messages | Inspect toast container: present in DOM before the toast, `role=status`/`aria-live=polite`; errors `role=alert`. Trigger success, undo, validation error, filter count change. [4.1.3] | Each outcome announced once without moving focus; filter result count in a live region | Live region created together with message (silent); `role=alert` on every success; focus stolen by toast |
| A12 Undo toast accessibility | Trigger delete/tick/reassign. Measure lifetime with `Date.now()`; hover and focus the toast; Tab to Undo. [2.2.1, P1: 5-8 s] | >= 5 s (>= 8 s for bulk/high impact), timer pauses on hover AND focus, Undo reachable by keyboard before expiry (or shortcut), second toast does not kill first Undo | < 5 s fixed; toast last in DOM with 80 Tabs to reach; replaced by next toast |
| A13 Drag alternative | On Checkliste/Kalender/any sortable: perform the same change without drag (menu, Verschieben, date field). [2.5.7, P4] | Click and keyboard path both exist and announce result | Drag is the only way; swipe-only on phone |
| A14 Reflow and zoom | Viewport 320x256 and zoom emulation 400% (`deviceScaleFactor`/CSS zoom); `document.documentElement.scrollWidth > clientWidth`. Text-spacing override (line-height 1.5, letter 0.12em, word 0.16em, paragraph 2em) injected via `addStyleTag`. [1.4.10, 1.4.12, 1.4.4] | No page-level horizontal scroll (tables scroll inside their own focusable container); no clipped/overlapping text | Page scrolls sideways; fixed-height containers clip; long German word breaks a button |
| A15 Reduced motion | `page.emulateMedia({reducedMotion:'reduce'})` then open drawer, toast, skeleton. [2.3.3 / 2.2.2 intent] | Shimmer/slide toned down; no endless shimmer after a failed load | Animations ignore the setting |
| A16 Forms | Each field: visible `<label>` (not placeholder), required state programmatic, error linked with `aria-describedby`+`aria-invalid`, focus to first error, `autocomplete` on name/email/phone. [3.3.1, 3.3.2, 1.3.5] | All hold; hints always visible (T-offset example) | Placeholder-only label; error text not associated; focus stays on submit |
| A17 Redundant entry / auth | Create Genehmigung from an event: is Ort/Saison/Markt re-asked? Magic link: paste allowed? [3.3.7, 3.3.8] | Known data prefilled or selectable; no transcription test | Same value typed twice in one flow; paste blocked |
| A18 Shortcuts | Focus an input and type `e`, `j`, `k`, `/`, `?`; on de-DE layout test `/` (Shift+7). Check Strg+K, E (tick), Space (Vorschau), J/K do not fire in inputs. [2.1.4] | Single-key shortcuts inactive in inputs/textareas/contenteditable and have an off switch or focus scope; every shortcut also has a visible control | Letter pressed in a field ticks a task; Ctrl/Cmd+A/F/P hijacked |
| A19 Automated floor | Run axe on each state of the flow (page, drawer open, toast visible, error state, dark mode). [W3C] | 0 serious/critical | Treating "Lighthouse 100" as proof; closed-state pages only |

## B. State coverage per screen
For every screen in the flow tick each row. Capture with Playwright: `page.route()` to delay/abort/500, `context.setOffline(true)`, seeded data counts.

| State | How to provoke | Pass anchor | Fail anchor |
|---|---|---|---|
| B1 Loading | `page.route('**/*', r => setTimeout(() => r.continue(), 2000))` (and 4x CPU via CDP) | Skeleton shaped like final layout (P8); no flash for < 300 ms; CLS <= 0.1; nothing blank > 100 ms after click; pending state on the clicked button within 100 ms | Blank page between routes; "Keine Aufgaben" flashes before data; layout jumps under the cursor |
| B2 Empty (truly empty) | Fresh Markt/Ort/Kontakt, empty Archiv, Übersicht "Nichts fällig." | Says what the area is for, why empty, one verb-first action ("Genehmigung anlegen"); same wording as docs | Header-only table; "Keine Daten" |
| B3 Filtered-empty | Apply contradictory filters / search nonsense | Names active filters, "Keine Treffer – Filter zurücksetzen" works; differs from B2; archived match hint | Identical to B2; reset missing; filters cleared but state stays |
| B4 Error | `page.route` abort / fulfill 500 / 403 / 404 / expired session | Per Section D; page-level `error.tsx` German with Retry; rest of shell still works | Next.js default error page, blank screen, raw Supabase/Postgres text, 403 shown as empty list |
| B5 Partial | One of several data sources fails (e.g. Vorschau data fails, list ok); some rows missing optional data (no Ort, no assignee, no due date, no Antrag-bis) | Section degrades alone with inline retry; null cells say "Nicht zugewiesen"/"Noch offen"; sort puts nulls last both directions | Whole page dies; blank cells indistinguishable from load failure |
| B6 Overflow / long text | 200-char Markt/Ort/Kontakt/Aufgabe titles, 60-char single word, `Genehmigungsverfahrensbeschleunigungsgesetz`, 15 chips, 30 subtasks | Wraps or truncates with full text available (title/tooltip/focus), hyphenation works, no clipped buttons/tabs, row actions still reachable | Ellipsis hides only copy; overlap of date/status; horizontal page scroll |
| B7 Many items | Seed/scroll 200+ Aufgaben, 65 same-day deadlines, 17 Märkte x 3 years, month with 4 events on one weekend | Pagination or virtual list with total ("1-50 von 148"); filters/selection survive paging; collapsed same-day entries ("65 Genehmigungen: …") with drill-down; "+ N weitere" popover shows all, Esc closes, focus returns, no viewport clipping | Unbounded DOM jank (> 50 ms long tasks); page resets to 1 after edit; cell height jumps; items unreachable |
| B8 Stale / concurrent | Open same object in 2 contexts, edit in A, then edit in B; delete in A, act in B | B shows conflict/refresh notice or merges; no silent last-write-wins for dates or status | Silent overwrite; ghost object acts on deleted record |
| B9 Permission | Worker opens lead-only URL; field role opens event they do not work at | Explains what and who can do it, offers way back; no data leak | Blank list, 404 for known object, buttons visible but failing |
| B10 Deleted/archived deep link | Open URL of an archived/deleted object, old `/logbuch?genehmigung=` | Explanatory page + restore/back path; redirect keeps query | Raw 404 or crash |

## C. Input edge cases (apply to every text/date/select field in the flow)
Provoke via `fill`, paste, and direct server action/POST where possible. Pass = accepted-and-stored-faithfully OR rejected with a specific German inline message; never a silent change, never a 500.

| ID | Input | Pass anchor | Fail anchor / what to look for |
|---|---|---|---|
| C1 Umlauts/ß | `Müller & Söhne – Straße`, `Köln`/`Koeln`/`Koln` in search, A-Z selector Ä->A | Stored and displayed exactly; search diacritic- and case-insensitive; `de` collation (Ä sorts with A, not after Z) | `Mller`, `&amp;` shown literally; Koeln finds nothing; Ä after Z |
| C2 Emoji and Unicode | `🎪 Flohmarkt 🍷`, ZWJ sequences, RTL text, combining accents, NBSP | Round-trips; counts as 1 visible char for length rules; PDF/digest unaffected | Replacement boxes `?`; DB error; truncation mid-surrogate pair |
| C3 Very long strings | 255, 5 000, 100 000 chars in title/notes; 1 000 chars no spaces | Server limit enforced with message naming the limit ("max. 200 Zeichen", live counter near limit); UI not broken (B6) | 500; silently truncated without notice; page freeze |
| C4 Whitespace/empty | `""`, `"   "`, leading/trailing spaces, tabs, newlines in a single-line field | Trimmed; whitespace-only treated as empty with required message; duplicates differing only by spaces caught | Whitespace-only name saved; "Flohmarkt" and "Flohmarkt " both allowed |
| C5 Injection-like | `<script>alert(1)</script>`, `'; drop table--`, `{{7*7}}`, `%s`, markdown/HTML in notes | Displayed as inert text everywhere (list, drawer, toast, digest, title) | Executes/renders HTML; breaks toast; layout injection |
| C6 Date formats | `5.3.`, `05.03.26`, `5.3.2026`, `2026-03-05`, `5 3 2026`, `31.02.2026`, `00.00.0000`, `heute` | Common forms accepted and echoed with weekday + KW; impossible dates rejected with fix hint ("z. B. 24.11.2026"); typing always possible | Picker-only; `1.2.26` guessed silently; "Ungültiges Datum" with no hint |
| C7 Past/future | Due date before today, event 20 years out, year 1900/9999, Antrag-bis after Entscheidung erwartet, granted before applied, end before start, due after Veranstaltung | Impossible orderings blocked or warned inline while typing (P3); past due allowed only where sensible and shown "überfällig seit n Tagen"; cross-field errors clear when fixed | Accepted silently; error persists after fix; fixing field A reddens field B; impossible state reachable |
| C8 DST and year boundary | Termin on 28.-30.03.2026 and 24.-26.10.2026 (Berlin DST), 31.12./01.01., multi-day across DST; set browser timezone to `America/Los_Angeles` and `Asia/Tokyo` (`timezoneId`) | Same date in list, Kalender, Vorschau, drawer, digest/export (Europe/Berlin); no 23/25 h anomalies; KW correct (ISO: 29.12.2025 = KW 1/2026; 28.12.2026 = KW 53; 04.01.2027 = KW 1) | Event shifts a day by timezone; KW differs between views; `getFullYear` instead of ISO week-year |
| C9 Numbers/currency (where present) | `1.234,50`, `1234.5`, `-5`, `0`, `1e3`, 10 decimal places | Locale-tolerant parse, German display `1.234,50 €`, tabular, right-aligned | Dot/comma swapped silently (1.234 -> 1,234 €) |
| C10 Phone/e-mail | `0221 123-45`, `+49 221 …`, `a@b`, trailing space | Accepted forms normalized; `tel:`/`mailto:` links work | Rejects spaces; invalid saved |
| C11 Duplicates | Same Markt name, same Termin (Markt+Datum), same Kontakt with umlaut variants, Saison twice, apply Vorlage twice | Warning with link to existing; unique constraint server-side; second Vorlage apply is no-op or "bereits angewendet" | Silent duplicate rows; duplicate generated tasks |
| C12 Double submit | `dblclick`, 3 rapid Enter, 3 clicks with 2 s delay route | Button pending/disabled within 100 ms; exactly 1 record, 1 toast, 1 notification | Duplicate records/toasts/notifications |
| C13 Back / forward / refresh mid-flow | In "Markt planen" step 2, in an open drawer with typed text, after submit: Back, Forward, F5, close tab and reopen, session expiry (clear cookies) mid-edit | Input kept or discard-guard shown (not on untouched forms); no re-POST on F5; session expiry returns to same URL with draft or clear message; steps have URLs | Typed text silently lost; F5 resubmits; Back leaves flow; login drops target URL |
| C14 Deep link to drawer | Paste `?aufgabe=<id>`, `?genehmigung=<id>`, `?vorschau=veranstaltung:<id>` logged out, as worker, with wrong/deleted id, with extra params | Logged out -> login -> returns to same target; unknown id shows explanation; other params kept | Lands on Übersicht; blank drawer; crash |
| C15 Offline / slow | `setOffline(true)` then tick task, drag/move, save field; Slow 3G | Optimistic UI reverts visibly with German error + retry; "Gespeichert" never shown before server ok; Undo toast never claims success on failure; reload matches server | Item stays "done" after failed request; error only in console; success toast first |
| C16 Bulk / cascade | Apply Vorlage to many Termine/Saisons, shift Saison date, Vorlage offset T-240 -> T-180, delete Ort/Vorlage in use | Preview with counts before commit ("Auf 1 Veranstaltung und 2 Saisons anwenden"); hand-edited/done tasks untouched; ONE undo restores all (subtasks, assignee, due dates, logbook); blocked delete lists dependents with links | Silent regeneration; N toasts for N items; undo restores parent only |
| C17 Irreversible actions | Veranstaltung löschen (typed name confirm is the documented exception), permanent deletes, external sends | `alertdialog`, names object + counted blockers, outcome-named button, focus on safe option, Esc cancels | "Sind Sie sicher?" Ja/Nein; confirm on trivial reversible action; no confirm on irreversible one |

## D. Error-message quality (score every message you provoke, 0/1 each)
Provoke: required empty, bad date, cross-field order, duplicate, delete in use, role denied, expired magic link, 404, 500, offline, double submit. Sources: German UPA Leitfaden Fehlermeldungen, NN/g error guidelines, GOV.UK, WCAG 3.3.1/3.3.3.

| ID | Criterion | Pass anchor | Fail anchor |
|---|---|---|---|
| D1 | German and plain | "Das Enddatum muss nach dem Startdatum liegen." | English, zod/Supabase/Postgres/RLS text, error codes, "Fehler 500" |
| D2 | States the specific cause | Names field/rule and limit | "Fehler aufgetreten", "Ungültige Eingabe", "Das Feld ist erforderlich" without field |
| D3 | Constructive: next step or example | "z. B. 24.11.2026"; lists valid values; button "Erneut versuchen" / "Termine anzeigen" | Cause only, no way forward |
| D4 | Placed at the field, plus summary for long forms | Adjacent text + icon, `aria-describedby`; focus to first error | Toast-only or top-only; far from field |
| D5 | Not colour-only, persistent | Icon + text; stays until fixed or dismissed | Red border only; auto-dismissing toast for an error |
| D6 | Input preserved | All entered values remain after failure | Form/drawer cleared |
| D7 | Tone | No blame ("ungültig", "falsch", "Sie haben vergessen"), no CAPS/"!", consistent Du/Sie across UI, emails, digest | Mixed address; humour; shouting |
| D8 | Timing | Appears on blur or submit, not on first keystroke; disappears the moment value is valid; fixing one field does not flag others | Error on focus; stale error after fix |
| D9 | Recovery path for system errors | Retry / Zurück / Startseite; 403 says who can do it; 404 offers search or list | Dead end; Next.js error screen |
| D10 | Consequence stated for risky outcomes | Says what is preserved/unsent ("Nichts wurde gespeichert") | Ambiguous whether saved |

Score = passed/10 per message; any message < 6 is a finding (severity 2, 3 if on a Genehmigung/date field, 4 if data is lost).

## E. Mobile viewport checks (390x844 `devices['iPhone 13']`, also 320 px and 400% zoom)
| ID | Check | Pass anchor | Fail anchor |
|---|---|---|---|
| E1 Reflow | `scrollWidth <= clientWidth` on every screen of the flow, incl. drawer open | No sideways page scroll; tables/tabs scroll inside their container (focusable, visible cue); Genehmigungen list not matrix on phone | Page scrolls sideways; clipped columns without cue |
| E2 Target size | A10 at 390 px | Primary controls (tick, Erledigt, Speichern, Undo, ×) >= 44x44; all >= 24x24 with spacing | Tick box 16 px next to row link |
| E3 Reach | List where Save/Close/Erledigt sit; scroll drawer | Primary action visible without scrolling the drawer (sticky bar) or at thumb zone; destructive not adjacent to primary | Save only at top right; submit scrolls away |
| E4 Drawer as sheet | Open drawer | Full-height sheet, clear "Schließen", Back closes it, own URL | Fixed-width drawer wider than viewport |
| E5 Keyboard overlap | Focus a field near bottom (emulate 300 px visual viewport) | Focused field and Save remain visible; toast not hidden by keyboard/bottom bar/browser chrome | Field covered; toast over Save |
| E6 Input types | Inspect `type/inputmode/autocomplete`, font-size | `tel`, `email`, native date or typed date; inputs >= 16 px (no iOS zoom); labels above fields | Text input for dates; 14 px inputs zoom page |
| E7 Hover-only | Run flow with `hasTouch` and no hover | Every action visible/reachable without hover (eye icon, row menu) | Actions appear only on `:hover` |
| E8 Network | Slow 3G + offline (Section C15) at 390 px | Skeletons, visible offline/failed state, no duplicate on repeated taps | Blank page; false success |
| E9 Field-staff task | Cold open -> find my task -> tick -> add note -> phone/address of Ort | <= 3 taps to tick; `tel:` and maps link; correct role landing | Office dashboard density; numbers not tappable |
| E10 Text size | Browser default font 150%, long German labels | No truncated buttons/tabs; wraps with hyphenation | Fixed widths clip |

## F. Cross-cutting robustness spot checks (cheap, 1 minute each)
- **F1 Timing**: time click -> first visible change (target < 100 ms), settled state for frequent edits (tick, assign, due date) <= 400 ms (Doherty); anything > 1 s has a pending indicator; > 10 s has count progress ("12 von 40") and cancel (e.g. Markt planen, Vorlage anwenden).
- **F2 Console/network**: `page.on('console'|'pageerror')` and failed requests during the flow = 0 (lib.mjs already logs them).
- **F3 Vocabulary**: English leftovers or glossary drift in toasts/errors/empty states (Termin vs Veranstaltung, Löschen/Entfernen/Archivieren mean different things consistently, "Abbrechen" vs "Absagen").
- **F4 Notifications/deadlines (P9)**: advance clock or seed a passed Antrag-bis; is it visible on Übersicht, Genehmigungen badge (= list length of "Jetzt zu tun"), and drill-down within one click without Strg+K? Per-task "Benachrichtigung" says "Versand folgt …" (nothing sent): not promising delivery.
- **F5 Density**: repeat A3, A10, B6 in *Kompakt*; rows still >= 24 px targets; Hell/Dunkel both.

## G. Reporting template
Copy once per finding. One finding = one problem; merge duplicates across screens (list all locations).

```
ID: F3-<flow>-<nn>            Type: observed | predicted
Title: <short, user-facing consequence>
Check ID(s): A4, C13, D2 …     WCAG SC / heuristic: 2.4.3, H9 …
Where: URL + state (e.g. /genehmigungen?genehmigung=<id>, drawer open, 390 px, dark)
Role / device: lead | worker | field  /  desktop | mobile  /  browser
Steps: 1… 2… 3…   (copy-pasteable; Playwright snippet or key sequence)
Expected (rule/source): <pass anchor + source, e.g. ux-concept §1.5 undo 5-8 s>
Actual: <what happened; measured value, e.g. toast 3.1 s, target 18x18>
Evidence: screenshot path / DOM snippet / console line
Impact on real task: <e.g. Büroleitung misses Antrag-bis for Neuss>
Frequency (daily/weekly/rare) · Impact (blocks/slows/annoys) · Persistence (once/recurring)
Severity 0-4: <n>   (4 = data loss, silent missed permit deadline, user blocked)
Suggested fix: <concrete; not a redesign>
```

**Sheet header:** flow evaluated · evaluator lens (a11y | edge-case | mobile) · build/date · roles/devices covered · **not evaluated** (and why).
**Sheet footer:** counts by severity · top 5 by severity then task criticality · matrix summary (below) · positives to preserve · items needing real-user test (Büroleitung, 2 office staff incl. 50+, Jerome).

Coverage matrix (fill with P / F / N/A per screen; F links to finding ID):

| Screen | A1-A19 | B1-B10 | C (fields) | D (messages) | E1-E10 |
|---|---|---|---|---|---|
| e.g. Genehmigung drawer | | | | | |

Caveats to restate in every report: automated axe finds only a fraction of WCAG issues; HE-style findings include false alarms, so keep observed vs predicted; undo-toast duration (5-8 s, ux-concept) and the 8-10 s suggestion are product/practitioner targets, WCAG 2.2.1 only requires that the function is available another way or the timer is adjustable; 44 px is best practice (2.5.5 AAA), 24 px is the AA floor.
