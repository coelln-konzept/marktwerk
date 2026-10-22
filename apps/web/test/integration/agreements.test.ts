import {
  auditLog,
  contact,
  event,
  eventDuty,
  eventPreset,
  locationAgreement,
  venue,
} from "@marktwerk/db/schema";
import { asc, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import {
  type AgreementInput,
  AgreementInputError,
  archiveAgreement,
  createAgreement,
  createEventsFromAgreement,
  restoreAgreement,
  updateAgreement,
} from "@/server/services/agreements";
import { EventInputError, undoGeneratedEvents } from "@/server/services/events";
import { createActor, resetDatabase, seedCatalogue } from "../helpers/fixtures";

let cat: Awaited<ReturnType<typeof seedCatalogue>>;
let owner: Awaited<ReturnType<typeof createActor>>;
let townId: string;

beforeEach(async () => {
  await resetDatabase();
  cat = await seedCatalogue();
  owner = await createActor("owner");
  const [town] = await db
    .insert(contact)
    .values({ kind: "landowner", name: "Gemeinde Testdorf" })
    .returning();
  townId = town?.id ?? "";
});

afterAll(async () => {
  await db.$client.end();
});

const isForbidden = (error: unknown) =>
  String((error as { digest?: unknown })?.digest ?? "").includes("403");

const agreementInput = (patch: Partial<AgreementInput> = {}): AgreementInput => ({
  counterpartyContactId: townId,
  validFrom: "2026-01-01",
  validUntil: "2028-12-31",
  fixedDates: ["2027-05-02", "2026-06-07", "2026-06-07", "2028-05-07"],
  terms: "  Stellplätze nur bis 18 Uhr.  ",
  ...patch,
});

const manualPlan = () => ({
  manual: {
    name: "Gemeindefest",
    eventTypeId: cat.type.id,
    durationDays: 1,
    times: { setup: "06:00", open: "09:00", close: "17:00", teardown: "19:00" },
    pricePerMCents: 1000,
    bookingFeeCents: 0,
  },
});

async function newAgreement(patch: Partial<AgreementInput> = {}) {
  return createAgreement(owner, cat.venue.id, agreementInput(patch));
}

describe("agreements", () => {
  it("creates an agreement with sorted, de-duplicated dates and trimmed terms", async () => {
    const { id } = await newAgreement();
    const [row] = await db.select().from(locationAgreement).where(eq(locationAgreement.id, id));
    expect(row).toMatchObject({
      venueId: cat.venue.id,
      counterpartyContactId: townId,
      validFrom: "2026-01-01",
      validUntil: "2028-12-31",
      fixedDates: ["2026-06-07", "2027-05-02", "2028-05-07"],
      terms: "Stellplätze nur bis 18 Uhr.",
      archivedAt: null,
    });
    const entries = await db.select().from(auditLog);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      action: "agreement.create",
      entityType: "location_agreement",
      entityId: id,
      actorId: owner.id,
    });
  });

  it("accepts no counterparty, no terms and no dates", async () => {
    const { id } = await newAgreement({ counterpartyContactId: null, terms: "  ", fixedDates: [] });
    const [row] = await db.select().from(locationAgreement).where(eq(locationAgreement.id, id));
    expect(row).toMatchObject({ counterpartyContactId: null, terms: null, fixedDates: [] });
  });

  describe("rejects bad input without writing anything", () => {
    it.each([
      ["a malformed date", { validFrom: "1.1.2026" }, "invalid_date"],
      ["a malformed fixed date", { fixedDates: ["2026-02-30"] }, "invalid_date"],
      ["validity ending before it starts", { validUntil: "2025-12-31" }, "invalid_period"],
      ["a fixed date before the validity", { fixedDates: ["2025-06-01"] }, "date_outside_period"],
      ["a fixed date after the validity", { fixedDates: ["2029-06-01"] }, "date_outside_period"],
      [
        "an unknown counterparty",
        { counterpartyContactId: "019f0000-0000-7000-8000-000000000000" },
        "invalid_contact",
      ],
      ["terms that are too long", { terms: "x".repeat(4001) }, "invalid_terms"],
    ])("%s", async (_label, patch, code) => {
      await expect(newAgreement(patch)).rejects.toThrow(new AgreementInputError(code as never));
      expect(await db.select().from(locationAgreement)).toHaveLength(0);
      expect(await db.select().from(auditLog)).toHaveLength(0);
    });

    it("an unknown venue", async () => {
      await expect(
        createAgreement(owner, "019f0000-0000-7000-8000-000000000000", agreementInput()),
      ).rejects.toThrow(new AgreementInputError("invalid_venue"));
    });

    it("an archived venue", async () => {
      await db.update(venue).set({ archivedAt: new Date() }).where(eq(venue.id, cat.venue.id));
      await expect(newAgreement()).rejects.toThrow(new AgreementInputError("invalid_venue"));
    });
  });

  it("updates an agreement, audits the changed fields and returns the previous values", async () => {
    const { id } = await newAgreement();
    await db.delete(auditLog);
    const result = await updateAgreement(
      owner,
      id,
      agreementInput({ validUntil: "2029-12-31", terms: "Neue Bedingungen" }),
    );
    expect(result.changed).toBe(true);
    expect(result.previous).toMatchObject({ validUntil: "2028-12-31" });
    const [row] = await db.select().from(locationAgreement).where(eq(locationAgreement.id, id));
    expect(row).toMatchObject({ validUntil: "2029-12-31", terms: "Neue Bedingungen" });
    const [entry] = await db.select().from(auditLog);
    expect(entry).toMatchObject({ action: "agreement.update", entityId: id });
    const diff = entry?.diff as { changes: object };
    expect(Object.keys(diff.changes).sort()).toEqual(["terms", "validUntil"]);

    // Undo = write the previous values back.
    await updateAgreement(owner, id, result.previous, { undo: true });
    const [back] = await db.select().from(locationAgreement).where(eq(locationAgreement.id, id));
    expect(back).toMatchObject({ validUntil: "2028-12-31", terms: "Stellplätze nur bis 18 Uhr." });
  });

  it("does not write or audit when nothing changed", async () => {
    const { id } = await newAgreement();
    await db.delete(auditLog);
    expect((await updateAgreement(owner, id, agreementInput())).changed).toBe(false);
    expect(await db.select().from(auditLog)).toHaveLength(0);
  });

  it("refuses to edit an unknown agreement", async () => {
    await expect(
      updateAgreement(owner, "019f0000-0000-7000-8000-000000000000", agreementInput()),
    ).rejects.toThrow(new AgreementInputError("not_found"));
  });

  it("archives and restores an agreement, audited", async () => {
    const { id } = await newAgreement();
    await archiveAgreement(owner, id);
    const [archived] = await db
      .select()
      .from(locationAgreement)
      .where(eq(locationAgreement.id, id));
    expect(archived?.archivedAt).toBeInstanceOf(Date);
    await expect(updateAgreement(owner, id, agreementInput())).rejects.toThrow(
      new AgreementInputError("not_found"),
    );
    await restoreAgreement(owner, id);
    const [restored] = await db
      .select()
      .from(locationAgreement)
      .where(eq(locationAgreement.id, id));
    expect(restored?.archivedAt).toBeNull();
    expect((await db.select().from(auditLog)).map((e) => e.action)).toEqual([
      "agreement.create",
      "agreement.archive",
      "agreement.restore",
    ]);
  });

  it.each(["staff", "field"] as const)("is forbidden for the %s role", async (role) => {
    const actor = await createActor(role);
    const error = await createAgreement(actor, cat.venue.id, agreementInput()).then(
      () => null,
      (e: unknown) => e,
    );
    expect(isForbidden(error)).toBe(true);
    expect(await db.select().from(locationAgreement)).toHaveLength(0);
  });
});

