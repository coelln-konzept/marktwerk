# Wireframes (low fidelity)

Revised 2026-10-21 after the client meeting. Rules:
- **Office = dense, keyboard-friendly, side drawers** (Linear/Notion-like); **one event page with tabs**.
- **Field crew = WhatsApp + one mobile page via magic link.** No app, no login.
- Consistent status colours: 🟢 ok · 🟡 attention · 🔴 critical · ⚪ not started · 🔵 info · ↻ carried over.
- German UI by default.

---

## P1-1 Owner dashboard ("Übersicht"): what's due today, ranked
```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ marktwerk     ⌘K Suchen…                                            🔔 6   Petra ▾  │
├────────────┬─────────────────────────────────────────────────────────────────────────┤
│ Übersicht  │ HEUTE FÄLLIG  [Alle] [💶 Finanzen] [Genehmigungen] [Aufgaben] [Team]    │
│ Board      │ 🔴 💶 Rate 2/3 Standgebühr Altstadt  6.000 € · fällig heute · Vermieter  │
│ Veranstalt.│ 🔴 📄 Plakatierung Neuss · Antrag bis heute (Jonas)                      │
│ Logbuch    │ 🟡 🔧 Standrohre zurückgeben · Stadtwerke · seit 1 Tag (Lars)            │
│ Team       │ 🟡 ⏱ 3 Schichten ohne Zeiten (Tag 5 von 7)                              │
│ Finanzen   │ 🟡 ↻3 Toiletten bestellen · Design-Markt 14.05. (Ayşe)                   │
│ Firma      │                                                                         │
│ Vorlagen   │ NÄCHSTES WOCHENENDE (4 Veranstaltungen)                                 │
│ Wissen     │            Genehm.  Aufgaben    Team     Geld      Aufwand              │
│ ── Phase 2 │ Flohmarkt Altstadt  🟢      🟢 18/20    🟢 6/6   🟢        34 h         │
│ Buchungen  │ Antik/Design Linz   🟡 Wasser 🟡 9/14   🟡 4/5   🟢        22 h         │
│ Postfach   │ Food & Wine Neuss   🔴 Plakat 🟢 12/15   🟢 5/5   🟡 Rate   41 h         │
│ Inventar   │ Flohmarkt Bonn      🟢      🟢 16/16    🔴 2/4   🟢        18 h         │
│            │                                                                         │
│ Petra      │ SAISON: 46 Veranst. · 1.540 h geschätzt ≈ 3,1 Minijobber/Monat zusätzlich│
└────────────┴─────────────────────────────────────────────────────────────────────────┘
 The finance filter shows only money items. Click → drawer. Health is computed; overriding needs a reason.
```

## P1-2 Event board (kanban) with people rail
```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ ← Food & Wine Neuss · Sa 16.05.2026 · geplant (Genehmigung offen)                     │
│ [Überblick] [Board] [Genehmigungen 3/5] [Team] [Geld] [Dokumente] [Notizen] [Log]     │
├──────────────────────────────────────────────────────────────────────┬───────────────┤
│ VORBEREITUNG (9)   DIESE WOCHE (4)     HEUTE (2)        ERLEDIGT (12)│ TEAM  Woche   │
│ ┌──────────────┐   ┌──────────────┐   ┌──────────────┐               │ 🧑 Jonas      │
│ │Flyer drucken │   │Halteverbot   │   │↻2 Toiletten  │               │ ███████░ 14/16h│
│ │Komm. · 2 h   │   │aufstellen    │   │bestellen     │               │ 🧑 Lars       │
│ │T-21 · —      │   │Logistik·1 h  │   │Büro · 30 min │               │ ████░░░ 8/20h │
│ └──────────────┘   │→ Lars        │   │→ Ayşe        │               │ 🧑 Dieter (MJ)│
│ ┌──────────────┐   └──────────────┘   └──────────────┘               │ ██████ 12/14h │
│ │Wasser: Stand-│                                                     │  Rest: 14 h   │
│ │rohr reservier│   ← drag a card onto a person to assign →           │ 🧑 Ayşe (MJ)  │
│ │Logistik·30min│                                                     │ ███░░░ 6/43h  │
│ └──────────────┘                                                     │               │
├──────────────────────────────────────────────────────────────────────┴───────────────┤
│ Σ geschätzt 41 h · erledigt 18 h · 📨 2 WhatsApp-Nachrichten bereit [Senden]          │
└──────────────────────────────────────────────────────────────────────────────────────┘
 Load bars: estimated hours this week vs. capacity (for Minijobbers: remaining allowance).
 Drop → undo toast → message queued (debounced). Swimlane toggle: [Spalten] [Nach Person].
```

