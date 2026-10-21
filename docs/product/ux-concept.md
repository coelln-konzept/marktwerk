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
   Shortcuts, ⌘K, saved filters and *Kompakt* are layers for the people who want them, never a prerequisite.
2. **Nothing hidden.** Every module is reachable from the labelled sidebar, always in the same place. ⌘K and
   keyboard shortcuts are accelerators, not the only path (client: "don't hide existing functions").
3. **Their words, their mental models.** Vorlage → Termine (like the old PHP admin), calendar weeks (KW),
   Platzkarte, Logbuch, Raten. Excel-like grids where they use Excel today. Printable views where they print today.
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
├── Übersicht                 ← start screen for everyone (KPIs, season, Heute fällig, Nächstes Wochenende)
├── Kalender                  ← company-wide calendar with layers (events, deadlines, shifts, holidays)
├── Board                     ← tasks across events (kanban, nach Person, Arbeitslast)
├── Veranstaltungen           ← list · calendar · "Aus Vorlage erzeugen"
│   └── Veranstaltung         ← tabs: Überblick · Board · Genehmigungen · Team · Geld · Dokumente · Notizen · Verlauf
├── Logbuch                   ← permit matrix (locations × permit types) · Zeitstrahl
├── Team                      ← hours month grid · shifts per event · month close
├── Finanzen                  ← payables & instalments · receipts · event money overview
├── Firma                     ← obligations · vehicles · insurances · company documents
├── Händler                   ← vendor list (read-only import in Phase 1)
├── Vorlagen                  ← event presets · timeline templates
├── Wissen                    ← knowledge base
├── Benachrichtigungen · Einstellungen
├── SPÄTER (disabled, "Phase 2"): Buchungen · Postfach · Inventar
└── (bottom) Profil: Sprache · Design (System/Hell/Dunkel) · Dichte (Standard/Kompakt) · Abmelden
```

## 3. App shell

```
┌ Sidebar 232 px ─┬ Top bar: Veranstaltungen › Food & Wine Neuss   [🔍 Suchen oder Befehl … ⌘K]  [+ Neu]  🔔 3 ┐
│ marktwerk       │─────────────────────────────────────────────────────────────────────────────────────────┤
│ Übersicht       │                                                                                         │
│ Kalender        │  Page (own URL)                                         ┌ Vorschau ───────┐             │
│ Board           │                                                         │ card, top right │             │
│ Veranstaltungen │                                                         └─────────────────┘             │
│ Logbuch      7  │                                                                  ┌ Drawer (right) ─────┐│
│ …               │                                                                  │ real work           ││
│ SPÄTER          │                                                                  │                     ││
│ Profil ▾        │                                                                  └─────────────────────┘│
└─────────────────┴─────────────────────────────────────────────────────────────────────────────────────────┘
```
- **Sidebar** (232 px, collapsible to an icon rail; `user_preference.sidebar_collapsed`): logo "marktwerk", then
  Übersicht · Kalender · Board · Veranstaltungen · Logbuch (badge count) · Team · Finanzen (badge) · Firma · Händler ·
  Vorlagen · Wissen · Benachrichtigungen (count) · Einstellungen. Group **SPÄTER**: Buchungen · Postfach · Inventar,
  disabled with the hint "Phase 2". At the bottom the **profile** (name, role, current theme); it opens the profile menu
  with Sprache, Design (System / Hell / Dunkel), Dichte (Standard / Kompakt) and Abmelden.
- **Top bar:** breadcrumb (e.g. "Veranstaltungen › Food & Wine Neuss"), the visible search field "Suchen oder
  Befehl …" with ⌘K hint (opens the command palette), **"+ Neu"** (shortcut `C`; context-aware: new task on a board,
  new event in Veranstaltungen…), notification bell with count.
- **Content:** one page. Vorschau and drawers open over it (§4).
- **Below 1024 px** the sidebar collapses to icons, then to a hamburger menu; pages go single-column. Staff/shift
  screens have a **390 px mobile variant** (Team · Schichten); field crew get magic-link pages in Phase 2.

## 4. Pages, preview and drawers

| Surface | Use for | Behaviour |
|---|---|---|
| **Page** | Modules and records that are work surfaces: event (with tabs), template editor, month close, Logbuch | Own URL, breadcrumb, browser back/forward |
| **Vorschau** (quick preview) | Looking at a record from any list without leaving it: key facts, health, next deadlines | Small card/sheet top right; 👁 icon on the row or **Space**; **Enter** opens the page, **Esc** closes; read-only apart from one primary action |
| **Detail drawer** | Real work on one record while the list stays visible: task, permit, payable/instalment, shift | Slides in from the right; full editing, comments, activity; Esc closes |
| **Modal** | ≤ 8 fields, quick creation (new task, new contact) or confirming something irreversible | Centered; never for a form someone might abandon halfway |
| **Side sheet (stepper)** | Multi-step flows that need the page behind them: "Aus Vorlage erzeugen" (3 steps), "Auf Veranstaltungen anwenden…" | Wide sheet from the right with steps |

**Event page tabs:** Überblick · Board · Genehmigungen · Team · Geld · Dokumente · Notizen · Verlauf. Each tab label
shows its count or health (e.g. "Genehmigungen 4/5 ▲", "Team 5/6").

### Opening things
| Action | Mouse | Keyboard |
|---|---|---|
| Open (page) | click on the row | Enter |
| **Vorschau** | 👁 icon on the row | Space |
| Open in a new browser tab | Ctrl/⌘+click (browser-native, never overridden) | — |
| Open the drawer for a row | row action or the item's primary link (e.g. task title on a board card) | Enter on a card |
| Close Vorschau / drawer | × or click outside (Vorschau only) | Esc (focus returns to the row) |

### Linkable overlays (implementation detail, ADR 0019)
Vorschau and drawers are addressed by search params on the current page, e.g. `?vorschau=event:<id>` or
`?detail=task:<id>`. A copied link reopens the same page with the same overlay; browser back closes it. Pages read the
param on the server and render the overlay with the page, so a hard refresh keeps it. Param names are settled
when the shell is built.

## 5. View catalogue (Phase 1)

Every view is a route-level page; drawers are listed where a record usually opens as a drawer instead of a page.

| View | Route | Purpose |
|---|---|---|
| Übersicht | `/` | Start screen for everyone: KPI strip, season strip, Heute fällig, Nächstes Wochenende (below) |
| Kalender | `/kalender` | Company-wide calendar with layers (below) |
| Board | `/board` | Kanban across events, people rail, Nach Person, Arbeitslast toggle |
| Aufgabe | drawer `?detail=task:<id>` | Description, check items, evidence, comments with @mention, activity, status incl. "Wartet · Amt" |
| Veranstaltungen | `/veranstaltungen` | Liste / Kalender toggle (KW column), filters, "Aus Vorlage erzeugen" (3-step side sheet) |
| Veranstaltung | `/veranstaltungen/[id]` | Event with tabs (Überblick, Board, Genehmigungen, Team, Geld, Dokumente, Notizen, Verlauf); tabs as sub-paths (proposed, e.g. `…/[id]/board`) |
| Logbuch | `/logbuch` | Permit matrix (locations × permit types) + Zeitstrahl toggle; cells open the permit drawer |
| Genehmigung | `/genehmigungen/[id]`, drawer `?detail=permit:<id>` | One permit (documents, conditions, fees) |
| Team · Stunden | `/team` | Month grid hours, remaining allowance, month-close stepper; Schichten je Veranstaltung |
| Person | `/team/[id]` | Contract, hours history, shifts |
| Finanzen · Zahlungen | `/finanzen` | Payables with inline instalments, receipts; drawer `?detail=payable:<id>` |
| Firma | `/firma` | Obligations, vehicles, insurances, documents |
| Händler | `/haendler` | Vendor list (read-only) |
| Vorlagen | `/vorlagen` | Event presets, timeline templates |
| Vorlage (Ablauf) | `/vorlagen/ablauf/[id]` | Timeline template editor (Excel-like grid + timeline ruler) |
| Wissen | `/wissen` | Knowledge base |
| Benachrichtigungen | `/benachrichtigungen` | Grouped notifications |
| Einstellungen | `/einstellungen` | Users & roles, legal parameters, company settings |

### Übersicht (start screen, one for everyone)
Top to bottom, no fixed master-detail layout:
1. **Date + KW line** and greeting "Guten Morgen, <Vorname>".
2. **KPI strip:** Fällig bis Sonntag · Überfällig · Geld überfällig · Nächstes Wochenende ("2 von 4 im Plan").
3. **Season strip** (the owner's view of the year): "Saison 2026 · Mär–Nov · 46 Veranstaltungen" with counts per
   event type · 3.410 h geschätzter Aufwand · Platzteam 2.380 h Bedarf · 1.170 h Kapazität · hiring signal
   "≈ 3,1 Minijobber/Monat zusätzlich". Figures come from task estimates (M2) and contracts (M4); before that the strip
   shows what exists (event counts).
4. **Heute fällig:** groups Überfällig · Heute · Diese Woche; filter chips Alle · Geld · Genehmigungen · Stunden ·
   Aufgaben with counts; **one primary action per row** (Bezahlt, Erfassen, Erledigt, Öffnen); Space = Vorschau,
   row actions open the matching drawer.
5. **Nächstes Wochenende:** table of the coming events with columns Genehmigungen · Aufgaben · Team · Geld · Aufwand,
   each with health ● ▲ ■, plus a list **"Was das Wochenende aufhält"** (the blocking items, each linking to its drawer).

### Kalender (module)
- **Views:** Monat (with KW column) and **"Liste · 6 Wochen"**. Veranstaltungen keeps its own Liste/Kalender toggle;
  the Kalender module is the company-wide view across modules.
- **Layer panel ("Ebenen"):** *Veranstaltungen* by type (Flohmarkt, Antikmarkt, Stadtfest, Food & Wine); *Fristen*:
  Genehmigungen, Raten & Zahlungen, Aufgaben, Arbeitszeiten & Abschluss, Rückgaben (Miete), Fahrzeuge & Pflichten;
  *Team*: Schichten; *Hintergrund*: Feiertage NRW.
- **Presets:** Alles · Nur Veranstaltungen · Nur Fristen · Märkte + Genehmigungen. **Narrowing:** "Nur Achtung und
  Kritisch", "Nur meine Zuständigkeit", Ort.
- The layer selection is **saved per person** (`user_preference.saved_views`).
- Weekend marker **⚑** when a weekend has 4 or more events (the weekend cap).
- **Rollout:** M1 ships the Veranstaltungen and Feiertage NRW layers; the other layers appear as their modules land
  (Aufgaben M2, Genehmigungen M3, Arbeitszeiten & Abschluss and Schichten M4, Raten & Zahlungen M5, Fahrzeuge &
  Pflichten M6; Rückgaben (Miete) with rentals in M12).

## 6. Interaction patterns

**Overlays:** when to use Vorschau, drawer, page or modal is in §4.

**Tables and lists:** resource name + count in the heading; row actions on hover/selection; bulk actions bar;
sticky header; column chooser; saved filters ("Ansichten") per list and per person (`user_preference.saved_views`);
Excel paste into grids (templates, hours).

**States:** skeletons shaped like the content; empty states that teach ("Noch keine Genehmigungen für diesen
Ort – aus Vorlage anlegen"); filtered-empty ("Keine Treffer – Filter zurücksetzen"); errors with retry and no data loss.

**Feedback:** optimistic + undo toast (5–8 s) for assign, move, tick off, mark paid. Money stays visibly
"wird gespeichert…" until the server confirms.

**Keyboard map (core):** ⌘K search/commands · `/` filter in list · J/K up/down · Space Vorschau · Enter open ·
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
| Events (lifecycle) | Entwurf · geplant · bestätigt · läuft · abgeschlossen · abgesagt; from M10 also abgerechnet (`closed`, after financial close-out) | label badge; health shown separately (● ▲ ■) |

## 8. Content & language

- **Form of address:** neutral wording wherever possible ("Aufgabe zuweisen", "Keine Aufgaben fällig"); where an
  address is needed, **"du"**. Vendor-facing documents and emails: **"Sie"**.
- **Formats** (`Intl`, `de-DE`): `16.05.2026`, short `Sa 16.05.`, `14:30 Uhr`, `1.234,56 €`, lengths `4,50 m`,
  **calendar weeks** ("KW 20"), weeks start Monday, NRW public holidays marked in calendars.
- **Terms** from the [glossary](./glossary.md); never "Kunde".
- **Long compounds** ("Halteverbotsgenehmigung") wrap with `hyphens: auto` / `&shy;`; truncated text always has a tooltip.

## 9. Visual system

- **Themes:** light (default), dark, "System" (profile menu → Design). A high-contrast light theme for outdoor field
  use comes in Phase 3.
- **Density:** *Standard* (default): 40 px table rows, labels above fields, 14 px body. *Kompakt* (per-user switch):
  32 px rows, labels beside fields, 13 px body. 4 px spacing grid. Running text max ~70 characters per line.
- **Tokens** (in `apps/web/src/app/globals.css`, extracted from the Claude Design prototype):
  - neutral warm base (background `#F7F6F3` light), white cards; dark theme with its own values for every token;
  - **one accent:** teal `#0E5A62` (light) / `#5DB7BE` (dark);
  - **status** ok · warn · critical · neutral · info · waiting/violet (prototype: ok/warn/crit/neut/info/vio), each with
    a foreground, a background and a dot colour;
  - **event-type** identity colours, muted: Flohmarkt · Antikmarkt · Stadtfest · Food & Wine (prototype:
    floh/antik/stadt/food);
  - radii 6 / 8 / 12 px; 4 px spacing grid; density values as above.
