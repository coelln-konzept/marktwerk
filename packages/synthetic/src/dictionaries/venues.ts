import type { VenueKind } from "../types";

export interface VenueBlueprint {
  key: string;
  /**
   * The Ort's name. Null where the client names the place only by its address: the name is then derived from the
   * address like the app does (`venueNameFromAddress`, "Köln – Riehler Gürtel").
   */
  name: string | null;
  /** How the place is described on the public website, e.g. "am Wilhelmplatz in Köln-Nippes". */
  publicPlace: string;
  kind: VenueKind;
  street: string;
  postalCode: string;
  city: string;
  lat: number;
  lng: number;
  accessInfo: string;
  /** Zones of a venue several markets share (Stadion: Vorplatz and P6). Null: 2–4 generic zones. */
  zones: readonly string[] | null;
  /** Key into CONTACT_BLUEPRINTS of the authority that issues the city permits. */
  cityAuthorityKey: string;
  /** Key of the authority that handles standpipes. Null falls back to the city authority. */
  waterAuthorityKey: string | null;
  /** Key into CONTACT_BLUEPRINTS of the landowner, or null when the city owns the ground. */
  landownerKey: string | null;
}

/*
 * The places of Coelln Konzept's markets (research 13 §2.1/§4): eight in Köln, Kerpen and Rösrath-Hoffnungsthal.
 * Place names and addresses are real (public squares and streets), coordinates approximate. The places of Coelln
 * Antik & Design (Neumarkt, Rheinauhafen, Flora, Gürzenich) are left out with that company. Landowners of the
 * private grounds are fictional.
 */
