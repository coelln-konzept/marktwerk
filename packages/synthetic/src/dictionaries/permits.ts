import type { EventTypeKey, PermitCadence, PermitCategory, PermitType } from "../types";

export interface PermitTypeBlueprint {
  permitType: PermitType;
  titleDe: string;
  conditions: string[];
}

/** German titles and typical conditions (Auflagen) per permit type. Conditions become tasks in the app. */
export const PERMIT_TYPE_BLUEPRINTS: Record<PermitType, PermitTypeBlueprint> = {
  market_permit: {
    permitType: "market_permit",
    titleDe: "Marktgenehmigung (Sondernutzung)",
    conditions: [
      "Rettungswege müssen jederzeit frei bleiben.",
      "Stände dürfen nicht auf der Fahrbahn stehen.",
      "Der Markt endet spätestens um 18:00 Uhr.",
      "Die Fläche ist besenrein zu übergeben.",
    ],
  },
  market_fixing: {
    permitType: "market_fixing",
    titleDe: "Festsetzung (§ 69 GewO)",
    conditions: [
      "Markt nur an den festgesetzten Tagen und zu den festgesetzten Öffnungszeiten.",
      "Nur Waren des festgesetzten Warenkreises anbieten.",
      "Änderungen von Termin oder Ort vorher bei der Stadt anzeigen.",
    ],
  },
  water: {
    permitType: "water",
    titleDe: "Standrohr (Wasserentnahme am Hydranten)",
    conditions: [
      "Entnahme nur über das vom Versorger ausgegebene Standrohr.",
      "Standrohr ist am Folgetag zurückzugeben.",
    ],
  },
  signage: {
    permitType: "signage",
    titleDe: "Plakatierungsgenehmigung mit Aufklebern",
    conditions: [
      "Jedes Plakat muss den ausgegebenen Aufkleber tragen.",
      "Plakate nur an den genehmigten Flächen anbringen.",
      "Plakate spätestens drei Tage nach dem Markt entfernen.",
    ],
  },
  no_parking: {
    permitType: "no_parking",
    titleDe: "Haltverbot (PVBT)",
    conditions: [
      "Schilder rechtzeitig vor Beginn aufstellen (Frist laut Anordnung) und das Aufstellprotokoll einreichen.",
      "Schilder nach der Veranstaltung wieder entfernen.",
    ],
  },
  traffic_order: {
    permitType: "traffic_order",
    titleDe: "Verkehrsrechtliche Anordnung (Sperrung)",
    conditions: [
      "Absperrung und Beschilderung nur nach dem genehmigten Verkehrszeichenplan.",
      "Zufahrt für Rettungsfahrzeuge freihalten.",
    ],
  },
  toilets: {
    permitType: "toilets",
    titleDe: "Toilettenanlage (Rahmenvertrag)",
    conditions: ["Mindestens eine barrierefreie Toilette je Standort."],
  },
  landowner_ok: {
    permitType: "landowner_ok",
    titleDe: "Einverständnis Grundstückseigentümer",
    conditions: ["Keine Schäden an Belägen, Rasen oder Bäumen."],
  },
  other: {
    permitType: "other",
    titleDe: "Schaustellerliste an die Stadt",
    conditions: ["Änderungen an der Liste bis eine Woche vor dem Markt nachmelden."],
  },
};

/** Who issues a permit: the city (Ordnungsamt), its traffic office, the water supplier, the landowner, a supplier. */
export type PermitAuthority = "city" | "traffic" | "water" | "landowner" | "supplier";

/** The authority collects applications in a window and decides on a fixed day (Köln Altstadt, the stadium). */
export interface SubmissionWindow {
  startMd: string;
  endMd: string;
  decisionMd: string;
  /** Requirement note. */
  note: string;
  /** Permit notes once filed / once granted. */
  appliedNote: string;
  grantedNote: string;
}

