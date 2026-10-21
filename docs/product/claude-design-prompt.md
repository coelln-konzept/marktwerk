# Claude Design prompt: Phase 1 UI (v2, workspace concept)

Copy everything below the line into Claude Design. It's self-contained. Sources: `ux-concept.md`,
`wireframes.md` (v2), `research/09-ui-ux-workspace.md`.

---

Design the Phase 1 UI of **marktwerk**, an internal operations web app for one German company in the Cologne
area that runs recurring **flea markets (Flohmärkte) and antique markets (Antikmärkte)**, plus a few
**Stadtfeste** and **Food & Wine** markets, at several locations, with up to 4 events on one weekend. Phase 1
**digitises** their current work: events generated from presets, timelines with tasks, a kanban board, a
company-wide permit logbook, staff hours with the Minijob limit, payments with instalments, and a "due today"
start screen. Build a **clickable, mid-to-high fidelity prototype** with a clean, calm, professional look.

## Users
- **Owner (Geschäftsführung):** wants today's priorities and money at a glance; stays on the start screen.
- **Office manager (Büroleitung):** overloaded power user, desktop with two screens, keyboard-friendly; builds
  their own workspaces.
- **Office staff:** works through assigned tasks.
- Field crew (Minijob) don't use the app in Phase 1; the office assigns their tasks and enters their hours.

## The core idea: a customisable workspace
The app is **one shell with dockable panes**, like VS Code or the Salesforce console but simpler:
- **Left sidebar** (labelled, collapsible to icons): Start · Board · Veranstaltungen · Logbuch · Team · Finanzen ·
  Firma · Händler · Vorlagen · Wissen; below them **Favoriten**; then disabled "Phase 2" entries (Buchungen,
  Postfach, Inventar); at the bottom Benachrichtigungen, Einstellungen, Profil.
- **Top bar:** a visible search field ("Suchen oder Befehl … ⌘K"), then **workspace tabs** like browser tabs
  ("Start", "Genehmigungen ×", "Geld ×", "+"), notification bell, profile.
- **Workspace area:** **1–3 pane groups side by side**, each pane group with tabs. A view's tab can be **dragged onto
  the edge of another group to split** (show drop-zone overlays) or into a group to stack. Max 3 groups.
  No floating windows. Each pane header: icon, title + context ("So 07.06. · Altstadt"), a **"⛓ folgt: …"** chip when
  the pane follows a list's selection, maximise, "⋯" menu (Link kopieren, Als Seite öffnen, Nach rechts/links/unten
  verschieben, Verknüpfung lösen, Schließen), close.
- **Workspace menu** (from "+" or the active tab): Speichern · Als neuen Arbeitsbereich speichern… · Auf
  gespeicherten Stand zurücksetzen · Layout sperren · Meine Arbeitsbereiche (4 von 8) · Neu: leer / aus Team-Vorlage ·
  Start wiederherstellen · (Manager) Als Team-Vorlage teilen…
- **Team template gallery:** cards Bürotag (Heute fällig | Board), Genehmigungen (Logbuch | Veranstaltung),
  Geld (Zahlungen | Veranstaltung), Wochenende (Veranstaltungen | Veranstaltung + Schichten); button "Kopie verwenden".
- Every list row has hover icons **👁 peek** (quick preview sheet) and **⇥ open to the side**, plus "⋯".
- Everyone starts with the same default workspace **"Start"**: left ≈60% "Heute fällig", right ≈40%
  "Nächstes Wochenende". Clicking an item on the left opens it as a tab in the right pane (which follows the list).

## Screens and states to design
1. **Shell + default workspace "Start"** with both panes filled.
2. **Splitting:** a tab being dragged with drop zones; the toast "Logbuch nach rechts verschoben · Rückgängig"; the
   disabled 4th drop zone tooltip "Maximal 3 Bereiche".
3. **Workspace menu** and **team template gallery**; a "save as" dialog (name field).
4. **Heute fällig:** grouped Überfällig / Heute / Diese Woche; filter chips with counts; each row: type icon, title,
   event, person, amount if money, due status, **one primary action button** (Bezahlt / Erledigt / Erfassen / Öffnen).
   Empty state "Heute ist nichts fällig".
5. **Board:** columns Vorbereitung · Diese Woche · Heute · Erledigt. Cards: title, category, estimate ("30 min"),
   relative due ("T-14 · Fr 01.05."), assignee avatar, rollover badge ↻2, drag handle ⠿ and "⋯". **Right "Team"
   rail** with avatars and load bars (hours this week / capacity; amber > 80%, red > 100%). Show a card dropped on a
   person with an undo toast. Toggle "Nach Person" (swimlanes) and an "Arbeitslast" view (people × weeks, hours).
6. **Veranstaltungen** list (with KW column) and the **"Aus Vorlage erzeugen"** side sheet: step 1 preset, step 2
   3-month calendar multi-select with NRW holidays and conflict markers, step 3 preview table with inline warnings
   ("4. Veranstaltung an diesem Wochenende", "Feiertag") and button "7 Veranstaltungen anlegen".
