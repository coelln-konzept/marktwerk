import type { Rng } from "./rng";

/*
 * Privacy: phone numbers are only taken from German ranges reserved for fiction and film. Emails are only
 * allowed on the RFC 2606 example domains. Both rules are asserted in dataset.test.ts.
 */

export const FICTION_PHONE_RANGES = {
  /** +49 30 23125 0xx–9xx (Berlin) */
  berlin: "+493023125",
  /** +49 40 66969 xxx (Hamburg) */
  hamburg: "+494066969",
  /** +49 69 90009 xxx (Frankfurt) */
  frankfurt: "+496990009",
  /** +49 89 99998 xxx (München) */
  munich: "+498999998",
  /** +49 176 04069 xxx (mobile) */
  mobile: "+4917604069",
} as const;

export type FictionPhoneRange = keyof typeof FICTION_PHONE_RANGES;

export const FICTION_PHONE_PATTERN =
  /^\+(493023125|494066969|496990009|498999998|4917604069)\d{3}$/;

export const EXAMPLE_DOMAINS = ["example.com", "example.org", "example.net"] as const;
export type ExampleDomain = (typeof EXAMPLE_DOMAINS)[number];

export function fictionPhone(rng: Rng, range: FictionPhoneRange): string {
  const subscriber = String(rng.int(0, 999)).padStart(3, "0");
  return `${FICTION_PHONE_RANGES[range]}${subscriber}`;
}

/** Lowercase ASCII slug for email local parts ("Anke Müller" → "anke.mueller"). */
export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replaceAll("ä", "ae")
    .replaceAll("ö", "oe")
    .replaceAll("ü", "ue")
    .replaceAll("ß", "ss")
    .replaceAll("é", "e")
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "");
}

export function exampleEmail(localPart: string, domain: ExampleDomain): string {
  return `${localPart}@${domain}`;
}
