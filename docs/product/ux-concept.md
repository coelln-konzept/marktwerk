# UX concept

**Version 2 (2026-10-21, design direction A: classic screens).** Version 1 described a customisable workspace with
docking panes; the product owner chose classic screens instead ([ADR 0019](../architecture/adr/0019-classic-screens.md),
superseding ADR 0018). Based on [research 09](../research/09-ui-ux-workspace.md) (standards, references), the client
meeting ([research 05](../research/05-client-meeting-2026-10.md)) and the product owner's decisions of 2026-10-21
(decisions log in [open-questions.md](../open-questions.md)). Historical references: the Claude Design prototype in
[`docs/design/claude-design/a-classic/`](../design/claude-design/a-classic/INDEX.md) (53 screens, 2026-10-21) and the
archived [wireframes](../archive/wireframes.md). Where they and this document differ, **this document and the code
win**; the prototype is historical reference only.

## 1. Design principles

1. **Familiar first, powerful second.** Every screen must work for someone who never changes a setting.
   Shortcuts, Strg+K, saved filters and *Kompakt* are layers for the people who want them, never a prerequisite.
2. **Nothing hidden.** Every module is reachable from the labelled sidebar, always in the same place (the less
   frequent ones one click away in the collapsible group "Stammdaten"). Strg+K and keyboard shortcuts are
   accelerators, not the only path (client: "don't hide existing functions").
   *Hidden modules are not a contradiction:* Team, Finanzen, Buchung, Kernaufgaben, the global Board and a few
   other parts are switched off as a whole (`HIDDEN_MODULES` in `apps/web/src/lib/modules.ts`, client feedback
   2026-10-22 and user test 2026-11-03), so they leave no dead entries behind. What is switched on is reachable from
   the sidebar.
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
├── Übersicht                 ← start screen for everyone (Heute & nächste Tage, Dieses Wochenende, Genehmigungen demnächst; no KPI or season strip)
├── (Board)                   ← hidden since 2026-11-03 (`globalBoard`), route answers by URL: Bereitschaft · Spalten
├── Veranstaltungen           ← list · calendar · "Markt planen"
│   └── Veranstaltung         ← tabs: Zusammenfassung · Checkliste · Genehmigungen · Dokumente · Notizen · Verlauf (Team, Geld hidden)
├── Kalender                  ← company-wide calendar, layers behind the "Ebenen" button
├── Genehmigungen             ← permit matrix (locations × permit types) · list; was "Logbuch" (`/genehmigungen`)
├── Stammdaten (collapsible, collapsed by default)
│   ├── Orte                  ← venues with zones/rows and location agreements
│   ├── Kontakte              ← authorities, landowners, suppliers, services
│   ├── Aussteller            ← vendor list (read-only import)
│   ├── Wissen                ← knowledge base (sidebar entry hidden 2026-11, route stays as a placeholder)
│   ├── Archiv                ← past events, documents, activity, old permits (2026-11-03)
│   └── Pflichten             ← recurring obligations · vehicles · defects (`/firma`, page title "Pflichten")
├── (hidden for now, `lib/modules.ts`: Team · Finanzen · Buchungen · Kernaufgaben; Benachrichtigungen has no bell and no sidebar entry since 2026-11: Strg+K, the Übersicht link and its URL)
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
- **Sidebar** (232 px): logo "marktwerk", then **four daily entries**: Übersicht · Veranstaltungen · Kalender ·
  Genehmigungen (UX pass, product owner 2026-10-22; the **Board** entry is hidden since 2026-11-03 behind
  `HIDDEN_MODULES.globalBoard`: every task belongs to an event, so the Übersicht and each event's Checkliste cover it.
  Nothing links to `/board` any more: "+ Neu → Aufgabe" outside an event page and Strg+K "Aufgabe anlegen" open
  the new-task dialog on the Übersicht (`/?neu=1`, event to pick; the task then opens on its event's page), and the
  permit drawer's task links go to the event. The route itself still answers by URL). Team and Finanzen join them when their modules return. The red
  badge on Genehmigungen is the number "Jetzt zu tun" (decision 2026-10-29): permits whose apply-by date has passed
  without an application, or falls within `permit_horizon_days`, plus rejected and expired ones, plus "Antwort
  überfällig" (applied, decision date passed; 2026-11-13); later ones are "noch nicht fällig" and don't count. It is the same number as the focus chip of that name on the Genehmigungen page (one
  rule, core `permitActionTier`). Below, the
  collapsible group **Stammdaten** (Orte · Kontakte · Aussteller · Wissen · Archiv · Pflichten), collapsed by default; the
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
  Veranstaltungen…). "+ Neu" also offers **Besprechung** (CF9-1, right after "Einzeltermin", for everyone with `appointment` write, i.e. the office incl. `staff`; also
  Strg+K "Besprechung anlegen"): a modal dialog mounted in the app layout, so it opens on every page via `?neu=besprechung`
  (`&datum=YYYY-MM-DD` pre-fills the day, `&bearbeiten=<id>` edits an existing Besprechung; closing removes the parameters).
  Fields: Name, Datum, **Ganztägig** (switch, on; off shows Von/Bis), Wo (venue list or "Adresse eingeben …", one of the two),
  Ansprechpartner (search in the contacts, or "Neuer Kontakt …" with Name/Telefon/E-Mail and "Als Kontakt speichern", checked
  by default), Notizen. Errors show in German at the bottom and the focus goes to the wrong field; success toasts "Besprechung
  angelegt" with Rückgängig (archives it) / "Besprechung gespeichert". The **bell** (number of unread open notifications) is hidden since the user test 2026-11 (`HIDDEN_MODULES.notificationBell`).
- **Content:** one page. Vorschau and drawers open over it (§4). **A row or box opens its record when clicked
  anywhere**, not only on its title (event rows → the event Überblick, task rows → the task drawer); links and buttons
  inside it keep their own action, Cmd/Ctrl-click opens a new tab. Checklist icons (event Überblick → Kernaufgaben,
  Übersicht task icons) mark a task done with undo; a done Kernaufgabe's ✓ reopens it.
- **Below 1024 px** the sidebar collapses to icons, then to a hamburger menu; pages go single-column. Staff/shift
  screens have a **390 px mobile variant** (Team · Schichten; hidden with the Team module for now); field crew get magic-link pages in Phase 2.

## 4. Pages, preview and drawers

| Surface | Use for | Behaviour |
|---|---|---|
| **Page** | Modules and records that are work surfaces: event (with tabs), template editor, month close, Genehmigungen | Own URL, breadcrumb, browser back/forward |
| **Vorschau** (quick preview) | Looking at a record from any list without leaving it: key facts, health, next deadlines | Small card/sheet top right; 👁 icon on the row or **Space**; **Enter** opens the page, **Esc** closes; read-only apart from one primary action |
| **Detail drawer** | Real work on one record while the list stays visible: task, permit, payable/instalment, shift | Slides in from the right; full editing and activity (no comments, decision 2026-10-22); Esc closes |
| **Modal** | ≤ 8 fields, quick creation (new task, new contact) or confirming something irreversible | Centered; never for a form someone might abandon halfway |
| **Side sheet (stepper)** | Multi-step flows that need the page behind them: "Markt planen" (3 steps), "Auf Veranstaltungen anwenden…" | Wide sheet from the right with steps |