## P1-3 Template editor (timeline with estimates)
```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ Vorlage: Flohmarkt Standard   v3 (Entwurf)    [Verwerfen] [Veröffentlichen]           │
├──────────────────────────────────────────────────────────────────────────────────────┤
│ Phase  Kat.   Titel                       Anker        Offset  Rolle      Aufwand  ✓ │
│ Vorb.  Genh.  Marktgenehmigung beantragen  Veranst.tag  -180    Genehmig.  3 h     📎│
│ Vorb.  Genh.  Plakatierung + Aufkleber     Veranst.tag  -42     Genehmig.  1 h       │
│ Vorb.  Komm.  Termin auf Website (geplant) Veranst.tag  -150    Komm.      15 min    │
│ Vorb.  Komm.  Flyer drucken lassen         Veranst.tag  -28     Komm.      2 h       │
│ Vorb.  Logis. Standrohr reservieren        Veranst.tag  -14     Logistik   30 min    │
│ Vorb.  Büro   Buchungsschluss: Liste final Buchungsschl. 0      Büro       1 h       │
│ Markt  Logis. Halteverbot aufstellen 05:00 Veranst.tag   0      Aufbau     1 h    📷 │
│ Nachb. Logis. Standrohre zurückgeben       Veranst.tag  +1      Logistik   45 min    │
│ Nachb. Geld   Abschluss: Zahlungen prüfen  Veranst.tag  +3      Büro       1 h       │
│ + Zeile                                          Σ Aufwand pro Veranstaltung: 34 h   │
├──────────────────────────────────────────────────────────────────────────────────────┤
│ Veröffentlichen ändert keine bestehenden Veranstaltungen.                             │
│ Danach optional: [Auf Veranstaltungen anwenden…]  (keine vorausgewählt, mit Vorschau) │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

## P1-4 Permit logbook ("Logbuch / Status quo")
```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ Logbuch   [Alle Orte ▾] [Stadt | Extern] [Saison 2027 ▾]   Fehlt: 7 · Beantragt: 12   │
├──────────────────────────────────────────────────────────────────────────────────────┤
│ ORT: Altstadt (Rheinufer)                                                             │
│  Stadt   Marktgenehmigung 2027     🟡 beantragt · Stadt entscheidet ~Jan · 9 Termine  │
│  Stadt   Wasser (Hydrant)          🟢 gültig bis 31.12. · 📎 Bescheid                 │
│  Stadt   Plakatierung              ⚪ fehlt · Antrag bis T-42 je Termin              │
│  Stadt   Halteverbot               🟢 je Termin, Vorlauf 14 T                        │
│  Extern  Toiletten (Fa. Dixi)      🟢 Rahmenvertrag 2027 · 💶 3 Raten                 │
│ ORT: Linz (Mehrjahresvereinbarung 2025–2028, Termine fix)                            │
│  Stadt   Marktgenehmigung 2027     ⚪ fehlt · Vorlauf 6 Monate → bis 01.11.          │
│  Extern  Einverständnis Grundstück 🟢 in Vereinbarung enthalten                       │
└──────────────────────────────────────────────────────────────────────────────────────┘
 Drawer: documents, conditions → tasks, stickers received (100) / used, fee → payable, history.
