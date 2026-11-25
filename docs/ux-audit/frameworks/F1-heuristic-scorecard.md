# F1 – Heuristic & Principle Scorecard (marktwerk)

Version 1 · 2026-11-13 · For 30 independent evaluator agents. Read time: about 8 minutes. Apply to ONE flow at a time.

Basis: Nielsen's 10 heuristics + severity method, Gestalt/hierarchy, cognitive load, interaction cost, WCAG 2.2 AA, and the app's own rules in `docs/product/ux-concept.md` (UXC), `vision.md` (VIS), `roles-and-personas.md` (ROL), `glossary.md` (GLO).

---

## 0. The 10-minute path

1. **Pick one flow** (section 1.2) and a **role** (Jerome = owner, Büroleitung = manager, office staff = staff, field = phone/magic link).
2. **Pick applicable groups** with the matrix in section 5. Always apply the ★ (core) criteria; apply the others only where the matrix says so.
3. **Walk the flow in the live app first, then confirm in code** if a check says "code". Do not judge from docs alone.
4. **Score each criterion 0–4** (section 2). Use N/A sparingly. Tag every score O (observed) or P (predicted from code or reasoning).
5. **Every score of 0–2 on a ★ criterion becomes a finding** (section 6). Rate severity separately (section 4), and only after the walk.
6. Fill the screen scorecard (section 6.2) and return it. Do not read other evaluators' output before finishing.

**Rule of precedence.** (a) If UXC explicitly decides something, the UXC rule is the standard, and a deviation is a defect even if literature disagrees. (b) If UXC is silent, use the cited research. (c) Where UXC is documented and deliberately differs from literature, score against UXC and add the tag **[DOC-RISK]** with a one-line note. Do not file a redesign argument as a defect. Known cases are listed in section 7.

---

## 1. Scope and set-up

### 1.1 Briefing (same for every evaluator)
marktwerk is the internal operations app of one Cologne company running about 17 recurring flea/antique markets, Stadtfeste and Food & Wine markets. UI is German. "Classic screens": every view is a page with its own URL; Vorschau and drawers keep the list in sight; undo toasts instead of confirm dialogs. Several modules are hidden by design (`lib/modules.ts`: Team, Finanzen, Buchungen, Kernaufgaben, global Board, notification bell). **Do not file a finding for a hidden module being absent**; do file one if something still links to it or leaves a dead end.

### 1.2 Flow catalogue (choose one; roughly 5–8 steps each)
| ID | Flow | Main role | Key routes |
|---|---|---|---|
| FL1 | Monday morning: "what is due today and is next weekend OK?" | owner | `/`, Genehmigungen badge |
| FL2 | Plan a market: "Markt planen" side sheet (3 steps) and see generated tasks | manager | `/veranstaltungen?erzeugen=1` |
| FL3 | Work a Checkliste: tick, subtasks, snooze, reassign, undo | staff | `/veranstaltungen/[id]/board`, `?aufgabe=` |
| FL4 | Permit life-cycle: apply-by, Beantragt, Antwort überfällig, Genehmigt | manager | `/genehmigungen`, `?detail=permit:` |
| FL5 | Vorlage / Saison: edit Ablauf-Vorlage, "Gilt für", "Auf Veranstaltungen anwenden" | manager | `/vorlagen/*`, `/einstellungen/bibliothek` |
| FL6 | Find things: Strg+K, Kontakte A–Z, Orte, Archiv | staff | `/kontakte`, `/orte`, `/archiv` |
| FL7 | Kalender: month, Ebenen, event popover, Feiertage | manager | `/kalender` |
| FL8 | Create and delete: new Besprechung, cancel an event, delete an event | manager/owner | `?neu=besprechung`, event "…" menu |
| FL9 | Field phone (390 px): my tasks, tick, magic-link session | field | magic-link pages, `/` at 390 px |
| FL10 | Pflichten: obligations, vehicles, defects | manager | `/firma` |

### 1.3 Environment
Desktop 1440×900 plus phone 390×844 (and 320 px for reflow). Light and dark. Standard and Kompakt density. Throttle to Fast 4G for response checks. Test with realistic data (17 Märkte, hundreds of tasks), not an empty tenant, and also once with an empty list.

---

## 2. Scoring rubric

### 2.1 Generic 0–4 anchors (use when a criterion has no sharper anchor)
| Score | Meaning | Test |
|---|---|---|
| **4** | Exemplary. Met everywhere in the flow, for every role and device checked, including edge cases. Nothing to fix. | Would keep as the team's reference pattern. |
| **3** | Met on the happy path and in most edge cases. Small gaps (one screen, one role, cosmetic). | Fix if time allows. |
| **2** | Partly met. Works for the expert or on desktop only, or fails one real edge case, or is inconsistent between screens. | A new user would stumble. |
| **1** | Mostly failed. The principle is visible only by accident, or fails on the happy path. | Users need a workaround or help. |
| **0** | Absent or harmful. User can lose data, miss a deadline or be actively misled. | Stop-ship candidate if it hits a critical flow. |
| **N/A** | The situation never occurs in this flow. Say why in one line. | |

### 2.2 Evidence tags
- **O** = observed in the running app (screenshot, step count, DOM, measured value).
- **P** = predicted from code or reasoning, not reproduced. Predicted findings are queued for user testing, not asserted as fact.
- **[DOC-RISK]** = follows a UXC decision that literature questions.
- **[DOC-GAP]** = UXC promises it but the app does not do it. Always at least severity 2.

### 2.3 Scoring rules
- Score what a user meets, not what code intends. Measure, do not estimate: count clicks and time, read the real DOM, use devtools for pixel sizes and contrast.
- A criterion with several sub-checks scores **min of the critical sub-check** if one fails hard, else the rounded average.
- Group score = mean of scored criteria in the group (ignore N/A). Screen score = unweighted mean of group scores. Never average away a 0: list zeros separately.
- Record positives: any 4 that is a pattern worth keeping goes in "Preserve".

