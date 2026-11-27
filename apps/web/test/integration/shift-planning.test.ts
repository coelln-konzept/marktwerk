import { defaultSchedule } from "@marktwerk/core";
import {
  auditLog,
  dutyRole,
  event,
  eventPreset,
  shift,
  shiftNeed,
  staffMember,
  staffUnavailability,
} from "@marktwerk/db/schema";
import { asc, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { Actor } from "@/server/actor";
import { db } from "@/server/db";
import { moveEvent } from "@/server/services/event-details";
import { createEventsFromPreset } from "@/server/services/events";
import {
  applyPresetStaffing,
  assignToNeed,
  PlanningInputError,
  setShiftStatus,
  setUnavailability,
  updateNeed,
} from "@/server/services/shift-planning";
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

const isForbidden = (error: unknown) =>
  String((error as { digest?: unknown })?.digest ?? "").includes("403");

async function person(name: string) {
  const [p] = await db
    .insert(staffMember)
    .values({ displayName: name, firstName: name, lastName: "T." })
    .returning();
  if (!p) throw new Error("no person");
  return p;
}

describe("assigning and answering", () => {
  it("assign → requested with the need's times; decline reopens; undo restores", async () => {
    const [ev] = await createEventsFromPreset(owner, cat.presets.flea.id, ["2026-12-13"]);
    const [need] = await needsOf(ev!.id);
    const anna = await person("Anna");
    const { shiftId, shortNotice } = await assignToNeed(owner, need!.id, anna.id, {
      today: "2026-11-26",
    });
    expect(shortNotice).toBe(false);
    const [row] = await db.select().from(shift).where(eq(shift.id, shiftId));
    expect(row).toMatchObject({
      status: "requested",
      needId: need!.id,
      plannedStart: "06:00:00",
      plannedEnd: "08:00:00",
    });

    const declined = await setShiftStatus(owner, shiftId, "declined", row!.version);
    expect(declined.previous).toBe("requested");
    const undone = await setShiftStatus(
      owner,
      shiftId,
      declined.previous as "requested",
      declined.version,
    );
    expect(undone.version).toBe(declined.version + 1);
    const audits = await db.select().from(auditLog).where(eq(auditLog.entityId, shiftId));
    expect(audits.map((a) => a.action)).toEqual(["shift.create", "shift.update", "shift.update"]);
  });

  it("a warning without confirmation is refused, with confirmation saved", async () => {
    const [ev] = await createEventsFromPreset(owner, cat.presets.flea.id, ["2026-12-13"]);
    const [need] = await needsOf(ev!.id);
    const ben = await person("Ben");
    await setUnavailability(owner, ben.id, "2026-12-13", "2026-12-13", "Urlaub");
    await expect(
      assignToNeed(owner, need!.id, ben.id, { today: "2026-11-26" }),
    ).rejects.toMatchObject({ code: "needs_confirmation", flags: ["unavailable"] });
    await expect(
      assignToNeed(owner, need!.id, ben.id, { today: "2026-11-26", confirm: true }),
    ).resolves.toMatchObject({ shortNotice: false });
  });

  it("short notice when the day is less than 4 days ahead", async () => {
    const [ev] = await createEventsFromPreset(owner, cat.presets.flea.id, ["2026-12-13"]);
    const [need] = await needsOf(ev!.id);
    const cem = await person("Cem");
    expect((await assignToNeed(owner, need!.id, cem.id, { today: "2026-12-11" })).shortNotice).toBe(
      true,
    );
  });

  it("staff and field roles are refused", async () => {
    const [ev] = await createEventsFromPreset(owner, cat.presets.flea.id, ["2026-12-13"]);
    const [need] = await needsOf(ev!.id);
    const dora = await person("Dora");
    for (const role of ["staff", "field"] as const) {
      const actor = await createActor(role, `${role}2@test.local`);
      await assignToNeed(actor, need!.id, dora.id).then(
        () => expect.fail("allowed"),
        (e) => expect(isForbidden(e)).toBe(true),
      );
    }
  });
});

describe("needs and unavailability", () => {
  it("updateNeed changes one day only and is audited", async () => {
    const [ev] = await createEventsFromPreset(owner, cat.presets.flea.id, ["2026-12-13"]);
    const [need] = await needsOf(ev!.id);
    await updateNeed(owner, need!.id, { headcount: 3, plannedStart: "05:30", plannedEnd: "08:00" });
    const [row] = await db.select().from(shiftNeed).where(eq(shiftNeed.id, need!.id));
    expect(row).toMatchObject({ headcount: 3, plannedStart: "05:30:00" });
    await expect(updateNeed(owner, need!.id, { headcount: -1 })).rejects.toBeInstanceOf(
      PlanningInputError,
    );
  });

  it("setUnavailability writes one row per day and replaces the note on repeat", async () => {
    const eva = await person("Eva");
    expect(
      (await setUnavailability(owner, eva.id, "2026-12-12", "2026-12-14", null)).dates,
    ).toHaveLength(3);
    await setUnavailability(owner, eva.id, "2026-12-13", "2026-12-13", "nur bis 15 Uhr");
    const rows = await db
      .select()
      .from(staffUnavailability)
      .where(eq(staffUnavailability.staffMemberId, eva.id))
      .orderBy(asc(staffUnavailability.date));
    expect(rows.map((r) => r.note)).toEqual([null, "nur bis 15 Uhr", null]);
  });

  it("applyPresetStaffing is idempotent for events created before the preset had staffing", async () => {
    await db
      .update(eventPreset)
      .set({ staffing: [] })
      .where(eq(eventPreset.id, cat.presets.flea.id));
    const [ev] = await createEventsFromPreset(owner, cat.presets.flea.id, ["2026-12-13"]);
    await db
      .update(eventPreset)
      .set({ staffing: [{ dutyRoleKey: crewKey, count: 1, scheduleKind: "open" }] })
      .where(eq(eventPreset.id, cat.presets.flea.id));
    expect((await applyPresetStaffing(owner, ev!.id)).created).toBe(1);
    expect((await applyPresetStaffing(owner, ev!.id)).created).toBe(0);
  });
});
