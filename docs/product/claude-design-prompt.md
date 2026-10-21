# Claude Design prompt: Phase 1 wireframes

Copy everything below the line into Claude Design. It's self-contained (Claude Design can't see this repo).
Source documents: `roadmap.md` (Phase 1, M1–M6), `wireframes.md`, `research/05-client-meeting-2026-10.md`.

---

Design the Phase 1 screens of **marktwerk**, an internal operations web app for one German event company
in the Cologne area. They mainly run recurring **flea markets (Flohmärkte) and antique markets (Antikmärkte)**,
plus a few **Stadtfeste** (city festivals) and **Food & Wine** markets, at several locations and cities, with up to
4 events on one weekend. Phase 1 is about **digitising** their current work (no automation, no messaging to staff yet). Build a **clickable mid-fidelity prototype** (wireframe
style with real layout, real content and status colours; no final branding yet).

## Who uses it
- **Owner (Geschäftsführung):** wants today's priorities and money risks in seconds, and whether next weekend
  is on track. Thinks in event types and strategy.
- **Office manager (Büroleitung):** one overloaded person who files permits ~6 months ahead, maintains event
  dates, assigns work, calculates mini-jobbers' hours before the 15th of each month, pays instalments. Desktop,
  two screens, keyboard power user.
- **Office staff:** enters phone requests, works through assigned tasks.
- **Field crew (mostly Minijob):** use only WhatsApp, no app, no login. **In Phase 1 they don't use marktwerk
  at all:** the office assigns their tasks on the board and enters their working hours for them.

## Product principles (they come from the client and must be visible in the design)
1. Digitise first: the app mirrors how they work today (presets → dates, timelines, paper stall maps), with
   no clever re-invention.
2. Nothing slips: every deadline (tasks, permits, instalment payments, returns of rented equipment, vehicle
   inspections, missing working-time records) surfaces in one ranked "due today" list.
3. Human touch stays: no AI features, no auto-sent reminders; people press "send".
4. Calm, dense, fast: Linear/Notion-like back office with side drawers that keep context; one event page
   with tabs instead of scattered modules; keyboard shortcuts; ⌘K search.
5. Field crew get big buttons, high contrast, one screen.

## Language & content
- **UI language: German.** Use realistic German sample data (see the end). Dates as `Sa 16.05.`, money as
  `6.000 €`, times `05:30`.
- Vocabulary: **Veranstaltung** (event; menus may say "Märkte"), **Vorlage** (preset/template), **Termin**
  (date), **Händler** (vendor), **Besucher** (visitor; never "Kunde"), **Genehmigung** (permit),
  **Logbuch** (permit status overview), **Rate** (instalment), **Schicht** (shift), **Minijob**,
  **Platzteam** (field crew).
- Status colours, used consistently: green ok · amber attention · red critical · grey not started · blue info ·
  "↻2" badge = task carried over 2 days.

## Layout system
- Desktop first (1440 px) for the back office, with a left sidebar:
  Übersicht · Board · Veranstaltungen · Logbuch · Team · Finanzen · Firma · Händler · Vorlagen · Wissen ·
  Benachrichtigungen · Einstellungen. Below that, disabled with a "Phase 2" tag: Buchungen · Postfach · Inventar.
  User name and role at the bottom with a language switch (DE/EN).
