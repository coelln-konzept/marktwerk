# Wireframes v3 (direction A: classic screens)

**2026-10-21.** Based on the [UX concept v2](./ux-concept.md) and [ADR 0019](../architecture/adr/0019-classic-screens.md).
v3 replaces the workspace version (v2): the app shell is a sidebar with pages, Vorschau and detail drawers; W1 is now
the Kalender module (the workspace operations were removed). Low fidelity: structure, content and interaction, not
visual design. German UI. Desktop frames ≈ 1440 px wide unless noted.

**High-fidelity reference:** the Claude Design prototype in
[`docs/design/claude-design/a-classic/`](../design/claude-design/a-classic/INDEX.md) (`index.html`, 53 screens,
`INDEX.md` maps screens → `index.html#<ScreenId>`). Where the prototype and these wireframes differ, the prototype
wins unless a decision says otherwise.

Legend: `⋯` menu · `👁` Vorschau · `›` breadcrumb · ↻n carried over n days · ● ▲ ■ health (ok / attention / critical) ·
⚑ weekend with 4+ events.

---

## W0 · App shell with the start screen "Übersicht"
```
┌──────────────────┬──────────────────────────────────────────────────────────────────────────────────────────┐
│ marktwerk        │ Übersicht                      [🔍 Suchen oder Befehl …  ⌘K]   [+ Neu]          🔔 3     │
│                  ├──────────────────────────────────────────────────────────────────────────────────────────┤
│ ⌂ Übersicht      │ Mittwoch, 13. Mai 2026 · KW 20                                                           │
│ ▦ Kalender       │ Guten Morgen, Petra                                                                      │
│ ▥ Board          │ ┌ Fällig bis So ┐ ┌ Überfällig ┐ ┌ Geld überfällig ┐ ┌ Nächstes Wochenende ┐              │
│ ▤ Veranstaltungen│ │      12       │ │     2      │ │    6.000 €      │ │  2 von 4 im Plan    │              │
│ ◎ Orte           │ └───────────────┘ └────────────┘ └─────────────────┘ └─────────────────────┘              │
│ ▣ Logbuch      7 │ SAISON 2026 · Mär–Nov · 46 Veranstaltungen (Floh 24 · Antik 12 · Stadtfest 4 · F&W 6)    │
│ ☺ Team           │ 3.410 h geschätzter Aufwand · Platzteam 2.380 h Bedarf · 1.170 h Kapazität               │
│ € Finanzen     2 │ → ≈ 3,1 Minijobber/Monat zusätzlich                                                      │
│ ⌂ Firma          │──────────────────────────────────────────────────────────────────────────────────────────│
│ ☷ Händler        │ HEUTE FÄLLIG   [Alle 12] [Geld 3] [Genehmigungen 2] [Stunden 3] [Aufgaben 4]              │
│ ☎ Kontakte       │ ÜBERFÄLLIG                                                                               │
│ ⎘ Vorlagen       │ ! 💶 Rate 2/3 Standgebühr Altstadt            6.000 €  seit 2 T            [Bezahlt]     │
│ ? Wissen         │ ! ▣ Plakatierung Neuss beantragen             Jonas    seit 1 T            [Öffnen]      │
│ 🔔 Benachr.    3 │ HEUTE                                                                                    │
│ ⚙ Einstellungen  │ ⏱ 3 Schichten ohne Zeiten · Tag 5/7                                        [Erfassen]    │
│                  │ ↻2 Toiletten bestellen · Food & Wine                                       [Erledigt]    │
│ SPÄTER           │ DIESE WOCHE (7)                                                            alle ▸        │
│ Buchungen Phase 2│──────────────────────────────────────────────────────────────────────────────────────────│
│ Postfach  Phase 2│ NÄCHSTES WOCHENENDE · KW 20 · Sa 16.05. – So 17.05.                                      │
│ Inventar  Phase 2│ Veranstaltung          Genehm.  Aufgaben  Team  Geld  Aufwand                            │
│                  │ Food & Wine Neuss      ▲ 4/5    ● 31/39   ● 6/6 ● ok  42 h                               │
│                  │ Flohmarkt Altstadt     ■ 3/5    ▲ 14/20   ▲ 5/6 ● ok  34 h                               │
│                  │ Antikmarkt Linz        ● 5/5    ● 12/14   ● 4/4 ● ok  22 h                               │
│                  │ WAS DAS WOCHENENDE AUFHÄLT                                                               │
│ Petra · Inhaberin│  ■ Genehmigung Wasser fehlt · Altstadt          ▲ Halteverbot aufstellen offen · Lars    │
│ ◐ System       ▾ │                                                                                          │
└──────────────────┴──────────────────────────────────────────────────────────────────────────────────────────┘
```
- One start screen for everyone; no fixed master-detail. Each Heute-fällig row has **one primary action**;
  Space = Vorschau; the row action opens the matching drawer (Rate, Aufgabe, Genehmigung).
