/**
 * Contact details from a mail's signature lines, by fixed patterns (ADR 0014: no AI). Only pre-fills the
 * "Als Kontakt speichern" dialog; a person checks every field.
 */
const PHONE = /(?:tel\.?|telefon|mobil|fon)?[:\s]*((?:\+49|0)[\d\s/()-]{6,}\d)/i;
const POSTAL = /^\s*(\d{5}\s+[A-ZÄÖÜ][\wäöüß .-]+?)\s*$/m;
const STREET = /^\s*([A-ZÄÖÜ][\wäöüß.-]+(?:[ -][\wäöüß.-]+)*\s+\d+[a-z]?)\s*$/m;
const COMPANY = /^\s*(.*\b(?:GmbH|AG|e\.\s?V\.|UG|KG|Stadt|Amt|Ordnungsamt|Gemeinde)\b.*?)\s*$/m;

export function extractSignatureFields(text: string): {
  phone: string | null;
  company: string | null;
  street: string | null;
  postalCity: string | null;
} {
  const tail = text.split("\n").slice(-12).join("\n");
  return {
    phone: PHONE.exec(tail)?.[1]?.trim() ?? null,
    company: COMPANY.exec(tail)?.[1]?.trim() ?? null,
    street: STREET.exec(tail)?.[1]?.trim() ?? null,
    postalCity: POSTAL.exec(tail)?.[1]?.trim() ?? null,
  };
}
