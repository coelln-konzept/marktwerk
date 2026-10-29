# UX concept

**Version 2 (2026-10-21, design direction A: classic screens).** Version 1 described a customisable workspace with
docking panes; the product owner chose classic screens instead ([ADR 0019](../architecture/adr/0019-classic-screens.md),
superseding ADR 0018). Based on [research 09](../research/09-ui-ux-workspace.md) (standards, references), the client
meeting ([research 05](../research/05-client-meeting-2026-10.md)) and the product owner's decisions of 2026-10-21
(decisions log in [open-questions.md](../open-questions.md)). Wireframes: [wireframes.md](./wireframes.md).
High-fidelity reference: the Claude Design prototype in
[`docs/design/claude-design/a-classic/`](../design/claude-design/a-classic/INDEX.md) (53 screens). Where the prototype
and this document differ, the prototype wins unless a decision says otherwise.

## 1. Design principles

1. **Familiar first, powerful second.** Every screen must work for someone who never changes a setting.
   Shortcuts, Strg+K, saved filters and *Kompakt* are layers for the people who want them, never a prerequisite.
2. **Nothing hidden.** Every module is reachable from the labelled sidebar, always in the same place (the less
   frequent ones one click away in the collapsible group "Stammdaten"). Strg+K and keyboard shortcuts are
   accelerators, not the only path (client: "don't hide existing functions").
3. **Their words, their mental models.** Vorlage → Termine (like the old PHP admin), calendar weeks (KW),
   Platzkarte, Genehmigungen, Raten. Excel-like grids where they use Excel today. Printable views where they print today.
4. **One view, one place.** Every view (board, event, logbook…) is a page with its own URL. Vorschau and detail
   drawers keep the list in sight while looking at or working on a record, and they are linkable too.
5. **Undo over "Sind Sie sicher?".** Optimistic actions with an undo toast. Confirm only what can't be undone, and name
   the consequence in the button ("Monat März abschließen").
6. **Status is colour + icon + text.** Never colour alone. One vocabulary across all modules.
7. **Warn while typing, not after saving.** Minijob limits, §17 deadlines, double-booked locations show inline.
8. **Every drag has a click path.** Assigning, moving cards, reordering rows: always also via menu and keyboard
   (WCAG 2.2 · 2.5.7).
9. **German-first layout.** Labels are ~30% longer (short labels up to 2×). No fixed-width buttons or tabs;
   hyphenation on; test every screen in German first.

## 2. Information architecture

```
marktwerk
├── Übersicht                 ← start screen for everyone (KPIs, season, Heute fällig, Dieses Wochenende)
├── Board                     ← across events: Bereitschaft · Matrix · Spalten
├── Veranstaltungen           ← list · calendar · "Markt planen"
│   └── Veranstaltung         ← tabs: Überblick · Board · Genehmigungen · Dokumente · Notizen · Verlauf (Team, Geld hidden)
├── Kalender                  ← company-wide calendar, layers behind the "Ebenen" button
├── Genehmigungen             ← permit matrix (locations × permit types) · list; was "Logbuch" (`/genehmigungen`)
├── Stammdaten (collapsible, collapsed by default)
│   ├── Orte                  ← venues with zones/rows and location agreements
│   ├── Kontakte              ← authorities, landowners, suppliers, services
│   ├── Aussteller            ← vendor list (read-only import)
│   ├── Wissen                ← knowledge base
│   └── Pflichten             ← recurring obligations · vehicles · defects (`/firma`, page title "Pflichten & Fahrzeuge")
├── (hidden for now, `lib/modules.ts`: Team · Finanzen · Buchungen; Benachrichtigungen is reached by the bell, not the sidebar)
└── (bottom) Profil: Einstellungen · Design (System/Hell/Dunkel) · Dichte (Standard/Kompakt) · Sprache · Abmelden
      Einstellungen ← Firma (company data) · Benutzer & Rollen · [Rechtliche Werte with Team] · **Bibliothek**
```
Naming: **Pflichten** is the sidebar entry for what the route `/firma` holds; **Firma** only names the company data
in Einstellungen → Firma. The old route `/logbuch` redirects permanently to `/genehmigungen` (query strings such as
`?genehmigung=<id>` stay intact).

## 3. App shell