- The season strip uses task estimates (M2) and contracts (M4); until then it shows the event counts only.
- **Orte** (after Veranstaltungen) and **Kontakte** (after Händler) have their own sidebar entries (product owner,
  2026-10-21); the prototype's sidebar predates this.
- Profile at the bottom opens: Sprache · Design System/Hell/Dunkel · Dichte Standard/Kompakt · Abmelden.

## W1 · Kalender (module)
```
┌──────────────────────────────────────────────────────────────────────────────┬─────────────────────────────┐
│ Kalender   Mai 2026  ‹ ›  [Heute]           (•) Monat ( ) Liste · 6 Wochen    │ EBENEN                      │
│ [Alles] [Nur Veranstaltungen] [Nur Fristen] [Märkte + Genehmigungen]          │ VERANSTALTUNGEN             │
│ ☐ Nur Achtung und Kritisch   ☐ Nur meine Zuständigkeit   [Ort ▾]              │ ☑ Flohmarkt  ☑ Antikmarkt   │
├────┬────────┬────────┬────────┬─────────┬────────┬─────────────┬──────────────┤ ☑ Stadtfest  ☑ Food & Wine  │
│ KW │ Mo     │ Di     │ Mi     │ Do      │ Fr     │ Sa          │ So           │ FRISTEN                     │
│ 19 │ 4      │ 5      │ 6      │ 7       │ 8      │ 9           │ 10 Floh Bonn │ ☑ Genehmigungen             │
│ 20 │ 11     │ 12     │ 13     │ 14      │ 15     │ 16 ⚑        │ 17           │ ☑ Raten & Zahlungen         │
│    │        │ ! Rate │        │ ! Plakat│        │ F&W Neuss   │ Floh Altstadt│ ☐ Aufgaben                  │
│    │        │   2/3  │        │   Neuss │        │ Antik Linz  │ Floh Nippes  │ ☐ Arbeitszeiten & Abschluss │
│ 21 │ 18     │ 19     │ 20     │ 21      │ 22     │ 23          │ 24           │ ☐ Rückgaben (Miete)         │
│ …  │        │        │        │         │        │             │              │ ☐ Fahrzeuge & Pflichten     │
│    │        │        │        │         │        │             │              │ TEAM        ☐ Schichten     │
│    │        │        │        │         │        │             │              │ HINTERGRUND ☑ Feiertage NRW │
└────┴────────┴────────┴────────┴─────────┴────────┴─────────────┴──────────────┴─────────────────────────────┘
```
- "Liste · 6 Wochen": the same entries as a chronological list grouped by KW. Click = open, Space = Vorschau.
- The layer selection is saved per person. ⚑ marks weekends with 4+ events.
- M1: Veranstaltungen + Feiertage NRW only; other layers appear with their modules (M2–M6, Rückgaben with M12).

