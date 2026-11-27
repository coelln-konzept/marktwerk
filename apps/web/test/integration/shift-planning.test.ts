import { defaultSchedule } from "@marktwerk/core";
import {
  auditLog,
  dutyRole,
  employmentContract,
  event,
  eventPreset,
  legalParameter,
  payrollPeriod,
  shift,
  shiftNeed,
  shiftRevision,
  staffMember,
  staffUnavailability,
} from "@marktwerk/db/schema";
import { asc, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { Actor } from "@/server/actor";
import { db } from "@/server/db";
import {
  getEventPlanning,
  getPlanningMonth,
  listCandidates,
  listUnavailabilityRanges,
} from "@/server/queries/planning";
import { ContractInputError, saveContract } from "@/server/services/contracts";
import { moveEvent, updateEventBasics, updateEventFacts } from "@/server/services/event-details";
import { changeEventStatus, revertEventStatus } from "@/server/services/event-lifecycle";
import { createEventsFromPreset } from "@/server/services/events";
import {
  createPreset,
  type PresetInput,
  PresetInputError,
  updatePreset,
} from "@/server/services/presets";
import {
  applyPresetStaffing,
  assignToNeed,
  PlanningInputError,
  setShiftStatus,
  setUnavailability,
  updateNeed,
} from "@/server/services/shift-planning";
import { createShift, updateShift } from "@/server/services/shifts";
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

describe("a new event length rebuilds the needs", () => {
  async function setLength(eventId: string, durationDays: number) {
    const [row] = await db.select().from(event).where(eq(event.id, eventId));
    if (!row) throw new Error("no event");
    return updateEventBasics(owner, eventId, {
      name: row.name,
      durationDays,
      venueId: row.venueId,
      eventTypeId: row.eventTypeId,
    });
  }

  it("longer: fitting needs keep their people, missing days are added, the teardown moves to the new last day", async () => {
    await db
      .update(eventPreset)
      .set({
        staffing: [
          { dutyRoleKey: crewKey, count: 2, scheduleKind: "setup" },
          { dutyRoleKey: crewKey, count: 1, scheduleKind: "open" },
          { dutyRoleKey: crewKey, count: 1, scheduleKind: "teardown" },
        ],
      })
      .where(eq(eventPreset.id, cat.presets.flea.id));
    const [ev] = await createEventsFromPreset(owner, cat.presets.flea.id, ["2026-12-13"]);
    if (!ev) throw new Error("no event");
    const before = await needsOf(ev.id);
    const setup = before.find((n) => n.scheduleKind === "setup");
    const oldTeardown = before.find((n) => n.scheduleKind === "teardown");
    if (!setup || !oldTeardown) throw new Error("needs missing");
    const anna = await person("Anna");
    const { shiftId } = await assignToNeed(owner, setup.id, anna.id, { today: "2026-11-26" });

    const result = await setLength(ev.id, 2);
    expect(result).toMatchObject({ changed: true, needsRemoved: 1, shiftsUnlinked: 0 });

    const after = await needsOf(ev.id);
    expect(after.find((n) => n.id === setup.id)).toMatchObject({
      workDate: "2026-12-13",
      scheduleKind: "setup",
    });
    expect(after.some((n) => n.id === oldTeardown.id)).toBe(false);
    expect(after.some((n) => n.workDate === "2026-12-14" && n.scheduleKind === "open")).toBe(true);
    expect(after.some((n) => n.workDate === "2026-12-14" && n.scheduleKind === "teardown")).toBe(
      true,
    );
    expect(after.some((n) => n.workDate === "2026-12-13" && n.scheduleKind === "teardown")).toBe(
      false,
    );
    const [linked] = await db.select().from(shift).where(eq(shift.id, shiftId));
    expect(linked?.needId).toBe(setup.id);
  });

  it("shorter: shifts of removed needs stay, unlinked, with a revision; the teardown lands on day 1", async () => {
    await db
      .update(eventPreset)
      .set({
        staffing: [
          { dutyRoleKey: crewKey, count: 2, scheduleKind: "setup" },
          { dutyRoleKey: crewKey, count: 1, scheduleKind: "open" },
          { dutyRoleKey: crewKey, count: 1, scheduleKind: "teardown" },
        ],
      })
      .where(eq(eventPreset.id, cat.presets.flea.id));
    const [ev] = await createEventsFromPreset(owner, cat.presets.flea.id, ["2026-12-13"]);
    if (!ev) throw new Error("no event");
    await setLength(ev.id, 2);
    const day2Open = (await needsOf(ev.id)).find(
      (n) => n.workDate === "2026-12-14" && n.scheduleKind === "open",
    );
    if (!day2Open) throw new Error("no day-2 open need");
    const anna = await person("Anna");
    const { shiftId } = await assignToNeed(owner, day2Open.id, anna.id, { today: "2026-11-26" });
    const [before] = await db.select().from(shift).where(eq(shift.id, shiftId));

    const result = await setLength(ev.id, 1);
    expect(result).toMatchObject({ needsRemoved: 2, shiftsUnlinked: 1 });

    const [after] = await db.select().from(shift).where(eq(shift.id, shiftId));
    expect(after?.needId).toBeNull();
    expect(after?.version).toBe((before?.version ?? 0) + 1);
    const revisions = await db
      .select()
      .from(shiftRevision)
      .where(eq(shiftRevision.shiftId, shiftId));
    expect(revisions.map((r) => r.reason)).toContain("Bedarf entfällt (Dauer geändert)");
    expect(
      (await needsOf(ev.id)).some(
        (n) => n.workDate === "2026-12-13" && n.scheduleKind === "teardown",
      ),
    ).toBe(true);
  });

  it("per-day edits of fitting needs survive", async () => {
    const [ev] = await createEventsFromPreset(owner, cat.presets.flea.id, ["2026-12-13"]);
    if (!ev) throw new Error("no event");
    await setLength(ev.id, 2);
    const open1 = (await needsOf(ev.id)).find(
      (n) => n.workDate === "2026-12-13" && n.scheduleKind === "open",
    );
    if (!open1) throw new Error("no open need on day 1");
    await db.update(shiftNeed).set({ headcount: 3 }).where(eq(shiftNeed.id, open1.id));
    await setLength(ev.id, 3);
    const [kept] = await db.select().from(shiftNeed).where(eq(shiftNeed.id, open1.id));
    expect(kept?.headcount).toBe(3);
  });

  it("moving a 2-day event by 7 days keeps its 2 days of needs", async () => {
    const [ev] = await createEventsFromPreset(owner, cat.presets.flea.id, ["2026-12-13"]);
    if (!ev) throw new Error("no event");
    await setLength(ev.id, 2);
    const ids = (await needsOf(ev.id)).map((n) => n.id).sort();
    await moveEvent(owner, ev.id, "2026-12-20", "2026-12-13");
    const after = await needsOf(ev.id);
    expect(after.map((n) => n.id).sort()).toEqual(ids);
    expect([...new Set(after.map((n) => n.workDate))].sort()).toEqual(["2026-12-20", "2026-12-21"]);
  });
});

describe("planning queries", () => {
  it("month: people with budget, week totals, needs with gaps; event: day blocks and candidates", async () => {
    const [ev] = await createEventsFromPreset(owner, cat.presets.flea.id, ["2026-12-13"]);
    const needs = await needsOf(ev!.id);
    const anna = await person("Anna");
    await assignToNeed(owner, needs[0]!.id, anna.id, { today: "2026-11-26" }); // setup 06–08 = 120 min

    const month = await getPlanningMonth("2026-12-01");
    expect(month.days).toEqual(["2026-12-13"]);
    expect(month.needsByDay["2026-12-13"]?.map((n) => [n.scheduleKind, n.open])).toEqual([
      ["setup", 1],
      ["open", 1],
    ]);
    const row = month.people.find((p) => p.staffMemberId === anna.id)!;
    expect(row).toMatchObject({
      budgetMinutes: 2400,
      noContract: true,
      leftMinutes: 2280,
      level: "ok",
    });
    expect(row.usage.requestedMinutes).toBe(120);
    expect(row.weeks["2026-W50"]).toBe(120);

    const plan = await getEventPlanning(ev!.id);
    expect(plan.openTotal).toBe(2);
    expect(plan.days[0]?.needs[0]?.shifts[0]?.displayName).toBe("Anna");

    const candidates = await listCandidates(needs[1]!.id);
    // createActor may add a staff member for the owner, so look Anna up rather than taking the first row.
    expect(candidates.find((c) => c.staffMemberId === anna.id)?.flags).toContain(
      "already_scheduled",
    );
  });
});

describe("planning queries: edge cases", () => {
  it("declined and cancelled shifts reopen the need and do not count as usage", async () => {
    const [ev] = await createEventsFromPreset(owner, cat.presets.flea.id, ["2026-12-13"]);
    const needs = await needsOf(ev!.id);
    const setup = needs.find((n) => n.scheduleKind === "setup")!;
    const anna = await person("Anna");
    const ben = await person("Ben");
    const a = await assignToNeed(owner, setup.id, anna.id, { today: "2026-11-26" });
    const b = await assignToNeed(owner, setup.id, ben.id, { today: "2026-11-26" });
    const [rowA] = await db.select().from(shift).where(eq(shift.id, a.shiftId));
    const [rowB] = await db.select().from(shift).where(eq(shift.id, b.shiftId));
    await setShiftStatus(owner, a.shiftId, "declined", rowA!.version);
    await setShiftStatus(owner, b.shiftId, "cancelled", rowB!.version);

    const month = await getPlanningMonth("2026-12-01");
    const need = month.needsByDay["2026-12-13"]?.find((n) => n.id === setup.id);
    expect(need).toMatchObject({ headcount: 2, open: 2 });
    for (const p of [anna, ben]) {
      const usage = month.people.find((x) => x.staffMemberId === p.id)!.usage;
      expect(usage.requestedMinutes).toBe(0);
      expect(usage.confirmedMinutes).toBe(0);
    }
  });

  it("a KW spanning two months shows the whole week, usage stays in the month", async () => {
    const anna = await person("Anna");
    const base = { staffMemberId: anna.id, plannedStart: "08:00", plannedEnd: "10:00" };
    await db.insert(shift).values({ ...base, workDate: "2026-11-30", status: "confirmed" });
    await db.insert(shift).values({ ...base, workDate: "2026-12-05", status: "requested" });

    const month = await getPlanningMonth("2026-12-01", { allDays: true });
    const row = month.people.find((p) => p.staffMemberId === anna.id)!;
    expect(row.weeks["2026-W49"]).toBe(240);
    expect(row.usage.confirmedMinutes).toBe(0);
    expect(row.usage.requestedMinutes).toBe(120);
    expect(Object.keys(row.shiftsByDay)).toEqual(["2026-12-05"]);
  });

  it("an archived event with preset staffing and no needs cannot apply the preset", async () => {
    await db
      .update(eventPreset)
      .set({ staffing: [] })
      .where(eq(eventPreset.id, cat.presets.flea.id));
    const [ev] = await createEventsFromPreset(owner, cat.presets.flea.id, ["2026-12-13"]);
    await db
      .update(eventPreset)
      .set({ staffing: [{ dutyRoleKey: crewKey, count: 1, scheduleKind: "open" }] })
      .where(eq(eventPreset.id, cat.presets.flea.id));
    expect((await getEventPlanning(ev!.id)).canApplyPreset).toBe(true);
    await db.update(event).set({ archivedAt: new Date() }).where(eq(event.id, ev!.id));
    expect((await getEventPlanning(ev!.id)).canApplyPreset).toBe(false);
  });
});

describe("budget and staffing inputs", () => {
  const contract = (monthlyHourBudget: number | null) => ({
    type: "minijob" as const,
    hourlyRateCents: 1600,
    contractedHoursPerWeek: 10,
    fixedMonthlyPayCents: null,
    workingTimeAccount: false,
    otherMinijobDeclared: false,
    validFrom: "2026-01-01",
    validUntil: null,
    notes: null,
    monthlyHourBudget,
  });
  const budgetOf = async (staffMemberId: string) => {
    const [c] = await db
      .select()
      .from(employmentContract)
      .where(eq(employmentContract.staffMemberId, staffMemberId));
    return c?.monthlyHourBudget;
  };

  it("saves a contract's monthly hour budget, edits and clears it (audited)", async () => {
    const anna = await person("Anna");
    const { id } = await saveContract(owner, anna.id, contract(35));
    expect(await budgetOf(anna.id)).toBe(35);
    await saveContract(owner, anna.id, contract(37.5), id);
    expect(await budgetOf(anna.id)).toBe(37.5);
    await saveContract(owner, anna.id, contract(null), id);
    expect(await budgetOf(anna.id)).toBeNull();
    const updates = await db.select().from(auditLog).where(eq(auditLog.action, "contract.update"));
    expect(updates[0]?.diff).toMatchObject({
      before: { monthlyHourBudget: 35 },
      after: { monthlyHourBudget: 37.5 },
    });
  });

  it("refuses budgets outside 0–200 or off the half hour", async () => {
    const anna = await person("Anna");
    for (const bad of [-1, 200.5, 10.3, Number.NaN, Number.POSITIVE_INFINITY]) {
      const error = await saveContract(owner, anna.id, contract(bad)).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ContractInputError);
      expect((error as ContractInputError).code).toBe("invalid_amount");
    }
    await saveContract(owner, anna.id, contract(0));
    expect(await budgetOf(anna.id)).toBe(0);
  });

  const presetInput = (patch: Partial<PresetInput> = {}): PresetInput => ({
    name: "Personalbedarf-Test",
    eventTypeId: cat.type.id,
    venueId: cat.venue.id,
    durationDays: 1,
    publicTitle: "Test",
    publicText: "Test.",
    schedule: [
      { audience: "vendors", kind: "setup", day: "first", from: "6:00", to: "8:00" },
      { audience: "visitors", kind: "open", day: "each", from: "8:00", to: "16:00" },
      { audience: "vendors", kind: "teardown", day: "last", from: "16:00", to: "18:00" },
    ],
    pricePerMCents: 1500,
    bookingFeeCents: 500,
    rrule: "FREQ=MONTHLY;BYDAY=SU;BYSETPOS=1",
    defaultDuties: {},
    active: true,
    ...patch,
  });

  it("a Vorlage stores its Personalbedarf; unknown roles are refused", async () => {
    const { id } = await createPreset(owner, presetInput());
    const load = async () => {
      const [row] = await db.select().from(eventPreset).where(eq(eventPreset.id, id));
      if (!row) throw new Error("preset missing");
      return row;
    };
    const staffing = [
      { dutyRoleKey: crewKey, count: 3, scheduleKind: "setup" as const },
      { dutyRoleKey: crewKey, count: 2, scheduleKind: "open" as const },
    ];
    await updatePreset(owner, id, presetInput({ staffing }), (await load()).updatedAt);
    expect((await load()).staffing).toEqual(staffing);

    const error = await updatePreset(
      owner,
      id,
      presetInput({ staffing: [{ dutyRoleKey: "no_such_role", count: 1, scheduleKind: "open" }] }),
      (await load()).updatedAt,
    ).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PresetInputError);
    expect((error as PresetInputError).code).toBe("invalid_input");
    expect((await load()).staffing).toEqual(staffing);
  });
});