```

## P1-5 Team & hours ("Team")
```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ Team · Mai 2026   Grenze 603 € · Mindestlohn 13,90 €    [Monat abschließen] (bis 15.)│
├──────────────────────────────────────────────────────────────────────────────────────┤
│ Name     Vertrag  Satz    Std. (gearb.+geplant)  Verdienst   Rest      Jahr   Überschr.│
│ Dieter   Minijob  14,00€  29 + 12 = 41 h         574 €  🟡   2 h       4.980€   0/2  │
│ Ayşe     Minijob  13,90€  18 + 6  = 24 h         334 €  🟢   19 h      3.100€   1/2  │
│ Kemal    Minijob  15,00€  38 + 8  = 46 h         690 €  🔴   —         5.900€   1/2  │
│           ↳ Über 603 €: nur zulässig, wenn unvorhersehbar → [Begründung erfassen]    │
│ Jonas    Vollzeit  —      —                       —           —          —       —   │
├──────────────────────────────────────────────────────────────────────────────────────┤
│ ⏱ Fehlende Zeiten: 3 Schichten (Bonn 10.05.) · gesetzl. Frist 17.05.                 │
│ ⚠ Arbeitszeit: Kemal 11,5 h am 16.05. (max. 10 h)                                     │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

## P1-6 Payables ("Finanzen")
```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ Zahlungen  [Offen] [Fällig ≤ 14 T] [Überfällig] [Bezahlt]   [Veranstaltung ▾] [+ Neu]  │
├──────────────────────────────────────────────────────────────────────────────────────┤
│ Fällig     Was                              An           Rate     Betrag   Beleg     │
│ heute 🔴   Standgebühr Altstadt 2027        Vermieter    2/3      6.000 €  —         │
│ 21.05. 🟡  Genehmigungsgebühr Neuss         Stadt Neuss  1/1        640 €  —         │
│ 01.06.     Toiletten Rahmenvertrag          Dixi         2/3        900 €  —         │
│ 03.05. ✔   Standrohr-Miete Bonn             Stadtwerke   1/1         85 €  📎        │
├──────────────────────────────────────────────────────────────────────────────────────┤
│ Drawer: Ratenplan (Gesamt 15.000 € = 6.000 + 6.000 + 3.000 ✔), Erinnerungen,         │
│ [Als bezahlt markieren] → [📷 Beleg hinzufügen]  ·  Belege ohne Zuordnung: 2          │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

## P1-7 Staff page via magic link (mobile, no login)
```
┌─────────────────────────────┐
│ Hallo Dieter 👋              │
│ Mai: 29 h · Rest ca. 2 h    │
├─────────────────────────────┤
│ MEINE AUFGABEN              │
│ Standrohr abholen           │
│ Neuss · bis Fr 15.05.       │
│ [Zusagen] [✓ Erledigt]      │
│ [Kann nicht]                │
├─────────────────────────────┤
│ MEINE SCHICHTEN             │
│ Sa 16.05. Neuss · Aufbau    │
│ 05:00–14:00  [Zusagen]      │
│ So 10.05. Bonn · erledigt   │
│ Zeiten: 05:30–13:45 ✔       │
└─────────────────────────────┘
 Arrives via WhatsApp: "Neue Aufgabe: Standrohr abholen (Neuss, bis Fr). Details: <link>"
