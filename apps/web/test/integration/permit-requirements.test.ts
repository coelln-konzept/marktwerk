import {
  auditLog,
  contact,
  dutyRole,
  eventPreset,
  permit,
  permitRequirement,
  task,
} from "@marktwerk/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { listVenueRequirements } from "@/server/queries/permits";
import { createEventsFromPreset } from "@/server/services/events";
import {
  applyRequirementsToUpcomingEvents,
  archiveRequirement,
  createRequirement,
  type RequirementInput,
  restoreRequirement,
  updateRequirement,
} from "@/server/services/permit-requirements";
import { createActor, resetDatabase, seedCatalogue } from "../helpers/fixtures";

let cat: Awaited<ReturnType<typeof seedCatalogue>>;
let owner: Awaited<ReturnType<typeof createActor>>;
let authorityId: string;

const isForbidden = (error: unknown) =>
  String((error as { digest?: unknown })?.digest ?? "").includes("403");

beforeEach(async () => {
  await resetDatabase();
  cat = await seedCatalogue();
  owner = await createActor("owner");
  const [authority] = await db
    .insert(contact)
    .values({ kind: "authority", name: "Ordnungsamt Köln" })
    .returning();
  authorityId = authority?.id ?? "";
});

afterAll(async () => {
  await db.$client.end();
});

const input = (patch: Partial<RequirementInput> = {}): RequirementInput => ({
  category: "city",
  permitType: "market_permit",
  title: "  Marktgenehmigung  ",
  eventTypeId: null,
  authorityContactId: authorityId,
  cadence: "per_season",
  leadTimeDays: 120,
  submissionWindowStartMd: "10-01",
  submissionWindowEndMd: "11-30",
  expectedDecisionMd: "01-15",
  typicalFeeCents: 12000,
  deliverables: { stickers: 100 },
  notes: "  Antrag online  ",
  ...patch,
});