---

## 3. Criteria catalogue

Each row: **ID** | what to check (L = live, C = code) | **4 =** pass anchor, **0–1 =** fail anchor | source. ★ = core, apply on every screen. Source keys are in section 8.

### Group A – System status and feedback (Nielsen H1)
| ID | Check | Pass / fail anchors | Src |
|---|---|---|---|
| A1★ | **Where am I.** L: active sidebar item marked (`aria-current`), one h1 equal to the nav label, unique `<title>` per route and record; breadcrumb only below a top-level page, with "←" back. | 4: all four present on every route incl. detail pages and open drawers. 0–1: same title everywhere, or nav highlight lost on a detail or drawer. | UXC §3, N1, W-2.4.2 |
| A2★ | **Action feedback.** L: after every mutation (tick, assign, move, save, snooze) a visible change appears in ≤1 s: row updates and/or a toast that names the object ("Aufgabe an Anna übergeben"). Time it with throttling: 0.1 s instant, 1 s keep flow, 10 s needs progress and a way out. | 4: ≤0.1 s optimistic change plus named toast; anything >1 s shows pending; >10 s shows count/progress. 0–1: silent success, unchanged page after save, or a click with no response >1 s. | N1, N2, UXC §6 |
| A3★ | **Status = colour + icon + text**, from the closed vocabulary in UXC §7 (Tasks, Permits, Money, Health, Events, Saison). L: greyscale screenshot; read every status. C: no status carried by colour alone. | 4: every status readable in greyscale and uses the §7 wording. 0–1: colour-only dots, English or ad-hoc status words. | UXC §1.6, §7, W-1.4.1 |
| A4★ | **Due-ness language** (`DueBadge`): Heute / Morgen / In 3 Tagen / 3 Tage überfällig / Gestern fällig / Wartet seit 5 Tagen; same wording in Übersicht, Checkliste, Genehmigungen, Kalender, notifications. | 4: identical wording and colour+icon everywhere. 0–1: red text only, or "3 T" outside matrix cells, or counts that disagree between screens. | UXC §7 |
| A5★ | **Four distinct states: loading, empty, filtered-empty, error.** L: delay a request, empty a filter, force a failure. Skeleton matches the final layout; no "Keine Aufgaben" flash before data; filtered-empty offers "Filter zurücksetzen"; error offers retry and keeps data. | 4: all four exist and differ. 0–1: blank area, false empty during load, or an error shown as an empty list. | UXC §6, N5 |
| A6★ | **Badges and counters tell the truth.** L: the red Genehmigungen badge ("Jetzt zu tun") equals the length of the focus chip of the same name; resolving one item decrements it everywhere; zero hides it; any other count equals what a click shows. C: one rule (`permitActionTier`). | 4: always equal, live-updating. 0–1: number differs from list, or two definitions in use. | UXC §3, N12 |
| A7 | **Unsaved / failed / offline.** L: block the request or go offline, then tick a task, drag a card, edit a field. Optimistic UI reverts visibly with a German reason and Retry; money shows "wird gespeichert…" until confirmed; second tab shows no silent stale data. | 4: visible revert plus retry, reload matches the server. 0–1: item stays "done" after the failure, or the error is only a vanishing toast. | UXC §6, N1, N6 |
| A8 | **Long operations** (generate tasks from Vorlage, "Markt planen" for many dates, export). L: pending state, result summary with a count ("38 Aufgaben angelegt") and link. | 4: progress or pending plus count summary. 0–1: nothing visible, or user can double-start it. | N1, N6 |

