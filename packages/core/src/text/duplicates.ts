import { foldForms } from "./fold";
import { normalizePhone } from "./phone";

/*
 * Duplicate hints (UX-028): while a Kontakt or Ort is typed, records that look like the same thing are
 * shown with a link. Nothing is blocked; these rules only decide what counts as "looks the same".
 * Case, spaces, punctuation and umlauts don't matter: "Ordnungsamt Köln", "ordnungsamt  koeln" and
 * "Ordnungsamt-Koln" are one name.
 */

/** The comparable forms of a text: folded (ö → o and ö → oe), without spaces and punctuation. */
function compactForms(text: string | null | undefined): string[] {
  const value = (text ?? "").trim();
  if (value === "") return [];
  return [...new Set(foldForms(value).map((f) => f.replace(/[^\p{L}\p{N}]/gu, "")))].filter(
    (f) => f !== "",
  );
}

/** True when two texts are the same apart from case, spaces, punctuation and umlaut spelling. */
export function sameText(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = compactForms(a);
  if (left.length === 0) return false;
  const right = new Set(compactForms(b));
  return left.some((f) => right.has(f));
}

/** Digits of a phone number after the German normalisation; "" when there are fewer than six. */
function phoneKey(phone: string | null | undefined): string {
  const digits = normalizePhone(phone ?? "").replace(/\D/g, "");
  return digits.length >= 6 ? digits : "";
}

export type ContactLike = {
  name: string;
  phone?: string | null;
  email?: string | null;
};

/** Why a contact looks like `typed`: same name first, then phone, then e-mail; null when it doesn't. */
export function similarContactReason(
  typed: ContactLike,
  other: ContactLike,
): "name" | "phone" | "email" | null {
  if (sameText(typed.name, other.name)) return "name";
  const phone = phoneKey(typed.phone);
  if (phone !== "" && phone === phoneKey(other.phone)) return "phone";
  const email = (typed.email ?? "").trim().toLowerCase();
  if (email !== "" && email === (other.email ?? "").trim().toLowerCase()) return "email";
  return null;
}

export type VenueLike = {
  name?: string | null;
  street?: string | null;
  postalCode?: string | null;
};

/**
 * Why an Ort looks like `typed`: the same name, or the same street at the same postcode (an Ort named
 * differently at the same address is still the same place). Null when it doesn't.
 */
export function similarVenueReason(typed: VenueLike, other: VenueLike): "name" | "address" | null {
  if (sameText(typed.name, other.name)) return "name";
  const postal = (typed.postalCode ?? "").trim();
  if (
    postal !== "" &&
    postal === (other.postalCode ?? "").trim() &&
    sameText(typed.street, other.street)
  )
    return "address";
  return null;
}
