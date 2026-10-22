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
├── Board                     ← across events: Bereitschaft · Matrix · Gruppiert · Spalten
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
├── (hidden for now, `lib/modules.ts`: Team · Finanzen · Benachrichtigungen · Buchungen)
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
- **Top bar:** breadcrumb only below a top-level page (e.g. "Veranstaltungen › Food & Wine Neuss"; on a top-level
  page it would repeat the H1, so it is left out), the visible search field "Suchen oder Befehl …" with Strg+K hint
  (opens the command palette), **"+ Neu"** (shortcut `C`; context-aware: new task on a board, new event in
  Veranstaltungen…) and, once notifications are back, the bell with count.
- **Content:** one page. Vorschau and drawers open over it (§4).
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

**Event page tabs:** Überblick · Board · Genehmigungen · Team · Geld · Dokumente · Notizen · Verlauf. Each tab label
shows its count or health (e.g. "Genehmigungen 4/5 ▲", "Team 5/6").

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
| Board | `/board` | Views in the "Ansicht" control (`?ansicht=`): **Bereitschaft** (default), **Matrix**, Gruppiert (`gruppiert`), Spalten (kanban); Nach Person and Arbeitslast return with the team module. See "Board views" below |
| Aufgabe | drawer `?aufgabe=<id>` on `/board` and `/veranstaltungen/[id]/board` (M2; `?detail=task:<id>` also opens it) | Description, check items, evidence, optional completion note, snooze ("Zurückstellen"), activity, status incl. "Wartet · Amt" (no comments, client decision 2026-10-22) |
| Veranstaltungen | `/veranstaltungen` | Liste / Kalender toggle (KW column), type filter chips, Vorschau `?vorschau=<id>`, one primary button **"Markt planen"** (3-step side sheet: pick a market, dates, preview) via `?erzeugen=1[&vorlage=<presetId>]`; a single date without a market is "+ Neu → Einzeltermin" (`/veranstaltungen/neu`) |
| Veranstaltung | `/veranstaltungen/[id]` | Event, tab Überblick; the other tabs are sub-paths: `/board`, `/genehmigungen`, `/team`, `/geld`, `/dokumente`, `/notizen`, `/verlauf` (e.g. `/veranstaltungen/[id]/board`) |
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
| Benachrichtigungen | `/benachrichtigungen` | Grouped notifications |
| Einstellungen | `/einstellungen` | Users & roles, legal parameters, company settings |

Modules whose data arrives in a later milestone exist from M1 as routes with a "coming soon" page, so the sidebar never
leads nowhere.

### Board views (across events, decision 2026-10-22)
- **Bereitschaft** (default, `/board`): one row per upcoming market (running ones included), by date. Columns: market (colour marker, links to its Board tab) · date and "in N Tagen" · progress bar and x/y · **Fehlt** (chips, worst first, only non-zero: überfällig, Genehmigungen fehlen, Kernaufgaben offen; "Im Plan" when none) · **Nächste Frist** (opens the task drawer). Attention is status colour + icon + text in the chips, never a row background; a missing permit turns critical within 14 days of the first day. Category chips narrow the task counts.
- **Matrix** (`?ansicht=matrix`): the same markets x Kernaufgaben (at most 10 columns, matched by the template item's stable key, title as fallback, in their usual due order). Cell = erledigt / offen / bald fällig (due within 7 days) / überfällig / zurückgestellt / "–" (no such task), always icon + colour + date, with a legend below; every cell with a task opens the drawer (`?aufgabe=`). The market column sticks, the table scrolls sideways inside its container.
- **Zeitraum** (Bis Sonntag / 14 Tage / Alles) applies to the first day of the market; "Alles" is every upcoming market. Gruppiert and Spalten keep their own behaviour.

### Übersicht (start screen, one for everyone)
Top to bottom, no fixed master-detail layout:
1. **Date + KW line** and greeting "Guten Morgen, <Vorname>".
2. **KPI strip:** Fällig bis Sonntag · Überfällig · Geld überfällig · Dieses Wochenende ("2 von 4 im Plan").
3. **Season strip** (the owner's view of the year): "Saison 2026 · Mär–Nov · 46 Veranstaltungen" with counts per
   event type · 3.410 h geschätzter Aufwand · Platzteam 2.380 h Bedarf · 1.170 h Kapazität · hiring signal
   "≈ 3,1 Minijobber/Monat zusätzlich". Figures come from task estimates (M2) and contracts (M4); before that the strip
   shows what exists (event counts).
4. **Heute fällig:** groups Überfällig · Heute · Diese Woche; filter chips Alle · Geld · Genehmigungen · Stunden ·
   Aufgaben with counts; **one primary action per row** (Bezahlt, Erfassen, Erledigt, Öffnen); Space = Vorschau,
   row actions open the matching drawer.
5. **Dieses Wochenende:** table of the coming events with columns Genehmigungen · Aufgaben · Team · Geld · Aufwand,
   each with health ● ▲ ■, plus a list **"Was das Wochenende aufhält"** (the blocking items, each linking to its drawer).

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
| Due-ness (all) | Fällig in n T · Heute · Überfällig · ↻n übertragen | neutral · amber · red · amber badge |
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
