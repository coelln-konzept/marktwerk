# UX concept

**Version 1 (2026-10-21).** Designed from scratch on the basis of [research 09](../research/09-ui-ux-workspace.md)
(standards, references, workspace patterns), the client meeting ([research 05](../research/05-client-meeting-2026-10.md))
and the product owner's decisions of 2026-10-21 (decisions log in [open-questions.md](../open-questions.md)).
Architecture: [ADR 0018](../architecture/adr/0018-workspace-architecture.md). Wireframes: [wireframes.md](./wireframes.md).

## 1. Design principles

1. **Familiar first, powerful second.** The default screen must work for someone who never customises
   anything (most users don't). Customisation is a layer for the people who want it, never a prerequisite.
2. **Nothing hidden.** Every module is reachable from the labelled sidebar. Workspaces and ⌘K are accelerators,
   not the only path (client: "don't hide existing functions").
3. **Their words, their mental models.** Vorlage → Termine (like the old PHP admin), calendar weeks (KW),
   Platzkarte, Logbuch, Raten. Excel-like grids where they use Excel today. Printable views where they print today.
4. **One view, many places.** Every view (board, event, logbook…) is a single implementation that works as a
   full page with its own link *and* as a pane in a workspace.
5. **Undo over "Sind Sie sicher?".** Optimistic actions with an undo toast. Confirm only what can't be undone, and name
   the consequence in the button ("Monat März abschließen").
6. **Status is colour + icon + text.** Never colour alone. One vocabulary across all modules.
7. **Warn while typing, not after saving.** Minijob limits, §17 deadlines, double-booked locations show inline.
8. **Every drag has a click path.** Assigning, moving cards, docking panes: always also via menu and keyboard
   (WCAG 2.2 · 2.5.7).
9. **German-first layout.** Labels are ~30% longer (short labels up to 2×). No fixed-width buttons or tabs;
   hyphenation on; test every screen in German first.

## 2. Information architecture

```
marktwerk
├── Start                     ← default workspace ("Heute fällig" + next weekend)
├── Board                     ← tasks across events (kanban, my tasks, workload)
├── Veranstaltungen           ← list · calendar · "aus Vorlage erzeugen"
│   └── Veranstaltung         ← tabs: Überblick · Board · Genehmigungen · Team · Geld · Dokumente · Notizen · Verlauf
├── Logbuch                   ← permit matrix (locations × permit types) · application timeline
├── Team                      ← hours month grid · shifts per event · month close
├── Finanzen                  ← payables & instalments · receipts · event money overview
├── Firma                     ← obligations · vehicles · insurances · company documents
├── Händler                   ← vendor list (read-only import in Phase 1)
├── Vorlagen                  ← event presets · timeline templates · workspace templates
├── Wissen                    ← knowledge base
└── (bottom) Benachrichtigungen · Einstellungen · Profil (Sprache, Theme, Dichte)
   Phase 2 (shown disabled): Buchungen · Postfach · Inventar
```

## 3. App shell

```
┌ Sidebar ┬ Top bar: [🔍 Suchen… ⌘K]  [Start] [Genehmigungen ×] [Geld ×] [+]   🔔 3   Profil ┐
│ labelled│────────────────────────────────────────────────────────────────────────────────┤
│ modules │  Workspace area: 1–3 pane groups, each with tabs                               │
│ (collap-│                                                                                │
│ sible)  │                                                                                │
└─────────┴────────────────────────────────────────────────────────────────────────────────┘
```
- **Sidebar** (240 px, collapsible to 56 px icons): modules with text labels. Below the modules sit **favourites**
  (pinned views and workspaces), then Phase 2 modules disabled. Clicking a module opens its view in the
  **focused pane** (Shift+click: to the side).
- **Top bar:** visible search field (opens ⌘K), the **workspace tabs** (open workspaces, like browser tabs; `+`
  opens the workspace menu), notification bell, profile menu.
- **Workspace area:** the docked panes.

## 4. Workspace model (decided)

| Topic | Decision |
|---|---|
| Layout freedom | **Docking**: drag a view's tab into another group or onto an edge to split. **Max 3 visible groups.** Maximise a pane; no floating windows; popout deferred. Second screen = second browser window with its own workspace. |
| Defaults | **One default workspace for everyone: "Start".** Ready-made **team templates** exist (seeded: Genehmigungen, Geld, Wochenende, Bürotag) for anyone to copy. |
| Ownership | **Personal workspaces + team templates.** Owner/manager publish templates; using one creates a personal copy. Templates are never live-linked. |
| Saving | **Autosave + named saves.** The current arrangement is remembered automatically. Explicit actions: *Speichern*, *Als neuen Arbeitsbereich speichern…*, *Auf gespeicherten Stand zurücksetzen*, *Start wiederherstellen*. *Layout sperren* toggle. Layout undo via toast after every docking move. Max ~8 named workspaces per user. |
| Linking | **"Folgt"**: a pane opened from a list follows that list's selection. Chain icon in the pane header; click to unlink. |
| Pages vs panes | **Both.** Every view is a page at its own URL and a pane. "Link kopieren" / "Als Seite öffnen" in every pane menu. |
| Small screens | ≥1440 px: up to 3 groups · 1024–1439 px: up to 2 · <1024 px: one pane with a "Bereiche" switcher. Phones: single-column pages; field crew never see workspaces (they get magic-link pages in Phase 2). |

### The default workspace "Start"
Two groups: **left (≈60%) "Heute fällig"** (ranked list across tasks, permits, instalments, missing hours, rentals,
with filter chips), **right (≈40%) "Nächstes Wochenende"** (the coming events with health). Clicking an item on the
left opens it as a tab in the right group, which follows the list. Everybody starts here; the owner can stay here.

### Seeded team templates (copy to use)
| Template | Left | Right |
|---|---|---|
| **Bürotag** | Heute fällig | Board (all events, swimlanes by person) |
| **Genehmigungen** | Logbuch (matrix) | Veranstaltung · Genehmigungen tab (follows) |
| **Geld** | Finanzen · Zahlungen | Veranstaltung · Geld tab (follows) |
| **Wochenende** | Veranstaltungen (next weekend filter) | Veranstaltung · Board (follows) + Team · Schichten tab |

### Opening things
| Action | Mouse | Keyboard |
|---|---|---|
| Open in focused pane | click | Enter |
| **Open to the side** | hover icon "Rechts daneben öffnen" / context menu / **Shift+click** | Shift+Enter |
| **Peek** (quick preview without opening a pane) | peek icon on row | Space (hold = temporary) |
| New browser tab | Ctrl/⌘+click (browser-native, never overridden) | — |
| Move pane / split | drag tab onto edge or group | pane menu "Nach rechts verschieben…", Ctrl+M (keyboard docking), F6 cycles groups |
| Maximise / restore pane | double-click tab | Ctrl+Shift+Enter |

### Pane header
`[icon] Title · context (e.g. "So 07.06. · Altstadt")   [⛓ folgt: Veranstaltungen]   [⤢ maximise] [⋯ menu] [×]`
Menu: Link kopieren · Als Seite öffnen · Nach rechts/links/unten verschieben · Verknüpfung lösen · Schließen.

## 5. View catalogue (Phase 1)

Each view = one panel type in the registry (ADR 0018). "Min width" drives auto-collapse.

| View | Route | Purpose | Min width | Typical neighbour |
|---|---|---|---|---|
| Heute fällig | `/` (Start) | Ranked due items, filter chips, one primary action per row | 420 | Nächstes Wochenende / any record |
| Nächstes Wochenende | `/wochenende` | Events of the coming weekend with health | 360 | Event |
| Board | `/board` | Kanban across events, people rail, swimlanes, workload | 640 | Task detail (peek) |
| Veranstaltungen | `/veranstaltungen` | List / calendar of events, generate from preset | 480 | Event |
| Veranstaltung | `/veranstaltungen/[id]` | Event with tabs (Überblick, Board, Genehmigungen, Team, Geld, Dokumente, Notizen, Verlauf) | 560 | List / Logbuch |
| Logbuch | `/logbuch` | Permit matrix + application timeline | 640 | Event · Genehmigungen |
| Genehmigung | `/genehmigungen/[id]` | One permit (documents, conditions, fees) | 420 | Logbuch |
| Team · Stunden | `/team` | Month grid hours, remaining allowance, month close | 720 | Person |
| Person | `/team/[id]` | Contract, hours history, shifts | 420 | Team |
| Finanzen · Zahlungen | `/finanzen` | Payables with instalments, receipts | 560 | Event · Geld |
| Firma | `/firma` | Obligations, vehicles | 480 | Vehicle |
| Händler | `/haendler` | Vendor list (read-only) | 480 | Vendor |
| Vorlagen | `/vorlagen` | Presets, timeline templates, workspace templates | 560 | Template editor |
| Vorlage (Ablauf) | `/vorlagen/ablauf/[id]` | Timeline template editor (grid + ruler) | 720 | — (often maximised) |
| Wissen | `/wissen` | Knowledge base | 480 | Article |
| Benachrichtigungen | `/benachrichtigungen` | Grouped notifications | 360 | any record |

## 6. Interaction patterns

**Overlays (when to use what)**
- **Modal:** ≤ 8 fields, quick creation (new task, new contact), or confirming something irreversible.
- **Peek / side sheet:** look at or lightly edit a record while staying in the list.
- **Pane / page:** records and work surfaces (event, template, month close).
- Never put a form someone might abandon halfway into a modal.

**Tables and lists:** resource name + count in the heading; row actions on hover/selection; bulk actions bar;
sticky header; column chooser; saved filters ("Ansichten") per list; Excel paste into grids (templates, hours).

**States:** skeletons shaped like the content; empty states that teach ("Noch keine Genehmigungen für diesen
Ort – aus Vorlage anlegen"); filtered-empty ("Keine Treffer – Filter zurücksetzen"); errors with retry and no data loss.

**Feedback:** optimistic + undo toast (5–8 s) for assign, move, tick off, mark paid. Money stays visibly
"wird gespeichert…" until the server confirms.

**Keyboard map (core):** ⌘K search/commands · `/` filter in list · J/K up/down · Space peek · Enter open ·
Shift+Enter open to the side · `C` create · `A` assign · `S` status · `X` done · F6 next pane · Ctrl+M dock pane ·
Ctrl+Z undo last action · `?` shortcut overview.

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

## 8. Content & language

- **Form of address:** neutral wording wherever possible ("Aufgabe zuweisen", "Keine Aufgaben fällig"); where an
  address is needed, **"du"**. Vendor-facing documents and emails: **"Sie"**.
- **Formats** (`Intl`, `de-DE`): `16.05.2026`, short `Sa 16.05.`, `14:30 Uhr`, `1.234,56 €`, lengths `4,50 m`,
  **calendar weeks** ("KW 20"), weeks start Monday, NRW public holidays marked in calendars.
- **Terms** from the [glossary](./glossary.md); never "Kunde".
- **Long compounds** ("Halteverbotsgenehmigung") wrap with `hyphens: auto` / `&shy;`; truncated text always has a tooltip.

## 9. Visual system

- **Themes:** light (default), dark, "System". Tokens in `apps/web/src/app/globals.css`. A high-contrast light
  theme for outdoor field use comes in Phase 3.
- **Density:** *Standard* (default): 40 px table rows, labels above fields, 14 px body. *Kompakt* (per-user switch):
  32 px rows, labels beside fields, 13 px body. 4 px spacing grid. Running text max ~70 characters per line.
- **Colour:** neutral base, one accent, status colours from the tokens `status-ok/warn/critical/info` plus violet for
  "waiting/applied". Event types get muted identity colours (Flohmarkt, Antikmarkt, Stadtfest, Food & Wine).
- **Typography:** Geist Sans / Geist Mono (tabular figures for money, hours, dates in tables).
- **Components** (shadcn/ui on Base UI): sidebar, top bar with workspace tabs, dock pane + pane header,
  data table, kanban card, people rail with load bars, status badge, health dot, filter chips, peek sheet, modal,
  toast with undo, command palette, calendar multi-select, timeline ruler, matrix cell, stepper (month close),
  empty state, skeleton.

## 10. Accessibility & quality bar
WCAG 2.2 AA from the start (internal tools are likely outside the EAA/BFSG, but the Phase 4 vendor booking form isn't,
and components are shared). Focus visible everywhere, logical tab order per pane, F6 between panes, every icon
button labelled, contrast checked in both themes, reduced-motion respected.

## 11. Rollout (change management)
1. Sandbox with synthetic data; the office manager tries the default "Start" + board first.
2. Introduce workspaces to the office manager (power user) via the seeded templates; owner stays on "Start".
3. Excel-like grids and printable views (day sheet, hours list) keep paper habits working.
4. One short first-run hint per concept (split, peek, ⌘K), shown once, dismissible.
