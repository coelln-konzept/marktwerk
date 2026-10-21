import type { PermitType } from "../types";

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
  water: {
    permitType: "water",
    titleDe: "Wasserentnahme (Hydrant / Standrohr)",
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
    ],
  },
  no_parking: {
    permitType: "no_parking",
    titleDe: "Halteverbot (Verkehrszeichen)",
    conditions: [
      "Schilder spätestens 24 Stunden vorher aufstellen.",
      "Schilder nach der Veranstaltung wieder entfernen.",
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
};