export interface RequirementSpec {
  permitType: PermitType;
  category: PermitCategory;
  cadence: PermitCadence;
  /** Days before the first market day it covers (per season: the market's first date of the season). */
  leadTimeDays: number;
  /** Typical fee in cents, [min, max]. */
  fee: readonly [number, number];
  authority: PermitAuthority;
  /** Only markets of this event type need it (`permit_requirement.event_type_id`). */
  eventType?: EventTypeKey;
  stickers?: number;
  window?: SubmissionWindow;
  notes?: string;
}

/*
 * Permit kinds (research 13 §4). Lead times follow the client's sheets where they say so: Genehmigung 6 months before
 * the first date (Altstadt 7), Standrohr 30 days, Schaustellerliste 2 months. The others are the usual lead times of
 * the Köln offices. Every market applies for its own Marktgenehmigung and Festsetzung, also where markets share a
 * place (the generator makes one permit per market and season).
 */
const MARKET_PERMIT: RequirementSpec = {
  permitType: "market_permit",
  category: "city",
  cadence: "per_season",
  leadTimeDays: 180,
  fee: [15000, 45000],
  authority: "city",
};

/** Festsetzung (§ 69 GewO): applied for together with the Marktgenehmigung; its fee becomes a payable once granted. */
const FESTSETZUNG: RequirementSpec = {
  permitType: "market_fixing",
  category: "city",
  cadence: "per_season",
  leadTimeDays: 180,
  fee: [8000, 25000],
  authority: "city",
};

const LANDOWNER: RequirementSpec = {
  permitType: "landowner_ok",
  category: "external",
  cadence: "per_season",
  leadTimeDays: 150,
  fee: [0, 0],
  authority: "landowner",
};

/** PVBT: no-parking signs, ordered per date. */
const PVBT: RequirementSpec = {
  permitType: "no_parking",
  category: "city",
  cadence: "per_event",
  leadTimeDays: 21,
  fee: [6000, 9000],
  authority: "traffic",
};

const PLAKATIERUNG: RequirementSpec = {
  permitType: "signage",
  category: "city",
  cadence: "per_season",
  leadTimeDays: 42,
  fee: [8000, 12000],
  authority: "city",
  stickers: 100,
};

/** Standrohr at the water supplier, ordered 30 days before each date ("Standrohr bestellen"). */
const STANDROHR: RequirementSpec = {
  permitType: "water",
  category: "external",
  cadence: "per_event",
  leadTimeDays: 30,
  fee: [3000, 6000],
  authority: "water",
};

/** Road closure (verkehrsrechtliche Anordnung) where the market closes a street. */
const SPERRUNG: RequirementSpec = {
  permitType: "traffic_order",
  category: "city",
  cadence: "per_season",
  leadTimeDays: 42,
  fee: [10000, 20000],
  authority: "traffic",
};

const TOILETTEN: RequirementSpec = {
  permitType: "toilets",
  category: "external",
  cadence: "per_season",
  leadTimeDays: 60,
  fee: [0, 0],
  authority: "supplier",
};

const ALTSTADT_WINDOW: SubmissionWindow = {
  startMd: "10-01",
  endMd: "11-30",
  decisionMd: "01-15",
  note: "Sammelantrag: die Stadt nimmt alle Anträge im Herbst gesammelt entgegen.",
  appliedNote: "Sammelantrag eingereicht, Entscheidung der Stadt im Januar erwartet.",
  grantedNote: "Sammelantrag über die Stadt bearbeitet.",
};

const STADION_WINDOW: SubmissionWindow = {
  startMd: "09-01",
  endMd: "10-31",
  decisionMd: "12-15",
  note: "Termine bis Ende Oktober für das Folgejahr anfragen; die Verwaltung bestätigt nach dem Spiel- und Konzertplan.",
  appliedNote: "Termine angefragt, Bestätigung der Stadionverwaltung Mitte Dezember erwartet.",
  grantedNote: "Termine von der Stadionverwaltung bestätigt.",
};