## W2 · Vorschau & drawer (every list)
```
│ Veranstaltungen                                           │
│ Datum      Name                 Ort        Status          │
│ So 07.06.  Flohmarkt Altstadt   Köln       ▲ geplant   👁 ⋯│  ← hover icons: Vorschau · menu
│ Sa 06.06.  Antikmarkt Linz      Linz       ● bestätigt     │
```
**Vorschau** (Space or 👁; small card top right; Esc closes, Enter opens the page)
```
                                   ┌──────────────────────────────────────┐
                                   │ Flohmarkt Altstadt · So 07.06.     × │
                                   │ ▲ Achtung: Genehmigung Wasser fehlt │
                                   │ Aufgaben 14/20 · Team 5/6 · 34 h    │
                                   │ Nächste Fristen                     │
                                   │  Fr Halteverbot aufstellen (Lars)   │
                                   │ [Öffnen ↵]                          │
                                   └──────────────────────────────────────┘
```
**Detail drawer** (from the right, for real work; the list stays visible; linkable, e.g. `?detail=task:<id>`)
```
                              ┌──────────────────────────────────────────────────────┐
                              │ Aufgabe · Halteverbot aufstellen                 ⋯ × │
                              │ Status [◐ In Arbeit ▾]                              │
                              │ Flohmarkt Altstadt · fällig Fr 05.06. · Lars · 1 h  │
                              │ Beschreibung …                                      │
                              │ ☑ Schilder abholen  ☐ Schilder aufstellen  ☐ Foto  │
                              │ Nachweis: 📷 erforderlich                            │
                              │ Kommentare: @Jonas Schilder liegen im Lager …       │
                              │ Verlauf: zugewiesen an Lars · vor 2 T               │
                              └──────────────────────────────────────────────────────┘
```
Status menu: Offen · In Arbeit · Wartet · Amt / Extern · Blockiert · Erledigt · Übersprungen. Esc closes; focus
returns to the row or card. Permit, payable and shift drawers follow the same layout.

## W3 · "Heute fällig" (section of Übersicht, detail)
```
┌───────────────────────────────────────────────────────────────────────────────────────┐
│ Heute fällig                        [Alle 12][Geld 3][Genehmigungen 2][Stunden 3][Aufg. 4]│
│                                     Nur meine ☐   Sortierung: Priorität ▾              │
├───────────────────────────────────────────────────────────────────────────────────────┤
│ ÜBERFÄLLIG (2)                                                                        │
│  ! 💶  Rate 2/3 · Standgebühr Altstadt 2027 · an Vermieter     6.000 €  seit 2 T [Bezahlt]│
│  ! ▣   Plakatierung Neuss beantragen · Food & Wine 16.05.     Jonas    seit 1 T [Öffnen] │
│ HEUTE (3)                                                                             │
│  ⏱    3 Schichten ohne Arbeitszeiten · Bonn 10.05. · gesetzl. Frist 17.05.     [Erfassen] │
│  ↻2   Toiletten bestellen · Food & Wine 16.05.                 Ayşe     30 min [Erledigt]│
│  ⚠    UVV-Prüfung Transit K-MW 123                              Firma            [Öffnen]│
│ DIESE WOCHE (7)                                                              alle ▸   │
└───────────────────────────────────────────────────────────────────────────────────────┘
```
Empty: "Heute ist nichts fällig. Nächste Frist: Mo 08.06. Halteverbot Bonn." Filtered-empty: "Keine Geld-Themen
heute – Filter zurücksetzen".

