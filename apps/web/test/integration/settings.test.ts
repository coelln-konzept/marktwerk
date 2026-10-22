import { auditLog, legalParameter, settings } from "@marktwerk/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { getCompanySettings, listLegalParameters } from "@/server/queries/settings";
import {
  type CompanySettingsInput,
  SettingsInputError,
  updateCompanySettings,
} from "@/server/services/settings";
import { createActor, resetDatabase } from "../helpers/fixtures";

let owner: Awaited<ReturnType<typeof createActor>>;

const valid: CompanySettingsInput = {
  companyName: "Muster Märkte GmbH",
  addressLine1: "Demostraße 7",
  addressLine2: "",
  postalCode: "50667",
  city: "Köln",
  country: "DE",
  email: "info@example.com",
  phone: "+49 221 123456",
  taxNumber: "",
  vatId: "DE999999999",
  iban: "DE02 1203 0000 0000 2020 51",
  bic: "demodem1xxx",
  bundesland: "NW",
  defaultLocale: "de",
  defaultDueTime: "09:00",
  emailEnabled: false,
  dailyDigestEnabled: true,
};

beforeEach(async () => {
  await resetDatabase();
  owner = await createActor("owner");
});

afterAll(async () => {
  await db.$client.end();
});

const isForbidden = (error: unknown) =>
  String((error as { digest?: unknown })?.digest ?? "").includes("403");

const audits = () => db.select().from(auditLog).where(eq(auditLog.action, "settings.update"));

describe("updateCompanySettings", () => {
  it("creates the settings row on first save and normalises IBAN, BIC and empty values", async () => {
    const result = await updateCompanySettings(owner, valid);
    expect(result.changed).toBe(true);
    const [row] = await db.select().from(settings);
    expect(row).toMatchObject({
      id: 1,
      companyName: "Muster Märkte GmbH",
      addressLine2: null,
      taxNumber: null,
      iban: "DE02120300000000202051",
      bic: "DEMODEM1XXX",
      vatId: "DE999999999",
      timeZone: "Europe/Berlin",
      defaultDueTime: "09:00:00",
    });
  });

  it("changes only what was edited and audits exactly those fields", async () => {
    await updateCompanySettings(owner, valid);
    await db.delete(auditLog);

    const result = await updateCompanySettings(owner, {
      ...valid,
      city: "Bonn",
      defaultDueTime: "08:30",
    });
    expect(result).toEqual({ changed: true, fields: ["city", "defaultDueTime"] });

    const [entry] = await audits();
    expect(entry).toMatchObject({ actorId: owner.id, entityType: "settings", entityId: null });
    expect(entry?.diff).toEqual({
      changes: {
        city: { from: "Köln", to: "Bonn" },
        defaultDueTime: { from: "09:00", to: "08:30" },
      },
    });
    const view = await getCompanySettings();
    expect(view).toMatchObject({
      city: "Bonn",
      defaultDueTime: "08:30",
      iban: "DE02120300000000202051",
    });
  });

  it("does nothing, and audits nothing, when no value changed", async () => {
    await updateCompanySettings(owner, valid);
    await db.delete(auditLog);
    const result = await updateCompanySettings(owner, valid);
    expect(result).toEqual({ changed: false });
    expect(await audits()).toHaveLength(0);
  });

  it("never touches the time zone", async () => {
    await db.insert(settings).values({ id: 1, companyName: "Alt", timeZone: "Europe/Vienna" });
    await updateCompanySettings(owner, valid);
    const [row] = await db.select().from(settings);
    expect(row?.timeZone).toBe("Europe/Vienna");
  });

  describe("rejects invalid input without writing anything", () => {
    it.each([
      ["an empty company name", { companyName: "  " }, { companyName: "required" }],
      ["a name that is too long", { companyName: "x".repeat(201) }, { companyName: "too_long" }],
      ["a wrong IBAN checksum", { iban: "DE02120300000000202052" }, { iban: "invalid" }],
      ["a malformed BIC", { bic: "DEMO" }, { bic: "invalid" }],
      ["a malformed VAT id", { vatId: "DE123" }, { vatId: "invalid" }],
      ["a malformed email", { email: "info(at)example.com" }, { email: "invalid" }],
      ["a German postcode with 4 digits", { postalCode: "5066" }, { postalCode: "invalid" }],
      ["an unsupported Bundesland", { bundesland: "BY" }, { bundesland: "unsupported" }],
      ["an unknown language", { defaultLocale: "fr" }, { defaultLocale: "unsupported" }],
      ["a due time that is not a time", { defaultDueTime: "25:00" }, { defaultDueTime: "invalid" }],
      ["a country code with 3 letters", { country: "DEU" }, { country: "invalid" }],
    ])("%s", async (_label, patch, fields) => {
      await updateCompanySettings(owner, valid);
      await db.delete(auditLog);
      const error = await updateCompanySettings(owner, { ...valid, ...patch }).catch((e) => e);
      expect(error).toBeInstanceOf(SettingsInputError);
      expect((error as SettingsInputError).fields).toEqual(fields);
      expect(await audits()).toHaveLength(0);
      expect((await getCompanySettings()).companyName).toBe("Muster Märkte GmbH");
    });

    it("reports every bad field at once", async () => {
      const error = await updateCompanySettings(owner, {
        ...valid,
        companyName: "",
        iban: "x",
      }).catch((e) => e);
      expect((error as SettingsInputError).fields).toEqual({
        companyName: "required",
        iban: "invalid",
      });
    });
  });

  it.each(["manager", "staff", "field"] as const)("is forbidden for %s", async (role) => {
    const actor = await createActor(role);
    const error = await updateCompanySettings(actor, valid).catch((e) => e);
    expect(isForbidden(error)).toBe(true);
    expect(await db.select().from(settings)).toHaveLength(0);
    expect(await audits()).toHaveLength(0);
  });
});

describe("listLegalParameters", () => {
  it("derives validity end and state from the next row of the same key", async () => {
    await db.insert(legalParameter).values([
      { key: "minimum_wage_cents_per_hour", value: 1390, validFrom: "2026-01-01", note: "MiLoG" },
      { key: "minimum_wage_cents_per_hour", value: 1460, validFrom: "2027-01-01" },
      { key: "minimum_wage_cents_per_hour", value: 1200, validFrom: "2024-01-01" },
      { key: "hu_interval_months_over_3500kg", value: 12, validFrom: "2026-01-01" },
    ]);
    const rows = await listLegalParameters("2026-10-21");
    expect(rows.map((r) => [r.key, r.value, r.validFrom, r.validUntil, r.state, r.note])).toEqual([
      ["hu_interval_months_over_3500kg", 12, "2026-01-01", null, "current", null],
      ["minimum_wage_cents_per_hour", 1200, "2024-01-01", "2025-12-31", "past", null],
      ["minimum_wage_cents_per_hour", 1390, "2026-01-01", "2026-12-31", "current", "MiLoG"],
      ["minimum_wage_cents_per_hour", 1460, "2027-01-01", null, "future", null],
    ]);
  });

  it("is empty without rows", async () => {
    expect(await listLegalParameters("2026-10-21")).toEqual([]);
  });
});

describe("getCompanySettings", () => {
  it("returns form-friendly defaults while the row does not exist", async () => {
    expect(await getCompanySettings()).toMatchObject({
      exists: false,
      companyName: "",
      country: "DE",
      bundesland: "NW",
      defaultDueTime: "09:00",
    });
  });
});
