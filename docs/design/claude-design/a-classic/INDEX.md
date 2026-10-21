# Claude Design output · direction A (classic screens)

Clickable mid-fidelity prototype of the Phase 1 screens, produced in Claude Design from the v1 prompt
(`git show a241381:docs/product/claude-design-prompt.md`) plus the follow-up
[`claude-design-prompt-v1-update.md`](../../../product/claude-design-prompt-v1-update.md). Uploaded 2026-10-21.
Chosen direction: **A, classic screens** ([ADR 0019](../../../architecture/adr/0019-classic-screens.md)).

**How to view:** open `index.html` in a browser (self-contained; only Inter is loaded from Google Fonts). The
floating button *Bildschirme (53)* switches screens; each screen also has its own anchor, e.g.
`index.html#Event-Board`. The design tokens and components extracted from it are in
[`apps/web/src/app/globals.css`](../../../../apps/web/src/app/globals.css) and
[`../../component-inventory.md`](../../component-inventory.md).

Where the prototype and [`wireframes.md`](../../../product/wireframes.md) differ, the prototype wins unless the
decisions log says otherwise. Sample data in the prototype is illustrative (week of Wed 13.05.2026, KW 20).

## 1 · Übersicht (Geschäftsführung) · Kalender rechts

| # | Screen / state | Anchor |
|---|---|---|
| 1 | Übersicht | [`#Main`](./index.html#Main) |
| 1b | Filter Geld | [`#Uebersicht-Finanzen`](./index.html#Uebersicht-Finanzen) |
| 1c | Leer: nichts fällig | [`#Uebersicht-Leer`](./index.html#Uebersicht-Leer) |
| 1d | Flow 1 · Rate im Drawer | [`#Uebersicht-Rate`](./index.html#Uebersicht-Rate) |
| 1e | Bezahlt + Toast Rückgängig | [`#Uebersicht-Toast`](./index.html#Uebersicht-Toast) |
| 1f | Vorschau-Sheet | [`#Uebersicht-Vorschau`](./index.html#Uebersicht-Vorschau) |
| 1g | Befehlspalette ⌘K | [`#Uebersicht-Suche`](./index.html#Uebersicht-Suche) |
| 1h | Dunkel | [`#Uebersicht-Dunkel`](./index.html#Uebersicht-Dunkel) |
| 1i | Kalender · Monat | [`#Kalender`](./index.html#Kalender) |
| 1j | Kalender · Liste 6 Wochen | [`#Kalender-Liste`](./index.html#Kalender-Liste) |
| 1k | Kalender · nur Märkte + Genehmigungen | [`#Kalender-Gefiltert`](./index.html#Kalender-Gefiltert) |

## 2 · Veranstaltungen

| # | Screen / state | Anchor |
|---|---|---|
| 2 | Veranstaltungen · Liste | [`#Veranstaltungen`](./index.html#Veranstaltungen) |
| 2b | Kalender mit KW | [`#Veranstaltungen-Kalender`](./index.html#Veranstaltungen-Kalender) |
| 2c | Vorschau-Sheet | [`#Veranstaltungen-Vorschau`](./index.html#Veranstaltungen-Vorschau) |
| 2d | Flow 5 · Aus Vorlage · Schritt 2 | [`#Veranstaltungen-Vorlage`](./index.html#Veranstaltungen-Vorlage) |
| 2e | Aus Vorlage · Schritt 3 | [`#Veranstaltungen-Vorlage3`](./index.html#Veranstaltungen-Vorlage3) |
| 2f | Dichte Kompakt | [`#Veranstaltungen-Kompakt`](./index.html#Veranstaltungen-Kompakt) |
| 2g | Laden (Skeleton) | [`#Veranstaltungen-Laden`](./index.html#Veranstaltungen-Laden) |
| 2h | Fehler | [`#Veranstaltungen-Fehler`](./index.html#Veranstaltungen-Fehler) |

## 3 · Veranstaltung · Board

| # | Screen / state | Anchor |
|---|---|---|
| 3 | Veranstaltung · Board | [`#Event-Board`](./index.html#Event-Board) |
| 3b | Flow 2 · Karte ziehen | [`#Board-Ziehen`](./index.html#Board-Ziehen) |
| 3c | Zugewiesen + Rückgängig | [`#Board-Zugewiesen`](./index.html#Board-Zugewiesen) |
| 3d | Abgehakt + Rückgängig | [`#Board-Erledigt`](./index.html#Board-Erledigt) |
| 3e | Kartenmenü ⋯ | [`#Board-Menue`](./index.html#Board-Menue) |
| 3f | Nach Person | [`#Board-NachPerson`](./index.html#Board-NachPerson) |
| 3g | Arbeitslast | [`#Board-Arbeitslast`](./index.html#Board-Arbeitslast) |
| 3h | Aufgaben-Drawer | [`#Board-Aufgabe`](./index.html#Board-Aufgabe) |
| 3i | Tab Geld | [`#Event-Geld`](./index.html#Event-Geld) |
| 3j | Dunkel | [`#Board-Dunkel`](./index.html#Board-Dunkel) |

## 4 · Vorlagen

| # | Screen / state | Anchor |
|---|---|---|
| 4 | Vorlagen · Editor | [`#Vorlagen`](./index.html#Vorlagen) |
| 4b | Auf Veranstaltungen anwenden… | [`#Vorlagen-Anwenden`](./index.html#Vorlagen-Anwenden) |

## 5 · Logbuch (Genehmigungen)

| # | Screen / state | Anchor |
|---|---|---|
| 5 | Logbuch · Matrix | [`#Logbuch`](./index.html#Logbuch) |
| 5b | Flow 3 · Fehlt → Aufgabe | [`#Logbuch-Drawer`](./index.html#Logbuch-Drawer) |
| 5c | Zeitstrahl | [`#Logbuch-Zeitstrahl`](./index.html#Logbuch-Zeitstrahl) |
| 5d | Gefiltert leer | [`#Logbuch-Gefiltert`](./index.html#Logbuch-Gefiltert) |
| 5e | Echt leer | [`#Logbuch-Leer`](./index.html#Logbuch-Leer) |

## 6 · Team (Stunden & Minijob)

| # | Screen / state | Anchor |
|---|---|---|
| 6 | Team · Monatsraster | [`#Team`](./index.html#Team) |
| 6b | Warnung beim Tippen | [`#Team-Eingabe`](./index.html#Team-Eingabe) |
| 6c | Flow 4 · Begründung | [`#Team-Begruendung`](./index.html#Team-Begruendung) |
| 6d | Abschluss · Prüfen | [`#Team-Abschluss`](./index.html#Team-Abschluss) |
| 6e | Abschluss · Sperren | [`#Team-Sperren`](./index.html#Team-Sperren) |
| 6f | Schichten je Veranstaltung | [`#Team-Schichten`](./index.html#Team-Schichten) |
| 6g | Schichten · mobil 390 | [`#Team-Mobil`](./index.html#Team-Mobil) |

## 7 · Finanzen

| # | Screen / state | Anchor |
|---|---|---|
| 7 | Finanzen · Raten inline | [`#Finanzen`](./index.html#Finanzen) |
| 7b | Detail-Drawer | [`#Finanzen-Drawer`](./index.html#Finanzen-Drawer) |
| 7c | Bezahlt + Rückgängig | [`#Finanzen-Toast`](./index.html#Finanzen-Toast) |
| 7d | Belege fehlen | [`#Finanzen-Belege`](./index.html#Finanzen-Belege) |

## 8 · Firma  ·  9 · Benachrichtigungen

| # | Screen / state | Anchor |
|---|---|---|
| 8 | Firma | [`#Firma`](./index.html#Firma) |
| 9 | Benachrichtigungen | [`#Benachrichtigungen`](./index.html#Benachrichtigungen) |

## Komponenten

| # | Screen / state | Anchor |
|---|---|---|
|  | Komponenten-Legende | [`#Legende`](./index.html#Legende) |
| Komponente | Sidebar | [`#Sidebar`](./index.html#Sidebar) |
| Profilmenü | Design + Dichte | [`#Sidebar-Profil`](./index.html#Sidebar-Profil) |
| Komponente | Topbar | [`#Topbar`](./index.html#Topbar) |
