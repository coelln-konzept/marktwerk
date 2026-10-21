# Claude Design follow-up prompt: apply research-based improvements to the v1 design

For the Claude Design session that was started with the **v1 prompt** (classic screens, no customisable workspace).
Copy everything below the line into that session. It lists only the changes; it doesn't add docking, workspace
tabs or saved layouts. Source: `research/09-ui-ux-workspace.md`, `ux-concept.md` (non-workspace parts).

---

Please update the existing marktwerk design with the following improvements. They come from a UI/UX research
round (enterprise design systems like SAP Fiori, IBM Carbon, Salesforce, Shopify Polaris; products like Linear,
Notion, Front; WCAG 2.2; German localisation). **Keep the current layout, navigation and screens.** Don't add
draggable panes, workspace tabs or saved layouts. Apply the changes to all existing screens, then add the new
states listed at the end.

## 1. Status: colour + icon + text, one vocabulary
Never show status by colour alone. Every status is a badge with **colour + icon + text**, and the same words are used
everywhere:
- **Tasks:** Offen (grey ○) · In Arbeit (blue ◐) · Wartet (violet ⏸, e.g. "wartet auf Amt") · Blockiert (amber ⛔) ·
  Erledigt (green ✓) · Übersprungen (grey ⤼)
- **Due-ness:** "fällig in 3 T" (neutral) · Heute (amber) · Überfällig (red !) · ↻2 = carried over 2 days (amber badge)
- **Permits:** Fehlt (red !) · In Vorbereitung (blue ◐) · Beantragt (violet ⏳) · Genehmigt (green ✓) · Abgelehnt
  (red ✕) · Läuft ab (amber ⚠) · Abgelaufen (red ⌛) · Nicht nötig (grey –)
- **Money:** Geplant (grey) · Fällig (amber) · Teilweise bezahlt (amber ◐) · Bezahlt (green ✓) · Überfällig (red !)
- **Hours:** OK (green) · Grenze nah (amber) · Über Grenze (amber ⚠, "nur zulässig, wenn unvorhersehbar") ·
  Unzulässig (red ⛔)
- **Health** (events, areas): Im Plan **●** green · Achtung **▲** amber · Kritisch **■** red. The shape differs too,
  so it works without colour.

## 2. Density and grid
- Two density modes. **Standard** (default): table rows 40 px, form labels above fields, body text 14 px.
  **Kompakt** (per-user switch in the profile menu): rows 32 px, labels beside fields, 13 px. Show one screen
  (the board or the events list) in Kompakt as a variant.
- 4 px spacing grid. Tabular (monospaced) figures for money, hours and dates in tables. Running text (notes,
  descriptions) max ~70 characters per line.

## 3. Light and dark theme
Light stays the default. Add a **dark theme** variant of the dashboard and one detail screen. Profile menu offers
"Design: System / Hell / Dunkel". Check that status colours keep enough contrast in both.

## 4. German formats and wording
- Formats: `16.05.2026`, short `Sa 16.05.`, `14:30 Uhr`, `1.234,56 €` (space before €), lengths `4,50 m`,
  **calendar weeks** ("KW 23"). Add a **KW column** to the events list and KW labels in calendars; weeks start on Monday.
- Wording: **neutral where possible** ("Aufgabe zuweisen", "Keine Aufgaben fällig", "Beleg hinzufügen"); where an address
  is unavoidable, use **"du"** consistently.
- **Room for long German labels:** no fixed-width buttons or tabs; long compounds (e.g. "Halteverbotsgenehmigung")
  wrap or truncate with a tooltip.

## 5. Undo instead of "Sind Sie sicher?"
- Quick actions (assign, move, tick off, mark paid) happen immediately with a **toast + "Rückgängig"** (5–8 s).
  Show this on at least: marking an instalment paid, ticking off a task, assigning a task.
- Money actions show "wird gespeichert…" briefly until confirmed.
- Real confirmation dialogs only for **irreversible** steps, and the button names the consequence, e.g. month close:
  "Mai sperren – danach nur mit Begründung änderbar".

## 6. Every drag has a click alternative
- Kanban cards get a visible **drag handle (⠿)** and a **"⋯" menu** with *Zuweisen an…*, *Verschieben nach…*,
  *Status*, *Schätzung*. Show the open menu on one card.
- The same applies to reordering rows (e.g. template items): handle + menu.
- Keyboard hint in the shortcut overview: Space to pick up, arrows to move, Space to drop, Esc to cancel.

## 7. Quick preview ("Vorschau")
Every list row (events, permits, payables, tasks) gets hover icons: **👁 Vorschau** and **⋯**. Vorschau opens a
small preview sheet from the right **without leaving the list** (key: Space; Esc closes): title, status,
3–4 key facts, next deadlines, button "Öffnen". Keep the existing full detail drawer/page for real work.