describe("unavailability on the person", () => {
  it("groups consecutive days with the same note into ranges", async () => {
    const anna = await person("Anna");
    await setUnavailability(owner, anna.id, "2026-12-12", "2026-12-14", "Urlaub");
    await setUnavailability(owner, anna.id, "2026-12-15", "2026-12-15", null);
    await setUnavailability(owner, anna.id, "2026-12-20", "2026-12-21", "Urlaub");
    const ranges = await listUnavailabilityRanges(anna.id, "2026-12-01", "2026-12-31");
    expect(ranges.map((r) => [r.from, r.to, r.note, r.dates.length])).toEqual([
      ["2026-12-12", "2026-12-14", "Urlaub", 3],
      ["2026-12-15", "2026-12-15", null, 1],
      ["2026-12-20", "2026-12-21", "Urlaub", 2],
    ]);
    expect(await listUnavailabilityRanges(anna.id, "2026-12-13", "2026-12-13")).toHaveLength(1);
  });
});

describe("final review: side effects and integrity", () => {
  async function setLength(eventId: string, durationDays: number) {
    const [row] = await db.select().from(event).where(eq(event.id, eventId));
    if (!row) throw new Error("no event");
    return updateEventBasics(owner, eventId, {
      name: row.name,
      durationDays,
      venueId: row.venueId,
      eventTypeId: row.eventTypeId,
    });
  }
  const shiftRow = async (id: string) => {
    const [row] = await db.select().from(shift).where(eq(shift.id, id));
    if (!row) throw new Error("no shift");
    return row;
  };
  const reasonsOf = async (id: string) =>
    (await db.select().from(shiftRevision).where(eq(shiftRevision.shiftId, id))).map(
      (r) => r.reason,
    );
  async function confirmedShift(eventId: string) {
    const [need] = await needsOf(eventId);
    if (!need) throw new Error("no need");
    const anna = await person("Anna");
    const { shiftId } = await assignToNeed(owner, need.id, anna.id, { today: "2026-11-26" });
    await setShiftStatus(owner, shiftId, "confirmed", 1);
    return { need, shiftId, anna };
  }

  it("undo of a move restores the confirmations it reset", async () => {
    const [ev] = await createEventsFromPreset(owner, cat.presets.flea.id, ["2026-12-13"]);
    const { need, shiftId } = await confirmedShift(ev!.id);
    const moved = await moveEvent(owner, ev!.id, "2026-12-20", "2026-12-13");
    expect(moved.resetShiftIds).toEqual([shiftId]);
    expect(await shiftRow(shiftId)).toMatchObject({ status: "requested", workDate: "2026-12-20" });
    await moveEvent(owner, ev!.id, "2026-12-13", "2026-12-20", {
      undo: true,
      restoreConfirmed: moved.resetShiftIds,
    });
    const back = await shiftRow(shiftId);
    expect(back).toMatchObject({ status: "confirmed", workDate: "2026-12-13", needId: need.id });
    expect(back.version).toBe(4);
    expect(await reasonsOf(shiftId)).toContain("Verschieben rückgängig");
  });

  it("a move unlinks declined shifts of the moved needs instead of leaving them linked", async () => {
    const [ev] = await createEventsFromPreset(owner, cat.presets.flea.id, ["2026-12-13"]);
    const [need] = await needsOf(ev!.id);
    const ben = await person("Ben");
    const { shiftId } = await assignToNeed(owner, need!.id, ben.id, { today: "2026-11-26" });
    await setShiftStatus(owner, shiftId, "declined", 1);
    await moveEvent(owner, ev!.id, "2026-12-20", "2026-12-13");
    const row = await shiftRow(shiftId);
    expect(row).toMatchObject({ needId: null, workDate: "2026-12-13", status: "declined" });
    expect(row.version).toBe(3);
    expect(await reasonsOf(shiftId)).toContain("Veranstaltung verschoben");
  });

  it("a move is refused when a planned shift lies in a locked payroll month", async () => {
    const [ev] = await createEventsFromPreset(owner, cat.presets.flea.id, ["2026-12-13"]);
    await confirmedShift(ev!.id);
    await db
      .insert(payrollPeriod)
      .values({ month: "2026-12-01", status: "locked", lockedAt: new Date() })
      .onConflictDoUpdate({
        target: payrollPeriod.month,
        set: { status: "locked", lockedAt: new Date() },
      });
    await expect(moveEvent(owner, ev!.id, "2026-12-20", "2026-12-13")).rejects.toMatchObject({
      code: "period_locked",
    });
    const [row] = await db.select().from(event).where(eq(event.id, ev!.id));
    expect(row?.startsOn).toBe("2026-12-13");
  });

  it("shorten unlinks a confirmed shift; lengthening back links it again", async () => {
    const [ev] = await createEventsFromPreset(owner, cat.presets.flea.id, ["2026-12-13"]);
    await setLength(ev!.id, 2);
    const day2 = (await needsOf(ev!.id)).find(
      (n) => n.workDate === "2026-12-14" && n.scheduleKind === "open",
    );
    const anna = await person("Anna");
    const { shiftId } = await assignToNeed(owner, day2!.id, anna.id, { today: "2026-11-26" });
    await setShiftStatus(owner, shiftId, "confirmed", 1);

    expect(await setLength(ev!.id, 1)).toMatchObject({ shiftsUnlinked: 1 });
    expect(await shiftRow(shiftId)).toMatchObject({
      needId: null,
      status: "confirmed",
      version: 3,
    });

    await setLength(ev!.id, 2);
    const again = (await needsOf(ev!.id)).find(
      (n) => n.workDate === "2026-12-14" && n.scheduleKind === "open",
    );
    expect(await shiftRow(shiftId)).toMatchObject({
      needId: again!.id,
      status: "confirmed",
      version: 4,
    });
    expect(await reasonsOf(shiftId)).toContain("Bedarf wieder da");
  });

  it("updateShift to another day unlinks the shift from its need", async () => {
    const [ev] = await createEventsFromPreset(owner, cat.presets.flea.id, ["2026-12-13"]);
    const { shiftId } = await confirmedShift(ev!.id);
    await updateShift(owner, shiftId, { workDate: "2026-12-14" }, "Tag getauscht", 2, {
      today: "2026-11-26",
    });
    expect(await shiftRow(shiftId)).toMatchObject({ needId: null, workDate: "2026-12-14" });
  });

  it("a need of another event or day is refused", async () => {
    const [a, b] = await createEventsFromPreset(owner, cat.presets.flea.id, [
      "2026-12-13",
      "2026-12-20",
    ]);
    const [needB] = await needsOf(b!.id);
    const cem = await person("Cem");
    await expect(
      createShift(
        owner,
        {
          eventId: a!.id,
          staffMemberId: cem.id,
          dutyRoleId: crewRoleId,
          needId: needB!.id,
          workDate: "2026-12-13",
          plannedStart: "06:00",
          plannedEnd: "08:00",
          actualStart: null,
          actualEnd: null,
          breakMinutes: 0,
          status: "requested",
        },
        { today: "2026-11-26" },
      ),
    ).rejects.toMatchObject({ code: "invalid_event" });
  });

  it("a cancelled event has no open slots and refuses planning", async () => {
    const [ev] = await createEventsFromPreset(owner, cat.presets.flea.id, ["2026-12-13"]);
    const [need] = await needsOf(ev!.id);
    await db.update(event).set({ status: "cancelled" }).where(eq(event.id, ev!.id));
    const month = await getPlanningMonth("2026-12-01");
    expect(month.needsByDay["2026-12-13"] ?? []).toEqual([]);
    const plan = await getEventPlanning(ev!.id);
    expect(plan).toMatchObject({ openTotal: 0, canApplyPreset: false, days: [] });
    const dora = await person("Dora");
    await expect(
      assignToNeed(owner, need!.id, dora.id, { today: "2026-11-26" }),
    ).rejects.toBeInstanceOf(PlanningInputError);
    await expect(updateNeed(owner, need!.id, { headcount: 5 })).rejects.toBeInstanceOf(
      PlanningInputError,
    );
    await expect(applyPresetStaffing(owner, ev!.id)).rejects.toBeInstanceOf(PlanningInputError);
  });

  it("the break of a new shift follows the ArbZG values in legal_parameter", async () => {
    await db
      .insert(legalParameter)
      .values({ key: "arbzg_break_after_minutes", value: 60, validFrom: "2020-01-01" });
    const [ev] = await createEventsFromPreset(owner, cat.presets.flea.id, ["2026-12-13"]);
    const [need] = await needsOf(ev!.id);
    const eva = await person("Eva");
    const { shiftId } = await assignToNeed(owner, need!.id, eva.id, {
      today: "2026-11-26",
      confirm: true,
    });
    expect((await shiftRow(shiftId)).breakMinutes).toBe(30);
  });

  it("guards: bad status, recorded shifts, bad ids", async () => {
    const [ev] = await createEventsFromPreset(owner, cat.presets.flea.id, ["2026-12-13"]);
    const { need, shiftId } = await confirmedShift(ev!.id);
    await expect(setShiftStatus(owner, shiftId, "worked" as "confirmed", 2)).rejects.toMatchObject({
      code: "invalid_input",
    });
    await db.update(shift).set({ status: "no_show" }).where(eq(shift.id, shiftId));
    await expect(setShiftStatus(owner, shiftId, "cancelled", 2)).rejects.toMatchObject({
      code: "invalid_input",
    });
    await expect(assignToNeed(owner, need.id, "nope")).rejects.toMatchObject({
      code: "not_found",
    });
    expect(await listCandidates("nope")).toEqual([]);
  });

  it("setShiftStatus with a stale version is a conflict", async () => {
    const [ev] = await createEventsFromPreset(owner, cat.presets.flea.id, ["2026-12-13"]);
    const { shiftId } = await confirmedShift(ev!.id);
    await expect(setShiftStatus(owner, shiftId, "declined", 1)).rejects.toMatchObject({
      code: "conflict",
    });
  });

  it("undo of an assign (cancel at version 1) opens the need again; decline reopens the gap", async () => {
    const [ev] = await createEventsFromPreset(owner, cat.presets.flea.id, ["2026-12-13"]);
    const open = await needsOf(ev!.id).then((n) => n.find((x) => x.scheduleKind === "open")!);
    const openOf = async () =>
      (await getEventPlanning(ev!.id)).days.flatMap((d) => d.needs).find((n) => n.id === open.id)!
        .open;
    const anna = await person("Anna");
    const a = await assignToNeed(owner, open.id, anna.id, { today: "2026-11-26" });
    expect(await openOf()).toBe(0);
    await setShiftStatus(owner, a.shiftId, "cancelled", 1);
    expect(await openOf()).toBe(1);

    const ben = await person("Ben");
    const b = await assignToNeed(owner, open.id, ben.id, { today: "2026-11-26" });
    expect(await openOf()).toBe(0);
    await setShiftStatus(owner, b.shiftId, "declined", 1);
    expect(await openOf()).toBe(1);
  });
});