### Group B – Control, freedom, error prevention and recovery (H3, H5, H9)
| ID | Check | Pass / fail anchors | Src |
|---|---|---|---|
| B1★ | **Undo toast quality.** L: do an action, stopwatch the toast. UXC says 5–8 s. Pause on hover and focus? Reachable by keyboard? Announced (`role=status`)? Survives route change? Two quick actions: both undoable? Does not hide the drawer's primary action or the phone bottom area? | 4: ≥8 s or paused on hover/focus, keyboard reachable, announced, stacks without losing the earlier Undo. 3: ≥5 s with pause. 2: ≥5 s without pause or keyboard. 0–1: <5 s, lost on navigation, or the second toast replaces the first. *(≥8 s for high-impact actions is an inference; 5 s is the documented floor.)* | UXC §6, W-2.2.1, W-4.1.3, N4 |
| B2★ | **Undo is real.** L: delete or archive an Aufgabe with subtasks, assignee, due date; Undo; diff against the original. Same for event cancel (open tasks must reopen exactly), permit "Ersetzt", Vorlage-generated tasks, logbook entries. | 4: full restore incl. children, order, links. 0–1: only the parent returns, or Undo works on the client but the server already hard-deleted. | UXC §6, N4 |
| B3 | **Global undo.** L: top-bar "Rückgängig" and Strg+Z take back the newest of the last 10 changes (≤15 min), tooltip names the change, greyed when empty. | 4: works after the toast is gone and across pages. 0–1: absent or taking back the wrong item. *(After reload the history is empty by design.)* | UXC §6 |
| B4★ | **Confirm only the irreversible, and name the consequence.** L: inventory every dialog. Allowed by UXC: delete event (typed name, shows blockers), "Aufgabe erledigt?" on task-leaves-list views, "Monat … abschließen". Buttons are outcome verbs, destructive option not default-focused, Esc cancels. | 4: dialogs only where UXC allows, buttons like "Veranstaltung löschen" / "Behalten". 0–1: generic "Sind Sie sicher?", Ja/Nein, or a dialog on a reversible action (UXC divergence). | UXC §1.5, §6, N7 |
| B5★ | **Impact preview before commit** for cascades and bulk actions: apply Vorlage to events/Saisons, shift an event date (offset tasks move), change a Vorlage offset, "Markt planen". Count of tasks created, moved, overwritten; manually edited tasks protected; one undo for the batch. | 4: counts shown before commit, edits protected, one batch undo. 0–1: silent regeneration or overwrite, no count, N toasts. | UXC §5 (Anwenden), N7, W-3.3.4 |
| B6★ | **Impossible states are blocked** and explained: apply-by after event, decision date before application, granted before applied, due date after the market, task "Erledigt" with open subtasks (UXC: the drawer opens with a plain hint, no dead end), assign to deactivated user. | 4: prevented at input with a visible reason. 2: caught only on save with a clear message. 0–1: reachable and saved. | UXC §6, N7 |
| B7 | **Double submit.** L: double-click and rapid Enter on each create; submit then Back; two tabs. C: pending/disabled state and a unique constraint. | 4: one record, button pending ≤100 ms. 0–1: duplicates or duplicate notifications. | N6 |
| B8★ | **Input survives interruption.** L: type in a drawer or dialog, then Esc, outside click, browser Back, reload, failed save, session expiry. | 4: draft kept or discard guard shown, no false guard on untouched forms. 0–1: silent discard. | N7, UXC §6 |
| B9 | **Warn while typing, not after saving** (UXC principle 7): double-booked location, §17 deadline, Minijob limits where visible. | 4: inline at input. 0–1: only after save. | UXC §1.7 |
| B10★ | **Exits are obvious and cheap.** L: every drawer/modal/sheet has visible ×/Abbrechen; Esc closes and focus returns to the row; Back closes the overlay not the page, list scroll and filters restored. | 4: all of it. 0–1: trapped, Back leaves the app, or filters reset. | UXC §4, N3 |
| B11 | **Soft delete and recovery surface.** L: after a toast expires, find the item in Archiv or Verlauf ("Wiederherstellen"); deep link of a deleted record explains and offers restore. | 4: findable, restores with same URL and relations. 0–1: gone, or raw 404. | N3, W-G99 |

### Group C – Wayfinding, structure and consistency (H4, IA)
| ID | Check | Pass / fail anchors | Src |
|---|---|---|---|
| C1★ | **Own URL for every view and overlay.** L: copy the URL with a Vorschau (`?vorschau=`), drawer (`?aufgabe=`, `?detail=permit:`), filter, tab, month open; paste in a fresh tab; reload; logged-out then magic link returns to the target. Vorschau must use replaceState (no history pile-up). | 4: identical state restored every time. 0–1: state only in React, login drops the target, or Back needs several steps. | UXC §4, N10 |
| C2★ | **Nothing hidden, nothing dead.** L: every enabled module reachable from the sidebar (4 daily entries + Stammdaten); Strg+K only an accelerator. Hidden modules leave no link, no redirect loop, no empty shell. C: `HIDDEN_MODULES` vs links. | 4: all reachable, no dead entries. 0–1: a feature reachable only by shortcut, or a link into a hidden module. | UXC §1.2, VIS |
| C3★ | **Same pattern, same place.** Compare across ≥3 screens: primary action ("+ Neu", C key), filter row, section headings (h2 18 px outside the card, actions right), leading task tick (`TaskTick`), Vorschau/drawer behaviour, empty state shape. | 4: identical. 2: one outlier. 0–1: each page differs. | UXC §3, §6, N4 |
| C4 | **Same record, same drawer** from Checkliste, Übersicht, Was fehlt, Kalender, notification: same fields, order, actions. | 4: identical. 0–1: different editors for one record. | N4 |
| C5★ | **Search and Strg+K.** L: visible field "Suchen oder Befehl …"; finds records not only pages; umlaut/ß tolerant (Koeln/Köln, Strasse/Straße), typos (Flomarkt), prefix, partial words; results typed (Markt vs Ort of same name); zero-result state offers a next step; A–Z selector on Kontakte/Aussteller. | 4: ≥8/10 test queries succeed incl. umlaut and typo. 0–1: exact-substring only, or nothing on a one-character error. | N11, UXC §5 |
| C6★ | **Filters visible, clearable, shareable.** L: each active filter (incl. defaults like "Aktuell & kommend") appears as a chip or text; removable; "Zurücksetzen"; in the URL; saved "Ansichten". | 4: all of it. 0–1: hidden default filter ("where are my events?") or lost on Back. | N8, UXC §6 |
| C7 | **Legacy and bad URLs.** L: `/logbuch` redirects (query kept); archived, deleted and no-permission records show an explaining page with a way back, not a blank or framework error. | 4: all explained. 0–1: raw 404, white screen, or 403 shown as an empty list. | N9, UXC §2 |
| C8★ | **Provenance and cross-links.** L: a task drawer names Veranstaltung, Markt (colour + name), due date, assignee and Vorlage origin; event ↔ Ort ↔ Genehmigung ↔ Kontakt link both ways; breadcrumb is canonical wherever you came from. | 4: all present, two clicks max to any neighbour. 0–1: user must remember which Markt a task belongs to. | N6, N11 |
| C9 | **Predictable labels / information scent.** Five-second first-click test on 5 labels (Genehmigungen vs Pflichten vs Stammdaten; Kalender vs Veranstaltungen). | 4: ≥4/5 correct first clicks. 0–1: ≤2/5. | N11 |

