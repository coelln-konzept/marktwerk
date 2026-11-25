# F2 – Task-efficiency and cognitive-walkthrough protocol (marktwerk)

Apply to ONE flow at a time. Reading time about 8 minutes. Run it on the live app (http://localhost:3007, DB `marktwerk_ux`, helper `.ux-sim/lib.mjs`), not on the docs. Doc findings are "predicted", live findings are "observed".

Sources: ux-concept.md (UXC), vision.md (VIS), roles-and-personas.md (RP); research digests: CW = cognitive walkthrough (Wharton 1994, Spencer 2000, NN/g), KLM = Card/Moran/Newell 1980, NNg-RT = NN/g response times, WCAG 2.2 (2.5.8, 2.5.7, 3.3.7, 4.1.3, 2.2.1), Baymard/NN/g forms. Budgets in section 5 are practitioner targets (no published standard), tuned to the app.

## 1. Procedure (per flow)

1. **Scenario card** (write BEFORE touching the app): persona (Petra/owner, Jonas/Büroleitung, Frank/office staff, Dieter/field on phone, or an occasional-use newcomer), situation + trigger, goal in the user's words (no UI labels, CW), success criterion, task class (section 5).
2. **Ideal path**: write the single intended step list with the screen/URL per step. Agree step granularity: each new page, drawer, sheet step, or toast is a step boundary; typing a field and tabbing is one step.
3. **Walk it as a first-time/infrequent user** (the driver must not be the builder; the persona does not gain knowledge from earlier flows). Answer the 4 questions per step (section 2). One No fails the step. Do not debate fixes while walking.
4. **Measure** the happy path once cold and once warm (section 3). Count the actual run, not the ideal.
5. **Compare to the budget** (section 5), flag (section 6), then write failure stories and the report (section 7).
6. For high-stakes flows (permits, date shifts, deletes) also do one error-recovery pass: wrong path taken, undo, back button, reload mid-flow.

Use the full 4 questions for flows that fail or are deadline-critical; for the broad pass use Spencer's two questions (A: will the persona know what to do here? = Q1-Q3; B: will they see it worked? = Q4).

## 2. The 4 questions (checkable anchors)

| Q | Question | PASS anchor (check on screen) | FAIL anchor |
|---|---|---|---|
| Q1 | Will the persona try to achieve the right effect (is the next sub-goal obvious from this page state)? | Page title/h1 + empty state or highlighted next step names it; no outside knowledge of the data model needed (Markt vs Veranstaltung vs Saison vs Vorlage). UXC principle 3 | Next step requires knowing process from outside the app; user would pick another route (e.g. looks for `/board`, hidden since 2026-11-03) |
| Q2 | Will they notice the correct action is available? | Control visible without hover, overflow menu, scroll, or phone fold; sits near the fields (Fitts); hit area >= 24x24 px (WCAG 2.5.8), >= 44 px on 375 px phone | Only in "..." menu or hover; below fold in drawer; target < 24 px or touching neighbours; drag-only (UXC principle 8, WCAG 2.5.7) |
| Q3 | Will they associate that control with the effect (label wording)? | German domain term from glossary.md; verb-first outcome label ("Markt planen", "Termin anlegen"); T-offsets shown with the resolved date | "OK", "Absenden", jargon (offset, preset, slug, null), English leftovers, same action with two labels |
| Q4 | Will they see progress/feedback after acting? | Visible change within 1 s (list/badge/count updates) + toast naming the object ("Aufgabe ... erledigt" + Rückgängig, UXC 5-8 s); focus handled; status = colour + icon + text (UXC 6) | Silent success; item vanishes from filtered view with no trace; toast is the only evidence and < 5 s; error only in a vanishing toast; spinner > 1 s with no indicator (NNg-RT) |

**Failure story template** (reject "confusing"): `Step n | failed Q# | persona assumption | what the screen shows | predicted consequence (stuck / wrong action / abandon / silent error / missed permit date) | fix idea`. Also record **success stories** for passing steps (so we know what to keep).

## 3. Measures per flow

Record in the table in section 7. Use `act.click/fill/press` from `lib.mjs` (counts `clicks.count`, `clicks.keys`), `page` URL changes, and `performance`/Network for load times.

| Metric | How to count | Notes |
|---|---|---|
| Clicks (C) | Every pointer click/tap, including opening a drawer, toast Undo, menu item | Row-open = 1 |
| Keystrokes (K) | Every typed character, Tab, Enter, Esc, shortcut chord = 1 | Shortcut `C`, Strg+K, J/K, Strg+Z count as 1 each |
| Page loads (PL) | Full URL navigations (route change). Drawer/Vorschau/sheet opening with `?param` = 0 PL but 1 C | Note any navigation that resets filters/scroll |
| Decision points (D) | Places where the persona must choose among >= 2 plausible controls or values with no default | = KLM M for "think" steps; list each |
| Context switches (CS) | Leaving the current page/drawer to fetch info (second page, other tab), or info needed that is not on screen | Each CS = a recall risk (M 1.35 s + error risk); WCAG 3.3.7 redundant entry counts as CS |
| Fields typed that the system knows (RE) | Values entered that exist elsewhere (Markt, Ort, Kontakt, derived date) | Target 0 |
| Waits (R) | Time from input to first visible feedback and to settled state, throttled Fast 4G + 4x CPU for the second reading | < 100 ms direct manipulation, <= 400 ms settled for frequent edits (Doherty), > 1 s needs indicator, > 10 s needs progress + cancel |
| Step ratio | actual steps / ideal steps | Target <= 1.2 happy path, flag > 1.5 |
| Backtracks (BT) | Returning to a page/state already visited in the same task | Lostness signal; target 0 |
| Recovery | Undo/cancel path exists, how many steps, restores children (subtasks, assignee, logbook)? | Pass = full restore |

### KLM estimate (expert, error-free; compare variants, not absolute truth)
Operators: **K** 0.28 s (average typist; 0.20 skilled), **P** 1.1 s, **B** 0.1 s (click = P+B+B = 1.3 s), **H** 0.4 s (mouse<->keyboard), **M** 1.35 s, **R** measured. Shortcuts: K 0.28 each, no P.
Place M before each decision point (D) and each Q1-failure step; delete M where the action is fully anticipated (same cognitive unit). Formula: `T = 1.3*C_mouse + 0.28*K + 0.4*H + 1.35*M + sum(R)`. Report T for the ideal path and for the actual run. Flag actual > 1.5x ideal.
Mouse-keyboard-mouse alternation in a form: count every switch as H.

## 4. Check the walk against app rules (quick lens)
While walking, also tick these app-specific points (each is a pass/fail item with the anchor):
- Undo not confirm (UXC 5): reversible action runs at once with toast. FAIL: "Sind Sie sicher?" on a reversible action, or irreversible action (permanent event delete, external send) with no deliberate friction. Toast >= 5 s (UXC 5-8 s), pauses on hover/focus, reachable by keyboard, `role=status`, Undo restores subtasks/assignee/dates/logbook.
- One view, one URL (UXC 4): drawer/Vorschau deep link (`?aufgabe=`, `?vorschau=`, `?genehmigung=`) reloads to the same state; Back closes drawer only; list filters/scroll kept. FAIL otherwise.
- Nothing hidden (UXC 2): every step reachable from the sidebar/visible UI without Strg+K. FAIL: only via Strg+K (Benachrichtigungen is known: bell hidden; note, not new).
- Every drag has a click path (UXC 8). Warn while typing, not after saving (UXC 7).
- Kompakt vs Standard: re-check Q2 target size in Kompakt (32 px rows, 30 px controls).
- Field persona (RP): 375 px, <= 3 taps to tick a task from cold open, no hover-only, tel/maps links.

## 5. Budgets per task class (happy path, warm user; K = keystrokes, PL = page loads)

| Class | Representative flows | Clicks | K | PL | D | CS | KLM (s) | Hard rules |
|---|---|---|---|---|---|---|---|---|
| **A. Daily triage** (VIS goal 3: owner answers "what's due today, is next weekend OK?" < 1 min) | Open Übersicht, see overdue/today, act on one item; check Genehmigungen "Jetzt zu tun"; open notification target | See: 0 C (first viewport). Act on 1 item: <= 2 | 0 | 0-1 | <= 1 | 0 | <= 10 per item; whole "what's due" answer <= 60 s | Tick/complete = 1 C + undo; snooze/reassign/date change <= 3 interactions without leaving the page; first viewport shows overdue + today without scrolling; counts equal list length (badge = list) |
| **B. Creating records** | New task ("+ Neu" or `C`), new Termin via "Markt planen", new Kontakt/Ort (create-in-place), new Vorlage task row | Task: <= 4 incl. save. Termin from Markt: <= 6 (market, date(s), confirm preview). Create-in-place: <= +3 | Only the unknowns: title, date (<= 25 chars typed) | 0 (sheet/dialog) | <= 2 | 0 | Task <= 15, Termin <= 25 | Every known value prefilled and visible (Markt, Ort, colour, Vorlagen, assignee, year); RE = 0; dates typed in `5.3.`/`05.03.26`; picker second; Enter submits; double-submit cannot duplicate |
| **C. Planning a season** | Saison anlegen/status; apply Vorlage version to Saisons/Veranstaltungen ("Auf Veranstaltungen anwenden…"); shift a Termin and see tasks move; 17-market rollover | Per market <= 4 (open, apply, preview ok, confirm); bulk across N markets: <= 5 + 0 per extra market (one bulk choice "Alle N mit Änderungen wählen") | <= 5 | <= 2 | <= 3 | 0-1 | Per market <= 20; bulk of 17 <= 60 | Preview with counts ("N neu, M geändert, K bleiben") before commit; one undo for the whole batch incl. generated tasks; hand-edited/done tasks untouched and said so; T-offset shown with resolved date and "240 Tage vorher"; cost must NOT scale linearly (17 x n steps = fail) |
| **D. Permit handling** (deadline-critical, VIS: 0 permits missed) | Find next permit to apply for; log step (beantragt / Antwort überfällig / erteilt); open permit from badge/digest; link to Kontakt | Find: <= 2 from any page. Log a step: <= 3 (drawer primary button = next forward step) | <= 12 (dates/notes only) | 0-1 | <= 1 | 0 (authority selected, not retyped; apply-by and Veranstaltung date both visible in drawer) | Find <= 8; log step <= 15 | Badge "Jetzt zu tun" = chip = list rows (one rule `permitActionTier`); apply-by/expected-decision state visible without opening (colour+icon+text); illogical date order blocked inline (decision before application; granted before applied); passing a deadline unnoticed must surface in Übersicht + badge; step status change reversible or logged with actor |

Cross-class limits: any single flow > 8 clicks, > 3 page loads, or > 4 decisions needs written justification. Field persona (phone): tick own task <= 3 taps from cold open; every tap target >= 44 px (min 24 px).

## 6. Flagging over-budget flows

| Flag | Trigger | Default severity input (0-4) |
|---|---|---|
| OVER-C / OVER-K / OVER-PL / OVER-D | Measured > budget in that column | +1 step over: 2; +50% or more: 3 |
| OVER-T | Actual KLM > 1.5x ideal KLM or > budget KLM | 2-3 |
| LOST | Step ratio > 1.5, or any backtrack on a class A/D flow | 3 |
| RECALL | CS >= 1 for info that could be on screen, or RE >= 1 | 2; 3 on class D |
| SLOW | Feedback > 1 s without indicator, settled > 400 ms for a frequent edit, > 10 s without progress | 2-3 |
| NO-UNDO | Reversible action without undo, undo restores only the parent, toast < 5 s, or not keyboard reachable | 3 |
| STEP-FAIL | Any CW question answered No | by consequence |
| MISS-RISK | Flow can lead to a missed Genehmigung date or silent data loss | 4 regardless of frequency |

Rank by consequence for the business (missed permit date > data loss > wrong date > wasted clicks > wording). Mark each finding `observed` (reproduced live) or `predicted` (read from docs/code); predicted ones go to the user-test queue (Büroleitung, 1-2 office staff, Petra; HE-type inspection has false alarms, treat as hypotheses).

## 7. Reporting template (copy per flow)

```
### Flow <ID> – <name>   (class A/B/C/D)   Evaluator: <name>   Date: <YYYY-MM-DD>
Persona / role / device: <e.g. Frank, staff, desktop 1440 | Dieter, field, 375 px>
Scenario (user words): ...        Success criterion: ...
Ideal path: 1) <screen/URL> -> ... n)
Evidence basis: observed live | predicted from docs/code

| Metric | Ideal | Actual | Budget | Verdict |
|---|---|---|---|---|
| Clicks | | | | PASS/OVER |
| Keystrokes | | | | |
| Page loads | | | | |
| Decisions (M) | | | | |
| Context switches | | | | |
| Redundant entries | 0 | | 0 | |
| KLM seconds | | | | |
| Step ratio | 1.0 | | <=1.2 | |
| Backtracks | 0 | | 0 | |
| Feedback / settled time (ms) | | | <1000 / <=400 | |
| Recovery (undo/cancel) | | | full restore | |

Walkthrough:
| Step | Action | Q1 | Q2 | Q3 | Q4 | Note / success story |
|---|---|---|---|---|---|---|

Flags raised: <codes from section 6>

Findings (one per problem, merged duplicates):
- F2-<flow>-<n> | title | URL + role + device | failed step/question | failure story (persona assumption -> consequence) | evidence (steps, screenshot path, log line) | flags | proposed severity 0-4 (frequency, impact, persistence) | fix idea | observed/predicted

Top 3 fixes by saved clicks/seconds x frequency: ...
Positives to keep: ...
Not evaluated / open for user test: ...
```

Rollup (one table across flows, sorted by severity then class D > A > B > C): flow, flags, worst finding, budget verdict per metric, total KLM saved if fixed.

## 8. Caveats
CW covers learnability on chosen tasks only; it gives no frequency or severity (severity here is a proposal, final rating by 3 independent raters averaged). KLM is expert-only and under-predicts novices and error recovery. Budgets are practitioner heuristics. Accessibility depth, visual design and performance profiling belong to the other frameworks; here only the efficiency-relevant parts (target size, feedback time, undo) are checked.
