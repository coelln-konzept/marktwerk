import { auditLog, event, eventDuty, eventPreset, staffMember } from "@marktwerk/db/schema";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { EventDutyInputError, setEventDuty } from "@/server/services/event-duties";
import { createEventsFromPreset } from "@/server/services/events";
import { createActor, resetDatabase, seedCatalogue } from "../helpers/fixtures";

let cat: Awaited<ReturnType<typeof seedCatalogue>>;
let owner: Awaited<ReturnType<typeof createActor>>;
let eventId: string;

beforeEach(async () => {
  await resetDatabase();
  cat = await seedCatalogue();
  owner = await createActor("owner");
  // Default team of the preset: Marktleitung = Anna, Aufbau = Ben.
  const [created] = await createEventsFromPreset(owner, cat.presets.flea.id, ["2026-11-14"]);
  if (!created) throw new Error("no event");
  eventId = created.id;
});

afterAll(async () => {
  await db.$client.end();
});

const isForbidden = (error: unknown) =>
  String((error as { digest?: unknown })?.digest ?? "").includes("403");

const dutyOf = async (roleId: string) => {
  const [row] = await db
    .select({ staffMemberId: eventDuty.staffMemberId })
    .from(eventDuty)
    .where(and(eq(eventDuty.eventId, eventId), eq(eventDuty.dutyRoleId, roleId)));
  return row?.staffMemberId ?? null;
};

const dutyAudits = () =>
  db.select().from(auditLog).where(eq(auditLog.action, "event.duty")).orderBy(auditLog.at);

describe("setEventDuty", () => {
  it("reassigns a role and audits role and names", async () => {
    const result = await setEventDuty(owner, eventId, cat.roles.lead.id, cat.staff.ben.id);
    expect(result).toEqual({
      changed: true,
      from: cat.staff.anna.id,
      to: cat.staff.ben.id,
      tasks: 0,
    });
    expect(await dutyOf(cat.roles.lead.id)).toBe(cat.staff.ben.id);

    const [entry] = await dutyAudits();
    expect(entry).toMatchObject({ actorId: owner.id, entityType: "event", entityId: eventId });
    expect(entry?.diff).toEqual({
      role: "market_lead",
      roleDe: "Marktleitung",
      roleEn: "Market lead",
      from: cat.staff.anna.id,
      fromName: "Anna Test",
      to: cat.staff.ben.id,
      toName: "Ben Test",
    });
  });

  it("unassigns a role and fills an empty one", async () => {
    await setEventDuty(owner, eventId, cat.roles.setup.id, null);
    expect(await dutyOf(cat.roles.setup.id)).toBeNull();

    const filled = await setEventDuty(owner, eventId, cat.roles.setup.id, cat.staff.anna.id);
    expect(filled).toMatchObject({ changed: true, from: null, to: cat.staff.anna.id });
    expect(await dutyOf(cat.roles.setup.id)).toBe(cat.staff.anna.id);
    expect(await dutyAudits()).toHaveLength(2);
  });

  it("does nothing (and audits nothing) when the person is already assigned", async () => {
    const result = await setEventDuty(owner, eventId, cat.roles.lead.id, cat.staff.anna.id);
    expect(result).toEqual({
      changed: false,
      from: cat.staff.anna.id,
      to: cat.staff.anna.id,
      tasks: 0,
    });
    expect(await dutyAudits()).toHaveLength(0);
  });

  it("never touches the preset's default team", async () => {
    await setEventDuty(owner, eventId, cat.roles.lead.id, cat.staff.ben.id);
    const [preset] = await db
      .select({ defaultDuties: eventPreset.defaultDuties })
      .from(eventPreset)
      .where(eq(eventPreset.id, cat.presets.flea.id));
    expect(preset?.defaultDuties).toMatchObject({ market_lead: cat.staff.anna.id });
  });

  it("undo applies only while the role still has the expected person", async () => {
    await setEventDuty(owner, eventId, cat.roles.lead.id, cat.staff.ben.id);
    // Someone else changes it again before the undo is clicked.
    await setEventDuty(owner, eventId, cat.roles.lead.id, null);
    await expect(
      setEventDuty(owner, eventId, cat.roles.lead.id, cat.staff.anna.id, cat.staff.ben.id),
    ).rejects.toMatchObject({ code: "conflict" });
    expect(await dutyOf(cat.roles.lead.id)).toBeNull();

    const undone = await setEventDuty(owner, eventId, cat.roles.lead.id, cat.staff.anna.id, null);
    expect(undone.changed).toBe(true);
    expect((await dutyAudits()).at(-1)?.diff).toMatchObject({ undo: true });
  });

  it("rejects inactive or archived staff, unknown roles and archived events", async () => {
    await db.update(staffMember).set({ active: false }).where(eq(staffMember.id, cat.staff.ben.id));
    await expect(
      setEventDuty(owner, eventId, cat.roles.lead.id, cat.staff.ben.id),
    ).rejects.toMatchObject({ code: "invalid_staff" });
    await expect(
      setEventDuty(owner, eventId, cat.roles.lead.id, "not-a-uuid"),
    ).rejects.toBeInstanceOf(EventDutyInputError);
    await expect(
      setEventDuty(owner, eventId, "00000000-0000-7000-8000-000000000000", null),
    ).rejects.toMatchObject({ code: "invalid_role" });

    await db.update(event).set({ archivedAt: new Date() }).where(eq(event.id, eventId));
    await expect(setEventDuty(owner, eventId, cat.roles.lead.id, null)).rejects.toMatchObject({
      code: "not_found",
    });
    expect(await dutyAudits()).toHaveLength(0);
  });

  it("is forbidden for staff (event: read only)", async () => {
    const staff = await createActor("staff");
    const error = await setEventDuty(staff, eventId, cat.roles.lead.id, null).catch((e) => e);
    expect(isForbidden(error)).toBe(true);
    expect(await dutyOf(cat.roles.lead.id)).toBe(cat.staff.anna.id);
  });
});
