/*
 * The A–Z selector on the Aussteller and Kontakte lists (CF9-7): which letter does a display name file
 * under? Umlauts and accents fold to their base letter (Ä → A, É → E, ß → S), leading whitespace, quotes and
 * brackets are skipped, and digits and anything else (symbols, empty names) file under "#".
 */

export const LETTERS = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"] as const;
export type Letter = (typeof LETTERS)[number];
/** A letter of the selector: "A"–"Z", or "#" for digits and everything else. */
export type InitialLetter = Letter | "#";

/** Whitespace, quote marks and brackets that may wrap a name ("Müller", (Kunst) …); skipped before the first letter. */
const LEADING = /^[\s"'„“”‚‘’«»‹›`´()[\]]+/u;

export function initialLetter(name: string | null | undefined): InitialLetter {
  const first = (name ?? "").replace(LEADING, "").charAt(0);
  if (first === "") return "#";
  const base = first
    .toUpperCase()
    .replace("ß", "S")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .charAt(0);
  return /^[A-Z]$/.test(base) ? (base as Letter) : "#";
}

/** Narrows a URL param to a selector letter; anything else (including lower case) is no filter. */
export function parseLetterParam(value: string | undefined): InitialLetter | undefined {
  if (value === "#") return "#";
  return (LETTERS as readonly string[]).includes(value ?? "") ? (value as Letter) : undefined;
}
