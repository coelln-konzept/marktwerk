import type { VenueKindKey } from "../venues/name";
import type { PermitCadence, PermitTypeKey } from "./status";

/**
 * "Was braucht dieser Ort?" (product owner 2026-11-13, Fahrplan R28/R30): when an Ort is created or switched between
 * Städtisch and Privat, a dialog sets its permit requirements. These are the permit types it offers, in its order:
 * the main permit (Marktgenehmigung on city ground, the owner's OK on private ground), the Festsetzung, then the
 * optional extras (Standrohr, PVBT, Plakatierung, Toiletten). Other types stay on the requirement form.
 */
export const VENUE_NEED_TYPES = [
  "market_permit",
  "landowner_ok",
  "market_fixing",
  "water",
  "no_parking",
  "signage",
  "toilets",
] as const satisfies readonly PermitTypeKey[];
export type VenueNeedType = (typeof VENUE_NEED_TYPES)[number];

export const isVenueNeedType = (value: unknown): value is VenueNeedType =>
  typeof value === "string" && (VENUE_NEED_TYPES as readonly string[]).includes(value);

/**
 * The requirement a ticked need becomes: German title (data, like the template items), category, cadence and lead
 * time as the client's sheets have them (research 13 §4; the synthetic data uses the same numbers). Everything else
 * (authority, fee, application window) is filled in later on the requirement form.
 */
export const VENUE_NEED_DEFAULTS: Readonly<
  Record<
    VenueNeedType,
    { title: string; category: "city" | "external"; cadence: PermitCadence; leadTimeDays: number }
  >
> = {
  market_permit: {
    title: "Marktgenehmigung (Sondernutzung)",
    category: "city",
    cadence: "per_season",
    leadTimeDays: 180,
  },
  landowner_ok: {
    title: "Einverständnis des Eigentümers",
    category: "external",
    cadence: "per_season",
    leadTimeDays: 150,
  },
  market_fixing: {
    title: "Festsetzung (§ 69 GewO)",
    category: "city",
    cadence: "per_season",
    leadTimeDays: 180,
  },
  water: { title: "Standrohr", category: "external", cadence: "per_event", leadTimeDays: 30 },
  no_parking: {
    title: "Haltverbot (PVBT)",
    category: "city",
    cadence: "per_event",
    leadTimeDays: 21,
  },
  signage: { title: "Plakatierung", category: "city", cadence: "per_season", leadTimeDays: 42 },
  toilets: { title: "Toiletten", category: "external", cadence: "per_season", leadTimeDays: 60 },
};

/** The permit an Ort of this kind needs above all: the city's Marktgenehmigung, or the owner's OK on private ground. */
export function mainPermitType(kind: VenueKindKey): "market_permit" | "landowner_ok" {
  return kind === "private" ? "landowner_ok" : "market_permit";
}

/** Pre-ticked for a new Ort: its main permit and the Festsetzung (§ 69 GewO is the city's on private ground too). */
export function defaultVenueNeeds(kind: VenueKindKey): VenueNeedType[] {
  return [mainPermitType(kind), "market_fixing"];
}

/**
 * What the dialog ticks for an Ort that has requirements already (`current`: the permit types of its live
 * requirements): what it has, with the other kind's main permit swapped for this kind's, plus the Festsetzung. So a
 * switch Städtisch → Privat suggests the owner's OK instead of the Marktgenehmigung and keeps the extras; opening
 * the dialog again without a switch suggests nothing new beyond the defaults. In {@link VENUE_NEED_TYPES} order.
 */
export function suggestedVenueNeeds(
  kind: VenueKindKey,
  current: Iterable<string>,
): VenueNeedType[] {
  const other = mainPermitType(kind === "private" ? "municipal" : "private");
  const wanted = new Set<string>([...current].filter((type) => type !== other));
  for (const type of defaultVenueNeeds(kind)) wanted.add(type);
  return VENUE_NEED_TYPES.filter((type) => wanted.has(type));
}

/**
 * Turns the dialog's ticks into changes: the ticked types the Ort has no live requirement for are created, the
 * requirements of unticked need types are removed (archived). Requirements of types the dialog does not offer
 * (Sperrung, GEMA, …) are never touched, and a type with several requirements (e.g. one per event type) keeps all
 * of them while it stays ticked. Pure.
 */
export function planVenueNeeds<R extends { id: string; permitType: string }>(
  current: readonly R[],
  wanted: Iterable<string>,
): { create: VenueNeedType[]; archive: R[] } {
  const ticked = new Set([...wanted].filter(isVenueNeedType));
  const has = new Set(current.map((r) => r.permitType));
  return {
    create: VENUE_NEED_TYPES.filter((type) => ticked.has(type) && !has.has(type)),
    archive: current.filter((r) => isVenueNeedType(r.permitType) && !ticked.has(r.permitType)),
  };
}

/**
 * The permit type a template task applies for, at a place that needs `available` (the permit types of the permits
 * or requirements in question). An item naming the Marktgenehmigung ("Genehmigung beantragen", `market_permit`)
 * stands for the Ort's **main** permit (Fahrplan R30): on private ground without a Marktgenehmigung that is the
 * owner's OK (`landowner_ok`). Where both exist, the Marktgenehmigung keeps its own task and the OK gets its own.
 * Every other type stays as it is. Pure.
 */
export function itemPermitType(itemType: string, available: Iterable<string>): string {
  if (itemType !== "market_permit") return itemType;
  const types = new Set(available);
  return !types.has("market_permit") && types.has("landowner_ok") ? "landowner_ok" : itemType;
}
