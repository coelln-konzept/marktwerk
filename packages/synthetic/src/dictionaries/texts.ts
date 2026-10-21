import type { EventTypeKey, VendorCategory } from "../types";

/** Sentences for event presets' public text. Each preset gets one or two of these plus a venue sentence. */
export const PUBLIC_TEXT_SENTENCES: Record<EventTypeKey, readonly string[]> = {
  flea: [
    "Trödel, Bücher, Kleidung und kleine Schätze aus Haushaltsauflösungen warten auf neue Besitzer:innen.",
    "Privatleute und kleine Händler:innen bieten ihre Sachen an, zum Stöbern und Feilschen.",
    "Die Stände sind ab 08:00 Uhr geöffnet, Kaffee und Kuchen gibt es am Rand des Platzes.",
  ],
  antique: [
    "Porzellan, Silber, Möbel und Gemälde von Antiquar:innen aus der Region.",
    "Auf dem Antikmarkt gibt es ausschließlich Antiquitäten und Sammlerstücke, keine Neuware.",
    "Ein Termin für Sammler:innen und alle, die es gern alt mögen.",
  ],
  city_festival: [
    "Musik, Kulinarik und ein Programm für die ganze Familie.",
    "Drei Tage Stadtfest mit Bühne, Ständen und Kinderprogramm.",
    "Der Eintritt ist frei, Essen und Getränke gibt es an den Ständen.",
  ],
  food_wine: [
    "Regionale Weine, Käse und Spezialitäten von Produzent:innen aus dem Rheinland.",
    "Verkostungen und Gespräche mit den Winzer:innen direkt am Stand.",
    "Mit Sitzplätzen und Musik am Nachmittag.",
  ],
};

export const EVENT_NOTES: readonly string[] = [
  "Ausweichtermin bei starkem Regen ist noch nicht festgelegt.",
  "Baustelle in der Nähe, Anfahrt über die Umgehung.",
  "Ordnungsamt bittet um Rückmeldung zu den Halteverboten bis 14 Tage vorher.",
  "Zusätzliche Toilette für die Kinderecke vereinbart.",
];

/** Free-text vendor notes. Kept short and German, like the notes the office types in by hand. */
export const VENDOR_NOTES: readonly string[] = [
  "Möchte immer Platz B-14, bitte nach Möglichkeit berücksichtigen.",
  "Kommt mit Anhänger, braucht eine Ausfahrt nach hinten.",
  "Zahlt gern bar, bitte Wechselgeld bereithalten.",
  "Nicht neben Lebensmittelständen, wegen Geruch von Antiquitäten.",
  "Hat im Frühjahr zwei Standgespräche verpasst, bitte per Telefon bestätigen.",
  "Ist ehrenamtlich bei der Kinderecke aktiv.",
  "Verkauft nur Vintage-Kleidung, bitte auf Warenkategorie achten.",
  "Bittet um Stromanschluss, Kühlbox für Getränke.",
  "Mag den Platz am Brunnen, sonst ist alles recht.",
  "Schickt Buchungen meist per E-Mail, Antwort bitte dort.",
];

export const BOOKING_COMMENTS: readonly string[] = [
  "Bitte möglichst nah am Eingang.",
  "Wir kommen zu zweit mit Transporter, Aufbau gegen 06:30 Uhr.",
  "Können erst ab 09:00 Uhr aufbauen, bitte Platz reservieren.",
  "Haben letztes Jahr schon teilgenommen, gern wieder am gleichen Platz.",
  "Bitte Strom, falls möglich.",
  "Wir verkaufen Schallplatten, brauchen einen Tisch mit Überdachung.",
  "Kann leider nur einen Tag, bitte Vormittag.",
  "Bitte Rechnung an die Firma, nicht an die Privatadresse.",
];

export const COMPANY_PREFIXES: readonly string[] = [
  "Antiquariat",
  "Trödel-Team",
  "Haushaltsauflösungen",
  "Kinderland",
  "Designwerkstatt",
  "Bücherkiste",
  "Stilmöbel",
  "Kleiderkammer",
];

export const COMPANY_SUFFIXES: readonly string[] = [
  "Rheinland",
  "am Dom",
  "Vorgebirge",
  "& Söhne",
  "Nord",
  "GmbH",
  "UG",
  "Einzelhandel",
];

/** Category weights for a vendor's first category. Antique vendors are generated separately (see vendors.ts). */
export const VENDOR_CATEGORY_WEIGHTS: readonly { value: VendorCategory; weight: number }[] = [
  { value: "antik", weight: 24 },
  { value: "trödel", weight: 20 },
  { value: "kleidung", weight: 14 },
  { value: "bücher_medien", weight: 8 },
  { value: "haushalt", weight: 10 },
  { value: "kinder", weight: 7 },
  { value: "design_handmade", weight: 9 },
  { value: "food", weight: 4 },
];

/** Towns vendors live in. Postal code prefixes are real regional prefixes, the rest of the code is random. */
export const VENDOR_CITIES: readonly { city: string; postalPrefix: string }[] = [
  { city: "Köln", postalPrefix: "50" },
  { city: "Bonn", postalPrefix: "53" },
  { city: "Neuss", postalPrefix: "41" },
  { city: "Düsseldorf", postalPrefix: "40" },
  { city: "Leverkusen", postalPrefix: "51" },
  { city: "Bergisch Gladbach", postalPrefix: "51" },
  { city: "Brühl", postalPrefix: "50" },
  { city: "Siegburg", postalPrefix: "53" },
  { city: "Troisdorf", postalPrefix: "53" },
  { city: "Hürth", postalPrefix: "50" },
  { city: "Pulheim", postalPrefix: "50" },
  { city: "Wesseling", postalPrefix: "50" },
];