describe("permit requirements", () => {
  it("creates a requirement with normalised values and audits it", async () => {
    const { id } = await createRequirement(owner, cat.venue.id, input());
    const [row] = await db.select().from(permitRequirement).where(eq(permitRequirement.id, id));
    expect(row).toMatchObject({
      venueId: cat.venue.id,
      title: "Marktgenehmigung",
      authorityContactId: authorityId,
      cadence: "per_season",
      leadTimeDays: 120,
      submissionWindowStartMd: "10-01",
      expectedDecisionMd: "01-15",
      typicalFeeCents: 12000,
      deliverables: { stickers: 100 },
      notes: "Antrag online",
    });
    const [entry] = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, "permit_requirement.create"));
    expect(entry).toMatchObject({
      entityType: "permit_requirement",
      entityId: id,
      actorId: owner.id,
    });
    const listed = await listVenueRequirements(cat.venue.id);
    expect(listed.map((r) => [r.title, r.authorityName])).toEqual([
      ["Marktgenehmigung", "Ordnungsamt Köln"],
    ]);
  });

  it("validates input", async () => {
    const bad = async (patch: Partial<RequirementInput>, code: string) =>
      expect(createRequirement(owner, cat.venue.id, input(patch))).rejects.toMatchObject({ code });
    await bad({ title: "  " }, "invalid_title");
    await bad({ leadTimeDays: -1 }, "invalid_lead_time");
    await bad({ leadTimeDays: 1.5 }, "invalid_lead_time");
    await bad({ submissionWindowStartMd: "13-01" }, "invalid_month_day");
    await bad({ expectedDecisionMd: "1-5" }, "invalid_month_day");
    await bad({ typicalFeeCents: -5 }, "invalid_fee");
    await bad({ cadence: "weekly" as never }, "invalid_cadence");
    await bad({ category: "other" as never }, "invalid_category");
    await bad({ permitType: "nope" as never }, "invalid_type");
    await bad({ authorityContactId: "11111111-1111-4111-8111-111111111111" }, "invalid_contact");
    await bad({ eventTypeId: "11111111-1111-4111-8111-111111111111" }, "invalid_event_type");
    await bad({ deliverables: { stickers: -3 } }, "invalid_deliverables");
    await expect(createRequirement(owner, "nope", input())).rejects.toMatchObject({
      code: "invalid_venue",
    });
    expect(await db.select().from(permitRequirement)).toHaveLength(0);
  });

  it("edits with a diff, reports no change, and an undo writes the previous values back", async () => {
    const { id } = await createRequirement(owner, cat.venue.id, input());
    const same = await updateRequirement(owner, id, input());
    expect(same.changed).toBe(false);

    const result = await updateRequirement(
      owner,
      id,
      input({ leadTimeDays: 60, typicalFeeCents: null }),
    );
    expect(result.changed).toBe(true);
    expect(result.previous).toMatchObject({ leadTimeDays: 120, typicalFeeCents: 12000 });
    const [entry] = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, "permit_requirement.update"));
    expect(entry?.diff).toMatchObject({
      changes: { leadTimeDays: { from: 120, to: 60 }, typicalFeeCents: { from: 12000, to: null } },
    });

    await updateRequirement(owner, id, result.previous, { undo: true });
    const [row] = await db.select().from(permitRequirement).where(eq(permitRequirement.id, id));
    expect(row).toMatchObject({ leadTimeDays: 120, typicalFeeCents: 12000 });
  });

  it("does not touch permits that exist already when the blueprint changes", async () => {
    const { id } = await createRequirement(
      owner,
      cat.venue.id,
      input({ submissionWindowStartMd: null, submissionWindowEndMd: null }),
    );
    await db
      .insert(dutyRole)
      .values({ key: "permits", nameDe: "Genehmigungen", nameEn: "Permits" });
    await createEventsFromPreset(owner, cat.presets.flea.id, ["2027-05-02"]);
    const [before] = await db.select().from(permit);
    await updateRequirement(
      owner,
      id,
      input({ leadTimeDays: 10, submissionWindowStartMd: null, submissionWindowEndMd: null }),
    );
    const [after] = await db.select().from(permit);
    expect(after?.applyBy).toBe(before?.applyBy);
  });

  it("archives and restores; archived requirements create nothing", async () => {
    const { id } = await createRequirement(owner, cat.venue.id, input());
    expect((await archiveRequirement(owner, id)).title).toBe("Marktgenehmigung");
    expect(await listVenueRequirements(cat.venue.id)).toHaveLength(0);
    await createEventsFromPreset(owner, cat.presets.flea.id, ["2027-05-02"]);
    expect(await db.select().from(permit)).toHaveLength(0);
    await expect(updateRequirement(owner, id, input())).rejects.toMatchObject({
      code: "not_found",
    });
    await restoreRequirement(owner, id);
    expect(await listVenueRequirements(cat.venue.id)).toHaveLength(1);
  });

  it("staff may edit, only owner/manager remove; field is forbidden", async () => {
    const staff = await createActor("staff");
    const field = await createActor("field");
    const { id } = await createRequirement(staff, cat.venue.id, input());
    await updateRequirement(staff, id, input({ leadTimeDays: 14 }));
    await expect(archiveRequirement(staff, id)).rejects.toSatisfy(isForbidden);
    await expect(createRequirement(field, cat.venue.id, input())).rejects.toSatisfy(isForbidden);
    await expect(updateRequirement(field, id, input())).rejects.toSatisfy(isForbidden);
    await expect(applyRequirementsToUpcomingEvents(field, cat.venue.id)).rejects.toSatisfy(
      isForbidden,
    );
  });

  it("applies a new requirement to events that already exist, once", async () => {
    await db
      .insert(dutyRole)
      .values({ key: "permits", nameDe: "Genehmigungen", nameEn: "Permits" });
    await db
      .update(eventPreset)
      .set({ defaultDuties: { permits: cat.staff.anna.id } })
      .where(eq(eventPreset.id, cat.presets.flea.id));
    // The events exist before the venue has any requirement.
    await createEventsFromPreset(owner, cat.presets.flea.id, ["2099-05-03", "2099-06-07"]);
    expect(await db.select().from(permit)).toHaveLength(0);

    await createRequirement(
      owner,
      cat.venue.id,
      input({ submissionWindowStartMd: null, submissionWindowEndMd: null }),
    );
    const first = await applyRequirementsToUpcomingEvents(owner, cat.venue.id);
    expect(first).toEqual({ events: 2, permits: 1, linked: 2, tasks: 1 });
    const [t] = await db.select().from(task);
    expect(t).toMatchObject({ source: "permit", assigneeId: cat.staff.anna.id });
    const second = await applyRequirementsToUpcomingEvents(owner, cat.venue.id);
    expect(second).toEqual({ events: 2, permits: 0, linked: 0, tasks: 0 });
  });
});