```
┌ Sidebar 232 px ─┬ Top bar: Veranstaltungen › Food & Wine Neuss   [🔍 Suchen oder Befehl … Strg+K]  [+ Neu]      ┐
│ marktwerk       │─────────────────────────────────────────────────────────────────────────────────────────┤
│ Übersicht       │                                                                                         │
│ Kalender        │  Page (own URL)                                         ┌ Vorschau ───────┐             │
│ Board           │                                                         │ card, top right │             │
│ Veranstaltungen │                                                         └─────────────────┘             │
│ Genehmigungen 7 │                                                                  ┌ Drawer (right) ─────┐│
│ …               │                                                                  │ real work           ││
│ ▸ Stammdaten    │                                                                  │                     ││
│ Profil ▾        │                                                                  └─────────────────────┘│
└─────────────────┴─────────────────────────────────────────────────────────────────────────────────────────┘
```
- **Sidebar** (232 px): logo "marktwerk", then **five daily entries**: Übersicht · Board · Veranstaltungen · Kalender ·
  Genehmigungen (UX pass, product owner 2026-10-22). Team and Finanzen join them when their modules return. The red
  badge on Genehmigungen is the number "Fehlt/abgelaufen für kommende Märkte": permits that are missing, not yet
  applied for, rejected or expired and that an upcoming market needs; it is the same number as the focus chip of that
  name on the Genehmigungen page (one definition, `missingPermitCount` / `Logbook.needsAction`). Below, the
  collapsible group **Stammdaten** (Orte · Kontakte · Aussteller · Wissen · Pflichten), collapsed by default; the
  state is remembered per browser (cookie `mw_nav_stammdaten`) and the group opens by itself when the current page is
  inside it. Entries a role may not read are hidden (`can()`), as are the entries of hidden modules. The former
  group "SPÄTER" (Buchungen · Postfach · Inventar) and the Benachrichtigungen entry are gone. At the bottom the
  **profile** (name, role); its menu holds **Einstellungen** (also reachable with Strg+K), Design (System / Hell /
  Dunkel), Dichte (Standard / Kompakt), Sprache and Abmelden.
  A button at the sidebar's top right **hides the sidebar** on wide screens (remembered per browser, cookie
  `mw_nav_hidden`); the top bar then shows a button at its left to bring it back. On phones the same button closes the
  slide-in navigation.
- **Top bar:** breadcrumb only below a top-level page (e.g. "Veranstaltungen › Food & Wine Neuss"; on a top-level
  page it would repeat the H1, so it is left out), with a small **"←"** before it: back to the page you came from in
  this tab, with its filters (drawers, Vorschau and filter changes don't count as pages, so it never reopens a closed
  drawer), or to the parent crumb when the page was opened directly. Then the visible search field "Suchen oder Befehl …" with Strg+K hint
  (opens the command palette), **"+ Neu"** (shortcut `C`; context-aware: new task on a board, new event in
  Veranstaltungen…) and the **bell** with the number of unread open notifications (owner/manager: company-wide).
- **Content:** one page. Vorschau and drawers open over it (§4). **A row or box opens its record when clicked
  anywhere**, not only on its title (event rows → the event Überblick, task rows → the task drawer); links and buttons
  inside it keep their own action, Cmd/Ctrl-click opens a new tab. Checklist icons (event Überblick → Kernaufgaben,
  Übersicht task icons) mark a task done with undo; a done Kernaufgabe's ✓ reopens it.
- **Below 1024 px** the sidebar collapses to icons, then to a hamburger menu; pages go single-column. Staff/shift
  screens have a **390 px mobile variant** (Team · Schichten); field crew get magic-link pages in Phase 2.

## 4. Pages, preview and drawers

| Surface | Use for | Behaviour |
|---|---|---|
| **Page** | Modules and records that are work surfaces: event (with tabs), template editor, month close, Genehmigungen | Own URL, breadcrumb, browser back/forward |
| **Vorschau** (quick preview) | Looking at a record from any list without leaving it: key facts, health, next deadlines | Small card/sheet top right; 👁 icon on the row or **Space**; **Enter** opens the page, **Esc** closes; read-only apart from one primary action |
| **Detail drawer** | Real work on one record while the list stays visible: task, permit, payable/instalment, shift | Slides in from the right; full editing, comments, activity; Esc closes |
| **Modal** | ≤ 8 fields, quick creation (new task, new contact) or confirming something irreversible | Centered; never for a form someone might abandon halfway |
| **Side sheet (stepper)** | Multi-step flows that need the page behind them: "Markt planen" (3 steps), "Auf Veranstaltungen anwenden…" | Wide sheet from the right with steps |

