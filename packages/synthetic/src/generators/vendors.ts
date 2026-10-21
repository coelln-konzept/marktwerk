import {
  COMPANY_PREFIXES,
  COMPANY_SUFFIXES,
  VENDOR_CATEGORY_WEIGHTS,
  VENDOR_CITIES,
  VENDOR_NOTES,
} from "../dictionaries/texts";
import { addDays } from "../lib/dates";
import { type ExampleDomain, exampleEmail, fictionPhone, slugify } from "../lib/fiction";
import type { Rng } from "../lib/rng";
import type { Vendor, VendorCategory, VendorKind } from "../types";

export const VENDOR_COUNT = 1500;

const DEFAULT_LENGTH_CM: readonly { value: number; weight: number }[] = [
  { value: 200, weight: 25 },
  { value: 250, weight: 10 },
  { value: 300, weight: 15 },
  { value: 400, weight: 20 },
  { value: 500, weight: 12 },
  { value: 600, weight: 10 },
  { value: 800, weight: 8 },
];

const CAR_LENGTH_CM: readonly { value: number; weight: number }[] = [
  { value: 420, weight: 15 },
  { value: 450, weight: 10 },
  { value: 500, weight: 15 },
  { value: 550, weight: 10 },
  { value: 600, weight: 50 },
];

const EMAIL_DOMAINS: readonly { value: ExampleDomain; weight: number }[] = [
  { value: "example.com", weight: 60 },
  { value: "example.net", weight: 20 },
  { value: "example.org", weight: 20 },
];

function pickCategories(rng: Rng): VendorCategory[] {
  const first = rng.pickWeighted(VENDOR_CATEGORY_WEIGHTS);
  if (!rng.chance(0.35)) return [first];
  const second = rng.pickWeighted(VENDOR_CATEGORY_WEIGHTS.filter((entry) => entry.value !== first));
  return [first, second];
}

/** 1,500 vendors. 75 % private, categories weighted, about 30 % regular (higher among antique dealers). */
export function buildVendors(rng: Rng): Vendor[] {
  return Array.from({ length: VENDOR_COUNT }, (_, index): Vendor => {
    const legacyId = 10001 + index;
    const kind: VendorKind = rng.chance(0.75) ? "private" : "commercial";
    const firstName = rng.faker.person.firstName();
    const lastName = rng.faker.person.lastName();
    const categories = pickCategories(rng);
    const isAntique = categories.includes("antik");
    const isRegular = rng.chance(isAntique ? 0.45 : 0.22);
    const companyName =
      kind === "commercial"
        ? `${rng.pick(COMPANY_PREFIXES)} ${lastName} ${rng.pick(COMPANY_SUFFIXES)}`
        : null;
    const displayName = companyName ?? `${firstName} ${lastName}`;
    const town = rng.pick(VENDOR_CITIES);
    const hasCar = rng.chance(0.55);
    const hasEmail = rng.chance(0.8);
    const domain = rng.pickWeighted(EMAIL_DOMAINS);
    const email = hasEmail ? exampleEmail(`${slugify(displayName)}.${legacyId}`, domain) : null;
    return {
      id: rng.uuid(),
      legacyId,
      kind,
      displayName,
      firstName: kind === "private" ? firstName : null,
      lastName: kind === "private" ? lastName : null,
      companyName,
      email,
      phoneE164: rng.chance(0.7)
        ? fictionPhone(
            rng,
            rng.chance(0.5)
              ? "mobile"
              : rng.pick(["berlin", "hamburg", "frankfurt", "munich"] as const),
          )
        : null,
      street: rng.faker.location.street(),
      postalCode: `${town.postalPrefix}${String(rng.int(0, 999)).padStart(3, "0")}`,
      city: town.city,
      categories,
      isRegular,
      regularSpot:
        isRegular && rng.chance(0.5)
          ? `Reihe ${rng.pick(["A", "B", "C", "D"])}, ca. ${rng.int(1, 40)} m`
          : null,
      defaultLengthCm: rng.pickWeighted(DEFAULT_LENGTH_CM),
      hasCar,
      carLengthCm: hasCar ? rng.pickWeighted(CAR_LENGTH_CM) : null,
      newsletterConsent: email !== null && rng.chance(0.4) ? "soft_opt_in" : null,
      notes: rng.chance(0.12) ? rng.pick(VENDOR_NOTES) : null,
      createdOn: addDays("2019-01-01", rng.int(0, 2800)),
    };
  });
}
