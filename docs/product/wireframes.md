# Wireframes (low fidelity)

Design rules (from research 03/04):
- **Back office = Linear/Notion-like**: dense tables, side drawers that keep context, keyboard
  shortcuts, ⌘K palette. **One market page with tabs**, not modules scattered around.
- **Field = utility app**: big targets, high contrast, offline, as few screens as possible.
- Status colours are consistent everywhere: 🟢 ok · 🟡 attention · 🔴 critical · ⚪ not started · 🔵 info.
- German UI by default. Wireframes mix DE labels with EN notes.

---

## P1-1 Boss view ("Übersicht")
```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ marktwerk        ⌘K Suchen…                                         🔔 4   Petra ▾   │
├────────────┬─────────────────────────────────────────────────────────────────────────┤
│ Übersicht  │ Übersicht                                   Zeitraum: [Nächste 14 Tage ▾]│
│ Meine Aufg.│                                                                         │
│ Märkte     │ ⚠ KRITISCH                                                              │
│ Orte       │ 🔴 Sondernutzung Rheinufer 08.11. – Antrag fällig in 2 Tagen (Jonas)    │
│ Vorlagen   │ 🔴 3 Aufgaben > 3 Tage überfällig – Aufbau-Team (Dieter)                │
│ Genehmig.  │ 🟡 Rolle "Kasse" für Alte Fabrik 21.11. nicht besetzt                   │
│ Wissen     │                                                                         │
│ Benachr.   │ MÄRKTE                       Genehm.  Aufgaben     Team   Belegung*  ⏱  │
│            │ So 08.11. Rheinufer   T-19    🟡 4/5   🟢 14/20    🟢     — (P2)        │
│ ── Phase 2 │ Sa 14.11. Parkhaus Süd T-25   🟢 3/3   🟡 6/18 2⚠   🟢     —              │
│ Postfach   │ Sa 21.11. Alte Fabrik  T-32   🔴 GEMA  🟢 4/18      🟡     —             │
│ Händler    │ So 29.11. Rheinufer   T-40    ⚪ 0/5   🟢 2/20      🟢     —             │
│ Buchungen  │                                                                         │
│            │ ÜBERFÄLLIG NACH PERSON          NICHT ZUGEWIESEN (3)                    │
│ Petra      │ Dieter ███ 3   Ayşe █ 1         • Toiletten bestellen – Parkhaus Süd   │
│ Geschäftsf.│ Jonas  █ 1                      • …                                     │
└────────────┴─────────────────────────────────────────────────────────────────────────┘
 *Belegung (occupancy) appears with Phase 2. Click a row → market page. Health is computed;
  "Überschreiben" needs a reason. ⏱ = stale (no activity for 7 days).
```

## P1-2 My tasks ("Meine Aufgaben")
```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ Meine Aufgaben     [Alle Märkte ▾] [Alle Phasen ▾] [Gespeicherte Ansicht ▾]   + (c)  │
├──────────────────────────────────────────────────────────┬───────────────────────────┤
│ ÜBERFÄLLIG (2)                                           │ ▸ Toiletten bestellen     │
│ ☐ 🔴 Toiletten bestellen      Parkhaus Süd · T-14  vor 2T │ Parkhaus Süd · 14.11.    │
│ ☐ 🟡 Absperrgitter prüfen     Rheinufer · T-7    gestern │ Phase: Vorbereitung      │
│ HEUTE (1)                                                │ Fällig: 31.10. 09:00     │
│ ☐    Händlerliste an Ordnungsamt  Rheinufer · T-19       │ (T-14, Markttag)         │
│ NÄCHSTE 7 TAGE (5)                                       │ Rolle: Büro → Ayşe       │
│ ☐    GEMA anmelden           Alte Fabrik · T-30   Mo     │ Status [In Arbeit ▾]     │
│ ☐ ⏸ Verkehrsanordnung       Rheinufer   wartet auf Amt  │ ☐ Angebot eingeholt      │
│ …                                                        │ ☐ Bestellung bestätigt   │
│ SPÄTER (12) ▸                                            │ 📎 Angebot_Dixi.pdf       │
│ OHNE DATUM (1) ▸                                         │ 💬 @Jonas: Lieferung bis  │
│                                                          │    6 Uhr möglich?         │
└──────────────────────────────────────────────────────────┴───────────────────────────┘
 Keyboard: j/k move · x done · a assign · s status · / search. The drawer keeps list context.
```

