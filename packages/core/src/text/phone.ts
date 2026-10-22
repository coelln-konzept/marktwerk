/**
 * Phone numbers. German numbers are stored in E.164 ("+49221123456"); anything else is kept as typed
 * (trimmed), because we can't know what a foreign or unusual number is supposed to look like.
 */

/** Characters people put between the digit groups (incl. typographic dashes). */
const SEPARATORS = /[\s\-./()‐-―]/g;

/**
 * "0221 123456" -> "+49221123456"; "+49 (0)221 123456", "0049 221 123456" and "+49 0221 123456" give the
 * same. Everything that is not clearly a German number (other country codes, letters, too short or
 * too long) comes back trimmed but otherwise unchanged. An empty input gives "".
 */
export function normalizePhone(input: string): string {
  const typed = input.trim();
  if (typed === "") return "";
  // "(0)" after the country code is the optional trunk zero: drop it before the separators go.
  const compact = typed.replace(/^(\+|00)\s*49\s*\(0\)/, "$149").replace(SEPARATORS, "");
  let national: string | null = null;
  if (/^\+49\d+$/.test(compact)) national = compact.slice(3);
  else if (/^0049\d+$/.test(compact)) national = compact.slice(4);
  else if (/^0[1-9]\d*$/.test(compact)) national = compact.slice(1);
  if (national === null) return typed;
  // "+49 0221 ..." carries the trunk zero by mistake.
  if (national.startsWith("0")) national = national.slice(1);
  // A German national number has no leading zero and 6 to 13 digits (area code + subscriber).
  if (!/^[1-9]\d{5,12}$/.test(national)) return typed;
  return `+49${national}`;
}

/** Two-digit German area codes (Berlin, Hamburg, Frankfurt, Munich); every other area code has more digits. */
const TWO_DIGIT_AREA_CODES = new Set(["30", "40", "69", "89"]);

/**
 * "+493023125555" -> "+49 30 23125555", "+4917604069381" -> "+49 176 04069381". The area code length is
 * a guess for the less common cases (three digits); anything that isn't a German E.164 number is
 * shown as stored.
 */
export function formatPhone(stored: string): string {
  const match = /^\+49([1-9]\d{5,12})$/.exec(stored);
  if (!match) return stored;
  const national = match[1] as string;
  const mobile = /^1[567]/.test(national);
  const area = mobile || !TWO_DIGIT_AREA_CODES.has(national.slice(0, 2)) ? 3 : 2;
  return `+49 ${national.slice(0, area)} ${national.slice(area)}`;
}

/** True when `value` is a German number in E.164 form as produced by `normalizePhone`. */
export function isGermanE164(value: string): boolean {
  return /^\+49[1-9]\d{5,12}$/.test(value);
}