describe("product owner 2026-11-27: cancel and Zeitplan", () => {
  it("cancelling the market cancels its planned shifts; undo restores them", async () => {
    const [ev] = await createEventsFromPreset(owner, cat.presets.flea.id, ["2026-12-13"]);
    const needs = await needsOf(ev!.id);
    const anna = await person("Anna");
    const ben = await person("Ben");
    const a = await assignToNeed(owner, needs[0]!.id, anna.id, { today: "2026-11-26" });
    const b = await assignToNeed(owner, needs[1]!.id, ben.id, { today: "2026-11-26" });
    await setShiftStatus(owner, b.shiftId, "confirmed", 1);
    const usageOf = async (id: string) =>
      (await getPlanningMonth("2026-12-01")).people.find((p) => p.staffMemberId === id)!.usage;
    expect((await usageOf(anna.id)).requestedMinutes).toBeGreaterThan(0);

    await changeEventStatus(owner, ev!.id, "cancelled", "Regen");
    const statusOf = async (id: string) =>
      (await db.select().from(shift).where(eq(shift.id, id)))[0]?.status;
    expect(await statusOf(a.shiftId)).toBe("cancelled");
    expect(await statusOf(b.shiftId)).toBe("cancelled");
    expect((await usageOf(anna.id)).requestedMinutes).toBe(0);
    expect((await usageOf(ben.id)).confirmedMinutes).toBe(0);
    const reasons = await db
      .select()
      .from(shiftRevision)
      .where(eq(shiftRevision.shiftId, a.shiftId));
    expect(reasons.map((r) => r.reason)).toContain("Markt abgesagt");

    await revertEventStatus(owner, ev!.id, "cancelled", "draft");
    expect(await statusOf(a.shiftId)).toBe("requested");
    expect(await statusOf(b.shiftId)).toBe("confirmed");
  });

  it("Zeitplan edits rebuild the needs: a new part adds needs, a removed part unlinks its shifts", async () => {
    const schedule = defaultSchedule();
    await db
      .update(eventPreset)
      .set({
        schedule: schedule.filter((r) => r.kind !== "teardown"),
        staffing: [
          { dutyRoleKey: crewKey, count: 1, scheduleKind: "setup" },
          { dutyRoleKey: crewKey, count: 1, scheduleKind: "teardown" },
        ],
      })
      .where(eq(eventPreset.id, cat.presets.flea.id));
    const [ev] = await createEventsFromPreset(owner, cat.presets.flea.id, ["2026-12-13"]);
    expect((await needsOf(ev!.id)).map((n) => n.scheduleKind)).toEqual(["setup"]);
    const [row] = await db.select().from(event).where(eq(event.id, ev!.id));
    const facts = (s: typeof schedule) => ({
      schedule: s,
      pricePerMCents: row!.pricePerMCents,
      bookingFeeCents: row!.bookingFeeCents,
    });

    await updateEventFacts(owner, ev!.id, facts(schedule));
    expect((await needsOf(ev!.id)).map((n) => n.scheduleKind).sort()).toEqual([
      "setup",
      "teardown",
    ]);

    const setup = (await needsOf(ev!.id)).find((n) => n.scheduleKind === "setup")!;
    const anna = await person("Anna");
    const { shiftId } = await assignToNeed(owner, setup.id, anna.id, { today: "2026-11-26" });
    const result = await updateEventFacts(
      owner,
      ev!.id,
      facts(schedule.filter((r) => r.kind !== "setup")),
    );
    expect(result).toMatchObject({ needsRemoved: 1, shiftsUnlinked: 1 });
    expect((await needsOf(ev!.id)).map((n) => n.scheduleKind)).toEqual(["teardown"]);
    const [after] = await db.select().from(shift).where(eq(shift.id, shiftId));
    expect(after).toMatchObject({ needId: null, version: 2 });
    const revisions = await db
      .select()
      .from(shiftRevision)
      .where(eq(shiftRevision.shiftId, shiftId));
    expect(revisions.map((r) => r.reason)).toContain("Bedarf entfällt (Zeitplan geändert)");
  });
});