## P1-3 Market page (tabs)
```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ ← Märkte   So 08.11.2026 · Rheinufer-Promenade · Serie "Rheinufer 1. So"  🟡 geplant │
│ [Überblick] [Aufgaben 14/20] [Genehmigungen 4/5] [Team] [Dokumente] [Notizen] [Log]  │
├──────────────────────────────────────────────────────────────────────────────────────┤
│ AUFGABEN   Gruppieren: [Phase ▾]   Vorlage: Standard-Flohmarkt v7 (aktuell v8 → ⇪)    │
│ ▾ VORBEREITUNG                                                                       │
│   ✔ Sondernutzung beantragen          Genehmig. → Jonas    T-56  erledigt 12.09.     │
│   ☐ Händlerliste an Ordnungsamt       Büro → Ayşe          T-19  heute               │
│   ☐ Toiletten bestellen               Büro → Ayşe          T-14  📷                  │
│ ▾ MARKTTAG                                                                           │
│   ☐ 05:30 Absperrung aufbauen          Aufbau → Dieter     T     📷 Pflicht          │
│   ☐ 07:30 Rettungsweg prüfen           Marktleitung → Jonas T    ✋ Freigabe         │
│ ▾ NACHBEREITUNG                                                                      │
│   ☐ Reinigung abnehmen                 Marktleitung        T+1                       │
│ + Aufgabe   ⇪ "Vorlage aus diesem Markt aktualisieren"                               │
└──────────────────────────────────────────────────────────────────────────────────────┘
 Team tab: duty role → person (pre-filled from series). Changing it reassigns open tasks.
 Header "Datum ändern" opens the shift preview (flow 3).
```

## P1-4 Template editor
```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ Vorlage: Standard-Flohmarkt     v8 (Entwurf)  [Verwerfen] [Veröffentlichen…]         │
├──────────────────────────────────────────────────────────────────────────────────────┤
│ Phase   Titel                         Anker        Offset  Tage     Rolle     Nachweis│
│ Vorb.   Sondernutzung beantragen      Markttag     -56     Kalender Genehmig. 📎      │
│ Vorb.   Händlerliste an Ordnungsamt   Markttag     -19     Werktage Büro              │
│ Vorb.   Toiletten bestellen           Markttag     -14     Werktage Büro      📷      │
│ Markt   Absperrung aufbauen  05:30    Markttag      0      —        Aufbau    📷×2    │
│ Markt   Rettungsweg prüfen   07:30    Markttag      0      —        Marktltg. ✋      │
│ Nachb.  Reinigung abnehmen            Markttag     +1      Werktage Marktltg.         │
│ + Zeile  (Bedingung: nur wenn Ort = Halle)  (abhängig von: …)                         │
├──────────────────────────────────────────────────────────────────────────────────────┤
│ Veröffentlichen → "Auf Märkte anwenden?" ( ) keine (•) alle zukünftigen ( ) auswählen │
│ Vorschau: 9 Märkte · +1 Aufgabe · 2 geändert · 0 entfernt · erledigte bleiben unberührt│
└──────────────────────────────────────────────────────────────────────────────────────┘
```

## P1-5 Permit vault ("Genehmigungen")
```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ Genehmigungen   [Alle Orte ▾] [Status ▾] [Läuft ab ≤ 60 T]                 + Neu     │
├──────────────────────────────────────────────────────────────────────────────────────┤
│ Typ                 Ort / Markt          Behörde        Status     Antrag bis  Gültig │
│ §69 Festsetzung     Rheinufer (2027)     Ordnungsamt K  🟡 beantr.  —          —      │
│ Sondernutzung       Rheinufer 08.11.     Amt f. Straßen 🔴 offen    05.11. (2T) —      │
│ GEMA                Alte Fabrik 21.11.   GEMA           ⚪ n. beg.  21.10.      —      │
│ Haftpflicht         Firma                Allianz        🟢 gültig   —          31.03. │
│ Pachtvertrag        Parkhaus Süd         Fa. Meyer      🟡 läuft ab —          30.11. │
└──────────────────────────────────────────────────────────────────────────────────────┘
 Detail drawer: documents (versions), Auflagen → "als Aufgaben anlegen", covered markets,
 history (supersedes), responsible person, reminders sent (escalation log).
```

## P1-6 Notification center
```
┌───────────────────────────────────────────────────────────┐
│ Benachrichtigungen   [Alle] [Mir zugewiesen] [@Erwähnt]   │
│                      [Fristen] [Freigaben]  [Erledigt]    │
├───────────────────────────────────────────────────────────┤
│ ● 🔴 Überfällig: Toiletten bestellen · Parkhaus Süd   2T  │
│ ● 💬 Jonas hat dich erwähnt · Absperrgitter prüfen    1h  │
│   📅 6 Termine verschoben (+7 T) · Rheinufer 08.11.   3h  │
│   ✋ Freigabe angefragt · Rettungsweg prüfen        gest. │
│ hover: [✓ Erledigt] [☆ Merken] [⏰ Später] [Nicht folgen] │
└───────────────────────────────────────────────────────────┘
```

## P1-7 Market-day checklist (mobile, online in P1, offline in P3)
```
┌─────────────────────────────┐
│ ⚡ Rheinufer · So 08.11.     │
│ Aufbau 3/7 · Markt 0/5      │
├─────────────────────────────┤
│ 05:30 Absperrung aufbauen   │
│ Dieter · 📷 2 Fotos Pflicht  │
│ [ 📷 Foto ]  [ ✓ Erledigt ] │
├─────────────────────────────┤
│ 06:00 Toiletten geliefert?  │
│ [ ✓ Ja ]  [ ✗ Problem ]     │
│  ✗ → Notiz + Foto Pflicht   │
├─────────────────────────────┤
│ [Checkliste] [Tagesblatt] [!]│
└─────────────────────────────┘
```