### Group D – Language, domain fit and help (H2, H9, H10)
| ID | Check | Pass / fail anchors | Src |
|---|---|---|---|
| D1★ | **Glossary terms, one per concept.** Markt (preset) / Veranstaltung / Termin (the date) / Ort / Vorlage / Aufgabe / Saison / Genehmigung, as in GLO. Never "Kunde". C: grep `apps/web/messages/de` for synonyms (Event, Task, Template, Location, Todo, Händler). Nav label = title = h1 = breadcrumb. | 4: 0 deviations in flow. 0–1: English or developer terms (slug, enum, UUID, null) or one concept under two names. | GLO, N1, N2 |
| D2★ | **Address form.** UXC §8: neutral wording; "du" only where an address is needed; "Sie" only in vendor-facing documents. C and L: grep UI, toasts, errors, emails (magic link), digest. | 4: consistent. 0–1: du and Sie mixed in one flow. | UXC §8, G1 |
| D3 | **People words and politeness (GLO "Wording").** Plain forms (Aussteller, Ansprechpartner, Mitarbeiter), no ":innen", "*" or "/-innen"; "bitte" only in error and missing-input text; "Benutzer"/"Anmelden", never "Login" or "Konto". | 4: 0 violations. 0–1: ≥3. | GLO |
| D4★ | **Buttons: verb + object, outcome-specific, one label per action.** Not "OK", "Absenden", "Ja/Nein" (except the documented "Ja, erledigt"). Speichern vs Übernehmen; Löschen vs Archivieren vs Absagen must map to different behaviours. Dialog "Abbrechen" must not be ambiguous with "absagen". | 4: unambiguous and consistent. 0–1: mixed or generic. | G2, N7 |
| D5★ | **Formats** (`de-DE`, Europe/Berlin): `16.05.2026`, `Sa 16.05.`, `14:30 Uhr`, `1.234,56 €`, `4,50 m`, "KW 20", Monday-first. L: every surface incl. digest, notification, calendar, picker. Check KW at 28.12.2026 / 01.01.2027 (KW 53) and a DST day. | 4: identical everywhere. 0–1: ISO or US format, Sunday-first, KW mismatch between screens. | UXC §8, G3 |
| D6★ | **Offsets are never raw.** "T-240" (or equivalent) always shows the resolved date and a plain German phrase ("240 Tage vorher = 15.03.2026"), live while editing. | 4: always. 0–1: raw offset only. | N2, N6 |
| D7★ | **Error messages.** Force: empty required, bad date, duplicate, end before start, permission denied, expired magic link, network failure, 500. German; one cause; says how to fix; next to the field with icon+text; focus on the wrong field; input preserved; no raw Supabase/Postgres/RLS/zod text; no "Fehler aufgetreten"; no blame ("ungültig"). | 4: all constructive. 2: generic but near field. 0–1: raw system text, form wiped, or toast-only. | N9, G4, W-3.3.1/3.3.3 |
| D8 | **Help in context.** One-line hint beside non-obvious concepts: Saison vs Veranstaltung tasks, "Gilt für: Jeder Termin / Ganze Saison", permit stages, städtisch/privat. First-run hint once and dismissible (Vorschau with Space, Strg+K, Kompakt). No forced tour. | 4: concise, current, German, dismissible. 0–1: users must ask the Büroleitung. | N10, UXC §11 |
| D9★ | **Empty states teach.** Say what the area is for, why it is empty, and give a verb-first action. Differ by no-data, filtered, no-permission. | 4: all three. 0–1: "Keine Daten". | UXC §6, N5 |
| D10 | **Plurals, quotes, long words.** "1 Aufgabe / 3 Aufgaben", „…“ quotes, no clipped compounds, truncation always has a tooltip, `hyphens: auto`. | 4: clean. 0–1: "1 Aufgaben", clipped buttons. | UXC §8, G5 |

### Group E – Visual hierarchy, Gestalt and density (H8)
| ID | Check | Pass / fail anchors | Src |
|---|---|---|---|
| E1★ | **Primary job in one sentence; first viewport serves it.** State the page's job. Übersicht must answer "what needs me today / is next weekend OK" without scroll or a click. | 4: answer in <10 s without interaction. 0–1: decorative stats first, urgent item below the fold. | VIS, N8 |
| E2★ | **Squint/blur test** (blur ~5–20 px). First three things to pop out must be page title, primary action, most urgent item. One dominant primary action per screen. | 4: pass. 0–1: Markt colour or a banner outshouts overdue/critical. | N13 |
| E3★ | **Proximity before borders.** Heading nearer to its content than to the previous section; label nearer its value than the next pair; no card-in-card; forms >7 fields grouped under headings. Check again at 390 px. | 4: grouping survives border removal and stacking. 0–1: equal spacing everywhere. | N14, UXC §6 |
| E4★ | **Colour budget and roles.** Teal is the only accent. Markt colour is identity only: thin bar or dot beside the name, never a background, never a status colour. Event-type colours never status. Greyscale: market and status still tell apart (name next to colour). | 4: no collision, name always present. 0–1: colour is the only market identifier, or red used decoratively. | UXC §9, N15, W-1.4.1 |
| E5★ | **Data points per row/card ≤6**, chips and badges per row ≤3 types. Leading element is the identifying text (what + which Markt), not an icon/ID. | 4: ≤6 and scannable (F-pattern first words). 0–1: >8 or identical first words. | N16, N17 |
| E6 | **Type system.** Inventory sizes via devtools: tokens only (page title 22, section h2 18, panel 15, body 14, small 13, tiny 12). `.tabular` on money, dates, counts; running text ≤~70 chars. | 4: ≤5 sizes, tokens only. 0–1: ad-hoc sizes, proportional digits in columns. | UXC §9, N16 |
| E7★ | **Tables.** First column a human name; sticky header; numbers right-aligned tabular; row height 40 (Standard) / 32 (Kompakt); row actions findable by keyboard and touch (UXC allows hover-reveal: tag [DOC-RISK] if touch or keyboard cannot reach them); selected/focused row = tint + 2 px ring. | 4: all. 0–1: ID first column, header scrolls away, hover-only actions unreachable on phone. | UXC §6, §10, N18 |
| E8★ | **Progressive disclosure ≤2 levels.** page → drawer is the maximum; no drawer in drawer, no modal over drawer for routine work; rare fields collapsed (Eckdaten, Regeln). | 4: ≤2 levels. 0–1: ≥3 or frequent fields hidden. | N19 |
| E9★ | **German text expansion.** 390 px and 320 px: nothing clipped or overlapping, tabs scroll inside their bar, no fixed-width buttons. WCAG text-spacing override applied: no loss. | 4: clean. 0–1: clipped labels, horizontal page scroll. | UXC §1.9, W-1.4.10/1.4.12 |
| E10 | **Theme and density.** Light, dark, Kompakt: same hierarchy, contrast holds, no token left unset. | 4: all modes pass. 0–1: unreadable in one. | UXC §9 |