- **Typography:** **Inter** (variable), self-hosted via the `@fontsource-variable/inter` npm package (no request to
  Google at runtime); tabular figures for money, hours and dates. Monospace: the system `ui-monospace` stack, only for
  keyboard hints (kbd).
- **Components** (shadcn/ui on Base UI): sidebar, top bar with search field + "+ Neu", breadcrumb, Vorschau card,
  drawer, tabs with counts/health, KPI strip, season strip, data table, kanban card, people rail with load bars,
  status badge, health indicator, filter chips with counts, modal, side sheet with stepper, toast with undo, command
  palette, calendar (month/list) with layer panel, calendar multi-select, timeline ruler, matrix cell, month-close
  stepper, empty state, skeleton. Inventory with the backing primitives:
  [`docs/design/component-inventory.md`](../design/component-inventory.md).

## 10. Accessibility & quality bar
WCAG 2.2 AA from the start (internal tools are likely outside the EAA/BFSG, but the Phase 4 vendor booking form isn't,
and components are shared). Focus visible everywhere, logical tab order per page; focus moves into an opened
Vorschau/drawer and returns to the originating row on close; every icon button labelled, contrast checked in both
themes, reduced-motion respected.

## 11. Rollout (change management)
1. Sandbox with synthetic data; the office manager tries Übersicht + board first; the owner starts on Übersicht.
2. Excel-like grids and printable views (day sheet, hours list) keep paper habits working.
3. One short first-run hint per concept (Vorschau with Space, ⌘K, Kompakt), shown once, dismissible.
