import { defaultSchedule } from "@marktwerk/core";
import { dutyRole, event, eventPreset, shift, shiftNeed, staffMember } from "@marktwerk/db/schema";
import { asc, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { Actor } from "@/server/actor";
import { db } from "@/server/db";
import { moveEvent } from "@/server/services/event-details";
import { createEventsFromPreset } from "@/server/services/events";
import { createActor, resetDatabase, seedCatalogue } from "../helpers/fixtures";

let cat: Awaited<ReturnType<typeof seedCatalogue>>;
let owner: Actor;
let crewRoleId: string;
let crewKey: string;

beforeEach(async () => {
  await resetDatabase();
  cat = await seedCatalogue();
  owner = await createActor("owner");
  const [role] = await db.select().from(dutyRole).orderBy(asc(dutyRole.sort)).limit(1);
  if (!role) throw new Error("seedCatalogue has no duty roles");
  crewRoleId = role.id;
  crewKey = role.key;
  await db
    .update(eventPreset)
    .set({
      schedule: defaultSchedule(),
      staffing: [
        { dutyRoleKey: crewKey, count: 2, scheduleKind: "setup" },
        { dutyRoleKey: crewKey, count: 1, scheduleKind: "open" },
      ],
    })
    .where(eq(eventPreset.id, cat.presets.flea.id));
});

const needsOf = (eventId: string) =>
  db
    .select()
    .from(shiftNeed)
    .where(eq(shiftNeed.eventId, eventId))
    .orderBy(asc(shiftNeed.workDate), asc(shiftNeed.scheduleKind));

describe("needs from the preset", () => {
  it("a new event copies the staffing and gets one need per day and kind", async () => {
    const [created] = await createEventsFromPreset(owner, cat.presets.flea.id, ["2026-12-13"]);
    if (!created) throw new Error("no event");
    const [row] = await db.select().from(event).where(eq(event.id, created.id));
    expect(row?.staffing).toHaveLength(2);
    const needs = await needsOf(created.id);
    expect(needs.map((n) => [n.workDate, n.scheduleKind, n.headcount]).sort()).toEqual(
      [
        ["2026-12-13", "setup", 2],
        ["2026-12-13", "open", 1],
      ].sort(),
    );
    expect(needs[0]?.dutyRoleId).toBe(crewRoleId);
  });

  it("editing the preset later does not touch existing events", async () => {
    const [created] = await createEventsFromPreset(owner, cat.presets.flea.id, ["2026-12-13"]);
    if (!created) throw new Error("no event");
    await db
      .update(eventPreset)
      .set({ staffing: [] })
      .where(eq(eventPreset.id, cat.presets.flea.id));
    expect(await needsOf(created.id)).toHaveLength(2);
  });
});

describe("moveEvent moves needs and resets confirmations", () => {
  it("moves needs and linked shifts by the offset; confirmed becomes requested", async () => {
    const [created] = await createEventsFromPreset(owner, cat.presets.flea.id, ["2026-12-13"]);
    if (!created) throw new Error("no event");
    const [need] = await needsOf(created.id);
    if (!need) throw new Error("no need");
    const [person] = await db
      .insert(staffMember)
      .values({ displayName: "Anna A.", firstName: "Anna", lastName: "A." })
      .returning();
    if (!person) throw new Error("no person");
    await db.insert(shift).values({
      eventId: created.id,
      staffMemberId: person.id,
      dutyRoleId: crewRoleId,
      needId: need.id,
      workDate: "2026-12-13",
      plannedStart: "06:00",
      plannedEnd: "08:00",
      status: "confirmed",
    });
    const result = await moveEvent(owner, created.id, "2026-12-20", "2026-12-13");
    expect(result.confirmationsReset).toBe(1);
    const needs = await needsOf(created.id);
    expect(needs.every((n) => n.workDate === "2026-12-20")).toBe(true);
    const [moved] = await db.select().from(shift).where(eq(shift.needId, need.id));
    expect(moved).toMatchObject({ workDate: "2026-12-20", status: "requested", version: 2 });
  });
});