---

## P2-1 Inbox triage (3 panes)
```
┌──────────────────────┬─────────────────────────────────────┬─────────────────────────┐
│ POSTFACH buchung@    │ Stand für 08.11. + Bus?             │ 👤 Maria Schmidt ⭐      │
│ [Offen 12] [Mir] [⏰]│ maria.vintage@mail.de · vor 10 Min  │ Stammhändlerin seit 2023│
│                      │─────────────────────────────────────│ Vintage-Kleidung        │
│ ● Maria Schmidt  10m │ Hallo, kann ich meine üblichen 4 m  │ Stammplatz: B-14 (4 m)  │
│   Stand 08.11.+Bus   │ am 08.11. buchen? Ich komme diesmal │ Letzte 6 Märkte: 6/6 ✔  │
│ ○ Lukas Weber    1h  │ mit dem VW-Bus.                     │─────────────────────────│
│   Rechnung #402 @Ann │                                     │ ⚡ AKTIONEN              │
│ ○ Ordnungsamt    3h  │ 💬 intern · Jonas: @Anna passt der  │ [+ Buchungsentwurf]     │
│   Genehmigung 8821   │    Bus auf B-14? (5 m nötig)        │  Markt [08.11. ▾]       │
│                      │─────────────────────────────────────│  Länge [4] → 5 m (Bus) │
│                      │ [Antworten] [Vorlage ▾] [⏰] [✓]     │  Platz [B-14 ▾] 🟡 frei │
│                      │                                     │  Preis 68,00 € (auto)   │
│                      │                                     │ [+ Aufgabe] [Verknüpfen]│
└──────────────────────┴─────────────────────────────────────┴─────────────────────────┘
```

## P2-2 Scheduler matrix (rows × dates)
```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ Belegung · Serie Rheinufer   [Okt][Nov][Dez]      Wartend: 08.11. (12) 29.11. (3)    │
├────────────┬───────────────┬───────────────┬───────────────┬────────────────────────┤
│ Reihe      │ 08.11.        │ 29.11.        │ 06.12.        │ Unplatziert (12) ▸     │
│ A (40 m)   │ ████████░░ 34 │ ██████░░░░ 26 │ ███░░░░░░░ 12 │ Marco's Grill 6 m ⚡    │
│ B (32 m)   │ ██████████ 32 │ ████████░░ 27 │ ██░░░░░░░░  8 │ Lisa 3 m              │
│ C Food     │ ███░░░░░░░  3/8 slots       … │               │ …  (ziehen → Reihe)    │
└────────────┴───────────────┴───────────────┴───────────────┴────────────────────────┘
 Click a cell → row detail: metre intervals with vendors, status dots (placement · invoice).
```

## P3-1 Field mode check-in (offline)
```
┌─────────────────────────────┐
│ ⚡ LIVE Rheinufer · 08.11.   │
│ Da: 64/92 · ⚠ offline (3 ⇡) │
├─────────────────────────────┤
│ [ 📷 QR SCANNEN ]           │
│ [ + SPONTANHÄNDLER ]        │
│ 🔍 Name, Kennzeichen, Platz │
│ [Alle] [Fehlt 28] [Offen 5] │
├─────────────────────────────┤
│ A-03 Maria Schmidt 4m+Bus   │
│ 🟡 offen 68,00 €             │
│ [Bezahlt] [✓ Einchecken]    │
├─────────────────────────────┤
│ [Liste] [Plan] [Check] [!]  │
└─────────────────────────────┘
```

## P3-2 Map editor
```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ Lageplan Rheinufer   Ebenen: [●Stände] [●Infrastruktur] [●Rettungswege]  Färben nach:│
│ [Zahlung ▾]   Maßstab 1:500   [Hintergrund: Luftbild ◐ 60%]   [PDF] [Link für Amt]   │
├────────────┬─────────────────────────────────────────────────────────────────────────┤
│ Unplatziert│  ═══ Einfahrt A ═══════════════════════════════════════                 │
│ ▢ Marco 6m │  Reihe A  |A-01 4m 🟢|A-02 3m 🟢|A-03 5m 🟡|░ 3m frei ░|A-05 4m 🟢|    │
│ ▢ Lisa 3m  │  ░░░░░░░░░░░░░░░ Rettungsweg 3,5 m ░░░░░░░░░░░░░░░░░░░░                 │
│            │  Reihe B  |B-01⚡🟢|B-02⚡ [hier ablegen]|B-03 🔴|                        │
│ Mengen:    │  🚻 ×2   ⛔ Absperrgitter ×24   🗑 ×6                                   │
└────────────┴─────────────────────────────────────────────────────────────────────────┘
```