export const VENUE_BLUEPRINTS: readonly VenueBlueprint[] = [
  {
    key: "altstadt",
    name: "Köln Altstadt – Heumarkt und Alter Markt",
    publicPlace: "auf dem Heumarkt und dem Alter Markt in der Kölner Altstadt",
    kind: "municipal",
    street: "Heumarkt",
    postalCode: "50667",
    city: "Köln",
    lat: 50.9364,
    lng: 6.9608,
    accessInfo:
      "Anfahrt über die Pipinstraße. Zufahrt für Aussteller bis 09:30 Uhr, danach nur noch zu Fuß.",
    zones: ["Heumarkt", "Alter Markt"],
    cityAuthorityKey: "ordnungsamt_koeln",
    waterAuthorityKey: "wasser_koeln_standrohr",
    landownerKey: null,
  },
  {
    key: "riehler-guertel",
    name: null,
    publicPlace: "am Riehler Gürtel in Köln-Riehl",
    kind: "municipal",
    street: "Riehler Gürtel",
    postalCode: "50735",
    city: "Köln",
    lat: 50.9616,
    lng: 6.9726,
    accessInfo:
      "Straße wird ab 05:00 Uhr gesperrt (Parkverbot ab dem Vorabend). Anfahrt nur aus Richtung Amsterdamer Straße.",
    zones: null,
    cityAuthorityKey: "ordnungsamt_koeln",
    waterAuthorityKey: "wasser_koeln_standrohr",
    landownerKey: null,
  },
  {
    key: "nippes",
    name: null,
    publicPlace: "auf dem Wilhelmplatz in Köln-Nippes",
    kind: "municipal",
    street: "Wilhelmplatz",
    postalCode: "50733",
    city: "Köln",
    lat: 50.9677,
    lng: 6.9545,
    accessInfo:
      "Wochenmarktfläche, Anlieferung über die Florastraße. Stände werden am Morgen eingezeichnet.",
    zones: null,
    cityAuthorityKey: "ordnungsamt_koeln",
    waterAuthorityKey: "wasser_koeln_standrohr",
    landownerKey: null,
  },
  {
    key: "stadion",
    name: "RheinEnergie Stadion",
    publicPlace: "am RheinEnergie Stadion in Köln-Müngersdorf",
    kind: "private",
    street: "Aachener Straße 999",
    postalCode: "50933",
    city: "Köln",
    lat: 50.9335,
    lng: 6.8752,
    accessInfo:
      "Vorplatz über die Zufahrt Nord, Parkplatz P6 über die Junkersdorfer Straße. Nicht an Spieltagen.",
    zones: ["Vorplatz", "P6"],
    cityAuthorityKey: "ordnungsamt_koeln",
    waterAuthorityKey: null,
    landownerKey: "stadion_flaechen",
  },
  {
    key: "suedstadt",
    name: null,
    publicPlace: "rund um den Chlodwigplatz in der Kölner Südstadt",
    kind: "municipal",
    street: "Chlodwigplatz",
    postalCode: "50678",
    city: "Köln",
    lat: 50.9213,
    lng: 6.9573,
    accessInfo:
      "KVB-Haltestelle auf dem Platz, Stände nur auf der Westseite. Anlieferung bis 08:30 Uhr.",
    zones: null,
    cityAuthorityKey: "ordnungsamt_koeln",
    waterAuthorityKey: "wasser_koeln_standrohr",
    landownerKey: null,
  },
  {
    key: "suedbruecke",
    name: "Unter der Südbrücke",
    publicPlace: "unter der Südbrücke am Rheinufer in Köln-Poll",
    kind: "private",
    street: "Alfred-Schütte-Allee",
    postalCode: "51105",
    city: "Köln",
    lat: 50.9205,
    lng: 6.9735,
    accessInfo: "Schotterfläche unter der Brücke, Tor wird um 05:30 Uhr aufgeschlossen.",
    zones: null,
    cityAuthorityKey: "ordnungsamt_koeln",
    waterAuthorityKey: null,
    landownerKey: "suedbruecke_flaechen",
  },
  {
    key: "rudolfplatz",
    name: null,
    publicPlace: "auf dem Rudolfplatz in der Kölner Innenstadt",
    kind: "municipal",
    street: "Rudolfplatz",
    postalCode: "50674",
    city: "Köln",
    lat: 50.9365,
    lng: 6.9389,
    accessInfo: "Aufbau der Zelte am Freitagmorgen, Fahrzeuge bis 11:00 Uhr vom Platz.",
    zones: null,
    cityAuthorityKey: "ordnungsamt_koeln",
    waterAuthorityKey: "wasser_koeln_standrohr",
    landownerKey: null,
  },
  {
    key: "rodenkirchen",
    name: "Köln-Rodenkirchen",
    publicPlace: "in Köln-Rodenkirchen",
    kind: "municipal",
    street: "Maternusplatz",
    postalCode: "50996",
    city: "Köln",
    lat: 50.8893,
    lng: 6.9932,
    accessInfo:
      "Hauptstraße wird für das Straßenfest gesperrt, der Maternusplatz ist über die Schillingsrotter Straße erreichbar.",
    zones: ["Hauptstraße", "Maternusplatz"],
    cityAuthorityKey: "ordnungsamt_koeln",
    waterAuthorityKey: "wasser_koeln_standrohr",
    landownerKey: null,
  },
  {
    key: "kerpen",
    name: "Kerpen Innenstadt",
    publicPlace: "in der Kerpener Innenstadt rund um den Stiftsplatz",
    kind: "municipal",
    street: "Stiftsplatz",
    postalCode: "50171",
    city: "Kerpen",
    lat: 50.8697,
    lng: 6.6964,
    accessInfo: "Anlieferung über die Stiftsstraße. Strom aus den Verteilerkästen der Stadt.",
    zones: ["Stiftsplatz", "Stiftsstraße", "Marienplatz"],
    cityAuthorityKey: "ordnungsamt_kerpen",
    waterAuthorityKey: "wasser_kerpen_standrohr",
    landownerKey: null,
  },
  {
    key: "hoffnungsthal",
    name: null,
    publicPlace: "auf der Hauptstraße in Rösrath-Hoffnungsthal",
    kind: "municipal",
    street: "Hauptstraße",
    postalCode: "51503",
    city: "Rösrath",
    lat: 50.8828,
    lng: 7.1625,
    accessInfo:
      "Parkverbot 96 Stunden vorher aufstellen. Verkehrssicherung ab 09:00 Uhr nach Abnahme durch die Feuerwehr.",
    zones: ["Hauptstraße", "Festplätze"],
    cityAuthorityKey: "ordnungsamt_roesrath",
    waterAuthorityKey: "wasser_roesrath_standrohr",
    landownerKey: null,
  },
];

/** Zone names for venues without named zones. */
export const ZONE_NAMES: readonly string[] = [
  "Nordseite",
  "Südseite",
  "Mittelgang",
  "Randstreifen",
];