### Group F – Efficiency and cognitive load (H6, H7)
| ID | Check | Pass / fail anchors | Src |
|---|---|---|---|
| F1★ | **Step budget.** Count clicks, keystrokes, page loads, decisions (M) and context switches on the happy path. Budgets: open a record from a list = 1 click; tick off = 1 click + undo; change assignee or due date ≤3 interactions without leaving the page; new Termin from a Markt preset needs only the date. KLM-lite: click ≈ 1.3 s, decision ≈ 1.35 s, hand switch ≈ 0.4 s. Step ratio = actual / optimal. *(Budgets are practitioner targets, not published standards.)* | 4: ratio ≤1.2 and within budget. 3: ≤1.5. 2: ≤2. 0–1: >2, or needs data remembered from another screen. | N20, N21 |
| F2★ | **Defaults and no redundant entry.** Markt preset fills type, Ort, texts, template; year, assignee and due date derive from context and are visible and editable; nothing already known is asked again (WCAG 3.3.7); no consequential default silently set (notify, mark done). | 4: all derived, shown. 0–1: empty forms despite obvious context, or silent consequential defaults. | N6, W-3.3.7 |
| F3★ | **Recognition over recall.** Pickers (Ort, Kontakt, assignee, Markt) are searchable lists with names (+ colour/date), not typed IDs; "Neuer Kontakt …" create-in-place keeps parent state; drawer title names object and parent; icon buttons labelled. | 4: all. 0–1: free text where a picker belongs, or unlabeled icon-only buttons. | N6, N22 |
| F4★ | **Accelerators exist and are never required.** Strg+K, `/` filter, J/K, Space Vorschau, Enter, Esc, `C`, `A`, `S`, `X`, Strg+Z, `?` overview. Shortcuts shown in tooltips/menus. **Single-key shortcuts must not fire in inputs, textareas, drawer forms; test on a German QWERTZ layout** (`/`, `?`). Never override Strg/⌘+click, Cmd+F/A/P. | 4: discoverable, safe, optional. 0–1: fires while typing, or the only route. | UXC §6, W-2.1.4, N23 |
| F5 | **Bulk work.** Multi-select with visible count, tri-state select-all with clear scope (page vs filter), bulk assign / shift dates / status with one undo. Frequent chores (17 Märkte × n tasks) must not cost 17×n steps. | 4: exists, counted, one undo. 0–1: absent for a recurring chore. | N24 |
| F6 | **Working-memory load.** Per decision step list needed info; all on screen? Permit apply-by and event date visible where the task is decided; drawer keeps parent context; ≤3–4 items held in mind. | 4: nothing remembered. 0–1: switching screens to compare. | N6, N25 |
| F7★ | **Choice load.** Visible nav entries ≤8 and grouped; one primary action; row "⋯" menu ≤5 items; filter bars show common filters first; long lists have search and recents. | 4: within limits. 0–1: toolbars of 8+ equal actions, unfiltered 50+ lists. | N26, UXC §3 |
| F8 | **Role-fit.** Entries a role may not read are hidden (`can()`); owner/manager/staff/field each land on something useful; denied actions say who can do it. | 4: reduced and explained. 0–1: field staff sees admin density, or permission failure is silent. | ROL |

