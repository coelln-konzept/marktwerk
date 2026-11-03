import { foldIncludes } from "./fold";

/*
 * Multi-word search for the registers (Kontakte, Orte): "Köln Ordnungsamt" finds "Ordnungsamt Köln"
 * because every word only has to occur somewhere in the record, in any field and any order. Umlauts and
 * case are folded like in `foldIncludes`. Number words also match a phone number by its digits (three
 * at least), however the number is written ("0221 1234", "+49 221 1234", "22112").
 */

/** The words of a query; words that are only punctuation ("–", "·") are dropped. */
export function searchWords(query: string): string[] {
  return query
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word !== "" && /[\p{L}\p{N}]/u.test(word));
}

/** Digits of a phone number without the trunk prefix ("0221" -> "221", "0049" -> "49"). */
function stripTrunk(digits: string): string {
  if (digits.startsWith("00")) return digits.slice(2);
  if (digits.startsWith("0")) return digits.slice(1);
  return digits;
}

/** Words that can be part of a phone number ("0221", "+49", "(030)", "123-45"). */
const PHONE_WORD = /^[+()/.\-\d]*\d[+()/.\-\d]*$/;

/** The query as groups of words: neighbouring phone-like words form one group, every other word its own. */
function wordGroups(query: string): string[][] {
  const groups: string[][] = [];
  let previousWasPhone = false;
  for (const word of searchWords(query)) {
    const phoneLike = PHONE_WORD.test(word);
    if (phoneLike && previousWasPhone) groups[groups.length - 1]?.push(word);
    else groups.push([word]);
    previousWasPhone = phoneLike;
  }
  return groups;
}

/**
 * True if every word of `query` occurs in one of the `fields` (umlaut-insensitive). Neighbouring number
 * words ("0221 123 45") may instead match one of the `phones` by their digits, which must be at least
 * three. An empty query matches everything.
 */
export function matchesAllWords(
  fields: (string | null | undefined)[],
  query: string,
  phones: (string | null | undefined)[] = [],
): boolean {
  const phoneDigits = phones.map((p) => (p ?? "").replace(/\D/g, "")).filter((p) => p !== "");
  return wordGroups(query).every((group) => {
    if (group.every((word) => foldIncludes(fields, word))) return true;
    const digits = group.join("").replace(/\D/g, "");
    if (digits.length < 3) return false;
    const wanted = stripTrunk(digits);
    return wanted !== "" && phoneDigits.some((p) => p.includes(wanted));
  });
}