## W4 · Board
```
┌─────────────────────────────────────────────────────────────────────────────────────────┬──────────────┐
│ Board  [Alle Veranstaltungen ▾] [Kategorie ▾]  Ansicht: (•) Spalten ( ) Nach Person      │ TEAM  KW 23  │
│        [Arbeitslast]                                                    Σ 96 h geplant   │              │
├──────────────────┬──────────────────┬──────────────────┬───────────────┤                 │ 🧑 Jonas      │
│ VORBEREITUNG 18  │ DIESE WOCHE 9    │ HEUTE 4          │ ERLEDIGT 41   │                 │ ███████▒ 14/16h│
│ ┌──────────────┐ │ ┌──────────────┐ │ ┌──────────────┐ │ ┌───────────┐ │                 │ 🧑 Lars       │
│ │Flyer drucken │ │ │Halteverbot   │ │ │↻2 Toiletten  │ │ │✓ Wasser…  │ │                 │ ████░░░ 8/20h │
│ │Komm. · 2 h   │ │ │aufstellen    │ │ │bestellen     │ │ └───────────┘ │                 │ 🧑 Dieter (MJ)│
│ │Altstadt T-21 │ │ │Logistik · 1 h│ │ │Büro · 30 min │ │               │                 │ ██████▒ 12/14h│
│ │        ⋯ ⠿   │ │ │→ Lars  ⋯ ⠿   │ │ │→ Ayşe  ⋯ ⠿   │ │               │                 │  Rest ≈ 14 h  │
│ └──────────────┘ │ └──────────────┘ │ └──────────────┘ │               │                 │ 🧑 Ayşe (MJ)  │
│                  │                  │                  │               │                 │ ███░░░ 6/43h  │
└──────────────────┴──────────────────┴──────────────────┴───────────────┘                 └──────────────┘
 Drop a card on a person → "Zugewiesen an Lars [Rückgängig]". ⠿ = drag handle; ⋯ = Zuweisen an… / Verschieben nach… /
 Status / Schätzung. Key A = assign, S = status. Load bars: estimated hours this week vs capacity (Minijob: remaining
 allowance); amber > 80 %, red > 100 %. Click on a card opens the task drawer (W2).
```
**Arbeitslast** toggle: people × weeks grid with estimated hours per cell and the "≈ x Minijob-Monate" season total.