## 8. Screen-specific improvements
1. **Übersicht / Heute fällig:** group the list into **Überfällig · Heute · Diese Woche** (with counts); filter chips
   with counts (Alle 12 · Geld 3 · Genehmigungen 2 · Stunden 3 · Aufgaben 4); each row gets **one primary action
   button** that fits its type (Bezahlt / Erledigt / Erfassen / Öffnen). Keep the season strip and the next-weekend
   overview. Empty state: "Heute ist nichts fällig. Nächste Frist: Mo 08.06. Halteverbot Bonn."
2. **Aus Vorlage erzeugen:** turn the dialog into a **3-step side sheet**: (1) choose preset, (2) **3-month calendar**
   for multi-select (click; Shift-click for ranges) or a rule ("jeden 1. Sonntag, Apr–Okt"), with **NRW public
   holidays** marked and **conflict markers** (location already booked; a 4th event on that weekend), (3) **preview
   table** with inline warnings ("⚠ Ostersonntag (Feiertag)", "⚑ 4. Veranstaltung an diesem Wochenende",
   "✓ Genehmigung 2027 deckt ab") and the button "7 Veranstaltungen anlegen".
3. **Logbuch:** change from a grouped list to a **matrix**: rows = locations; column groups **STADT** (Markt, Wasser,
   Plakate, Halteverbot) and **EXTERN** (Toiletten, Eigentümer); each cell = icon + short text ("✓ bis 12/27",
   "⏳ Antwort Jan", "! fehlt – Frist KW 48", "–"). Sticky header and first column. Clicking a cell opens the existing
   permit drawer. Add a toggle "Matrix / Zeitstrahl" (timeline of application windows) in the header.
4. **Vorlagen (timeline template editor):** make the table an **Excel-like editable grid** (keyboard editing,
   "aus Excel einfügen") and add a **read-only timeline ruler** above it (T-180 … T+3 with markers per task,
   previewed against a sample date). Show the template editor using the full width.
5. **Team (hours):** switch to a **month grid**: rows = people, columns = days, then Σ hours, earnings, a
   **remaining-allowance bar with text** ("noch ≈ 2 h bis 603 €"), overrun months "1/2". Warnings inline while typing.
   Month close as a **stepper**: Prüfen (3 offen) ▸ Sperren ▸ Freigeben ▸ Exportieren (CSV).
6. **Finanzen (payables):** payables **expand inline into instalment rows** (Rate 1/3 ✓ bezahlt 📎 · Rate 2/3 ! überfällig
   [Bezahlt] · reminders sent "14 T ✓ 3 T ✓" · Rate 3/3 geplant) instead of only showing them in a drawer.
   Header counter "2 Belege fehlen".
7. **Board:** add the drag handle + "⋯" menu (see 6) and a toggle **"Arbeitslast"**: people × weeks with estimated
   hours per cell and capacity colouring (amber > 80 %, red > 100 %).
8. **⌘K command palette:** design it: search field, results grouped (Veranstaltungen, Genehmigungen, Personen,
   Aktionen like "Veranstaltung aus Vorlage erzeugen"), keyboard hints, umlaut-insensitive search ("koln" finds Köln).
   Also show a visible search field in the top bar that opens it (not keyboard-only).
9. **Event types** get muted identity colours (Flohmarkt, Antikmarkt, Stadtfest, Food & Wine) used in tags and calendars.

## 9. New states to add (as extra frames)
- **Filtered-empty:** "Keine Treffer für „Plakate“ in Nippes. [Filter zurücksetzen]" (different from a true empty state)
- **True empty with teaching action:** "Noch keine Genehmigungen für diesen Ort. [Aus Vorlage anlegen] [Manuell anlegen]"
- **Loading:** skeleton rows shaped like the table
- **Error:** "Konnte nicht geladen werden. [Erneut versuchen]" with the user's input kept
- Toast with "Rückgängig"; the open "⋯" card menu; the Vorschau sheet; the Kompakt variant; the dark variant

## 10. Component legend
Update the legend to include: status badge (with icons), health indicator (● ▲ ■), filter chips with counts,
Vorschau sheet, undo toast, drag handle + card menu, command palette, calendar multi-select with markers, matrix
cell, stepper, skeleton, empty and filtered-empty states, density and theme variants.

## (Optional) fixed side-by-side detail
On the Logbuch, the events list and Heute fällig, you may show the selected item's details in a **fixed right-hand
detail panel** (list left ~60 %, detail right ~40 %) instead of an overlay drawer. This is a fixed master-detail
layout (SAP Fiori style), **not** a movable or customisable pane. Show it on one screen as an alternative so we can compare.