**Event page header and tabs** (UX pass 2026-10-22: health once, less chrome). Header: title with colour marker, type
tag and the **status chip** (geplant, bestätigt, …), one **"…" menu** at the right (Bearbeiten, Verschieben, Status ändern:
every action stays reachable by keyboard; "abgerechnet" is not offered while finance is hidden), then one meta line
(date, times, KW · venue link). There is no separate health indicator in the header (the Überblick status line and "Was
fehlt" carry it), no Buchung menu or chip while booking is hidden, no setup time (it is in Nächste Termine) and no
"Vorlage" (it moved into Eckdaten). Tabs: **Überblick · Board · Genehmigungen · Mehr ▾**; Dokumente, Notizen and Verlauf are
items of the "Mehr" menu and each keeps its own URL (the button is underlined while one is open). Team and Geld return with
their modules. Counts: Board shows the open tasks with their health shape, Genehmigungen shows a number only when permits
are missing (a complete "5/5" says nothing). The **Genehmigungen** tab lists the permits without a "Zuständig" column; the
whole row opens the permit. On phones (390 px) nothing overflows: the "…" menu is the only action, tabs scroll inside their
bar, and "Was fehlt" rows put the title on its own line with the due badge and actions below.

**Event Überblick** (decision 2026-10-22: an event is a bundle of to-dos; the page answers "is this market on track, and
what's missing?"). Top to bottom: (1) **status line** with days until the market ("in 12 Tagen", "läuft heute",
"vorbei"), tasks done x/y with a slim bar and permits granted a/b, each piece linking to what it summarises; (2) **Was
fehlt**: open tasks that are overdue, blocked/waiting or due within 7 days (snoozed ones stay out) plus required permits
not yet granted, Kernaufgaben first then by due date, each task row with a quick "Erledigt" tick and the snooze menu
(undo toasts), permit rows opening the Genehmigungen drawer, "Alles im Plan" when empty; (3) **Kernaufgaben** checklist with
state per row (erledigt · offen · bald fällig · überfällig · zurückgestellt), the star only in the heading;
(4) **Nächste Termine**, upcoming dates first, past ones collapsed; (5) **Eckdaten** and **Regeln der Art**, collapsed with a
one-line summary and editable as before. The tab bar already shows the counts, so there is no separate "Zustand" panel.
Rules live in `packages/core/src/events/overview.ts`; task rows open the task drawer on the same page (`?aufgabe=<id>`).

### Opening things
| Action | Mouse | Keyboard |
|---|---|---|
| Open (page) | click on the row | Enter |
| **Vorschau** | 👁 icon on the row | Space |
| Open in a new browser tab | Ctrl/⌘+click (browser-native, never overridden) | — |
| Open the drawer for a row | row action or the item's primary link (e.g. task title on a board card) | Enter on a card |
| Close Vorschau / drawer | × or click outside (Vorschau only) | Esc (focus returns to the row) |

### Linkable overlays (implementation detail, ADR 0019)
Vorschau and drawers are addressed by search params on the current page. As built in M1: **`?vorschau=<id>`** (the
list page knows which record kind it shows; Team uses **`?person=<id>`**) and, for the generation sheet,
**`?erzeugen=1[&vorlage=<presetId>|&neu=1]`** on `/veranstaltungen` (`neu=1` opens the new-market form). Drawers (from M2) follow the same idea, e.g.
`?detail=task:<id>`. A copied link reopens the same page with the same overlay; closing a Vorschau replaces the URL
(it does not pile up history entries). Pages read the param on the server and render the overlay with the page, so a
hard refresh keeps it.

## 5. View catalogue (Phase 1)

Every view is a route-level page; drawers are listed where a record usually opens as a drawer instead of a page.

| View | Route | Purpose |
|---|---|---|
| Übersicht | `/` | Start screen for everyone: KPI strip, season strip, Heute fällig, Dieses Wochenende (below) |
| Kalender | `/kalender` | Company-wide calendar with layers (below) |
| Board | `/board` | Views in the "Ansicht" control (`?ansicht=`): **Bereitschaft** (default), **Matrix**, Spalten (kanban); Nach Person and Arbeitslast return with the team module; the old `gruppiert` falls back to Bereitschaft. See "Board views" below |
| Aufgabe | drawer `?aufgabe=<id>` on `/board` and `/veranstaltungen/[id]/board` (M2; `?detail=task:<id>` also opens it) | Description, check items, evidence, optional completion note, snooze ("Zurückstellen"), activity (a closed disclosure), status: primary **Erledigt** button, **Wartet auf Amt** toggle and a "…" menu for In Arbeit / Blockiert / Übersprungen / Wieder offen, the current state always spelled out as a badge. The carried-over count and the origin of the task are not shown; the "Kernaufgabe" toggle explains itself in one line and the star carries the tooltip "Kernaufgabe – eine Aufgabe, die jeder Markt braucht" (no comments, client decision 2026-10-22) |
| Veranstaltungen | `/veranstaltungen` | Opens at the **current week**: default filter "Aktuell & kommend" (running and upcoming, all seasons; past ones via the status or season select, `?status=alle`), no Liste/Kalender toggle (the Kalender page covers it; `?ansicht=kalender` redirects there), no health column, "abgerechnet" reads as "vorbei" while finance is hidden. KW column, type filter chips, Vorschau `?vorschau=<id>`, one primary button **"Markt planen"** (3-step side sheet: pick a market, dates, preview) via `?erzeugen=1[&vorlage=<presetId>]`; a single date without a market is "+ Neu → Einzeltermin" (`/veranstaltungen/neu`) |
| Veranstaltung | `/veranstaltungen/[id]` | Event, tab Überblick; the other tabs are sub-paths: `/board`, `/genehmigungen`, `/team`, `/geld`, `/dokumente`, `/notizen`, `/verlauf` (e.g. `/veranstaltungen/[id]/board`); Dokumente, Notizen and Verlauf sit under "Mehr". Every link to a market opens its Überblick |
| Orte | `/orte` | Venues: Name, Stadt, kommende Termine (zones, rows, capacity, landowner in the Vorschau `?vorschau=<id>`) |
| Ort | `/orte/[id]` | One venue: zones and rows, location agreements |
| Genehmigungen | `/genehmigungen` (was `/logbuch`, permanent redirect) | Permit matrix (locations × permit types) or list; one status row incl. "Fehlt/abgelaufen für kommende Märkte"; cells open the permit drawer `?genehmigung=<id>` |
| Genehmigung | drawer `?detail=permit:<id>` (M3); page `/genehmigungen/[id]` planned | One permit (documents, conditions, fees) |
| Team · Stunden | `/team` | Staff list (M1), Vorschau `?person=<id>`; month grid hours, remaining allowance, month-close stepper and Schichten je Veranstaltung from M4 |
| Person | `?person=<id>` on `/team`; page `/team/[id]` planned (M4) | Contract, hours history, shifts |
| Finanzen · Zahlungen | `/finanzen` | Payables with inline instalments, receipts; drawer `?detail=payable:<id>` (M5) |
| Pflichten & Fahrzeuge | `/firma` (sidebar: Pflichten) | Obligations, vehicles, defects (tabs); one filter row, no column prints over another |
| Aussteller | `/aussteller` | Vendor list (read-only): Name, Sortiment, Stadt, Stammaussteller; the rest in the Vorschau |
| Kontakte | `/kontakte` | Authorities, landowners, suppliers, services (Vorschau `?vorschau=<id>`) |
| Einstellungen → Bibliothek | `/einstellungen/bibliothek` | Grundvorlage (master task template), Märkte (presets with venue, rhythm, own task template; Vorschau `?vorschau=<id>`), "Weitere Ablaufvorlagen" (collapsed, the old per-type templates). There is no "Vorlagen" sidebar entry; `/vorlagen` redirects here |
| Markt bearbeiten | `/vorlagen/[id]` | Edit form of a market (preset) |
| Vorlage (Ablauf) | `/vorlagen/ablauf/[id]` | Timeline template editor (Excel-like grid + timeline ruler); used for the Grundvorlage, a market's own template and the other templates, its back link goes to the Bibliothek |
| Wissen | `/wissen` | Knowledge base |
| Benachrichtigungen | `/benachrichtigungen` | Owner/manager: the company-wide notification center (below). Staff/field: their personal inbox. Entry: the bell and Strg+K, no sidebar entry |
| Einstellungen | `/einstellungen` | Users & roles, legal parameters, company settings |

Modules whose data arrives in a later milestone exist from M1 as routes with a "coming soon" page, so the sidebar never
leads nowhere.

### Board views (across events, decision 2026-10-22)
- **Bereitschaft** (default, `/board`): one row per upcoming market (running ones included), by date. Columns: market (colour marker, links to its Überblick) · date and "in N Tagen" · progress bar and x/y · **Fehlt** (chips, worst first, only non-zero: überfällig, Genehmigungen fehlen, Kernaufgaben offen; "Im Plan" when none) · **Nächste Frist** (opens the task drawer). Attention is status colour + icon + text in the chips, never a row background; a missing permit turns critical within 14 days of the first day. The category chips sit behind a **Filter** button (closed by default, the active category reads out next to it; Team and Finanzen are not offered while those modules are hidden). On phones every row stacks, so "Fehlt" stays visible.
- **Matrix** (`?ansicht=matrix`): the same markets x Kernaufgaben (at most 10 columns, matched by the template item's stable key, title as fallback, in their usual due order). Cell = erledigt / offen / bald fällig (due within 7 days) / überfällig / zurückgestellt / "–" (no such task), always icon + colour + date, with a legend below; every cell with a task opens the drawer (`?aufgabe=`). The market column sticks, the table scrolls sideways inside its container (never the page); long titles wrap to up to three lines with the full title as tooltip.
- **Spalten** (`?ansicht=spalten`): the kanban across markets, cards with the market colour marker next to the market name (linking to its Überblick); no carried-over badge, a small category tag. Columns: **Später · Diese Woche · Überfällig & heute · Erledigt**, each sorted by due date. On the event's own Board tab the tasks due after the last event day sit at the end of "Später" under "Nach der Veranstaltung".
- **Ablauf** (`?ansicht=ablauf`, event Board tab only; decision 2026-10-26): every task of the event in one list, one line
  per task with aligned columns (tick · title with ★ and status when not "offen" · category · due-ness only for
  overdue/today/waiting · date · "…"), grouped by phase relative to the market day: Überfällig & heute, Mehr als 4 / 3–4 /
  2 Wochen vorher, Woche vor dem Markt, Veranstaltungstag(e), Nach dem Markt, Ohne Datum, Erledigt (collapsed). Sticky
  phase headers with date range and count; hairline separators instead of cards. Click/Enter opens the drawer, J/K move,
  E ticks off. On phones category and date move under the title, titles wrap to two lines.
- **Zeitraum** (Bis Sonntag / 14 Tage / Alles) applies to the first day of the market; "Alles" is every upcoming market. The page has no subtitle line; on phones the "Neu" button of the top bar replaces the button next to the filters.

### Übersicht (start screen, one for everyone)
"Zwei Fragen" (decision 2026-10-29, replaces the KPI strip, season strip and the long "Heute fällig" list): the page
answers "is the weekend OK?" and "what is due now?" in one screen (≈ 800 px on desktop).
1. **Date + KW line** and greeting.
2. **Dieses Wochenende** (left from 1024 px, first on phones): per market of the weekend a **verdict** (Im Plan ● ·
   Achtung ▲ · Nicht startklar ■, with the reasons, e.g. "4 überfällig · Genehmigungen ok"), at most **3 blockers**
   (overdue, due today, missing permits; future-dated tasks don't block), "+ N weitere" linking to the market's
   Überblick, and a compact **Nächstes Wochenende** row (on Fri–Sun the following weekend).
3. **Heute & überfällig** (right): the top 5 by the due ranking (`rankDue`: Kernaufgaben first, then the soonest
   market), one-click Erledigt and Zurückstellen with undo, due words from `DueBadge`, and "Alle N in
   Benachrichtigungen". The full list lives in the notification center; "Diese Woche" is no longer on the Übersicht.
4. One calm line for tasks of past markets → Aufräumen (the cleanup drawer lists the titles it will skip).
Rows open the task drawer on the Übersicht itself (`/?aufgabe=<id>`); J/K move, Enter opens.

### Benachrichtigungen (notification center, decision 2026-10-22)
The place where the main user sees, sorts and addresses everything important; later it grows into the inbox (Phase 2).
For **owner and manager** it is **company-wide**: every important item exists **once** (not per assignee) with **one shared
state** (offen · zurückgestellt · erledigt), no team set-up needed. Staff and field logins keep their personal inbox.
- **What is in it:** tasks of current markets that are **overdue** or **due soon** (today and tomorrow, Kernaufgaben three
  days ahead) and **permit deadlines** (apply-by within the permit horizon, a decision due within a week, a granted permit
  that ends before a market that needs it). Not included yet: market confirmations, Pflichten, Fahrzeuge. No email.
- **Header:** "Benachrichtigungen" plus one line that this becomes the inbox later; "Alle als gelesen" on the right.
- **Filter bar** (labelled, URL-driven): **Status** Offen · Zurückgestellt · Erledigt (with counts) · **Art** Alle ·
  Aufgaben · Genehmigungen (counts for the current status) · **Markt** select · **Sortierung** Dringlichkeit (default:
  critical first = overdue Kernaufgaben, then by date) · Neueste. Counts always show what a click gives.
- **List:** open items by urgency are grouped Überfällig · Heute · Diese Woche · Später; other views are one list. Each row:
  kind icon, title (opens the task drawer or the permit), Kernaufgabe star, market with its colour marker, kind and date,
  the due information as colour + icon + text ("185 Tage überfällig"), and **Erledigt** · **Zurückstellen** (Morgen,
  Nächste Woche, Datum wählen) · **Öffnen**. Every change shows an undo toast. J/K move between rows, Enter opens.
- **Erledigt** on a task completes the task itself (tasks service, its own undo) and the notification resolves with it; on a
  permit it only marks the notification done. **Zurückstellen** on a task snoozes the task itself (decision 2026-10-29), so it leaves Übersicht, center and bell together; on a permit it snoozes only the notification.
- **Auto-resolve:** a notification whose subject is resolved (task done/skipped/cancelled/archived, market over, permit
  filed/granted/not required, due date moved) is never shown as open: the query treats it as done at once and the
  deadline sweep writes `done` afterwards. A task snoozed on the Übersicht shows as zurückgestellt until its date.
- **Bell:** unread open count, popover with the five most urgent open items (quick Erledigt) and "Alle anzeigen".

### Kalender (module)
- **Views:** Monat (with KW column) and **"Liste · 6 Wochen"**. Veranstaltungen keeps its own Liste/Kalender toggle;
  the Kalender module is the company-wide view across modules.
- **Layer panel ("Ebenen"):** collapsed behind an "Ebenen" button (state remembered, cookie `mw_kal_ebenen`).
  *Veranstaltungen* by type (Flohmarkt, Antikmarkt, Stadtfest, Food & Wine); *Fristen*: Genehmigungen, Raten &
  Zahlungen, Aufgaben, Fahrzeuge & Pflichten; *Team*: Schichten; *Hintergrund*: Feiertage NRW. Hidden modules' layers
  are not offered. Default: events + permits + obligations on, **Aufgaben off** (those live on the Board).
- **Presets:** two, "Märkte" and "Märkte + Fristen" (= the default). **Narrowing:** "Nur Achtung und Kritisch", Ort
  ("Nur meine Zuständigkeit" returns with Team).
- **Entries:** month chips show the full market name (up to two lines) with the market colour bar; every event
  chip and list row links to the event's Überblick (`/veranstaltungen/<id>`).
- The layer selection is **saved per person** (`user_preference.saved_views`).
- Weekend marker **⚑** when a weekend has 4 or more events (the weekend cap).
- **Rollout:** M1 ships the Veranstaltungen and Feiertage NRW layers; the other layers appear as their modules land
  (Aufgaben M2, Genehmigungen M3, Arbeitszeiten & Abschluss and Schichten M4, Raten & Zahlungen M5, Fahrzeuge &
  Pflichten M6).

## 6. Interaction patterns

**Overlays:** when to use Vorschau, drawer, page or modal is in §4.

**Tables and lists:** resource name + count in the heading; row actions on hover/selection; bulk actions bar;
sticky header; column chooser; saved filters ("Ansichten") per list and per person (`user_preference.saved_views`);
Excel paste into grids (templates, hours).

**States:** skeletons shaped like the content; empty states that teach ("Noch keine Genehmigungen für diesen
Ort – aus Vorlage anlegen"); filtered-empty ("Keine Treffer – Filter zurücksetzen"); errors with retry and no data loss.

**Feedback:** optimistic + undo toast (5–8 s) for assign, move, tick off, mark paid. Money stays visibly
"wird gespeichert…" until the server confirms.

**Keyboard map (core):** Strg+K search/commands · `/` filter in list · J/K up/down · Space Vorschau · Enter open ·
Esc close Vorschau/drawer · `C` create ("+ Neu") · `A` assign · `S` status · `X` done · Ctrl+Z undo last action ·
`?` shortcut overview. Ctrl/⌘+click (new browser tab) is never overridden.

**Drag alternatives (2.5.7):** cards and rows have a focusable handle and a "⋯" menu with *Zuweisen an…*,
*Verschieben nach…*; keyboard lift with Space, move with arrows, drop with Space, Esc cancels; screen-reader
announcements in German via `aria-live`.

## 7. Status vocabulary (fixed, everywhere)

| Domain | States (DE) | Colour + icon |
|---|---|---|
| Tasks | Offen · In Arbeit · Wartet (Amt/Extern) · Blockiert · Erledigt · Übersprungen | grey ○ · blue ◐ · violet ⏸ · amber ⛔ · green ✓ · grey ⤼ |
| Due-ness (all, `DueBadge`) | Heute · Morgen · In 3 Tagen (later: the date) · 3 Tage überfällig / Gestern fällig (weeks after 14 days, months after 59) · Wartet seit 5 Tagen | amber clock · neutral · neutral calendar · red circle-! · neutral hourglass (decision 2026-10-29; "3 T" only in matrix cells) |
| Permits | Fehlt · In Vorbereitung · Beantragt · Genehmigt · Abgelehnt · Läuft ab · Abgelaufen · Nicht nötig | red ! · blue ◐ · violet ⏳ · green ✓ · red ✕ · amber ⚠ · red ⌛ · grey – |
| Money | Geplant · Fällig · Teilweise bezahlt · Bezahlt · Überfällig | grey · amber · amber ◐ · green ✓ · red ! |
| Hours | OK · Grenze nah · Über Grenze (zulässig?) · Unzulässig | green · amber · amber ⚠ · red ⛔ |
| Health | Im Plan · Achtung · Kritisch | green ● · amber ▲ · red ■ (shape differs, too) |
| Events (lifecycle) | Entwurf (manual only) · geplant (start state of every new event) · bestätigt (automatic once all required permits are granted) · läuft · abgeschlossen · abgesagt; from M10 also abgerechnet (`closed`, after financial close-out) | label badge; health shown separately (● ▲ ■) |

## 8. Content & language

- **Form of address:** neutral wording wherever possible ("Aufgabe zuweisen", "Keine Aufgaben fällig"); where an
  address is needed, **"du"**. Vendor-facing documents and emails: **"Sie"**.
- **Formats** (`Intl`, `de-DE`): `16.05.2026`, short `Sa 16.05.`, `14:30 Uhr`, `1.234,56 €`, lengths `4,50 m`,
  **calendar weeks** ("KW 20"), weeks start Monday, NRW public holidays marked in calendars.
- **Terms** from the [glossary](./glossary.md); never "Kunde".
- **Long compounds** ("Halteverbotsgenehmigung") wrap with `hyphens: auto` / `&shy;`; truncated text always has a tooltip.

## 9. Visual system

Source of truth: [`apps/web/src/app/globals.css`](../../apps/web/src/app/globals.css) (tokens extracted from the Claude
Design prototype; change colours there only). Component-by-component mapping to code and Base UI primitives:
[`docs/design/component-inventory.md`](../design/component-inventory.md).

- **Themes:** `<html data-theme="light|dark|system">`, stored in `user_preference` and mirrored in the `mw_theme` cookie so the server renders the right
  attribute (profile menu → Design: System / Hell / Dunkel; default light). Every colour token is a `light-dark()` pair, so the
  three modes share one definition and `color-scheme` picks the side; Tailwind's `dark:` variant follows `data-theme`
  (and `prefers-color-scheme` when `system`). A high-contrast light theme for outdoor field use comes in Phase 3.
- **Density:** `<html data-density="standard|compact">` (`mw_density` cookie; profile menu → Dichte). *Standard* (default): `--row-h` 40 px
  table rows, `--cell-y` 8 px, `--control-h` 36 px, body 14 px (`--fs-body`), small 13 px, tiny 12 px, labels above
  fields. *Kompakt*: 32 px rows, 4 px cell padding, 30 px controls, 13 / 12 / 11.5 px, labels beside fields (the
  label layout is still to be built; see the inventory). 4 px spacing grid. Running text max ~70 characters per line.
- **Tokens** (CSS variables in `:root`, exposed to Tailwind through `@theme inline` under the same names):
  - surfaces: `--background` (`#F7F6F3` light / `#141412` dark, warm neutral), `--card` (white), `--surface-2`,
    `--sunken`, `--popover`, `--sidebar`; text: `--foreground`, `--foreground-2`, `--muted-foreground`,
    `--faint-foreground`; lines: `--border`, `--border-subtle`, `--input`; states: `--hover`, `--selected`, `--ring`;
    overlays: `--scrim`, `--toast`;
  - **one accent:** teal `--primary` `#0E5A62` (light) / `#5DB7BE` (dark), with `--primary-hover`,
    `--primary-foreground` and the soft pair `--accent-soft` / `--accent-soft-foreground`;
  - **status:** `--status-ok`, `-warn`, `-critical`, `-neutral`, `-info`, `-waiting` (violet: Wartet, Beantragt,
    geplant). Each has three values: text (`--status-ok`), badge surface (`--status-ok-bg`), dot/bar/icon
    (`--status-ok-dot`). `--destructive` is the critical dot colour. Prototype names: ok/warn/crit/neut/info/vio;
  - **event types** (muted identity colours, never status): `--type-flea`, `--type-antique`, `--type-city-festival`,
    `--type-food-wine`, each with a `-bg` surface (prototype: floh/antik/stadt/food);
  - **radii** 4 / 6 / 8 / 12 / 14 px (`rounded-sm` … `rounded-2xl`: square markers and kbd · small buttons and tags ·
    buttons and inputs · panels, Vorschau, toast · command palette); **shadows** `--shadow-card`, `--shadow-pop`,
    `--shadow-overlay`.
- **Typography:** **Inter** (variable), self-hosted via the `@fontsource-variable/inter` npm package (no request to
  Google at runtime); `.tabular` (`font-variant-numeric: tabular-nums`) for money, hours, dates and counts; hyphenation
  on. Monospace: the system `ui-monospace` stack, only for keyboard hints (kbd). Sizes through `text-body`,
  `text-small`, `text-tiny` so they follow the density; page title 22 px, panel title 15 px.
- **Motion:** `prefers-reduced-motion` shortens all transitions and animations to ~0.
- **Components** (hand-written in the shadcn/ui shape, behaviour from Base UI where a primitive exists: `Dialog`
  for the command palette and side sheet, `Menu` for the profile menu): sidebar, top bar with search field + "+ Neu",
  breadcrumb, Vorschau card, drawer, tabs with counts/health, KPI strip, season strip, data table, kanban card, people
  rail with load bars, status badge, health indicator, filter chips with counts, modal, side sheet with stepper, toast
  with undo, command palette, calendar (month/list) with layer panel, calendar multi-select, timeline ruler, matrix
  cell, month-close stepper, banner, empty state, skeleton. Inventory with the prototype anchor, implementation file,
  backing primitive and milestone of each:
  [`docs/design/component-inventory.md`](../design/component-inventory.md).

## 10. Accessibility & quality bar
WCAG 2.2 AA from the start (internal tools are likely outside the EAA/BFSG, but the Phase 4 vendor booking form isn't,
and components are shared). Focus visible everywhere, logical tab order per page; focus moves into an opened
Vorschau/drawer and returns to the originating row on close; every icon button labelled, contrast checked in both
themes, reduced-motion respected.

## 11. Rollout (change management)
1. Sandbox with synthetic data; the office manager tries Übersicht + board first; the owner starts on Übersicht.
2. Excel-like grids and printable views (day sheet, hours list) keep paper habits working.
3. One short first-run hint per concept (Vorschau with Space, Strg+K, Kompakt), shown once, dismissible.