```

## P1-8 Company tab ("Firma")
```
┌──────────────────────────────────────────────────────────────────────────────┐
│ Firma   [Pflichttermine] [Fahrzeuge] [Versicherungen] [Dokumente]            │
├──────────────────────────────────────────────────────────────────────────────┤
│ 🔴 UVV-Prüfung Transit K-MW 123     fällig seit 12 T                          │
│ 🟡 HU Sprinter K-MW 456             in 21 T (24-Monats-Intervall, ≤ 3,5 t)    │
│ 🟡 KSK-Meldung                      bis 31.03.                                │
│ ⚪ Veranstalterhaftpflicht          Verlängerung 01.09.                       │
│ Fahrzeug-Mängel: Transit: Bremse quietscht (📷, Dieter, 3 T)                  │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## P2-1 Event booking queue (multi-date requests split per event)
```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ Buchungen · Flohmarkt Altstadt 07.06.   Belegt 312/400 m · Autoplätze 18/20 [ausgebucht ☐]│
│ Buchungsschluss Mo 01.06.                                         [+ Telefonbuchung]   │
├──────────────────────────────┬───────────────────────────────────────────────────────┤
│ ANFRAGEN (7)                 │ REIHE A (Rheinseite, Autoplätze links)                │
│ ● Maria S. ⭐ 4 m · 🚗 Bus    │ |A1 4m Klein|A2 3m 🚗Weber|A3 ░░░ 6m frei ░░|A4 …    │
│   via Website · auch 05.07.  │ REIHE B                                              │
│   "wie immer B-14"           │ |B12 3m|B13 4m|B14 ░ 4m frei (Stammplatz Maria) ░|   │
│ ○ Lukas W. 3 m               │                                                       │
│ ○ Ahmet K. 6 m · 🚗 Transit  │ → Anfrage auf Platz ziehen · Autoplatz: [Ja] [Nein]   │
│   (Auto 6 m ✔ passt)          │                                                       │
├──────────────────────────────┴───────────────────────────────────────────────────────┤
│ Bestätigung: Platzkarte B-14 · 4 m · Autoplatz: NEIN (ausgebucht) · 62,50 €  [Senden] │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

## P2-2 Payment check session (Mon/Wed/Fri)
```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ Zahlungseingang prüfen · Fr 05.06.   [Kontoauszug hochladen (CSV/CAMT)]               │
├──────────────────────────────────────────────────────────────────────────────────────┤
│ Bank: 31 Eingänge   ✔ 23 eindeutig   ? 4 unklar   ◐ 2 Teilzahlung   [Alle bestätigen] │
│ ? 62,50 €  "Schmidt Flohmarkt"  → Vorschlag: Maria Schmidt, Altstadt 07.06. [✔] [Suche]│
│ ◐ 30,00 €  "B-2026-0412"         → offen: 32,50 €                                     │
├──────────────────────────────────────────────────────────────────────────────────────┤
│ NACH FRIST UNBEZAHLT (6)   [Erinnerung ansehen & senden]  ← a person sends, logged     │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

## P3-1 Field day sheet (offline)
```
┌─────────────────────────────┐
│ ⚡ Altstadt · So 07.06.      │
│ offline · 3 ⇡ wartend       │
├─────────────────────────────┤
│ 05:00 Halteverbot prüfen 📷 │
│ 05:30 Standrohr anschließen │
│      Zähler: [_____] 📷     │
│ 06:00 Händler-Ankunft (64)  │
│ [Liste] [Plan] [Gespräch +] │
└─────────────────────────────┘
```

## P3-2 Stall map (from today's paper maps)
```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ Lageplan Altstadt  Ebenen: [●Stände] [●Autoplätze] [●Wasser/Strom] [●Rettungswege]    │
├────────────┬─────────────────────────────────────────────────────────────────────────┤
│ Unplatziert│  Reihe A |A1🟢|A2🟢🚗|A3 ░ frei ░|A4🟡|                                  │
│ ▢ Lisa 3m  │  ░░░░░░░ Rettungsweg 3,5 m ░░░░░░░                                      │
│ ▢ Marco 6m │  Reihe B |B12🟢|B13🟢|B14 [hier ablegen]|                               │
└────────────┴─────────────────────────────────────────────────────────────────────────┘
```