### Group G – Accessibility and mobile (WCAG 2.2 AA)
| ID | Check | Pass / fail anchors | Src |
|---|---|---|---|
| G1★ | **Keyboard-only completion** of the flow. Visible focus (2 px accent ring, ≥3:1), not hidden by sticky bars or toast (2.4.11), logical order, no trap, no `outline:none` without replacement. | 4: whole flow done without mouse. 0–1: blocked step. | W-2.1.1/2.4.7/2.4.11 |
| G2★ | **Drawer/Vorschau/dialog focus contract.** Focus moves in; dialog traps Tab and background inert (a non-modal drawer must not claim modality); Esc closes; focus returns to the originating row; accessible name via `aria-labelledby`; the open row has `aria-current`. | 4: all. 0–1: focus lost to `body`, or Tab escapes. | UXC §10, APG-dialog |
| G3★ | **Every drag has a click and keyboard path** (2.5.7): "Zuweisen an…", "Verschieben nach…" menus; Space lift, arrows, Space drop, Esc cancel; German `aria-live` announcements. | 4: all three. 0–1: drag-only. | UXC §1.8, W-2.5.7 |
| G4★ | **Contrast.** Text ≥4.5:1 (3:1 large); UI components, input borders, status dots, focus ≥3:1; both themes; muted metadata and placeholders; text on Markt colours. | 4: all pass, measured. 0–1: grey-on-grey metadata, borders ~1.5:1. | W-1.4.3/1.4.11 |
| G5★ | **Target size.** ≥24×24 CSS px (AA) or the 24 px-circle spacing rule; aim ≥44 px on the 390 px layout. Measure hit area, not glyph: checkbox/tick, ×, toast Undo, kebab, chips, calendar cells. | 4: ≥44 on phone, ≥24 desktop. 2: 24–43 on phone. 0–1: <24 or crowded. | W-2.5.8, N27 |
| G6★ | **Status messages announced** without focus move: toast success `role=status`, errors `role=alert`, filter result count, badge as "3 offen". Live region exists at load. | 4: VoiceOver confirms. 0–1: silent toast, or `alert` on every success. | W-4.1.3 |
| G7★ | **Reflow and phone.** 320 px / 400 % zoom: no 2-D page scroll (data tables scroll in their own container); sidebar → icons → hamburger below 1024 px; drawers full-screen with reachable close; sticky bars leave workable space; keyboard does not cover field or save. | 4: pass. 0–1: horizontal page scroll or clipped actions. | UXC §3, W-1.4.10 |
| G8 | **Semantics.** `lang="de"`, real h1–h3, landmarks, skip link, icon buttons with German names, `<table>` + `th scope`, `aria-sort`; no fake `role=grid`. Run axe on page and with drawer open. | 4: axe clean plus manual. 0–1: div soup. | W, APG |
| G9 | **Motion.** `prefers-reduced-motion` honoured; no endless shimmer on failure; auto-updating lists do not move under the cursor. | 4: honoured. 0–1: ignored. | UXC §9, W-2.2.2 |
| G10 | **Field network (phone).** Slow 4G: skeletons, no layout shift (CLS ≤0.1), INP ≤200 ms; offline: clear banner and no false success; magic-link session expiry returns to the same page with draft; tel:/maps links on Ort and Kontakt. | 4: all. 0–1: blank page offline, lost draft. | N28, VIS |

### Group H – Domain-critical flows (consequence-weighted)
| ID | Check | Pass / fail anchors | Src |
|---|---|---|---|
| H1★ | **Permit deadlines cannot be missed.** Apply-by, Beantragt, expected decision, Genehmigt visible at a glance; "Jetzt zu tun" tier (passed or within `permit_horizon_days`, plus Abgelehnt, Abgelaufen, "Antwort überfällig"); reachable from the landing screen in ≤1 click; text + icon, not colour. Simulate a passed date: is it surfaced in Übersicht, badge, event "Was fehlt", Kalender? | 4: surfaced in ≥3 places, one rule. 0–1: an overdue permit visible only inside a nested page. **Any miss here is severity 4.** | VIS, UXC §3, §7 |
| H2★ | **Permit date logic and history.** Order enforced (B6); logbook shows who/what/when/old→new; status change reversible ("Ersetzt" toggles back, cancelled tasks reopen) or logged; Behörde is picked from Kontakte, not retyped. | 4: enforced and logged. 0–1: silent overwrite, no history. | UXC §6, W-3.3.4 |
| H3★ | **Notifications and digest.** Every item says actor/object/Markt/date, is actionable (Erledigt, Zurückstellen) and deep-links to the exact record; grouped by urgency (Überfällig / Heute / Diese Woche / Genehmigungen), consequence-ranked not just chronological; resolved items disappear everywhere; bulk generation (Saison, cancel event) produces grouped or no messages; digest not duplicating immediate mail. With the bell hidden, a Büroleitung who never uses Strg+K still sees must-do items on Übersicht. | 4: all. 0–1: per-task spam, stale items, or critical items only reachable by shortcut. | N29, UXC §5 |
| H4★ | **Overdue and snooze.** Überfällig group first; "Zurückstellen" with date; snoozed ≠ forgotten (visible); counts equal across Übersicht, Checkliste, Kalender, digest. Planned date vs hard deadline are not conflated (shifting a task must never silently move a permit deadline). | 4: consistent and distinct. 0–1: counts differ, or silent deadline shift. | N30 |
| H5★ | **Vorlage → Saison → Termin propagation.** "Gilt für: Jeder Termin / Ganze Saison" explained; "Auf Veranstaltungen anwenden" Wählen → Vorschau; moving an event date explains what moved; manual edits survive; season tasks vs event tasks distinguishable in lists. | 4: clear, previewed, safe. 0–1: user cannot tell why a task moved. | UXC §5 |
| H6 | **Kalender.** Layers behind "Ebenen"; Feiertage NRW quiet but text-labelled; "+N weitere" popover with Esc/focus return; list alternative; KW column; today not colour-only; month/layer in URL; popover `?vorschau=veranstaltung:<id>` keyboard-reachable. | 4: all. 0–1: overflow unreachable, colour-only. | UXC §5 Kalender, N31 |
| H7 | **Planning many dates** ("Markt planen"): defaults, range/multi-select with keyboard parity, conflicts shown on the date cell (same Ort, holiday), count summary, per-row removal, one batch undo. | 4: all. 0–1: one date per click, no preview. | N31 |
| H8 | **Role and permission edges.** Worker/staff/field opening a lead-only URL; expired magic link; deactivated assignee. German explanation and a way back. | 4: explained. 0–1: empty list or framework error. | ROL, N9 |

---

## 4. Severity scale (Nielsen 0–4 with frequency, impact, persistence)

Rate **after** the walk, separately from the criterion score, and **never rate your own builder's work**. Effort is not severity.

| Sev | Label | Meaning | Action |
|---|---|---|---|
| 0 | Not a problem | Disagreement, or a justified trade-off. Keep it in the log. | none |
| 1 | Cosmetic | Noticed, no effect on the task. | fix if time |
| 2 | Minor | Slows or irritates; low priority. | next cycle |
| 3 | Major | Task fails, takes much longer, or errors recur; high priority. | before next release |
| 4 | Catastrophe | Data loss, a missed or hidden permit deadline, wrong date on a legal or financial item, destructive action without recovery. | fix before release |

