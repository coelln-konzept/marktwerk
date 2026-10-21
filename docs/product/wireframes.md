# Wireframes v2 (from scratch)

**2026-10-21.** Based on the [UX concept](./ux-concept.md) and [research 09](../research/09-ui-ux-workspace.md).
Replaces the earlier screen-by-screen wireframes. Low fidelity: structure, content and interaction, not visual design.
German UI. Desktop frames ≈ 1440 px wide unless noted.

Legend: `▏` pane border · `[Tab ×]` pane tab · `⛓` follows another pane · `⤢` maximise · `⋯` menu ·
`👁` peek · `⇥` open to the side · ↻n carried over n days · ● ▲ ■ health (ok / attention / critical).

---

## W0 · App shell with the default workspace "Start"
```
┌──────────────┬───────────────────────────────────────────────────────────────────────────────────────────┐
│ marktwerk    │ [🔍 Suchen oder Befehl … ⌘K]   [Start] [Genehmigungen ×] [+]                 🔔 3   Jonas ▾│
│              ├────────────────────────────────────────────────────┬──────────────────────────────────────┤
│ ⌂ Start      │ [Heute fällig]                          ⤢ ⋯        │ [Nächstes Wochenende ×] ⛓          ⤢ ⋯ │
│ ▦ Board      │ Alle 12 · Geld 3 · Genehmigungen 2 · Stunden 3 ·   │ KW 23 · Sa 06.06. – So 07.06.        │
│ ▤ Veranstalt.│ Aufgaben 4                                         │                                      │
│ ▣ Logbuch    │ ÜBERFÄLLIG                                         │ ■ Flohmarkt Altstadt  So 07.06.     │
│ ☺ Team       │ ! 💶 Rate 2/3 Standgebühr Altstadt   6.000 € [Bezahlt]│   Genehmigung Wasser fehlt          │
│ € Finanzen   │ ! ▤ Plakatierung Neuss beantragen     Jonas [Öffnen]│   Aufgaben 14/20 · Team 5/6 · 34 h  │
│ ⌂ Firma      │ HEUTE                                              │ ▲ Antikmarkt Linz     Sa 06.06.     │
│ ☷ Händler    │ ⏱ 3 Schichten ohne Zeiten · Tag 5/7      [Erfassen]│   Aufgaben 9/14 · Team 4/5 · 22 h   │
│ ⎘ Vorlagen   │ ↻2 Toiletten bestellen · Food & Wine      [Erledigt]│ ● Flohmarkt Bonn      So 07.06.     │
│ ? Wissen     │ DIESE WOCHE                                        │   alles im Plan · 18 h              │
│              │   Standrohr zurückgeben · Stadtwerke · Fr  [Erledigt]│                                      │
│ ★ Favoriten  │   Halteverbot aufstellen · Altstadt · Sa   [Öffnen]│ Klick auf eine Zeile links öffnet    │
│   Geld       │   …                                                │ sie hier als Tab (folgt der Liste).  │
│ ── Phase 2   │                                                    │                                      │
│ Buchungen    │                                                    │                                      │
│ Postfach     │                                                    │                                      │
│ Inventar     │                                                    │                                      │
│ 🔔 ⚙ Profil  │                                                    │                                      │
└──────────────┴────────────────────────────────────────────────────┴──────────────────────────────────────┘
```
- Everyone starts here (one default for everyone). Each row has **one primary action**; Space = peek; click = open
  in the right pane; Shift+click = open as a new pane.
- Workspace tabs in the top bar work like browser tabs; `+` opens the workspace menu (W1c).

## W1 · Workspace operations

**W1a · Split by dragging a tab** (drop zones appear while dragging; max 3 groups)
```
│ [Heute fällig] [Logbuch]  ← dragging "Logbuch" …     ▏                                     │
│  ┌──────────────┬──────────────┐                      ▏   ┌───────────────────┐            │
│  │              │   ░░░░░░░░   │  ← drop on right half▏   │  ░ Nach rechts ░  │            │
│  │   (tabs)     │   ░ rechts ░ │    = new group         ▏   └───────────────────┘            │
│  └──────────────┴──────────────┘                      ▏                                     │
│ Toast after drop: "Logbuch nach rechts verschoben  [Rückgängig]"                           │
```
Keyboard / click alternative: pane menu `⋯ → Nach rechts verschieben / Nach unten verschieben / In Gruppe …`,
or Ctrl+M then arrows (live preview). If 3 groups exist, the 4th drop zone is disabled with tooltip
"Maximal 3 Bereiche – zuerst einen schließen".