7. **Veranstaltung** (event) with tabs Überblick · Board · Genehmigungen · Team · Geld · Dokumente · Notizen ·
   Verlauf; the Überblick shows health per area (Genehmigungen, Aufgaben, Team, Geld), next deadlines, effort, timeline.
8. **Workspace "Genehmigungen":** left the **Logbuch matrix** (rows = locations; column groups STADT: Markt, Wasser,
   Plakate, Halteverbot / EXTERN: Toiletten, Eigentümer; cells = icon + short text like "✓ bis 12/27",
   "⏳ Antwort Jan", "! fehlt – Frist KW 48", "–"); right the event's permit tab following the matrix.
9. **Vorlage (Ablauf) editor**, maximised: an Excel-like grid (Phase, Kategorie, Aufgabe, Anker, Offset T-180…T+3,
   Rolle, Aufwand, Nachweis icons) with a read-only timeline ruler above; "v3 Entwurf"; publish note "Bestehende
   Veranstaltungen bleiben unverändert"; a separate "Auf Veranstaltungen anwenden…" dialog with nothing pre-selected.
10. **Team · Stunden:** month grid (people × days), totals, earnings, a **remaining-allowance bar** ("noch ≈ 2 h bis
    603 €"), overrun months "1/2", amber/red warnings with text; banner for missing times (legal 7-day deadline);
    **month close stepper** Prüfen ▸ Sperren ▸ Freigeben ▸ Exportieren.
11. **Finanzen · Zahlungen:** payables that expand into instalment rows (Rate 2/3, due date, status, reminders sent),
    a "Bezahlt" action with undo toast and "Beleg hinzufügen"; counter "2 Belege fehlen".
12. **Firma:** obligations (UVV overdue, HU in 21 days, KSK report), vehicle defect report.
13. **Command palette** (⌘K) with grouped results (Veranstaltungen, Genehmigungen, Aktionen, Arbeitsbereiche), hints
    "↵ öffnen · ⇧↵ daneben".
14. **Peek sheet** over a list (quick preview with "Als Bereich öffnen").
15. **Tablet (900 px):** a single pane with a "Bereich" switcher instead of docking.
16. **Dark theme** variant of screen 1, and **Kompakt density** variant of screen 5.

## Visual and content rules
- German UI. Neutral wording ("Aufgabe zuweisen", "Keine Aufgaben fällig"); where an address is unavoidable,
  use **"du"**. Formats: `16.05.2026`, `Sa 16.05.`, `14:30 Uhr`, `1.234,56 €`, `4,50 m`, calendar weeks "KW 23".
- **Status always = colour + icon + text.** Vocabulary: Tasks Offen / In Arbeit / Wartet / Blockiert / Erledigt;
  Permits Fehlt / Beantragt / Genehmigt / Läuft ab; Money Geplant / Fällig / Bezahlt / Überfällig; Health
  Im Plan ● / Achtung ▲ / Kritisch ■ (shape differs too).
- **Density:** Standard default (40 px table rows, labels above fields, 14 px text); Kompakt variant (32 px, 13 px).
  4 px grid. Tabular numbers for money, hours, dates.
- Light theme default, dark theme supported. Neutral base, one accent colour, muted identity colours for the
  4 event types. Typeface Geist (or similar neo-grotesk).
- Undo toasts instead of confirmation dialogs; confirmations only for irreversible steps, naming the consequence.
- Every drag has a menu alternative (show "⋯ → Zuweisen an…" on a card).
- Leave room for long German labels (no fixed-width buttons or tabs); e.g. "Halteverbotsgenehmigung".

## Sample data
Events: Flohmarkt Altstadt (Köln, Heumarkt) So 07.06. · Antikmarkt Linz Sa 06.06. · Flohmarkt Bonn (Münsterplatz)
So 07.06. · Food & Wine Neuss Sa 16.05. · Flohmarkt Nippes Sa 20.06. · Stadtfest Brühl Fr–So 21.–23.08.
People: Petra (Geschäftsführung), Jonas (Büroleitung), Ayşe (Büro), Lars (Logistik), Dieter, Kemal (Platzteam, Minijob).
Money: Standgebühr Altstadt 2027 15.000 € in Raten 6.000 + 6.000 + 3.000; Genehmigungsgebühr Neuss 640 €.
Minijob 2026: limit 603 €/month, minimum wage 13,90 €/h. Price 15 €/m, Buchungsgebühr 2,50 €.

## Don'ts
No booking, inbox, map or inventory screens (Phase 2+, only disabled menu entries). No AI assistants or chatbots.
No "Kunde/customer". No floating windows, no more than 3 panes. No chart-heavy dashboards: prioritised lists beat graphs.

Deliver one frame per screen/state, a consistent component set (sidebar, workspace tabs, pane + header, drop-zone
overlay, data table, kanban card, people rail with load bar, status badge, health indicator, filter chips, peek sheet,
modal, toast with undo, command palette, calendar multi-select, matrix cell, stepper, empty state, skeleton) and a
short component legend.