## W5 · Veranstaltungen + generate from a preset
```
┌──────────────────────────────────────────────────────────────────────────────────┐
│ Veranstaltungen 74   (•) Liste ( ) Kalender   [Typ ▾][Ort ▾][Status ▾]  [+ Aus Vorlage erzeugen] │
├──────────────────────────────────────────────────────────────────────────────────┤
│ KW  Datum      Name                 Typ          Ort          Status     Gesundheit│
│ 23  So 07.06.  Flohmarkt Altstadt   Flohmarkt    Köln Altst.  geplant    ▲         │
│ 23  Sa 06.06.  Antikmarkt Linz      Antikmarkt   Linz         bestätigt  ●         │
│ …                                                                                  │
```
**Aus Vorlage erzeugen** (side sheet, 3 steps)
```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ 1 Vorlage ▸ 2 Termine ▸ 3 Vorschau                                                   │
│ Vorlage: [Flohmarkt Altstadt (Flohmarkt · Köln Altstadt) ▾]                           │
│ Termine wählen: Regel [jeden 1. Sonntag ▾] [Apr 2027 – Okt 2027]  oder im Kalender:   │
│   APRIL 2027               MAI 2027                 JUNI 2027                         │
│   Mo Di Mi Do Fr Sa So     Mo Di Mi Do Fr Sa So     Mo Di Mi Do Fr Sa So              │
│                  ...[4]     ...           [2]       ...                 [6]           │
│   ▦ = Feiertag NRW · ◆ = schon belegt (Ort) · ⚑ = 4. Veranstaltung am Wochenende      │
│ Vorschau (7 Termine)                                                                  │
│  So 04.04.2027  Ostersonntag (Feiertag)                       ⚠ prüfen                │
│  So 02.05.2027  ok · Genehmigung 2027 beantragt (deckt ab)    ✓                       │
│  So 06.06.2027  ⚑ 4. Veranstaltung an diesem Wochenende        ⚠                       │
│  … je 39 Aufgaben · ≈ 34 h · 5 Genehmigungen geprüft                                  │
│                                              [Abbrechen] [7 Veranstaltungen anlegen]  │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

## W6 · Veranstaltung (tab Überblick)
```
┌───────────────────────────────────────────────────────────────────────────────────┐
│ ▤ Flohmarkt Altstadt · So 07.06.2026 · Köln Altstadt (Heumarkt) · Flohmarkt      │
│ Status: geplant (Genehmigung offen) · buchbar · Autoplätze frei    [Datum ändern…] │
│ [Überblick] [Board 14/20] [Genehmigungen 4/5 ▲] [Team 5/6] [Geld ●] [Dokumente 6] [Notizen] [Verlauf]│
├───────────────────────────────────────────────────────────────────────────────────┤
│ GESUNDHEIT ▲ Achtung                      NÄCHSTE FRISTEN                          │
│  Genehmigungen ▲ Wasser fehlt              Fr 05.06. Halteverbot aufstellen · Lars │
│  Aufgaben ● 14/20 erledigt                 Sa 06.06. Standrohr abholen · Dieter    │
│  Team ● 5/6 Rollen besetzt                 So 07.06. 05:00 Aufbau                  │
│  Geld ● Rate 2/3 bezahlt                                                          │
│ AUFWAND 34 h geplant · 18 h erledigt       ZEITPLAN So 05:00 Aufbau · 08:00 Öffnung │
└───────────────────────────────────────────────────────────────────────────────────┘
```

## W7 · Logbuch matrix + permit drawer
```
┌────────────────────────────────────────────────────────────────┬─────────────────────────────────────────┐
│ Logbuch                                                        │ Genehmigung · Wasser 2027 · Altstadt  × │
│ Saison [2027 ▾]  (•) Matrix ( ) Zeitstrahl   Fehlt 7 · Beantragt 12│ ! Fehlt · Frist KW 48                 │
│           │ STADT                                │ EXTERN       │ Behörde: Stadtwerke Köln · Standrohr    │
│ Ort       │ Markt     Wasser   Plakate   Halteverb.│ Toil. Eigent.│ Deckt ab: 9 Veranstaltungen 2027        │
│ Altstadt  │ ⏳ Antw.Jan [! fehlt] ! fehlt  ✓ je T. │ ✓ RV27 –     │ Dokumente: –                            │
│ Nippes    │ ✓ –12/27  ✓ –12/27 ⏳ beantr. ✓       │ ✓      –     │ Gebühr: 120 € → Zahlung anlegen         │
│ Linz      │ ! fehlt   ✓        –        –         │ ✓      ✓ MJV │ [Aufgabe anlegen]  [Als beantragt …]    │
│  ⚑ Frist KW 45                                     │              │                                         │
└────────────────────────────────────────────────────────────────┴─────────────────────────────────────────┘
```
 Cells = icon + short text (never colour alone). Click a cell (or Enter) → the permit drawer opens on the right; the
 matrix stays visible. "Fehlt → Aufgabe anlegen" creates a task with the deadline. Zeitstrahl = the same permits as
 application/decision bars per location.

## W8 · Vorlage (Ablauf) editor
```
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│ Ablauf Flohmarkt · v3 Entwurf (v2 veröffentlicht)      [Verwerfen] [Veröffentlichen]       │
│ Vorschau mit Datum: [So 07.06.2026 ▾]                                                     │
│ T-180 ───────── T-90 ────── T-42 ── T-14 ─ T-7 ─ T ─ T+3   ← read-only ruler of the grid    │
│        ▮              ▮       ▮▮     ▮▮▮    ▮    ▮▮▮  ▮                                        │
├────┬──────────┬──────────────────────────────┬──────────────┬──────┬────────┬───────┬─────┤
│ Ph │ Kategorie│ Aufgabe                      │ Anker        │Offset│ Rolle  │Aufwand│ ✓   │
│ V  │ Genehm.  │ Marktgenehmigung beantragen  │ Veranst.tag  │ -180 │ Genehm.│ 2 h   │ 📎  │
│ V  │ Komm.    │ Termin auf Website „geplant“ │ Veranst.tag  │ -150 │ Komm.  │ 15 min│     │
│ V  │ Genehm.  │ Plakatierung + Aufkleber     │ Veranst.tag  │ -60  │ Genehm.│ 1 h   │     │
│ M  │ Logistik │ Halteverbot prüfen 05:00     │ Veranst.tag  │ 0    │ Aufbau │ 30 min│ 📷  │
│ N  │ Logistik │ Standrohre zurückgeben       │ Veranst.tag  │ +1   │ Logist.│ 45 min│     │
│ + Zeile (oder aus Excel einfügen)                                  Σ 34 h je Veranstaltung │
└────┴──────────┴──────────────────────────────┴──────────────┴──────┴────────┴───────┴─────┘
```
"Veröffentlichen" → note "Bestehende Veranstaltungen bleiben unverändert." Separately: **Auf Veranstaltungen
anwenden…** (dialog, nothing pre-selected, per-event diff: "+2 Aufgaben · 1 geändert · erledigte bleiben").

## W9 · Team · Stunden + month close
```
┌──────────────────────────────────────────────────────────────────────────────────────────────┐
│ Team · Mai 2026   Grenze 603 € · Mindestlohn 13,90 €          [Monat abschließen ▸] (bis 15.06.)│
│ ⏱ 3 Schichten ohne Zeiten (Bonn 10.05.) · Frist 17.05.   ⚠ Kemal 11,5 h am 16.05. (max. 10 h)  │
├──────────┬──────────┬───┬───┬───┬ … ┬────┬────────┬───────────────────────────────┬──────────┤
│ Name     │ Vertrag  │ 2 │ 3 │ 9 │   │ Σ h│ Verdienst│ Rest bis Grenze               │ Überschr.│
│ Dieter   │ MJ 14,00 │ 9 │ – │ 8 │   │ 41 │   574 €  │ ███████████▒ noch ≈ 2 h       │ 0/2      │
│ Ayşe     │ MJ 13,90 │ 6 │ 6 │ – │   │ 24 │   334 €  │ ██████░░░░░ noch ≈ 19 h       │ 1/2      │
│ Kemal    │ MJ 15,00 │ 9 │11,5│ 8│   │ 46 │   690 € ⚠│ über 603 € – nur zulässig, wenn unvorhersehbar [Begründung]│
└──────────┴──────────┴───┴───┴───┴ … ┴────┴────────┴───────────────────────────────┴──────────┘
```
**Monat abschließen** stepper: `Prüfen (3 offen) ▸ Sperren ▸ Freigeben ▸ Exportieren (CSV)`. Confirmation names the
consequence: "Mai sperren – danach nur mit Begründung änderbar".

## W10 · Finanzen · Zahlungen
```
┌────────────────────────────────────────────────────────────────────────────────────────────┐
│ Zahlungen  [Offen][Fällig ≤ 14 T][Überfällig][Bezahlt]  [Veranstaltung ▾]   [+ Zahlung]      │
├────────────────────────────────────────────────────────────────────────────────────────────┤
│ ▾ Standgebühr Altstadt 2027 · Vermieter · 15.000 €         nächste Rate 6.000 € heute ! │
│     Rate 1/3  6.000 €  01.03.  ✓ bezahlt 28.02.  📎                                        │
│     Rate 2/3  6.000 €  21.10.  ! überfällig      [Bezahlt]  Erinnerungen: 14 T ✓ 3 T ✓      │
│     Rate 3/3  3.000 €  01.02.  geplant                                                     │
│ ▸ Genehmigungsgebühr Neuss · Stadt Neuss · 640 €            fällig 28.10.                   │
│ ▸ Toiletten Rahmenvertrag 2027 · Dixi · 2.700 € (3 Raten)   nächste Rate 01.11.            │
└────────────────────────────────────────────────────────────────────────────────────────────┘
 [Bezahlt] → "Rate 2/3 als bezahlt markiert [Rückgängig]" → "Beleg hinzufügen" (drop or 📷). Shows
 "wird gespeichert…" until the server confirms. Counter in header: "2 Belege fehlen". Click on a payable → detail drawer.
