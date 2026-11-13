/**
 * "Kürzel" of a market (Fahrplan R15, research 13 G3): a short code of 1–4 characters ("ALT", "NIP",
 * "KS", "P6") shown next to the market colour where space is tight (Kalender month chips, later the
 * Jahresübersicht with its legend, R22). It is optional on the market (preset); without one the market
 * gets a code derived from its name. Stored codes are unique among the active markets; derived ones are
 * kept apart from every stored code and from each other by `marketShortCodes`.
 */

export const MARKET_SHORT_CODE_MAX = 4;

/** Upper-case letters A–Z, Ä, Ö, Ü and digits, 1–4 characters. */
const VALID = /^[A-Z0-9ÄÖÜ]{1,4}$/;

/** Is `code` a valid stored Kürzel (already normalised: upper case, no spaces)? */
export function isMarketShortCode(code: unknown): code is string {
  return typeof code === "string" && VALID.test(code);
}

/**
 * What a typed Kürzel is stored as: spaces removed, upper case ("alt " → "ALT", "p 6" → "P6"); blank →
 * null (= no own Kürzel, the derived one is shown). The result may still be invalid ("A-B", "ABCDE"):
 * check it with `isMarketShortCode`.
 */
export function normalizeMarketShortCode(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const compact = raw.replace(/\s+/g, "");
  if (compact === "") return null;
  // "ß".toUpperCase() is "SS"; keep the umlauts, which are valid.
  return compact.toLocaleUpperCase("de-DE");
}

/** Words that never make it into a derived code: articles and prepositions of German place names. */
const STOP_WORDS = new Set([
  "am",
  "an",
  "auf",
  "bei",
  "beim",
  "das",
  "dem",
  "den",
  "der",
  "des",
  "die",
  "im",
  "in",
  "und",
  "vom",
  "von",
  "zum",
  "zur",
]);

/** Words naming the kind of market; dropped when the name has other words ("Kerpener Trödelmarkt" → "KER"). */
const GENERIC_WORDS = new Set([
  "antikmarkt",
  "flohmarkt",
  "markt",
  "trödelmarkt",
  "troedelmarkt",
  "kunstmarkt",
  "nachtflohmarkt",
]);

/** Upper case, accents folded to their base letter except Ä/Ö/Ü, everything else dropped. */
function codeChars(word: string): string {
  let out = "";
  for (const char of word.toLocaleUpperCase("de-DE")) {
    if (/[A-Z0-9ÄÖÜ]/.test(char)) out += char;
    else {
      const base = char.normalize("NFD").replace(/[̀-ͯ]/g, "");
      if (/^[A-Z]+$/.test(base)) out += base;
    }
  }
  return out;
}

/** The words of a name that carry meaning, as code characters. */
function significantWords(name: string): string[] {
  const words = name
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w !== "" && !STOP_WORDS.has(w.toLocaleLowerCase("de-DE")));
  const specific = words.filter((w) => !GENERIC_WORDS.has(w.toLocaleLowerCase("de-DE")));
  return (specific.length > 0 ? specific : words).map(codeChars).filter((w) => w !== "");
}

/** Candidates in order of preference; the first one is the plain derivation. */
function candidates(name: string): string[] {
  const words = significantWords(name);
  const out: string[] = [];
  const first = words[0] ?? "";
  // Nothing usable in the name: "M" for Markt.
  if (words.length === 0) out.push("M");
  else if (words.length === 1) {
    // One word: its first three characters ("Altstadt" → "ALT", "P6" → "P6"), then four.
    out.push(first.slice(0, 3), first.slice(0, 4));
    // Then the first two and one later character ("Südbrücke" → "SÜB" … ).
    for (let i = 3; i < first.length; i += 1) out.push(first.slice(0, 2) + first[i]);
  } else {
    // Several words: their initials, a number as a whole ("Halle 7" → "H7"), at most four.
    const initials = words
      .map((w) => (/^\d+$/.test(w) ? w : w[0]))
      .join("")
      .slice(0, MARKET_SHORT_CODE_MAX);
    out.push(initials);
    // Then more of the last word ("RS" → "RST"), then more of the first ("RHS").
    const last = words[words.length - 1] as string;
    const head = initials.slice(0, -1);
    for (let n = 2; head.length + n <= MARKET_SHORT_CODE_MAX && n <= last.length; n += 1)
      out.push(head + last.slice(0, n));
    if (first.length > 1) out.push((first.slice(0, 2) + initials.slice(1)).slice(0, 4));
  }
  // Last resort: the plain code (at most three characters) with a number.
  const plain = (out[0] as string).slice(0, 3);
  for (let n = 2; n <= 999; n += 1) {
    const suffix = String(n);
    out.push(plain.slice(0, MARKET_SHORT_CODE_MAX - suffix.length) + suffix);
  }
  return out;
}

/**
 * The Kürzel derived from a market's name: one word → its first three letters ("Altstadt" → "ALT",
 * "Nippes" → "NIP", "P6" → "P6"); several words → their initials, at most four ("Kerpen Stadtfest" →
 * "KS", "Rodenkirchen Maternusplatz (Antik)" → "RMA"). Articles and prepositions are skipped, and so are
 * words like "Flohmarkt" unless nothing else is left. Codes in `taken` are avoided ("SÜD" taken →
 * "Südbrücke" becomes "SÜDB").
 */
export function deriveMarketShortCode(name: string, taken: Iterable<string> = []): string {
  const used = new Set(taken);
  const all = candidates(name).filter(isMarketShortCode);
  return all.find((c) => !used.has(c)) ?? (all[0] as string);
}

export type ShortCodeMarket = { id: string; name: string; shortCode: string | null };

/**
 * The Kürzel to show for each market (id → code): its own one where it has one, otherwise the derived
 * one, kept apart from every own code and from the other derived codes. Markets without an own code are
 * resolved in name order (then id), so the result does not depend on the input order. Pass every market
 * that may appear together (the non-archived ones) so the same market gets the same code on every page.
 */
export function marketShortCodes(markets: readonly ShortCodeMarket[]): Map<string, string> {
  const result = new Map<string, string>();
  const taken = new Set<string>();
  for (const m of markets) {
    if (m.shortCode && isMarketShortCode(m.shortCode)) {
      result.set(m.id, m.shortCode);
      taken.add(m.shortCode);
    }
  }
  const rest = markets
    .filter((m) => !result.has(m.id))
    .sort((a, b) => a.name.localeCompare(b.name, "de") || a.id.localeCompare(b.id));
  for (const m of rest) {
    const code = deriveMarketShortCode(m.name, taken);
    result.set(m.id, code);
    taken.add(code);
  }
  return result;
}
