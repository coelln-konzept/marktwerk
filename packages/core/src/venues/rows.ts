/*
 * Rules for an Ort's owner and its rows that the forms and the services share.
 */

/**
 * Contact kinds that may be entered as an Ort's Eigentümer (UX-056): a städtisches Ort belongs to the
 * city, so an authority ("Behörde", e.g. the Liegenschaftsamt) counts as well as an Eigentümer contact.
 */
export function landownerKindsFor(venueKind: string): readonly ("landowner" | "authority")[] {
  return venueKind === "municipal" ? ["landowner", "authority"] : ["landowner"];
}

/** True when a contact of `contactKind` may be the Eigentümer of an Ort of `venueKind`. */
export function mayOwnVenue(contactKind: string, venueKind: string): boolean {
  return (landownerKindsFor(venueKind) as readonly string[]).includes(contactKind);
}

/**
 * The label the next row probably gets (UX-056): the last label with its trailing number counted up,
 * keeping zero padding ("A3" → "A4", "Reihe 09" → "Reihe 10", "B-007" → "B-008"). "" when the last
 * label has no trailing number or there is none, so the field starts empty.
 */
export function nextRowLabel(labels: readonly string[]): string {
  const last = labels.at(-1)?.trim() ?? "";
  const match = /^(.*?)(\d+)$/.exec(last);
  if (!match) return "";
  const [, prefix = "", digits = ""] = match;
  const next = String(Number(digits) + 1).padStart(digits.length, "0");
  return `${prefix}${next}`;
}