**W1b · Pane header & menu**
```
┌─────────────────────────────────────────────────────────────────────────────┐
│ ▤ Flohmarkt Altstadt · So 07.06.   ⛓ folgt: Veranstaltungen   ⤢  ⋯  ×      │
├─────────────────────────────────────────────────────────────────────────────┤
│  ⋯  Link kopieren                                                          │
│     Als Seite öffnen                                                       │
│     Nach links / rechts / unten verschieben                                │
│     Verknüpfung lösen                                                      │
│     Schließen                                                              │
```

**W1c · Workspace menu (`+` or the active workspace tab's ▾)**
```
┌──────────────────────────────────────────────┐
│ ARBEITSBEREICH "Genehmigungen"  (geändert •) │
│  Speichern                          Ctrl+S   │
│  Als neuen Arbeitsbereich speichern…         │
│  Auf gespeicherten Stand zurücksetzen        │
│  🔒 Layout sperren                           │
│  Umbenennen · Löschen                        │
│ ──────────────────────────────────────────── │
│ MEINE ARBEITSBEREICHE (4 von 8)              │
│  Start · Genehmigungen · Geld · Montag       │
│ ──────────────────────────────────────────── │
│ NEU                                          │
│  Leerer Arbeitsbereich                       │
│  Aus Team-Vorlage…  (Bürotag, Genehmigungen, │
│                      Geld, Wochenende)       │
│ ──────────────────────────────────────────── │
│  Start wiederherstellen                      │
│  (Manager/Inhaber:) Als Team-Vorlage teilen… │
└──────────────────────────────────────────────┘
```

**W1d · Team template gallery** (copy on use; never live-linked)
```
┌──────────────────────────────────────────────────────────────────────────────┐
│ Team-Vorlagen                                                                │
│ ┌────────────────────┐ ┌────────────────────┐ ┌────────────────────┐ ┌─────┐ │
│ │ Bürotag            │ │ Genehmigungen      │ │ Geld               │ │ Wo- │ │
│ │ ▭▭▭▭ │ ▭▭▭        │ │ ▭▭▭▭▭ │ ▭▭▭       │ │ ▭▭▭▭ │ ▭▭▭        │ │ chen│ │
│ │ Heute fällig|Board │ │ Logbuch|Veranst.   │ │ Zahlungen|Veranst. │ │ ende│ │
│ │ von Jonas          │ │ von Jonas          │ │ von Petra          │ │     │ │
│ │ [Kopie verwenden]  │ │ [Kopie verwenden]  │ │ [Kopie verwenden]  │ │ […] │ │
│ └────────────────────┘ └────────────────────┘ └────────────────────┘ └─────┘ │
└──────────────────────────────────────────────────────────────────────────────┘
```

## W2 · Open to the side & peek (every list)
```
│ Veranstaltungen                                           │
│ Datum      Name                 Ort        Status          │
│ So 07.06.  Flohmarkt Altstadt   Köln       ▲ geplant   👁 ⇥ ⋯│  ← hover icons: peek · open to the side · menu
│ Sa 06.06.  Antikmarkt Linz      Linz       ● bestätigt     │
```
**Peek sheet** (Space or 👁; closes with Esc; doesn't change the layout)
```
                                   ┌──────────────────────────────────────┐
                                   │ Flohmarkt Altstadt · So 07.06.  ⇥ × │
                                   │ ▲ Achtung: Genehmigung Wasser fehlt │
                                   │ Aufgaben 14/20 · Team 5/6 · 34 h    │
                                   │ Nächste Fristen                     │
                                   │  Fr Halteverbot aufstellen (Lars)   │
                                   │ [Als Bereich öffnen] [Seite]        │
                                   └──────────────────────────────────────┘
```

## W3 · View "Heute fällig" (detail)
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

## W4 · View "Board"
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
 allowance); amber > 80 %, red > 100 %.
```
**Arbeitslast** toggle: people × weeks grid with estimated hours per cell and the "≈ x Minijob-Monate" season total.

## W5 · View "Veranstaltungen" + generate from a preset
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

## W6 · View "Veranstaltung" (tab Überblick)
```
┌───────────────────────────────────────────────────────────────────────────────────┐
│ ▤ Flohmarkt Altstadt · So 07.06.2026 · Köln Altstadt (Heumarkt) · Flohmarkt      │
│ Status: geplant (Genehmigung offen) · buchbar · Autoplätze frei    [Datum ändern…] │
│ [Überblick] [Board] [Genehmigungen 4/5] [Team 5/6] [Geld] [Dokumente] [Notizen] [Verlauf]│
├───────────────────────────────────────────────────────────────────────────────────┤
│ GESUNDHEIT ▲ Achtung                      NÄCHSTE FRISTEN                          │
│  Genehmigungen ▲ Wasser fehlt              Fr 05.06. Halteverbot aufstellen · Lars │
│  Aufgaben ● 14/20 erledigt                 Sa 06.06. Standrohr abholen · Dieter    │
│  Team ● 5/6 Rollen besetzt                 So 07.06. 05:00 Aufbau                  │
│  Geld ● Rate 2/3 bezahlt                                                          │
│ AUFWAND 34 h geplant · 18 h erledigt       ZEITPLAN So 05:00 Aufbau · 08:00 Öffnung │
└───────────────────────────────────────────────────────────────────────────────────┘
```

## W7 · Workspace "Genehmigungen": Logbuch matrix + linked event
```
┌──────────────────────────────────────────────────────────┬────────────────────────────────────────┐
│ [Logbuch]                                         ⤢ ⋯    │ [Flohmarkt Altstadt ×] ⛓ folgt: Logbuch │
│ Saison [2027 ▾]  (•) Matrix ( ) Zeitstrahl   Fehlt 7 · Beantragt 12                              │
│           │ STADT                                    │ EXTERN        │ Genehmigungen 3/5            │
│ Ort       │ Markt     Wasser   Plakate   Halteverb.│ Toil.  Eigent.│ ✓ Marktgenehmigung 2027      │
│ Altstadt  │ ⏳ Antw.Jan ✓ –12/27 ! fehlt   ✓ je T. │ ✓ RV27  –     │   beantragt · Antwort ~Jan   │
│ Nippes    │ ✓ –12/27  ✓ –12/27 ⏳ beantr. ✓       │ ✓      –      │ ! Wasser 2027 fehlt          │
│ Linz      │ ! fehlt   ✓        –        –         │ ✓      ✓ MJV  │   Frist KW 48 · [Aufgabe]    │
│  ⚑ Frist KW 45                                     │               │ ✓ Halteverbot je Termin      │
└──────────────────────────────────────────────────────────┴────────────────────────────────────────┘
 Cells = icon + short text (never colour alone). Click a cell → the right pane follows (event or permit).
```

## W8 · View "Vorlage (Ablauf)" editor: usually maximised
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

## W9 · View "Team · Stunden" + month close
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

## W10 · View "Finanzen · Zahlungen"
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
 "wird gespeichert…" until the server confirms. Counter in header: "2 Belege fehlen".
```

## W11 · View "Firma"
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
│  ▤ Flohmarkt Altstadt · So 07.06.        ↵ öffnen ⇧↵ daneben│
│  ▤ Flohmarkt Altstadt · So 05.07.                         │
│ GENEHMIGUNGEN                                            │
│  ▣ Marktgenehmigung Altstadt 2027 · beantragt             │
│ AKTIONEN                                                 │
│  + Veranstaltung aus Vorlage erzeugen                     │
│ ARBEITSBEREICHE                                          │
│  ⧉ Genehmigungen                                          │
└──────────────────────────────────────────────────────────┘
 Umlaut-insensitive (koln = Köln), German synonyms; → previews the selection.
```

## W13 · View "Benachrichtigungen"
```
│ Benachrichtigungen  [Alle][Mir zugewiesen][@Erwähnt][Fristen]                     │
│ ● ! Überfällig: Toiletten bestellen · Food & Wine           2 T   [✓] [Später]   │
│ ● 💬 Jonas hat dich erwähnt · Halteverbot aufstellen        1 h   [✓] [Später]   │
│   📅 6 Fristen verschoben (+7 T) · Flohmarkt Altstadt        3 h   [✓]            │
```

## W14 · Tablet (< 1024 px): one pane + switcher
```
┌───────────────────────────────────────────────┐
│ ☰  marktwerk     [Bereich: Heute fällig ▾] 🔔 │
├───────────────────────────────────────────────┤
│ Heute fällig                                  │
│ ! Rate 2/3 Standgebühr …            [Bezahlt] │
│ …                                             │
└───────────────────────────────────────────────┘
 "Bereich" switcher lists the workspace's other panes; no docking below 1024 px.
```

## W15 · States
```
Empty:           Noch keine Genehmigungen für diesen Ort.   [Aus Vorlage anlegen] [Manuell anlegen]
Filtered empty:  Keine Treffer für „Plakate“ in Nippes.     [Filter zurücksetzen]
Loading:         ▭▭▭▭▭▭▭▭ ▭▭▭▭ ▭▭  (skeleton rows shaped like the table)
Error:           Konnte nicht geladen werden.  [Erneut versuchen]   (input is kept)
Pane placeholders: "Diese Ansicht gibt es nicht mehr – entfernen" · "Veranstaltung gelöscht" · "Keine Berechtigung"
```

---

## Later phases (outlook, same shell)
- **Phase 2:** *Buchungen* view (per-event queue + rows/slots) and *Postfach* (Outlook-like 3 panes) ship as views;
  a team template "Buchungstag" = Postfach | Buchungen (follows). Staff magic-link page (mobile, no workspace).
- **Phase 3:** *Lageplan* view (map) docks next to *Buchungen*; field PWA is separate single-column pages.