**Computing it.** Score each factor, then sum S = F + I + P.
- **F frequency**: 1 = rare / one role or edge case; 2 = some users or flows (weekly); 3 = most users in the daily flow.
- **I impact** (difficulty to overcome): 1 = easy, user recovers at once; 2 = needs effort or help; 3 = cannot be overcome, or silently wrong result.
- **P persistence**: 1 = one-time, learnable; 2 = recurs, user can work around; 3 = recurs every time, no workaround.

| S | Base severity |
|---|---|
| 3–4 | 1 |
| 5 | 2 |
| 6–7 | 3 |
| 8–9 | 4 |

**Overrides (always set severity to 4):** a Genehmigung apply-by or decision deadline that can pass unnoticed; data loss on any save, undo or delete; a date shifted without the user knowing on a legal or financial item. **Floor of 2:** any [DOC-GAP]. **Cap of 1:** purely visual issue with correct meaning and ≥4.5:1 contrast.

**Rating procedure.** Evaluators rate their own findings provisionally (Sev-1). In consolidation, **three independent raters** give Sev (0–4) without seeing each other; the report shows all three and the **mean**. A single rater's number is not final. Do not make everything 3–4: a report where >30 % of findings are 3+ is mis-calibrated.

---

## 5. Applicability matrix (which groups for which screen)

● apply fully, ○ apply only the ★ criteria, – skip.

| Screen / route | A | B | C | D | E | F | G | H |
|---|---|---|---|---|---|---|---|---|
| Übersicht `/` | ● | ○ | ● | ● | ● | ● | ● | ● |
| Veranstaltungen list / Markt planen sheet | ● | ● | ● | ● | ● | ● | ○ | ● |
| Veranstaltung tabs (Zusammenfassung, Checkliste) | ● | ● | ● | ● | ● | ● | ● | ● |
| Aufgabe drawer | ● | ● | ○ | ● | ○ | ● | ● | ○ |
| Genehmigungen list / matrix / drawer | ● | ● | ● | ● | ● | ○ | ● | ● |
| Kalender | ● | ○ | ● | ● | ● | ○ | ● | ● |
| Vorlage (Ablauf) editor, Bibliothek, Markt bearbeiten | ○ | ● | ○ | ● | ● | ● | ○ | ● |
| Kontakte / Orte / Aussteller / Archiv | ○ | ● | ● | ● | ● | ● | ○ | – |
| Pflichten (`/firma`) | ○ | ● | ○ | ● | ● | ○ | ○ | ○ |
| Benachrichtigungen | ● | ○ | ● | ● | ● | ○ | ○ | ● |
| Einstellungen, Profil menu | ○ | ○ | ○ | ● | ○ | – | ○ | ○ |
| Sign-in / magic link / error pages | ○ | ○ | ○ | ● | – | – | ● | ○ |
| Phone variants (390 px) of any of the above | + G fully, + E9, F1 | | | | | | | |

---

## 6. Reporting template

### 6.1 Finding (one per problem; merge duplicates)
```
ID:            F1-<evaluator#>-<nn>
Title:         <one line, user-visible symptom>
Screen / URL:  <route + overlay param>   Role: <owner|manager|staff|field>   Device: <desktop|390px>   Theme/density: <…>
Flow + step:   <FLn, step k>
Criteria:      <e.g. B2, H1>   Heuristic: <Nielsen Hn>   Principle: <Gestalt / UXC §…>
Evidence:      O or P  ·  steps to reproduce (numbered)  ·  screenshot/DOM/measurement
Task impact:   <what the persona cannot do or does wrong, in one sentence>
F / I / P:     <1-3 / 1-3 / 1-3>  → provisional Sev <0-4>   (override reason, if any)
Tags:          [DOC-RISK] [DOC-GAP] [UXC-conform]
Fix (small):   <smallest change that removes the problem, not a redesign>
Effort:        S / M / L
Needs user test: yes/no (why)
```

### 6.2 Screen scorecard (one per screen/flow evaluated)
```
Screen/flow: <…>   Role: <…>   Device: <…>   Date: <…>   Evaluator: <#>   Time on task: <min>
Group scores (0–4, mean of scored ★ and applicable criteria; n = scored count)
 A status     _.__ (n=_)   B control/errors _.__ (n=_)   C wayfinding _.__ (n=_)   D language _.__ (n=_)
 E hierarchy  _.__ (n=_)   F efficiency     _.__ (n=_)   G a11y/mobile _.__ (n=_)  H domain   _.__ (n=_)
Screen score: _.__        Zeros (list IDs): <…>        Findings filed: <ids>
Step budget (F1): clicks _  keystrokes _  page loads _  decisions _  est. KLM s _  step ratio _.__
Preserve (scored 4 and worth keeping): <ID – what>
Not evaluated / blocked: <what and why>
```

### 6.3 Consolidated report (consolidator agent, after all evaluators)
1. Scope statement, personas, flows, environment, evaluator lenses (UX heuristics · domain/operations · accessibility/mobile), what was **not** covered.
2. Counts per severity (mean of three raters), observed vs predicted.
3. **Heat map**: screens × groups A–H (mean scores; colour band: ≤1.4 red, 1.5–2.4 amber, 2.5–3.4 light, ≥3.5 green, always with the number).
4. **Top 10** by severity, then by task criticality (permit deadline flows first), each with merged evidence and the three ratings.
5. Cross-cutting root causes (one cause behind many findings) and quick wins (Sev ≥2, Effort S).
6. UXC divergence list: [DOC-GAP] items and [DOC-RISK] items for the product owner's decision.
7. Positives to preserve.
8. Queue for a 3–5 person user test (Büroleitung, 1–2 office staff, Jerome; include one person aged 50+): all P-findings, F1/F2 step-ratio hot spots, undo discoverability, offsets, permit-deadline comprehension.
9. Caveats (copy verbatim, section 9).

