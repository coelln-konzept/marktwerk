import "server-only";
import { can, isValidPermitHorizonDays } from "@marktwerk/core";
import {
  isValidBic,
  isValidIban,
  isValidVatId,
  normalizeBic,
  normalizeIban,
  normalizeVatId,
} from "@marktwerk/core/company/identifiers";
import { settings } from "@marktwerk/db/schema";
import { eq } from "drizzle-orm";
import { forbidden } from "next/navigation";
import type { Actor } from "../actor";
import { db } from "../db";
import { audit } from "./audit";

/** Federal states with holiday tables in @marktwerk/core (`Bundesland`); more join with their calendars. */
export const SUPPORTED_BUNDESLAENDER = ["NW"] as const;
export const LOCALES = ["de", "en"] as const;
export const MAX_TEXT_LENGTH = 200;

export type CompanySettingsInput = {
  companyName: string;
  addressLine1: string;
  addressLine2: string;
  postalCode: string;
  city: string;
  country: string;
  email: string;
  phone: string;
  taxNumber: string;
  vatId: string;
  iban: string;
  bic: string;
  bundesland: string;
  defaultLocale: string;
  /** "HH:MM" */
  defaultDueTime: string;
  emailEnabled: boolean;
  dailyDigestEnabled: boolean;
  /** Days before the apply-by date that permits appear in the Übersicht (7–180). */
  permitHorizonDays: number;
};

export type CompanyField = keyof CompanySettingsInput;
export type SettingsFieldError = "required" | "too_long" | "invalid" | "unsupported";

/** One or more fields failed validation; nothing was written. */
export class SettingsInputError extends Error {
  constructor(readonly fields: Partial<Record<CompanyField, SettingsFieldError>>) {
    super(`invalid_fields: ${Object.keys(fields).join(", ")}`);
  }
}

const TEXT_FIELDS = [
  "companyName",
  "addressLine1",
  "addressLine2",
  "postalCode",
  "city",
  "email",
  "phone",
  "taxNumber",
] as const satisfies readonly CompanyField[];

/** Validates and normalises the form values (trimmed, optional empty → null). Pure; exported for tests. */
export function parseCompanySettings(input: CompanySettingsInput) {
  const errors: Partial<Record<CompanyField, SettingsFieldError>> = {};
  const text = (field: (typeof TEXT_FIELDS)[number]): string | null => {
    const value = String(input[field] ?? "").trim();
    if (value.length > MAX_TEXT_LENGTH) errors[field] = "too_long";
    return value === "" ? null : value;
  };
  const companyName = text("companyName");
  if (companyName === null) errors.companyName = "required";
  const addressLine1 = text("addressLine1");
  const addressLine2 = text("addressLine2");
  const city = text("city");
  const taxNumber = text("taxNumber");

  const country = String(input.country ?? "")
    .trim()
    .toUpperCase();
  if (!/^[A-Z]{2}$/.test(country)) errors.country = country === "" ? "required" : "invalid";

  const postalCode = text("postalCode");
  if (postalCode !== null && !errors.postalCode) {
    if (country === "DE" ? !/^\d{5}$/.test(postalCode) : postalCode.length > 10)
      errors.postalCode = "invalid";
  }

  const email = text("email");
  if (email !== null && !errors.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    errors.email = "invalid";

  const phone = text("phone");
  if (phone !== null && !errors.phone && !/^\+?[0-9 ()/.-]{5,30}$/.test(phone))
    errors.phone = "invalid";

  const ibanRaw = String(input.iban ?? "").trim();
  const iban = ibanRaw === "" ? null : normalizeIban(ibanRaw);
  if (iban !== null && !isValidIban(iban)) errors.iban = "invalid";

  const bicRaw = String(input.bic ?? "").trim();
  const bic = bicRaw === "" ? null : normalizeBic(bicRaw);
  if (bic !== null && !isValidBic(bic)) errors.bic = "invalid";

  const vatRaw = String(input.vatId ?? "").trim();
  const vatId = vatRaw === "" ? null : normalizeVatId(vatRaw);
  if (vatId !== null && !isValidVatId(vatId)) errors.vatId = "invalid";

  if (!(SUPPORTED_BUNDESLAENDER as readonly string[]).includes(input.bundesland))
    errors.bundesland = "unsupported";
  if (!(LOCALES as readonly string[]).includes(input.defaultLocale))
    errors.defaultLocale = "unsupported";
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(input.defaultDueTime)) errors.defaultDueTime = "invalid";
  if (!isValidPermitHorizonDays(input.permitHorizonDays)) errors.permitHorizonDays = "invalid";

  if (Object.keys(errors).length > 0) throw new SettingsInputError(errors);

  return {
    companyName: companyName as string,
    addressLine1,
    addressLine2,
    postalCode,
    city,
    country,
    email,
    phone,
    taxNumber,
    vatId,
    iban,
    bic,
    bundesland: input.bundesland,
    defaultLocale: input.defaultLocale,
    defaultDueTime: input.defaultDueTime,
    emailEnabled: Boolean(input.emailEnabled),
    dailyDigestEnabled: Boolean(input.dailyDigestEnabled),
    permitHorizonDays: input.permitHorizonDays,
  };
}

/** `time` columns come back as "09:00:00"; the app works with "HH:MM". */
const hhmm = (value: string) => value.slice(0, 5);

/**
 * Saves the company settings (the single `settings` row, id = 1; created if the seed never ran).
 * The time zone is deliberately not editable (event days and due dates are Europe/Berlin everywhere).
 * Writes audit "settings.update" with the changed fields as {field: {from, to}}; nothing is written
 * (and nothing audited) when no value changed. `audit_log.entity_id` is a uuid and the row id is 1,
 * so the entry has no entity id.
 */
export async function updateCompanySettings(actor: Actor, input: CompanySettingsInput) {
  if (!can(actor.role, "settings", "manage")) forbidden();
  const next = parseCompanySettings(input);

  return db.transaction(async (tx) => {
    const [current] = await tx.select().from(settings).where(eq(settings.id, 1)).for("update");
    const previous: Record<string, unknown> = current
      ? { ...current, defaultDueTime: hhmm(current.defaultDueTime) }
      : {};

    const changes: Record<string, { from: unknown; to: unknown }> = {};
    for (const [field, to] of Object.entries(next)) {
      const from = previous[field] ?? null;
      if (from !== to) changes[field] = { from, to };
    }
    if (current && Object.keys(changes).length === 0) return { changed: false as const };

    if (current) await tx.update(settings).set(next).where(eq(settings.id, 1));
    else await tx.insert(settings).values({ id: 1, ...next });
    await audit(tx, actor.id, [
      { action: "settings.update", entityType: "settings", entityId: null, diff: { changes } },
    ]);
    return { changed: true as const, fields: Object.keys(changes) };
  });
}