```

## W11 · Firma
```
│ Firma  [Pflichttermine] [Fahrzeuge] [Versicherungen] [Dokumente]                     │
│ ! UVV-Prüfung Transit K-MW 123        seit 12 T fällig                  [Erledigt…] │
│ ⚠ HU Sprinter K-MW 456                in 21 T (alle 24 Monate, ≤ 3,5 t)            │
│ ○ KSK-Meldung                         bis 31.03.                                    │
│ Mängel: Transit: Bremse quietscht · 📷 · Dieter · vor 3 T                           │
```

## W12 · Command palette (⌘K / search field)
```
┌──────────────────────────────────────────────────────────┐
│ 🔍 altstadt                                              │
├──────────────────────────────────────────────────────────┤
│ VERANSTALTUNGEN                                          │
│  ▤ Flohmarkt Altstadt · So 07.06.         ↵ öffnen · Space 👁│
│  ▤ Flohmarkt Altstadt · So 05.07.                         │
│ GENEHMIGUNGEN                                            │
│  ▣ Marktgenehmigung Altstadt 2027 · beantragt             │
│ AKTIONEN                                                 │
│  + Veranstaltung aus Vorlage erzeugen                     │
│ SEITEN                                                   │
│  ▣ Logbuch · Altstadt                                     │
└──────────────────────────────────────────────────────────┘
 Umlaut-insensitive (koln = Köln), German synonyms; → previews the selection.