describe("createEventsFromAgreement", () => {
  it("creates linked planned events from a preset for the dates without an event", async () => {
    const { id } = await newAgreement();
    await db.delete(auditLog);
    const { created, skipped } = await createEventsFromAgreement(owner, id, {
      presetId: cat.presets.flea.id,
    });
    expect(skipped).toEqual([]);
    expect(created.map((c) => c.startsOn)).toEqual(["2026-06-07", "2027-05-02", "2028-05-07"]);

    const rows = await db.select().from(event).orderBy(asc(event.startsOn));
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(row).toMatchObject({
        locationAgreementId: id,
        presetId: cat.presets.flea.id,
        venueId: cat.venue.id,
        name: "Testflohmarkt",
        status: "planned",
        pricePerMCents: 1200,
      });
    }
    // Default duties of the preset come along, like in a normal generation.
    expect(await db.select().from(eventDuty)).toHaveLength(6);
    const entries = await db.select().from(auditLog);
    expect(entries).toHaveLength(3);
    expect(entries.map((e) => e.diff)).toContainEqual({
      presetId: cat.presets.flea.id,
      locationAgreementId: id,
      startsOn: "2026-06-07",
      source: "agreement",
    });
  });

  it("creates events without preset from typed data, at the agreement's venue", async () => {
    const { id } = await newAgreement();
    const { created } = await createEventsFromAgreement(owner, id, manualPlan(), ["2027-05-02"]);
    expect(created).toHaveLength(1);
    const [row] = await db
      .select()
      .from(event)
      .where(eq(event.id, created[0]?.id ?? ""));
    expect(row).toMatchObject({
      presetId: null,
      locationAgreementId: id,
      venueId: cat.venue.id,
      name: "Gemeindefest",
      startsOn: "2027-05-02",
    });
    expect(await db.select().from(eventDuty)).toHaveLength(0);
  });

  it("skips dates that already have an event of the agreement, and runs again for the rest", async () => {
    const { id } = await newAgreement();
    await createEventsFromAgreement(owner, id, { presetId: cat.presets.flea.id }, ["2026-06-07"]);
    const second = await createEventsFromAgreement(owner, id, { presetId: cat.presets.flea.id });
    expect(second.created.map((c) => c.startsOn)).toEqual(["2027-05-02", "2028-05-07"]);
    expect(await db.select().from(event)).toHaveLength(3);

    // Asking for a date that has an event: reported as skipped; nothing left to do → no_dates.
    await expect(
      createEventsFromAgreement(owner, id, { presetId: cat.presets.flea.id }),
    ).rejects.toThrow(new EventInputError("no_dates"));
    await expect(
      createEventsFromAgreement(owner, id, { presetId: cat.presets.flea.id }, ["2026-06-07"]),
    ).rejects.toThrow(new EventInputError("no_dates"));
    expect(await db.select().from(event)).toHaveLength(3);
  });

  it("reports requested dates that already have an event as skipped", async () => {
    const { id } = await newAgreement();
    await createEventsFromAgreement(owner, id, { presetId: cat.presets.flea.id }, ["2026-06-07"]);
    const result = await createEventsFromAgreement(owner, id, { presetId: cat.presets.flea.id }, [
      "2026-06-07",
      "2027-05-02",
    ]);
    expect(result.skipped).toEqual(["2026-06-07"]);
    expect(result.created.map((c) => c.startsOn)).toEqual(["2027-05-02"]);
  });

  it("creates the date again after its event was undone (archived)", async () => {
    const { id } = await newAgreement();
    const { created } = await createEventsFromAgreement(
      owner,
      id,
      { presetId: cat.presets.flea.id },
      ["2026-06-07"],
    );
    await undoGeneratedEvents(
      owner,
      created.map((c) => c.id),
    );
    const again = await createEventsFromAgreement(owner, id, { presetId: cat.presets.flea.id }, [
      "2026-06-07",
    ]);
    expect(again.created).toHaveLength(1);
  });

  it("rejects dates that are not part of the agreement", async () => {
    const { id } = await newAgreement();
    await expect(
      createEventsFromAgreement(owner, id, { presetId: cat.presets.flea.id }, ["2026-06-14"]),
    ).rejects.toThrow(new EventInputError("date_not_in_agreement"));
    expect(await db.select().from(event)).toHaveLength(0);
  });

  it("rejects a preset of another venue, an inactive preset and an unknown agreement", async () => {
    const { id } = await newAgreement();
    const [other] = await db
      .insert(venue)
      .values({ name: "Anderer Platz", kind: "indoor", city: "Bonn" })
      .returning();
    await db
      .update(eventPreset)
      .set({ venueId: other?.id })
      .where(eq(eventPreset.id, cat.presets.festival.id));
    await expect(
      createEventsFromAgreement(owner, id, { presetId: cat.presets.festival.id }),
    ).rejects.toThrow(new EventInputError("preset_venue_mismatch"));
    await expect(
      createEventsFromAgreement(owner, id, { presetId: "019f0000-0000-7000-8000-000000000000" }),
    ).rejects.toThrow(new EventInputError("preset_not_found"));
    await expect(
      createEventsFromAgreement(owner, "019f0000-0000-7000-8000-000000000000", {
        presetId: cat.presets.flea.id,
      }),
    ).rejects.toThrow(new AgreementInputError("not_found"));
    expect(await db.select().from(event)).toHaveLength(0);
  });

  it("validates typed event data like the Einzeltermin", async () => {
    const { id } = await newAgreement();
    const plan = manualPlan();
    plan.manual.name = " ";
    await expect(createEventsFromAgreement(owner, id, plan)).rejects.toThrow(
      new EventInputError("invalid_name"),
    );
  });

  it("does nothing for an archived agreement", async () => {
    const { id } = await newAgreement();
    await archiveAgreement(owner, id);
    await expect(
      createEventsFromAgreement(owner, id, { presetId: cat.presets.flea.id }),
    ).rejects.toThrow(new AgreementInputError("not_found"));
  });

  it("is all or nothing", async () => {
    const { id } = await newAgreement();
    await db.delete(auditLog);
    // A duty pointing at a missing staff member makes the second insert fail → nothing stays.
    await db
      .update(eventPreset)
      .set({ defaultDuties: { market_lead: "019f0000-0000-7000-8000-000000000000" } })
      .where(eq(eventPreset.id, cat.presets.flea.id));
    await expect(
      createEventsFromAgreement(owner, id, { presetId: cat.presets.flea.id }),
    ).rejects.toThrow();
    expect(await db.select().from(event)).toHaveLength(0);
    expect(await db.select().from(auditLog)).toHaveLength(0);
  });

  it.each(["staff", "field"] as const)("is forbidden for the %s role", async (role) => {
    const { id } = await newAgreement();
    const actor = await createActor(role);
    const error = await createEventsFromAgreement(actor, id, {
      presetId: cat.presets.flea.id,
    }).then(
      () => null,
      (e: unknown) => e,
    );
    expect(isForbidden(error)).toBe(true);
    expect(await db.select().from(event)).toHaveLength(0);
  });
});