### 6.4 Consolidation procedure
1. Cluster findings by symptom and location (affinity); one master finding keeps all evidence.
2. Where evaluators disagree on score by ≥2, a second look in the live app decides; record the disagreement.
3. Three raters assign Sev independently; mean reported; a Sev-4 by any rater is escalated for discussion, not averaged away.
4. Distinguish a defect from a justified trade-off (section 7) before rating.

---

## 7. Known tensions between the product docs and the literature (score against the doc, tag [DOC-RISK])

| Topic | App rule (UXC) | Literature concern | How to score |
|---|---|---|---|
| "Aufgabe erledigt?" confirm on Übersicht, Benachrichtigungen, Was fehlt, Board | Deliberate exception D1 (user test 2026-11) | Confirms on reversible actions cause click-through | Score B4 against the exception list; a dialog anywhere else = defect |
| Delete event: typed-name `alertdialog` | The one deliberate exception, permanent | Typed confirmation used on rare catastrophes only | 4 if shows blockers and counts, else 2 |
| Undo toast 5–8 s | Documented | WCAG 2.2.1 and slow readers favour longer or pausable | Score B1 by the anchors; add [DOC-RISK] if <8 s without pause |
| Row actions on hover/selection | Documented | Hover-only fails keyboard and touch | E7: pass only if focus and touch show them |
| Single-letter shortcuts (`C`, `A`, `S`, `X`, `/`, `?`) | Documented accelerators | WCAG 2.1.4; QWERTZ conflicts | F4: must not fire in inputs; turn-off or scope required |
| Strg+K / Übersicht link only for Benachrichtigungen (bell hidden) | Decision 2026-11 | Hidden entry points reduce discoverability | H3 and C2: pass only if must-do items are on Übersicht |
| "du" where an address is needed | UXC §8 | None binding; consistency matters | D2: score consistency, not the choice |
| Hidden modules / Board by URL | Decision 2026-10-22, 2026-11-03 | – | Do not file absence; file dead links |
| Compact density labels beside fields | "still to be built" | – | Do not file as a defect; mark not evaluated |

---

## 8. Source key

**Nielsen/NN/g**: N1 10 Usability Heuristics (H1–H10) · N2 Response Times 3 Limits (0.1/1/10 s) · N3 User Control and Freedom · N4 Confirmation Dialogs (prefer undo) · N5 Empty States in Complex Apps · N6 Interaction cost / Working memory and external memory · N7 Slips vs Mistakes, Error prevention · N8 Heuristic Evaluation (How to conduct; Severity ratings; Applied filters Baymard) · N9 Error-Message Guidelines · N10 Help and documentation, Deep links/URL state (APG, GOV.UK back link) · N11 Breadcrumbs, Hamburger/hidden navigation, Baymard autocomplete and no-results · N12 Indicators, Validations and Notifications · N13 Visual Hierarchy (blur test) · N14 Gestalt Proximity · N15 Colour use in visual hierarchy · N16 Chunking, typography (GOV.UK type scale) · N17 F-pattern, layer-cake scanning · N18 Data Tables · N19 Progressive Disclosure (max 2 levels) · N20 KLM operators (Card, Moran, Newell 1980; via Wikipedia) · N21 Fitts's and Hick's laws · N22 Recognition and recall · N23 UI Accelerators · N24 Data tables (batch actions) / Carbon · N25 Short-term memory and web usability · N26 Choice overload / Hick's law (Laws of UX) · N27 Touch Target Size · N28 web.dev Web Vitals, RAIL, INP · N29 Push notification design; Fitz et al. 2019 batching · N30 Todoist/Things due vs deadline; Linear triage · N31 Calendar patterns (NN/g date input, APG date grid).

**W-** = W3C WCAG 2.2 Understanding documents (SC number follows). **APG** = W3C ARIA Authoring Practices (dialog, combobox, tabs, grid). **G1–G5** = German UPA Leitfaden Fehlermeldungen / UX-Writing, GOV.UK validation and date patterns, DIN 5008 / ISO 8601 (secondary sources).

**Product docs**: UXC = `docs/product/ux-concept.md` (section numbers as in the file); VIS = `vision.md`; ROL = `roles-and-personas.md`; GLO = `glossary.md`.

---

## 9. Caveats (copy into every report)

- Heuristic evaluation finds *likely* problems cheaply; it produces false alarms (one cited study: 43 % of flagged problems not real) and misses real ones (21 % coverage of what user testing found). Mark O vs P and queue P-findings for a 3–5 user test with the real roles.
- Missing elements are easier to spot in the running app than in specs. Evaluate the live app, not the docs.
- Single-evaluator detection is low (about 42 % of major and 32 % of minor problems in Nielsen 1992); the 35 %/75 % figures for one vs five evaluators are secondary-sourced. The 5-user 85 % figure applies to user testing, not inspection. Treat 30 evaluators as breadth across lenses and flows, not as proof of coverage.
- Numeric thresholds not published by a primary source (undo toast ≥8 s, step budgets, 27-character search box, ≥10 s skeleton, row actions ≤5) are team targets. Reported figures for Du/Sie, Baymard typo rates and default-effect percentages are unverified.
- Accessibility findings need a manual keyboard and screen-reader pass; automated tools cover only a fraction of WCAG.
- A clean score is not proof of usability. This scorecard does not estimate learnability for first-time users (use the cognitive-walkthrough framework) or real-user performance (use a user test).
