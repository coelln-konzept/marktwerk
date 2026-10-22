/**
 * Validation and normalisation of company identifiers (IBAN, BIC, USt-IdNr.) for the settings form.
 * Pure functions, no I/O. They check the *format* (and the IBAN checksum), not whether an account exists.
 */

const stripSpaces = (value: string) => value.replace(/\s+/g, "").toUpperCase();

/** "de02 1203 0000 0000 2020 51" → "DE02120300000000202051". */
export function normalizeIban(value: string): string {
  return stripSpaces(value);
}

/** ISO 13616 checksum (mod 97) plus the fixed length of German IBANs (22). */
export function isValidIban(value: string): boolean {
  const iban = normalizeIban(value);
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return false;
  if (iban.startsWith("DE") && iban.length !== 22) return false;
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let remainder = 0;
  for (const char of rearranged) {
    const digits = /\d/.test(char) ? char : String(char.charCodeAt(0) - 55);
    for (const digit of digits) remainder = (remainder * 10 + Number(digit)) % 97;
  }
  return remainder === 1;
}

/** Groups of four for display: "DE02 1203 0000 0000 2020 51". */
export function formatIban(value: string): string {
  return normalizeIban(value).replace(/(.{4})(?=.)/g, "$1 ");
}

export function normalizeBic(value: string): string {
  return stripSpaces(value);
}

/** 8 or 11 characters: bank (4 letters), country (2 letters), location (2), optional branch (3). */
export function isValidBic(value: string): boolean {
  return /^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(normalizeBic(value));
}

export function normalizeVatId(value: string): string {
  return stripSpaces(value);
}

/** Country prefix plus 2–12 characters; German numbers (DE + 9 digits) are checked exactly. */
export function isValidVatId(value: string): boolean {
  const id = normalizeVatId(value);
  if (id.startsWith("DE")) return /^DE\d{9}$/.test(id);
  return /^[A-Z]{2}[A-Z0-9]{2,12}$/.test(id);
}