- Top bar: ⌘K search, notification bell with count.
- Details open in a **right-side drawer** over the list (don't navigate away).
- The staff page is **mobile (390 px)**.
- Neutral, clean base (white/neutral greys, one accent colour). Typography with clear hierarchy, tabular
  numbers in tables. Accessible contrast. Not sterile: light warmth is welcome, but no decoration.

## Screens to design (with key states)

**1. Übersicht (owner dashboard)**
- "Heute fällig" ranked list mixing types: task, permit, instalment, rental return, missing time records.
  Each row has an icon by type, title, event, responsible person, due status, plus filter chips
  [Alle] [Finanzen] [Genehmigungen] [Aufgaben] [Team].
- "Nächstes Wochenende": 4 events as rows. Columns: Genehmigungen · Aufgaben (done/total) · Team (filled
  shifts) · Geld · geschätzter Aufwand in hours, each as a traffic light.
- Season strip: number of events, total estimated hours, "≈ 3,1 Minijobber/Monat zusätzlich" (hiring signal).
- States: the finance filter active; an empty state "Heute ist nichts fällig 🎉".

**2. Veranstaltungen (events list + calendar toggle)**
- Table: date, name, type (coloured tag), location, status (Entwurf / geplant = announced but permit pending /
  bestätigt / läuft / abgeschlossen / abgesagt), health dots, hours.
- Button "Aus Vorlage erzeugen": a dialog where you pick a preset, click dates in a calendar, see a preview
  ("9 Termine · je 34 h · 5 Genehmigungen werden geprüft") and confirm.

**3. Event page: tab "Board" (the heart of the app)**
- Header: event name, date, location, type, lifecycle status, booking flags (buchbar / ausgebucht /
  Autoplätze ausgebucht).
- Tabs: Überblick · Board · Genehmigungen · Team · Geld · Dokumente · Notizen · Verlauf.
- Kanban columns: Vorbereitung · Diese Woche · Heute · Erledigt. Cards show title, category (Genehmigung /
  Logistik / Kommunikation / Büro / Geld), estimated time ("30 min", "2 h"), due "T-14 · Fr 01.05.", assignee
  avatar, rollover badge.
- **Right rail "Team":** people with avatars and a load bar (estimated hours this week vs. capacity; for
  mini-jobbers capacity = remaining allowed hours this month).
- **Show the drag interaction:** a card dropped onto a person → toast "Zugewiesen an Dieter · Rückgängig";
  the card now shows Dieter's avatar and his load bar grows.
- Toggle "Nach Person" (swimlanes by person).
- Footer: Σ estimated 41 h · done 18 h.
- Task drawer: description, check items, photo evidence required, comments with @mention, activity,
  status incl. "wartet auf Amt".

**4. Vorlagen (template editor)**
- Timeline table rows: phase (Vorbereitung / Markttag / Nachbereitung), category, title, anchor (Veranstaltungstag /
  Buchungsschluss / Aufbautag), offset (−180 … +3 days, shown as "T-180"), duty role (Marktleitung, Aufbau,
  Büro, Genehmigungen, Kommunikation), estimated time, evidence icons.
- Version badge "v3 Entwurf". Publish button with a note: "Veröffentlichen ändert keine bestehenden
  Veranstaltungen". A separate, optional "Auf Veranstaltungen anwenden…" dialog where **nothing is pre-selected**
  and you get a per-event preview.

**5. Logbuch (permit status overview, company-wide)**
- Grouped by location.
- Rows: category (Stadt / Extern), permit type (Marktgenehmigung, Wasser/Hydrant, Plakatierung mit
  Aufklebern, Halteverbot, Toiletten, Einverständnis Grundstück), status (fehlt / in Vorbereitung / beantragt /
  genehmigt / abgelehnt), "Stadt entscheidet ~Januar", validity, covered dates (e.g. "9 Termine"), document
  clip, fee → linked instalments.
- Header counters: Fehlt 7 · Beantragt 12.
- Drawer: documents, conditions turned into tasks, stickers received/used (100/64), history.

**6. Team (staff hours & Minijob)**
- Month table per person: contract (Minijob / Vollzeit), hourly rate, hours worked + planned, earnings,
  **remaining allowed hours**, year-to-date, overrun months "1/2".
- Warning states: amber (over 603 € this month, "nur zulässig, wenn unvorhersehbar · Begründung erfassen"),
  red (over 1.206 € or a third overrun month).
- Banner "3 Schichten ohne Arbeitszeiten · gesetzliche Frist 17.05." and a working-time warning
  ("11,5 h am 16.05., max. 10 h").
- Button "Monat abschließen" (deadline 15th) → steps: prüfen → sperren → exportieren (CSV).
- Second view: shifts per event (who worked which role, planned vs. actual times), entered by the office.

**7. Finanzen (payables & instalments)**
- List: due date, what, to whom, instalment "2/3", amount, receipt clip, priority. Filters: Offen /
  Fällig ≤ 14 T / Überfällig / Bezahlt.
- Drawer: instalment plan for "Standgebühr Altstadt 2027: 15.000 € = 6.000 + 6.000 + 3.000 ✔",
  reminders sent, "Als bezahlt markieren" → "Beleg fotografieren/hochladen".
- Counter "2 Belege ohne Zuordnung".
- Event tab "Geld": costs by category with columns Plan · Zugesagt · Tatsächlich.

**8. Firma (company tab)**
- Recurring obligations: UVV-Prüfung Transit (overdue), HU Sprinter (in 21 days), KSK-Meldung (31.03.),
  insurance renewal.
- Vehicles with open defect reports (photo, reported by Dieter).

**9. Benachrichtigungen** (secondary)
- Grouped notifications with Done / Merken / Später actions, and filters (Mir zugewiesen, @Erwähnt, Fristen).

## Key flows to make clickable
1. Dashboard → red instalment → drawer → mark paid → add receipt.
2. Event board → drag task onto a person → toast with undo → load bar updates.
3. Logbuch → missing permit → drawer → "Aufgabe erstellen".
4. Team → amber person → enter justification → month close.
5. Create events from a preset with the date picker preview.

## Sample data
- **Events:** Flohmarkt Altstadt (Köln, Rheinufer) So 07.06. · Antikmarkt Linz Sa 13.06. · Food & Wine Neuss
  Sa 16.05. · Flohmarkt Bonn So 10.05. · Flohmarkt Nippes Sa 20.06. · Stadtfest Brühl Fr–So 21.–23.08.
  (status geplant).
- **People:** Petra (Geschäftsführung), Jonas (Büroleitung), Frank (Büro), Lars (Logistik), Dieter, Ayşe,
  Kemal (Platzteam, Minijob).
- **Prices:** 15 €/m, Buchungsgebühr 2,50 €.
- **Minijob 2026:** limit 603 €/month, minimum wage 13,90 €/h.
- **Permits:** Marktgenehmigung Altstadt 2027 (beantragt, Stadt entscheidet im Januar), Wasser/Hydrant
  (Standrohr von den Stadtwerken), Plakatierung Neuss (100 Aufkleber), Halteverbot, Toiletten (Rahmenvertrag).

## Don'ts
- No vendor booking screens, maps, inbox, inventory, WhatsApp features or staff mobile pages yet (Phase 2+):
  only the disabled menu entries.
- No new formats (design markets, workshops, tournaments).
- No AI assistants, chatbots or "smart suggestions" copy.
- No customer/Kunde wording.
- No dashboards full of charts: lists with clear priorities beat graphs here.

Deliver one frame per screen (plus the key states above), consistent components (buttons, tags, status dots,
drawer, toast, table, kanban card, load bar), and a short component legend.