/** Marked like the assumed template items: not on a client sheet yet. */
const ASSUMED = "Annahme – vom Team noch nicht bestätigt";

/**
 * Which permits each place needs (by venue key). Municipal places: Marktgenehmigung (Sondernutzung) and Festsetzung
 * via the Ordnungsamt. Private places (Stadion, Südbrücke): the landowner's OK instead of the Marktgenehmigung; the
 * Festsetzung is still the city's (it gives the Sunday market its privileges). The rest follows the client's sheets.
 */
export const VENUE_PERMITS: Readonly<Record<string, readonly RequirementSpec[]>> = {
  altstadt: [
    { ...MARKET_PERMIT, leadTimeDays: 210, window: ALTSTADT_WINDOW },
    { ...FESTSETZUNG, leadTimeDays: 210, window: ALTSTADT_WINDOW },
    { ...SPERRUNG, notes: "Abflattern und Verkehr am Vortag, Verkehr regeln an jedem Markttag." },
    {
      ...STANDROHR,
      eventType: "antique",
      notes: "Strom und Wasser organisiert die Orga am Vortag.",
    },
    TOILETTEN,
  ],
  "riehler-guertel": [
    MARKET_PERMIT,
    FESTSETZUNG,
    { ...PVBT, notes: "PVBT und Werbung sechs Tage vorher aufhängen." },
    { ...PLAKATIERUNG, notes: "Hohlkammerplatten mit den Aufklebern der Stadt." },
    { ...SPERRUNG, notes: "Straße ab 05:00 Uhr gesperrt; Abflattern und Verkehr am Vortag." },
    TOILETTEN,
  ],
  nippes: [MARKET_PERMIT, FESTSETZUNG, TOILETTEN],
  stadion: [{ ...LANDOWNER, window: STADION_WINDOW }, FESTSETZUNG, TOILETTEN],
  suedstadt: [MARKET_PERMIT, FESTSETZUNG, { ...PVBT, notes: ASSUMED }, TOILETTEN],
  suedbruecke: [LANDOWNER, FESTSETZUNG, TOILETTEN],
  rudolfplatz: [MARKET_PERMIT, FESTSETZUNG, STANDROHR, TOILETTEN],
  rodenkirchen: [
    MARKET_PERMIT,
    FESTSETZUNG,
    { ...SPERRUNG, eventType: "city_festival", notes: "Hauptstraße für das Straßenfest gesperrt." },
    { ...PVBT, eventType: "city_festival", notes: ASSUMED },
    { ...STANDROHR, eventType: "city_festival" },
    TOILETTEN,
  ],
  kerpen: [
    MARKET_PERMIT,
    FESTSETZUNG,
    PLAKATIERUNG,
    { ...STANDROHR, eventType: "city_festival" },
    { ...STANDROHR, eventType: "food_wine" },
    TOILETTEN,
  ],
  // Hoffnungsthal ("Anträge 180 days: Festsetzung, Plakatierung"): school toilets instead of a toilet contract.
  hoffnungsthal: [
    MARKET_PERMIT,
    FESTSETZUNG,
    { ...PLAKATIERUNG, notes: "Hohlkammerplatten mit den Aufklebern der Stadt bekleben." },
    {
      ...PVBT,
      notes: "Schilder spätestens 96 Stunden vor Marktbeginn aufstellen, Erinnerung 6 Tage vorher.",
    },
    {
      ...SPERRUNG,
      notes:
        "Den Verkehrszeichenplan stellt Signalbau Lindner; Verkehrssicherung ab 09:00 Uhr nach dem Feuerwehreinsatz.",
    },
    STANDROHR,
    {
      permitType: "other",
      category: "city",
      cadence: "per_event",
      leadTimeDays: 60,
      fee: [0, 0],
      authority: "city",
      notes: "Liste der aktuellen Schausteller zwei Monate vorher an die Stadt.",
    },
  ],
};