```

## W13 · Benachrichtigungen
```
│ Benachrichtigungen  [Alle][Mir zugewiesen][@Erwähnt][Fristen]                     │
│ ● ! Überfällig: Toiletten bestellen · Food & Wine           2 T   [✓] [Später]   │
│ ● 💬 Jonas hat dich erwähnt · Halteverbot aufstellen        1 h   [✓] [Später]   │
│   📅 6 Fristen verschoben (+7 T) · Flohmarkt Altstadt        3 h   [✓]            │
```

## W14 · Tablet/phone: collapsed sidebar, single column
```
Tablet (< 1024 px)                                  Phone (390 px, Team · Schichten)
┌────┬──────────────────────────────────────────┐   ┌──────────────────────────────┐
│ ⌂  │ Übersicht                 🔍  [+]  🔔 3   │   │ ☰  Schichten · Sa 16.05.  🔔 │
│ ▦  ├──────────────────────────────────────────┤   ├──────────────────────────────┤
│ ▥  │ HEUTE FÄLLIG  [Alle 12][Geld 3] …        │   │ Food & Wine Neuss            │
│ ▤  │ ! Rate 2/3 Standgebühr …       [Bezahlt] │   │ Aufbau 05:00–09:00           │
│ ▣  │ …                                        │   │  Dieter  ⏱ 05:02 – [Ende]    │
│ …  │ NÄCHSTES WOCHENENDE (one column)         │   │  Ayşe    ⏱ –        [Start]  │
└────┴──────────────────────────────────────────┘   └──────────────────────────────┘
```
 Below 1024 px the sidebar collapses to icons (hamburger on phones); pages stack into one column; drawers open full
 width. Staff/shift screens have the 390 px variant; field crew get magic-link pages in Phase 2.

## W15 · States
```
Empty:           Noch keine Genehmigungen für diesen Ort.   [Aus Vorlage anlegen] [Manuell anlegen]
Filtered empty:  Keine Treffer für „Plakate“ in Nippes.     [Filter zurücksetzen]
Loading:         ▭▭▭▭▭▭▭▭ ▭▭▭▭ ▭▭  (skeleton rows shaped like the table)
Error:           Konnte nicht geladen werden.  [Erneut versuchen]   (input is kept)
Record placeholders (page, Vorschau or drawer from an old link): "Veranstaltung gelöscht" · "Keine Berechtigung"
```

---

## Later phases (outlook, same shell)
- **Phase 2:** *Buchungen* (per-event queue + rows/slots) and *Postfach* (Outlook-like list + reading area) become
  sidebar modules (today shown under SPÄTER). Staff magic-link page (mobile, single column).
- **Phase 3:** *Lageplan* (map) view; the field PWA is separate single-column pages.