**Event page header and tabs** (UX pass 2026-10-22: health once, less chrome). Header: title with colour marker, type
tag and the **status chip** (geplant, bestätigt, …), one **"…" menu** at the right (Bearbeiten, Verschieben, Status ändern, and for owner/manager a last, separated, red **Veranstaltung löschen**:
every action stays reachable by keyboard; "abgerechnet" is not offered while finance is hidden; löschen is permanent and the one deliberate exception to "undo toasts over confirmation dialogs": an `alertdialog` asks to type the event's exact name, and shows instead of the input what blocks it, i.e. payments, expenses, shifts or documents, counted incl. archived ones and documents on its tasks, with a hint to cancel instead; afterwards the page returns to the list with a plain toast, no undo; 2026-11-04), then one meta line
(date, times, KW · venue link). There is no separate health indicator in the header (the Überblick status line and "Was
fehlt" carry it), no Buchung menu or chip while booking is hidden, no setup time (it is in Nächste Termine) and no
"Vorlage" (it moved into Eckdaten). Tabs: **Zusammenfassung · Checkliste · Genehmigungen · Mehr ▾** (renamed 2026-11 from Überblick · Board; URLs unchanged); Dokumente, Notizen and Verlauf are
items of the "Mehr" menu and each keeps its own URL (the button is underlined while one is open). Team and Geld return with
their modules. Counts: Checkliste shows the open tasks as text ("29 offen"), with "· ⏱ N überfällig" in red after it when tasks are overdue (no ▲/■; CF9-5), Genehmigungen shows a number only when permits
are missing (a complete "5/5" says nothing). The **Genehmigungen** tab lists the permits without a "Zuständig" column; the
whole row opens the permit. On phones (390 px) nothing overflows: the "…" menu is the only action, tabs scroll inside their
bar, and "Was fehlt" rows put the title on its own line with the due badge and actions below.

**Event Überblick** (decision 2026-10-22: an event is a bundle of to-dos; the page answers "is this market on track, and
what's missing?"). Top to bottom: (1) **status line** with days until the market ("in 12 Tagen", "läuft heute",
"vorbei"), tasks done x/y with a slim bar and permits granted a/b, each piece linking to what it summarises; (2) **Was
fehlt**: open tasks that are overdue, blocked/waiting or due within 7 days (snoozed ones stay out) plus required permits
not yet granted, Kernaufgaben first then by due date, each task row led by the "Erledigt" tick and ending with the snooze menu
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
list page knows which record kind it shows; a Besprechung on the Kalender and the Übersicht is **`?vorschau=besprechung:<id>`**, the Kalender's event popover **`?vorschau=veranstaltung:<id>`**; Team uses **`?person=<id>`**) and, for the generation sheet,
**`?erzeugen=1[&vorlage=<presetId>|&neu=1]`** on `/veranstaltungen` (`neu=1` opens the new-market form). Drawers (from M2) follow the same idea, e.g.
`?detail=task:<id>`. A copied link reopens the same page with the same overlay; closing a Vorschau replaces the URL
(it does not pile up history entries). Pages read the param on the server and render the overlay with the page, so a
hard refresh keeps it.

## 5. View catalogue (Phase 1)

Every view is a route-level page; drawers are listed where a record usually opens as a drawer instead of a page.

| View | Route | Purpose |
|---|---|---|
| Übersicht | `/` | Start screen for everyone: Heute & nächste Tage (main panel), Dieses Wochenende (info box), Genehmigungen demnächst (bottom; no KPI or season strip) |
| Kalender | `/kalender` | Company-wide calendar with layers (below) |
| Board | `/board` (**hidden** since 2026-11-03: no sidebar entry, nothing links here; the route still answers) | Views in the "Ansicht" control (`?ansicht=`): **Bereitschaft** (default), Spalten (kanban); **Matrix** is hidden with the Kernaufgaben (2026-11, an old link falls back to Bereitschaft); Nach Person and Arbeitslast return with the team module; the old `gruppiert` falls back to Bereitschaft. See "Board views" below |
| Aufgabe | drawer `?aufgabe=<id>` on the event's Checkliste (`/veranstaltungen/[id]/board`), its Zusammenfassung and the Übersicht (also on the hidden `/board`; `?detail=task:<id>` also opens it) | Description, check items, evidence, optional completion note, snooze ("Zurückstellen"), activity (a closed disclosure), status: **Erledigt** as a toggle (primary while open; pressed and green with the filled tick while done or skipped, a second click reopens), **Wartet auf Amt** toggle, and the status badge itself ("Status: <badge> ⌄", colour + icon + text) opens a menu with every status (Offen · In Arbeit · Wartet · Blockiert · Übersprungen · Erledigt, the current one ticked); Wartet, Blockiert and Übersprungen ask for a reason as before (HN-04). The carried-over count and the origin of the task are not shown; the "Kernaufgabe" toggle explains itself in one line and the star carries the tooltip "Kernaufgabe – eine Aufgabe, die jeder Markt braucht" (no comments, client decision 2026-10-22). **Benachrichtigung** (CF9-3): one line "Mail · 1 Tag vorher an dich" (Team visible: "… an Anna") with "Ändern" opening the same fields as "Neue Aufgabe" inline (saved through `updateTask`, undo toast): checkboxes Mail / WhatsApp, select "Wann" (Sofort beim Anlegen · Am Fälligkeitstag · 1 Tag vorher · 3 Tage vorher · 1 Woche vorher · Eigenes Datum/Uhrzeit, the relative ones disabled without a due date; custom shows a date-time field read as Berlin time), recipient line "An: dich (<E-Mail>)" while Team is hidden (the signed-in user who sets it, stored as `notify_user_id`; WhatsApp hint "Du hast keine Telefonnummer hinterlegt."), "An: <Zuständig>" once Team is visible (hints for a missing assignee / email / phone from has-flags only, no staff contact data in the browser), and the always-visible note "Versand folgt, sobald Mail und WhatsApp angebunden sind." (nothing is sent yet). "Neue Aufgabe" shows the same fields below the category row |
| Archiv | `/archiv` → `/archiv/veranstaltungen` · `/archiv/dokumente` · `/archiv/aktivitaet` · `/archiv/genehmigungen` | Everything past in one place (decision 2026-11-03), one section per URL behind segmented links. **Vergangene Veranstaltungen**: events whose last day is over, newest first, year select, type chips, search; rows open the event, the eye its Vorschau, and **"Als Vorlage speichern"** (`?vorlage=<eventId>`, template:write) opens the new-market form prefilled from the event (name, type, venue, length, times, prices); the new market's tasks are copied from the event's market (else the master); nothing is saved until confirmed, the event stays as it is. **Dokumente**: every live document the person may read (finance and team ones stay out while those modules are hidden), newest first, search over file name and description, a select for the kind; the file opens via `/api/documents/<id>`, "Gehört zu" opens its event, task, permit, venue or vehicle. **Aktivität** (owner and management, `audit:read`): the audit log in plain words (Zeitpunkt · Wer · Änderung · Betrifft, linked), filter "Bereich". **Alte Genehmigungen**: superseded, not required and run-out permits, searchable; a row opens the permit drawer in place (where "Ersetzt" can be taken back). **Every section shows 50 rows per page** with a pager ("1–50 von 148", ← 1 … 4 5 6 … →, `?seite=`; filters start again at page 1) |
| Veranstaltungen | `/veranstaltungen` | Opens at the **current week**: default filter "Aktuell & kommend" (running and upcoming, all seasons; past ones via the status or season select, `?status=alle`), no Liste/Kalender toggle (the Kalender page covers it; `?ansicht=kalender` redirects there), no health column, "abgerechnet" reads as "vorbei" while finance is hidden. KW column, type filter chips, Vorschau `?vorschau=<id>`, a **round colour dot** (12px) in the market colour before the market name, the name itself in the normal text colour and **no row background** (CF9-4, option C, decision 2026-11-04; the 2026-10-22 "never a background" rule holds); rows without a colour show the type square, cancelled rows keep the dot and are muted; hover, selected and focus are the same as on the other lists, **sortable columns** Datum (default, the only one with month headers) · Veranstaltung · Art · Ort · Status (`?sortierung=name|art|ort|status`, `&richtung=ab`; `aria-sort` on the header), the **Ort as a chip** that filters the list to that venue (`?ort=<id>`, shown as a removable filter), and per row the eye plus the **same "…" menu as the event page** (Bearbeiten incl. **Art** · Verschieben · Status · Veranstaltung löschen for owner/manager; HN-07–09, UT-14), one primary button **"Markt planen"** (3-step side sheet: pick a market, dates, preview) via `?erzeugen=1[&vorlage=<presetId>]`; picked days that follow each other become **one multi-day event** (Sa + So → one two-day event, never shorter than the market's length; a switch "Aufeinanderfolgende Tage zu einer Veranstaltung zusammenfassen", on by default, shows when it changes something; the preview lists one row per event and its × removes all of its days; HN-12, UT-16); in the date calendar (step 2)
public holidays are red with a dot, a **stiller Feiertag** (Karfreitag, Allerheiligen, Volkstrauertag, Totensonntag,
Heiligabend; FeiertG NW §6, §7 Abs. 2) gets an **amber warning badge** with the tooltip "Stiller Feiertag – Märkte meist
nicht erlaubt (5–13 Uhr)", and the **Easter and Whitsun weekends** (Sa–Mo) a quiet blue bar under the day number
(tooltip "Osterwochenende" / "Pfingstwochenende"); the legend lists all three. Nothing blocks the selection: the
preview (step 3) repeats the stiller Feiertag as a warning with its hours and the holiday weekend as a muted line that
does not count as a hint (R23); a single date without a market is "+ Neu → Einzeltermin" (`/veranstaltungen/neu`); **"Neuen Markt anlegen"** in step 1 has an optional **colour picker** (CF9-4, same as the Marktvorlage form), pre-selected with the colour the market would get anyway (the least used one), "Keine Farbe" selectable; every swatch's tooltip and a legend under the row name the active markets already using that colour ("Türkis – genutzt von: Flohmarkt Bilk"), unused colours read "noch frei" |
| Veranstaltung | `/veranstaltungen/[id]` | Event, tab Überblick; the other tabs are sub-paths: `/board`, `/genehmigungen`, `/team`, `/geld`, `/dokumente`, `/notizen`, `/verlauf` (e.g. `/veranstaltungen/[id]/board`); Dokumente, Notizen and Verlauf sit under "Mehr". In the Verlauf a task's newest "Aufgabe erledigt" / "übersprungen" entry has **Wiederherstellen** while the task is still finished (reopens it, undo toast; user test 2026-11, UT-06). Every link to a market opens its Überblick |
| Orte | `/orte` | Venues: Name, Stadt, kommende Termine (zones, rows, capacity, landowner in the Vorschau `?vorschau=<id>`) |
| Ort | `/orte/[id]` | One venue. First two boxes (HN-15): **Veranstaltungen an diesem Ort** (Kommende · Zuletzt, whole rows open the event; "Alle Veranstaltungen →" opens the list filtered to the venue, "Ältere im Archiv →" the Archiv searched by its name) and **Märkte an diesem Ort** (rows open the market's Vorschau in the Bibliothek); then address, zones and rows, location agreements, requirements ("Genehmigungen und Zustimmungen", with the button **"Was braucht dieser Ort?"**, see below) |
| "Was braucht dieser Ort?" | dialog on `/orte/[id]` (`?bedarf=neu`, `?bedarf=art`, `?bedarf=1`); stacked on the Ort quick form | Fahrplan R30 (product owner 2026-11-13). Opens **after an Ort is created** ("Ort anlegen" goes to the new Ort's page with `?bedarf=neu`; the "+ Neu" quick form of every Ort picker, e.g. in "Markt planen" → "Neuen Markt anlegen", opens it in its place, the new Ort already selected) and **after a switch Städtisch ↔ Privat** ("Ort bearbeiten" → `?bedarf=art`); any time from the button in "Genehmigungen und Zustimmungen". Two groups of checkboxes with a one-line hint each: **Genehmigungen** (Marktgenehmigung (Sondernutzung) · Einverständnis des Eigentümers · Festsetzung (§ 69 GewO)) and **Weitere, falls nötig** (Standrohr · PVBT (Halteverbot) · Plakatierung · Toiletten). Pre-ticked from the kind: Städtisch → Marktgenehmigung + Festsetzung, Privat → Einverständnis + Festsetzung, extras unticked; after a switch the other kind's main permit is swapped and the rest the Ort has stays ticked; opened from the button it shows what the Ort has. Everything can be changed; **"Überspringen"** (and ×/Esc) saves nothing. A line in the warning colour names what saving would remove. **"Speichern"** creates the ticked requirements with default titles, rhythm and lead time (core `VENUE_NEED_DEFAULTS`) and removes the unticked ones of these seven types (other requirements stay); undo toast "Rückgängig". Behörde, Gebühr and Antragsfenster are added later on the requirement form. The parameter is dropped once the dialog is open. Shown to roles with permit write + delete (owner, manager) |
| Event › Genehmigungen | `/veranstaltungen/[id]/genehmigungen` | The event's permits, rows open the drawer in place. **"+ Genehmigung anlegen"** adds a permit for this event (venue fixed, season from the event, linked at once, opens in the tab's drawer, undo archives it) and **"+ Aufgabe"** a task of this event in the category Genehmigungen (no C hint: C stays "+ Neu"; the task opens on the Zusammenfassung). Both also in the empty state (HN-16) |
| Genehmigungen | `/genehmigungen` (was `/logbuch`, permanent redirect) | Opens on **Kommend** (permits covering upcoming markets). List sorted by Antrag bis in groups "Jetzt beantragen (bis …)" · "Später beantragen" · "Beantragt und erledigt" (phones open the list), or the matrix (locations × permit types; open cells show "bis dd.mm.", granted cells the coverage "7/7", with a legend); focus chip "Jetzt zu tun"; cells and rows open the permit drawer `?genehmigung=<id>`, whose primary button is the next forward step |
| Genehmigung | drawer `?detail=permit:<id>` (M3); page `/genehmigungen/[id]` planned | One permit (documents, conditions, fees) |
| Team · Stunden | `/team` | Staff list (M1), Vorschau `?person=<id>`; month grid hours, remaining allowance, month-close stepper and Schichten je Veranstaltung from M4 |
| Person | `?person=<id>` on `/team`; page `/team/[id]` planned (M4) | Contract, hours history, shifts |
| Finanzen · Zahlungen | `/finanzen` | Payables with inline instalments, receipts; drawer `?detail=payable:<id>` (M5) |
| Pflichten | `/firma` (sidebar and page title: Pflichten) | Obligations, vehicles, defects (tabs); one filter row, no column prints over another |
| Aussteller | `/aussteller` | Vendor list (read-only): Name, Sortiment, Stadt, Stammaussteller; the rest in the Vorschau. **A–Z selector** (CF9-7, shared with Kontakte): a row "Alle · A B C … Z · #" above the list filters by the first letter of the display name the list sorts by (`?buchstabe=A–Z|#`; Ä→A, Ö→O, Ü→U, É→E, "#" = digits and anything else; leading quotes/brackets are skipped); combines with search and the other filters, drops the page, letters with no entries under the other filters are disabled (not links), the active one has `aria-current` |
| Kontakte | `/kontakte` | Authorities, landowners, suppliers, services (Vorschau `?vorschau=<id>`). The same **A–Z selector** as on Aussteller (`?buchstabe=`; the kind chips' counts follow the letter) |
| Einstellungen → Bibliothek | `/einstellungen/bibliothek` | Grundvorlage (master task template), Märkte (presets with venue, rhythm, own task template, the **Kürzel** small and muted after the name; Vorschau `?vorschau=<id>`), "Weitere Ablaufvorlagen" (collapsed, the old per-type templates). There is no "Vorlagen" sidebar entry; `/vorlagen` redirects here |
| Markt bearbeiten | `/vorlagen/[id]` | The market page: first its **Saison panels** (below, "Saison panel"), then the edit form of the market (preset); the colour picker lists the *other* active markets per colour (legend + tooltips). **Kürzel** (optional, Fahrplan R15) next to Dauer: 1–4 letters or digits, typed letters turn into capitals; empty, the placeholder and the hint show the code derived from the name ("Leer lassen, dann gilt „NW“ aus dem Namen."); a code another active market already has is refused at the field ("Dieses Kürzel hat schon ein anderer aktiver Markt. Bitte ein anderes wählen."). Derived codes: one word → first three letters ("ALT"), several → initials ("KS"), words like "Flohmarkt" and articles skipped, kept apart from every other market's code (core `marketShortCodes`). "Neuen Markt anlegen" sets no Kürzel (the derived one applies). A season task opens the task drawer in place (`?aufgabe=<id>`) |
| Vorlage (Ablauf) | `/vorlagen/ablauf/[id]` | Timeline template editor (Excel-like grid + timeline ruler); used for the Grundvorlage, a market's own template and the other templates, its back link goes to the Bibliothek. **Season rows** (Fahrplan R14, research 13 §6): the item drawer (`?zeile=<key>`) has **"Gilt für: Jeder Termin · Ganze Saison"** (two radio cards) for top-level rows; child rows take their parent's and show no choice (a child of a season row says "Gilt wie die Hauptaufgabe für die ganze Saison."). A season row's anchor is **Saisonbeginn** or **Saisonende** only (an event row never offers them); switching the choice moves an anchor that no longer fits to Saisonbeginn / Veranstaltungstag, and the example reads "Beispiel: Saisonbeginn am … → fällig …". The grid shows a **"Ganze Saison · einmal je Saison"** section (calendar icon) **above** the phase sections: all top-level season rows whatever their phase, each with its children, numbered first; "Fällig" reads e.g. "ca. 8 Monate vorher (T-240)" over "Saisonbeginn". In a draft the section is always there with **"Saison-Aufgabe hinzufügen"** (`?zeile=neu&gilt=saison`); read-only it shows only when the version has season rows. ⋯ → Nach oben/unten moves a season row among the season rows. The timeline ruler plots season rows on their own strips ("Gerechnet ab Saisonbeginn"), first |
| Auf Veranstaltungen anwenden … | `/vorlagen/ablauf/[id]?v=<n>&anwenden=1` | Side sheet with two steps (Wählen → Vorschau), from the published version's bar or the "Version veröffentlicht" toast. Lists upcoming events **and open Saison records** (this year or later, not closed or archived) that have an older checklist of the template or are linked to it through their market; a season without a checklist is listed only when the version has season rows. With seasons present the list has two groups, **"Saisons"** ("Bekommt nur die Aufgaben für die ganze Saison.") above **"Veranstaltungen"**; a season row reads **"<Markt> · Saison 2027"**, "Saisonbeginn 07.03.2027" and its status ("In Planung" / "Termine stehen", colour + icon + text). **Nothing is pre-selected**; "Alle N mit Änderungen wählen" is the one bulk choice, "Nur mit Änderungen" (on) hides targets without changes, search covers both. Step 2 lists per target the new, changed, removed and cancelled rows and what stays (done, edited by hand); the button reads "Auf 1 Veranstaltung und 2 Saisons anwenden". Applying goes through the one propagation path (`applyTemplateVersion`); done, skipped, cancelled and hand-edited tasks are never touched; hand-set due dates and assignees stay |
| Wissen | `/wissen` | Knowledge base. The sidebar entry is hidden for now (2026-11); the route stays as a placeholder |
| Benachrichtigungen | `/benachrichtigungen` | Owner/manager: the company-wide notification center (below). Staff/field: their personal inbox. Entry: Strg+K and the Übersicht link (the bell is hidden since 2026-11), no sidebar entry |
| Einstellungen | `/einstellungen` | Users & roles, legal parameters, company settings |

Modules whose data arrives in a later milestone exist from M1 as routes with a "coming soon" page, so the sidebar never
leads nowhere.

### Market page and its Saison panel (Fahrplan R12, research 13 §6.3)
The market page (`/vorlagen/<id>`, "Markt bearbeiten") opens with one **"Saison <Jahr>"** section per season record,
above the edit form: the current calendar year (Berlin) and the next year's once its record exists (the nightly job
makes it; archived records are left out). Seasons that are not closed come first, by year, closed ones after them
(product owner 2026-11-13: in November a closed 2026 sits below 2027; `orderSeasonPanels`). Each is a `Panel` with
its title outside the card (§6 "Section headings"), the open-task count as `meta` ("3 offen", left out on a closed
season) and the status switch on the right.
- **Status**: "Status: <badge> ⌄" (colour + icon + text, §7: In Planung · Termine stehen · Abgeschlossen) opens a menu
  with all three in the order planning → dates_set → closed, the current one ticked. Every change is allowed
  (`canChangeSeasonStatus`), applies at once and shows an undo toast ("Saison 2027: Termine stehen" · Rückgängig);
  nothing switches by itself. When `suggestedSeasonStatus` has a next step, one line under the start offers it as a
  button: "Die Termine sind angelegt. [Auf „Termine stehen“ setzen]" (planning with dates) or "Der letzte Termin ist
  vorbei und keine Saisonaufgabe ist offen. [Saison abschließen]".
- **Start** (first row of the card): with dates "Erster Termin Sa 27.03.2027 · KW 12" and "7 Termine, letzter am
  So 31.10.2027" (cancelled and archived events do not count); without dates "Erwartet ab So 09.05.2027" with
  "KW 18 · noch keine Termine. Mit dem ersten Termin gilt dessen Datum." and an **"Ändern"** button (decision
  2026-11-13: editable on the market page) that turns the line into a date field with Speichern / Abbrechen (Esc).
  The date must lie in the season's year (the error stays at the field); `season_start` and the open, not overridden
  season tasks move with it; undo toast ("Saison 2027 erwartet ab … · 2 Aufgaben verschoben" · Rückgängig). Once the
  season has dates the field is gone.
- **Tasks**: the season's top-level tasks, open ones first by due date (none last), each row with the shared tick
  (no question first: the row stays and moves to "Erledigt"; a second click reopens; `E` ticks the focused row),
  the title opening the task drawer in place (`?aufgabe=<id>`), the due badge with the date, "Zurückgestellt bis …"
  while snoozed, and the assignee (avatar + name, "Niemand zuständig" muted; shown here although the Team module is
  hidden, since the page's own form sets the market's default duties). Finished tasks (done, skipped) fold into
  "› Erledigt (n)". Empty: "Keine Saisonaufgaben. …"; all done: "Alle Saisonaufgaben erledigt".
- **No record yet** for the current year: the section shows "Noch keine Saison 2026", a one-line explanation and
  **"Saison anlegen"** (primary), which runs `ensureEventSeason` (the one path) and confirms with a plain toast
  ("Saison 2026 angelegt · 3 Aufgaben").
- Rules: `seasonStartInfo`, `canEditExpectedStart`, `expectedStartProblem`, `seasonTaskList`, `orderSeasonPanels` and `nextSeasonStatus` in
  `packages/core/src/events/season.ts`; query `getMarketSeasons`; services `setSeasonStatus` and
  `setSeasonExpectedStart` (`event:write`, audit `season.status` / `season.expected_start`).

### Board views (across events, decision 2026-10-22)
> The global Board (`/board`) is **hidden** since 2026-11-03 (`HIDDEN_MODULES.globalBoard`); Bereitschaft, Matrix and
> Spalten below describe what the route still renders. The event's **Checkliste** is the live view.

- **Bereitschaft** (default, `/board`): one row per upcoming market (running ones included), by date. Columns: market (colour marker, links to its Überblick) · date and "in N Tagen" · progress bar and x/y · **Fehlt** (chips, worst first, only non-zero: überfällig, Genehmigungen fehlen, Kernaufgaben offen; "Im Plan" when none) · **Nächste Frist** (opens the task drawer). Attention is status colour + icon + text in the chips, never a row background; a missing permit turns critical within 14 days of the first day. The category chips sit behind a **Filter** button (closed by default, the active category reads out next to it; Team and Finanzen are not offered while those modules are hidden). On phones every row stacks, so "Fehlt" stays visible.
- **Matrix** (`?ansicht=matrix`): the same markets x Kernaufgaben (at most 10 columns, matched by the template item's stable key, title as fallback, in their usual due order). Cell = erledigt / offen / bald fällig (due within 7 days) / überfällig / zurückgestellt / "–" (no such task), always icon + colour + date, with a legend below; every cell with a task opens the drawer (`?aufgabe=`). The market column sticks, the table scrolls sideways inside its container (never the page); long titles wrap to up to three lines with the full title as tooltip.
- **Spalten** (`?ansicht=spalten`): the kanban across markets, cards with the market colour marker next to the market name (linking to its Überblick); no carried-over badge, a small category tag. Columns: **Später · Diese Woche · Überfällig & heute · Erledigt**, each sorted by due date. Only on `/board`: the event's Checkliste tab has no Spalten (user test 2026-11), an old `?ansicht=spalten` link there lands on the Checkliste.
- **Checkliste** (the event's Checkliste tab, its only view while the team module is hidden; decisions 2026-10-26
  and 2026-11-03): every task of the event in one list, one line per task with aligned columns (tick · title with status
  when not "offen" · category · due-ness only for overdue/today/waiting, "Erledigt <Datum>" when done · date · "…"),
  grouped by phase relative to the market day: Überfällig & heute, Mehr als 4 / 3–4 / 2 Wochen vorher, Woche vor dem
  Markt, Veranstaltungstag(e), Nach dem Markt, Ohne Datum. **Finished tasks stay in place**: in the phase of their due
  date (one ticked off today stays in "Überfällig & heute" until tomorrow, so the row never jumps), and every finished
  task of the event is listed, not only the last 14 days. Done and open must differ at a glance: done = filled green tick
  (skipped: grey dash), tinted row, struck-through dimmed title; open = empty ring, full-contrast title. The same tick
  unticks (undo toast either way, no confirmation since nothing disappears, decision D1). Sticky phase headers with date
  range and "x von y erledigt"; hairline separators instead of cards. Click/Enter opens the drawer, J/K move, E ticks
  off or unticks. On phones category and date move under the title, titles wrap to two lines.
- **Zeitraum** (Bis Sonntag / 14 Tage / Alles) applies to the first day of the market; "Alles" is every upcoming market. The page has no subtitle line; on phones the "Neu" button of the top bar replaces the button next to the filters.

### Übersicht (start screen, one for everyone)
Decisions 2026-10-29 ("Zwei Fragen", per-market grouping), reworked by the product owner on **2026-11-13** (less
clutter, sections clearly told apart): **one main panel** for what to do, a separate **info box** for the weekend, the
permits at the bottom. No KPI strip, no season strip. Section titles sit outside their cards (see "Section headings" in §6).
1. **Date + KW line** and greeting.
2. **Heute & nächste Tage**, the main panel (named "Heute & überfällig" until 2026-11-13; left and widest from 1024 px, first on phones): the one place that says
   what to do today and what the next days need. Its groups, each opened by a coloured band (colour + icon + text +
   count): **Überfällig** · **Heute** · **Nächste Tage** (what the former "Diese Woche" section held: everything due in
   the next 7 days, with the date next to the words, "Sa 31.10. · In 2 Tagen") and, only when there are any, **Wartet
   auf Rückmeldung**. Every group is **bundled per market** in ranking order (`rankDue`: Kernaufgaben first, then the
   soonest market), with one-click Erledigt and Zurückstellen with undo and the due words from `DueBadge`. No subtitle.
   **Pflichten** (research 10) show as soon as their reminder runs, like the reminder job: overdue in Überfällig; due
   today, inside the "Erinnerung ab" window or near the km target in Heute, with the due date next to the words ("Di
   10.11. · In 3 Wochen") and "Pflicht" in the second line; the row opens the Pflicht. Only roles with
   `company:read`; a Pflicht whose lead is shorter than a week shows in Nächste Tage before its reminder starts.
   **Above the bands a group "Besprechungen heute"** (CF9-1) lists today's Besprechungen, all-day ones first, then by
   time ("09:30  Ortstermin · Heumarkt"); a row opens the Besprechung's Vorschau (`/?vorschau=besprechung:<id>`), J/K
   and Enter work as on every row; with no Besprechung today the group is not shown. "Benachrichtigungen öffnen" sits
   next to the heading. Empty (nothing in any group) → "Nichts fällig."
3. **Dieses Wochenende**, an **info box** top right (below the main panel on phones). It tells, it does not list tasks:
   a tinted card (`accent-soft`, no border, no row lines, compact) with one entry per event of the weekend: colour
   marker and name (opens the event), the eye for its Vorschau, date · Ort, and the **status of its Checkliste**: a
   small meter plus "12 von 20 erledigt" (top-level tasks the person may see, done and skipped count as finished,
   cancelled ones not at all, like the Zusammenfassung), in red with the "!" and "· 3 überfällig" when tasks are
   overdue, green with the tick when all are done, neutral otherwise ("Noch keine Aufgaben" without tasks). Below it, only when a required permit is missing, one red line with the shield icon: "1 Genehmigung fehlt" / "2 Genehmigungen fehlen" (the rule of "Was fehlt", core `missingPermits`; nothing without `permit:read`). The link
   **"Alle Veranstaltungen"** sits next to the heading. No date-range line. When nothing is planned this weekend the
   same card shows **the next events** (the first one after the weekend and the others up to the end of its weekend,
   at most 4) under the line "An diesem Wochenende ist nichts geplant. Als Nächstes:". The former verdict (Im Plan ·
   Achtung · Nicht startklar), the "Top-5-Aufgaben" toggle and the "Nächstes Wochenende" row are gone: the tasks
   themselves live in the main panel. Entries are J/K rows (Enter opens the event, Space its Vorschau).
4. **Genehmigungen demnächst** (CF9-6), the **last section**, full width under both: permits further out than 7 days
   but inside the permit horizon; the shield in the info colour next to the heading, the same rows, snooze and J/K as
   elsewhere; empty → "Keine Genehmigungen in Sicht."
5. One calm line for tasks of past markets → Aufräumen (the cleanup drawer lists the titles it will skip).
**Phone (390 px):** everything stacks: main panel, weekend box, permits; nothing scrolls sideways.
In every list a market shows its first 3 items and a group its first 10 markets; **"+ N weitere bei …" / "+ N weitere
Märkte" (or "+ N weitere Einträge" when rows without a market are among them) open the rest in place** (native disclosure, no navigation), drawn as a small bordered button with a chevron
so it reads as clickable. Past 10 hidden rows of one market it **links to the market's Zusammenfassung** instead
("Alle N weiteren ansehen →"), so a card never unfolds a hundred rows (HN-05). Every market heading (weekend box, the
per-market bundles) carries a **visible eye** that opens its Vorschau in place (`/?vorschau=<id>`, HN-06);
Space on the row still does the same. Rows open the task drawer on the Übersicht itself
(`/?aufgabe=<id>`); J/K move (main panel, then weekend box, then permits; also through opened disclosures), Enter opens.

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
- **Views:** Monat (with KW column) and **"Liste · 6 Wochen"**; phones open the Liste (decision 2026-10-28, cookie `mw_kal_phone`), an explicit `?ansicht=` wins. Same-day deadlines of one kind collapse into one entry ("65 Genehmigungen: Entscheidung erwartet"), "+ N weitere" opens **all entries of that day in a popover** in place (same chips, Escape closes; HN-10), with "In der Liste ab diesem Tag →" at its bottom, ←/→ change the month, the month title opens a month/year jump. Veranstaltungen keeps its own Liste/Kalender toggle;
  the Kalender module is the company-wide view across modules.
- **Layer panel ("Ebenen"):** collapsed behind an "Ebenen" button (state remembered, cookie `mw_kal_ebenen`).
  *Veranstaltungen* by type (Flohmarkt, Antikmarkt, Stadtfest, Food & Wine); *Fristen*: Genehmigungen, Raten &
  Zahlungen, Aufgaben, **Besprechungen** (CF9-1), Fahrzeuge & Pflichten; *Team*: Schichten; *Hintergrund*: Feiertage NRW. Hidden modules' layers
  are not offered. Default: events + Besprechungen + permits + obligations on (older saved selections show Besprechungen as on, see
  "Besprechungen" below). **No Aufgaben layer** since the user test 2026-11 (`HIDDEN_MODULES.calendarTasks`; tasks live on the Board).
- **Presets:** two, "Märkte" and "Märkte + Fristen" (= the default). **Narrowing:** "Nur Achtung und Kritisch", Ort
  ("Nur meine Zuständigkeit" returns with Team).
- **Besprechungen** (CF9-1): a neutral chip with a calendar-clock icon, "09:30" or "ganztägig" and the title, before the
  deadline chips of its day (all-day first, then by time); list rows likewise (time, title, place). A chip or row opens
  the **Besprechung-Vorschau** (`?vorschau=besprechung:<id>`, other params kept): title, date with weekday and KW, time, Wo (a
  venue links to its page, a typed address is text), notes, Ansprechpartner (name, phone as `tel:`, e-mail as
  `mailto:`), "In Kontakte öffnen" when it is a saved contact, **Bearbeiten** (`?neu=besprechung&bearbeiten=<id>`, the
  Vorschau closes) and **Archivieren** (undo toast; undo reopens the Vorschau). The same Vorschau opens on the
  Übersicht. "Nur Achtung und Kritisch" hides Besprechungen (they carry no urgency), "Nur meine Zuständigkeit" does not touch
  them, the Ort narrowing keeps those at that venue. "+ N weitere" counts them. The legend lists "Besprechungen" only while
  they are shown (not under "Nur Achtung und Kritisch"). **Besprechung per day:** for everyone who may write events, every day
  cell of the month grid and every date cell of the list has a small "+" ("Besprechung am Mo 07.12.2026 anlegen") that opens
  the dialog with that date (`?neu=besprechung&datum=…`, Vorschau parameters dropped); it shows on hover and keyboard focus
  and always on touch screens. "+ Neu › Besprechung" pre-fills today. **Privacy:** the Vorschau shows the Ansprechpartner
  block only with `contact` read and links the Ort only with `venue` read (plain text otherwise). **Office only:** Besprechungen
  use the own `appointment` grant (owner, manager, `staff`), so field users get no layer, no "Besprechungen heute" group and no Vorschau. Text lengths are capped (Name 200, Adresse 300, Notizen 2000, Kontakt 200 / E-Mail 254 / Telefon 40).
- **Entries:** month chips show the market colour bar with the market's **Kürzel** right after it ("▌ALT", Fahrplan
  R15; small bold capitals), the status icon and the full market name (up to two lines). In a narrow day column
  (chip under 7rem, usually weekdays) the name is hidden visually and the Kürzel stands in for it ("▌ALT ⌛"); the
  name stays in the tooltip and for screen readers. Events without a market (Einzeltermin) have no Kürzel and always
  show their name. The Liste keeps full names. A click on an
  event chip or list row opens the **event popover** in place, anchored to the chip/row (UT2-08, decision D2-8): type, status,
  date with weekday and KW, the times ("08–16 Uhr · Aufbau ab 06:00", the Zeitplan summary once it exists), Ort; a
  **"Status ändern"** menu (Entwurf / geplant / bestätigt, only the allowed transitions, only with `event` write; same
  service and undo toast as the event page; no Verschieben, no Absagen); **"Checkliste"** with the open and overdue
  task counts (with `task` read) → `/veranstaltungen/<id>/board`; primary **"Öffnen"** → the Überblick. Linkable as
  **`?vorschau=veranstaltung:<id>`** (written with `replaceState`, no history entry; other Kalender links never carry
  it); a link whose event has no chip on screen (other month, hidden layer, inside "+ N weitere") shows the event's
  Vorschau card instead. Esc closes, focus returns to the chip/row; in the Liste Enter or Space on a row opens it, the
  row's "Öffnen" still goes straight to the event. Chips and row names stay real links to the event, so Ctrl/⌘-click,
  middle-click and "In neuem Tab öffnen" open the event page. A chip inside "+ N weitere" opens it on top of that
  popover. The data comes with the Kalender's own query (task counts in one grouped query, no query per event).
- The layer selection is **saved per person** (`user_preference.saved_views`).
- Weekend marker **⚑** when a weekend has 4 or more events (the weekend cap).
- **Feiertage NRW** (Fahrplan R23, rules in `packages/core/src/dates/holidays.ts`): the day cell (Monat) and the date
  cell (Liste) show the holiday's name; public holidays are tinted red as before. **Stille Feiertage** (FeiertG NW §6,
  §7 Abs. 2) carry an amber warning icon and a tooltip "Stiller Feiertag – Märkte meist nicht erlaubt (5–13 Uhr)":
  Karfreitag (ganztägig), Allerheiligen and Totensonntag (5–18 Uhr), Volkstrauertag (5–13 Uhr), Heiligabend (ab 16 Uhr).
  Volkstrauertag, Totensonntag and Heiligabend are no holidays (no red tint, name in amber); they never count as days
  off for due dates or hours. The legend adds "Stiller Feiertag" when one is on screen.
- **Rollout:** M1 ships the Veranstaltungen and Feiertage NRW layers; the other layers appear as their modules land
  (Aufgaben M2, Genehmigungen M3, Arbeitszeiten & Abschluss and Schichten M4, Raten & Zahlungen M5, Fahrzeuge &
  Pflichten M6).

## 6. Interaction patterns

**Overlays:** when to use Vorschau, drawer, page or modal is in §4.

**Section headings** (product owner 2026-11-13, "option C"): a titled section shows its title **outside its card as a
real heading**: h2, 18 px, semibold (between the 22 px page title and the 15 px headings inside cards), a small gap
(8 px) above the card. Counts and short hints sit muted right after the title; the section's actions ("Alle
Veranstaltungen", "Zu den Notizen", "+ Pflicht", …) sit on the same line, aligned right. Inside the card the
coloured **group bands** (Überfällig, Heute, Nächste Tage …) are the second level, then the rows. Code: `Panel` with
`title` (+ `meta`, `actions`, `cardClassName`; `className` places the whole section) in `components/ui/panel.tsx`;
`PanelHeading` alone for a section whose body is several cards (Zonen on the Ort page). `PanelHeader` inside a card
stays for cards that are items of a list (a zone, an agreement) and for collapsible cards whose title is the toggle
(Eckdaten, Marktregeln, Steuer & Bank). Migrated so far: Übersicht, the event's Zusammenfassung (Was fehlt, Nächste
Termine, Notiz, Kernaufgaben/Team while visible), Genehmigungen, Dokumente, Notizen and Verlauf tabs, Ort page and its
permit-requirement form, Pflicht and Fahrzeug pages, Kontakt form, Einstellungen → Firma and Bibliothek, Markt
(Vorlage) form, Ablauf-Vorlage editor. The hidden modules (Team, Finanzen, Geld tab, global Board) still use the
header inside the card until they return.

**Tables and lists:** resource name + count in the heading; row actions on hover/selection; bulk actions bar;
sticky header; column chooser; saved filters ("Ansichten") per list and per person (`user_preference.saved_views`);
Excel paste into grids (templates, hours).

**States:** skeletons shaped like the content; empty states that teach ("Noch keine Genehmigungen für diesen
Ort – aus Vorlage anlegen"); filtered-empty ("Keine Treffer – Filter zurücksetzen"); errors with retry and no data loss.

**Feedback:** optimistic + undo toast (5–8 s) for assign, move, tick off, mark paid. Money stays visibly
"wird gespeichert…" until the server confirms.
**Undo history** (handwritten notes 2026-11): every change whose toast offers "Rückgängig" also goes into a short
history (the last 10, at most 15 minutes old, in memory, so a reload clears it). A **"Rückgängig" button in the top
bar** (left of the search, so a drawer never covers it) and Strg+Z take back the newest one, also after its toast
has gone; pressing again goes one further back. Greyed out when there is nothing; the tooltip names the change
("Rückgängig: Status: Ersetzt (Strg+Z)"). Code: `useShell().lastUndo` / `undoLast()`.
**Permit "Ersetzt" toggles back:** after "Als ersetzt markieren" the drawer shows a pressed "Als ersetzt markiert"
button; clicking it makes the permit valid again (the status before, granted or rejected, with cancelled tasks
reopened; `reinstatePermit`). The rest of a superseded permit stays read-only.
**One exception, ticking off where the task disappears** (user test 2026-11, decision D1): on the Übersicht, in
Benachrichtigungen, in the event's Zusammenfassung ("Was fehlt") and on the global Board (tick, menu, `E`), "Erledigt"
first asks in a small dialog ("Aufgabe erledigt?" · "„<Titel>“ als erledigt markieren?" · Abbrechen · Ja, erledigt);
the undo toast follows as usual. The event Checkliste and the task drawer ask nothing (the task stays visible), and
neither does a drag or keyboard move into the Erledigt column (a deliberate gesture). Code: `useTaskActions({ confirmDone })`,
one dialog in the shell (`useShell().confirm`).
**A task with open subtasks** (ADR 0021 done gate, Fahrplan R29, 2026-11-13): every "Erledigt" outside the task drawer
(Übersicht, Benachrichtigungen, Was fehlt, Kernaufgaben, Checkliste, Board card, tick, menu and `E`) asks nothing it would
then refuse: it opens the task's drawer in place, where the subtasks are, with a plain hint in the refusal's words
("„<Titel>“ kann noch nicht erledigt werden: 2 offene Unteraufgaben."). The lists know the count from their query
(`openSubtasks`). The drawer's own Erledigt and a drag into the Erledigt column still get the red refusal. There is no
"Alle erledigen" (finishing the subtasks with the parent): the tasks service has no such path.
**One tick for every task row** (handwritten notes 2026-11, HN-02/HN-03): Übersicht, Was fehlt and the Checkliste use
the same control, always the row's leading element: empty ring (open, previews the tick on hover), filled green tick
(done), filled grey dash (skipped). A click on a finished tick reopens; rows that leave their list on done only ever
show the open ring. The drawer's Erledigt button carries the same mark. Code: `TaskTick` / `TickMark`
(`components/task/task-tick.tsx`). The global Board's cards keep their own buttons until the Board is removed.

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
| Permits | Fehlt · In Vorbereitung · Beantragt · Genehmigt · Abgelehnt · Läuft ab · Abgelaufen · Nicht nötig (logbook also: Noch nicht fällig · Antwort überfällig) | red ! · blue ◐ · violet ⏳ · green ✓ · red ✕ · amber ⚠ · red ⌛ · grey – (grey calendar-clock · amber clock-alert) |
| Money | Geplant · Fällig · Teilweise bezahlt · Bezahlt · Überfällig | grey · amber · amber ◐ · green ✓ · red ! |
| Hours | OK · Grenze nah · Über Grenze (zulässig?) · Unzulässig | green · amber · amber ⚠ · red ⛔ |
| Health | Im Plan · Achtung · Kritisch | green ● · amber ▲ · red ■ (shape differs, too) |
| Events (lifecycle) | Entwurf (manual only) · geplant (start state of every new event) · bestätigt (automatic once all required permits are granted) · läuft · abgeschlossen · abgesagt (cancelling also cancels the event's open tasks so they vanish from every list; undo or leaving "abgesagt" reopens exactly those); from M10 also abgerechnet (`closed`, after financial close-out) | label badge; health shown separately (● ▲ ■) |
| Saison | In Planung · Termine stehen · Abgeschlossen (changed by hand only, undo toast) | blue dashed circle · green calendar-check · grey lock |

## 8. Content & language

- **Form of address:** neutral wording wherever possible ("Aufgabe zuweisen", "Keine Aufgaben fällig"); where an
  address is needed, **"du"**. Vendor-facing documents and emails: **"Sie"**.
- **Formats** (`Intl`, `de-DE`): `16.05.2026`, short `Sa 16.05.`, `14:30 Uhr`, `1.234,56 €`, lengths `4,50 m`,
  **calendar weeks** ("KW 20"), weeks start Monday, NRW public holidays marked in calendars, stille Feiertage with an amber warning (see Kalender).
- **Terms** from the [glossary](./glossary.md); never "Kunde".
- **Long compounds** ("Halteverbotsgenehmigung") wrap with `hyphens: auto` / `&shy;`; truncated text always has a tooltip.

## 9. Visual system

Source of truth: [`apps/web/src/app/globals.css`](../../apps/web/src/app/globals.css) (tokens extracted from the Claude
Design prototype; change colours there only). The first component-by-component mapping to code and Base UI primitives is archived:
[`archive/component-inventory.md`](../archive/component-inventory.md) (historical).

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
    `--type-food-wine`, each with a `-bg` surface and a `-strong` text stop for tags (≥ 4.5:1, prototype:
    floh/antik/stadt/food);
  - **market colours** (Marktfarbe, identity only, never status): `--market-<key>` for plum, rose, brown, sand
    (Bernstein), olive, petrol (Türkis), cyan, slate (Blau), indigo (Violett), graphite; a thin bar next to the
    market name everywhere, a round dot on the events list, never a background (CF9-4);
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
  breadcrumb, Vorschau card, drawer, tabs with counts/health, data table, kanban card, people
  rail with load bars, status badge, health indicator, filter chips with counts, modal, side sheet with stepper, toast
  with undo, command palette, calendar (month/list) with layer panel, calendar multi-select, timeline ruler, matrix
  cell, month-close stepper, banner, empty state, skeleton. Inventory with the prototype anchor, implementation file,
  backing primitive and milestone of each (historical, October 2026):
  [`archive/component-inventory.md`](../archive/component-inventory.md).

## 10. Accessibility & quality bar
WCAG 2.2 AA from the start (internal tools are likely outside the EAA/BFSG, but the Phase 4 vendor booking form isn't,
and components are shared). Focus visible everywhere, logical tab order per page; focus moves into an opened
Vorschau/drawer and returns to the originating row on close; every icon button labelled, contrast checked in both
themes, reduced-motion respected. A focused list row shows the selected tint **plus** a 2 px inset ring in the accent
(one shared `rowFocus` class in `components/ui/table.tsx`; the tint alone is too faint); the row whose Vorschau or
drawer is open carries `aria-current` (`aria-selected` is only for grid/listbox roles). Status dots and meter fills
are ≥ 3:1 on the card and the sunken meter track, white text on the "ok" dot ≥ 4.5:1.

## 11. Rollout (change management)
1. Sandbox with synthetic data; the office manager tries Übersicht + board first; the owner starts on Übersicht.
2. Excel-like grids and printable views (day sheet, hours list) keep paper habits working.
3. One short first-run hint per concept (Vorschau with Space, Strg+K, Kompakt), shown once, dismissible.
