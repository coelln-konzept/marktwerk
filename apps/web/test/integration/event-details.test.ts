import type { ScheduleRow } from "@marktwerk/core";
import {
  auditLog,
  event,
  eventAnchor,
  eventPermit,
  eventPreset,
  eventType,
  permit,
  task,
  venue,
} from "@marktwerk/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import {
  moveEvent,
  previewEventMove,
  previewEventSchedule,
  setEventBookingFlag,
  updateEventBasics,
  updateEventFacts,
} from "@/server/services/event-details";
import { createEventsFromPreset } from "@/server/services/events";
import { createActor, resetDatabase, seedCatalogue } from "../helpers/fixtures";

let cat: Awaited<ReturnType<typeof seedCatalogue>>;
let owner: Awaited<ReturnType<typeof createActor>>;

beforeEach(async () => {
  await resetDatabase();
  cat = await seedCatalogue();
  owner = await createActor("owner");
});

afterAll(async () => {
  await db.$client.end();
});

const isForbidden = (error: unknown) =>
  String((error as { digest?: unknown })?.digest ?? "").includes("403");

async function oneEvent(presetId = cat.presets.flea.id, date = "2026-11-14") {
  const [created] = await createEventsFromPreset(owner, presetId, [date]);
  if (!created) throw new Error("no event");
  return created.id;
}

const load = async (id: string) => {
  const [row] = await db.select().from(event).where(eq(event.id, id));
  if (!row) throw new Error("missing");
  return row;
};

const anchorsOf = async (id: string) =>
  Object.fromEntries(
    (await db.select().from(eventAnchor).where(eq(eventAnchor.eventId, id))).map((a) => [
      a.key,
      a.date,
    ]),
  );

const auditsOf = (action: string) =>
  db.select().from(auditLog).where(eq(auditLog.action, action)).orderBy(auditLog.at);

const row = (
  audience: ScheduleRow["audience"],
  kind: ScheduleRow["kind"],
  day: ScheduleRow["day"],
  from: string,
  to: string,
): ScheduleRow => ({ audience, kind, day, from, to });

const facts = {
  schedule: [
    row("team", "setup", "first", "05:00", "06:00"),
    row("vendors", "setup", "first", "06:00", "09:00"),
    row("visitors", "open", "each", "09:00", "17:00"),
    row("vendors", "teardown", "last", "17:00", "19:00"),
  ],
  pricePerMCents: 1500,
  bookingFeeCents: 300,
};

describe("updateEventFacts", () => {
  it("updates the Zeitplan and prices of this event only and audits what changed", async () => {
    const id = await oneEvent();
    const result = await updateEventFacts(owner, id, { ...facts, bookingFeeCents: 500 });
    expect(result.changed).toBe(true);
    expect(result.previous).toEqual({
      schedule: cat.schedule,
      pricePerMCents: 1200,
      bookingFeeCents: 500,
    });

    const stored = await load(id);
    expect(stored).toMatchObject({
      schedule: facts.schedule,
      pricePerMCents: 1500,
      bookingFeeCents: 500,
    });
    const [preset] = await db
      .select()
      .from(eventPreset)
      .where(eq(eventPreset.id, cat.presets.flea.id));
    expect(preset).toMatchObject({ schedule: cat.schedule, pricePerMCents: 1200 });

    const [entry] = await auditsOf("event.update");
    expect(entry?.diff).toEqual({
      changes: {
        schedule: { from: cat.schedule, to: facts.schedule },
        pricePerMCents: { from: 1200, to: 1500 },
      },
    });
  });

  it("writes nothing when nothing changed", async () => {
    const id = await oneEvent();
    const same = { schedule: cat.schedule, pricePerMCents: 1200, bookingFeeCents: 500 };
    expect((await updateEventFacts(owner, id, same)).changed).toBe(false);
    expect(await auditsOf("event.update")).toHaveLength(0);
  });

  it("normalises typed times and keeps only the row fields", async () => {
    const id = await oneEvent();
    const typed = [{ ...row("visitors", "open", "each", "9", "17.30"), note: "x" } as ScheduleRow];
    await updateEventFacts(owner, id, { ...facts, schedule: typed });
    expect((await load(id)).schedule).toEqual([row("visitors", "open", "each", "09:00", "17:30")]);
  });

  it("checks the Zeitplan with the core rules for the event's length", async () => {
    const id = await oneEvent();
    // Early tear-down on the last morning: only after a night, so not on a single-day event.
    const earlyTeardown = {
      ...facts,
      schedule: [...facts.schedule, row("vendors", "teardown", "last", "07:00", "10:00")],
    };
    const invalid = [
      earlyTeardown,
      { ...facts, schedule: [row("visitors", "open", "each", "17:00", "09:00")] },
      { ...facts, schedule: [row("vendors", "setup", "first", "06:00", "09:00")] },
      { ...facts, schedule: [row("visitors", "open", "each", "25:00", "26:00")] },
      { ...facts, schedule: "08–16" as unknown as ScheduleRow[] },
    ];
    for (const next of invalid)
      await expect(updateEventFacts(owner, id, next)).rejects.toMatchObject({
        code: "invalid_schedule",
      });
    await expect(
      updateEventFacts(owner, id, { ...facts, pricePerMCents: -1 }),
    ).rejects.toMatchObject({ code: "invalid_price" });

    const festival = await oneEvent(cat.presets.festival.id, "2026-12-04");
    expect((await updateEventFacts(owner, festival, earlyTeardown)).changed).toBe(true);
  });

  it("undo applies only while the values are still the saved ones", async () => {
    const id = await oneEvent();
    const { previous } = await updateEventFacts(owner, id, facts);
    await updateEventFacts(owner, id, { ...facts, pricePerMCents: 9900 });
    await expect(updateEventFacts(owner, id, previous, facts)).rejects.toMatchObject({
      code: "conflict",
    });
    expect((await load(id)).pricePerMCents).toBe(9900);
  });
});

describe("setEventBookingFlag", () => {
  it("sets one flag and audits it; unknown flags are rejected", async () => {
    const id = await oneEvent();
    expect(await setEventBookingFlag(owner, id, "bookingOpen", true)).toEqual({ changed: true });
    expect(await setEventBookingFlag(owner, id, "bookingOpen", true)).toEqual({ changed: false });
    expect((await load(id)).bookingOpen).toBe(true);
    const [entry] = await auditsOf("event.booking");
    expect(entry?.diff).toEqual({ flag: "bookingOpen", from: false, to: true });
    await expect(setEventBookingFlag(owner, id, "status", true)).rejects.toMatchObject({
      code: "invalid_flag",
    });
  });
});

describe("moving an event", () => {
  it("previews the new named dates and the warnings, without writing", async () => {
    const id = await oneEvent(); // Sa 2026-11-14
    await oneEvent(cat.presets.flea.id, "2026-12-26"); // same venue on 2. Weihnachtstag
    const preview = await previewEventMove(owner, id, "2026-12-26");
    expect(preview).toMatchObject({
      movable: true,
      announced: true, // new events start as planned = already published
      from: { startsOn: "2026-11-14", endsOn: "2026-11-14" },
      to: { startsOn: "2026-12-26", endsOn: "2026-12-26" },
    });
    expect(preview.anchors).toContainEqual({
      key: "booking_cutoff",
      from: "2026-11-09",
      to: "2026-12-21",
    });
    expect(preview.check?.holidays.map((h) => h.key)).toContain("boxing_day");
    expect(preview.check?.venueConflicts).toHaveLength(1);
    expect((await load(id)).startsOn).toBe("2026-11-14");
  });

  it("moves dates, anchors and season, keeps the duration and audits old → new", async () => {
    const id = await oneEvent(cat.presets.festival.id, "2026-12-04"); // Fr–So, 3 days
    const result = await moveEvent(owner, id, "2027-01-08", "2026-12-04");
    expect(result).toEqual({
      changed: true,
      from: "2026-12-04",
      to: "2027-01-08",
      tasksShifted: 0,
      seasonTasksShifted: 0,
    });
    expect(await load(id)).toMatchObject({
      startsOn: "2027-01-08",
      endsOn: "2027-01-10",
      season: 2027,
    });
    expect(await anchorsOf(id)).toEqual({
      event_day: "2027-01-08",
      setup_day: "2027-01-07",
      teardown_day: "2027-01-10",
      booking_cutoff: "2027-01-04",
    });
    const [entry] = await auditsOf("event.move");
    expect(entry?.diff).toMatchObject({
      from: { startsOn: "2026-12-04", endsOn: "2026-12-06" },
      to: { startsOn: "2027-01-08", endsOn: "2027-01-10" },
      anchors: { booking_cutoff: { from: "2026-11-30", to: "2027-01-04" } },
    });
  });

  it("refuses stale moves and events that already run; announced ones may move", async () => {
    const id = await oneEvent();
    await expect(moveEvent(owner, id, "2026-11-21", "2026-11-07")).rejects.toMatchObject({
      code: "conflict",
    });
    await db.update(event).set({ status: "confirmed" }).where(eq(event.id, id));
    expect((await previewEventMove(owner, id, "2026-11-21")).announced).toBe(true);
    expect((await moveEvent(owner, id, "2026-11-21", "2026-11-14")).changed).toBe(true);

    await db.update(event).set({ status: "live" }).where(eq(event.id, id));
    await expect(moveEvent(owner, id, "2026-11-28", "2026-11-21")).rejects.toMatchObject({
      code: "not_movable",
    });
  });

  it("answers far years with out_of_range instead of a crash; the undo may go back anyway (UX-041)", async () => {
    const id = await oneEvent();
    for (const date of ["9999-12-31", "0001-01-01", "2040-05-01"]) {
      await expect(previewEventMove(owner, id, date)).rejects.toMatchObject({
        code: "out_of_range",
      });
      await expect(moveEvent(owner, id, date, "2026-11-14")).rejects.toMatchObject({
        code: "out_of_range",
      });
    }
    await expect(previewEventMove(owner, id, "2026-02-30")).rejects.toMatchObject({
      code: "invalid_date",
    });
    expect((await load(id)).startsOn).toBe("2026-11-14");

    // An old event (a year that is now outside the range) can still be moved back by the undo toast.
    await db
      .update(event)
      .set({ startsOn: "2020-06-06", endsOn: "2020-06-06", season: 2020 })
      .where(eq(event.id, id));
    await moveEvent(owner, id, "2026-12-05", "2020-06-06");
    await expect(
      moveEvent(owner, id, "2020-06-06", "2026-12-05", { undo: true }),
    ).resolves.toMatchObject({ changed: true, to: "2020-06-06" });
  });

  it("names the permits still to apply for, whose Antrag bis does not move (UX-D3 open)", async () => {
    const id = await oneEvent();
    const permits = await db
      .insert(permit)
      .values(
        (
          [
            ["Halteverbot", "not_started", "2026-10-20"],
            ["Marktgenehmigung", "preparing", "2026-09-30"],
            ["Wasser", "applied", "2026-10-01"],
            ["Plakate", "not_started", null],
          ] as const
        ).map(([title, status, applyBy]) => ({
          venueId: cat.venue.id,
          season: 2026,
          category: "city" as const,
          permitType: "market_permit" as const,
          title,
          status,
          applyBy,
        })),
      )
      .returning();
    await db.insert(eventPermit).values(permits.map((p) => ({ eventId: id, permitId: p.id })));

    const preview = await previewEventMove(owner, id, "2026-11-21");
    expect(preview.permitsKept.map((p) => [p.title, p.applyBy])).toEqual([
      ["Marktgenehmigung", "2026-09-30"],
      ["Halteverbot", "2026-10-20"],
    ]);
    // A change of length keeps the first day, so the permits are not named there.
    expect((await previewEventSchedule(owner, id, { durationDays: 2 })).permitsKept).toEqual([]);
    await moveEvent(owner, id, "2026-11-21", "2026-11-14");
    expect((await db.select().from(permit).orderBy(permit.title)).map((p) => p.applyBy)).toEqual([
      "2026-10-20",
      "2026-09-30",
      null,
      "2026-10-01",
    ]);
  });

  it("is forbidden for staff", async () => {
    const id = await oneEvent();
    const staff = await createActor("staff");
    expect(
      isForbidden(await moveEvent(staff, id, "2026-11-21", "2026-11-14").catch((e) => e)),
    ).toBe(true);
    expect(
      isForbidden(await setEventBookingFlag(staff, id, "bookingOpen", true).catch((e) => e)),
    ).toBe(true);
  });
});

describe("updateEventBasics", () => {
  it("renames, changes the length (named dates recomputed) and the venue, audited with names", async () => {
    const id = await oneEvent(); // Sa 2026-11-14, 1 day
    const [other] = await db
      .insert(venue)
      .values({ name: "Rheinwiesen", kind: "municipal", city: "Köln" })
      .returning();
    if (!other) throw new Error("no venue");
    const result = await updateEventBasics(owner, id, {
      name: "  Herbstflohmarkt   Test ",
      durationDays: 2,
      venueId: other.id,
      eventTypeId: cat.type.id,
    });
    expect(result).toEqual({
      changed: true,
      previous: {
        name: "Testflohmarkt",
        durationDays: 1,
        venueId: cat.venue.id,
        eventTypeId: cat.type.id,
      },
      tasksShifted: 0,
    });
    expect(await load(id)).toMatchObject({
      name: "Herbstflohmarkt Test",
      startsOn: "2026-11-14",
      endsOn: "2026-11-15",
      venueId: other.id,
    });
    expect(await anchorsOf(id)).toMatchObject({
      setup_day: "2026-11-13",
      teardown_day: "2026-11-15",
      booking_cutoff: "2026-11-09",
    });
    const [entry] = await auditsOf("event.update");
    expect(entry?.diff).toMatchObject({
      changes: {
        name: { from: "Testflohmarkt", to: "Herbstflohmarkt Test" },
        durationDays: { from: 1, to: 2 },
        venueId: { fromName: "Messeplatz Test", toName: "Rheinwiesen" },
      },
      anchors: { setup_day: { from: "2026-11-14", to: "2026-11-13" } },
    });
  });

  it("changes the event type only: tasks stay as they are, audited with both names", async () => {
    const id = await oneEvent();
    const [antique] = await db
      .insert(eventType)
      .values({
        key: "antique",
        nameDe: "Antikmarkt",
        nameEn: "Antique market",
        rules: cat.type.rules,
      })
      .returning();
    if (!antique || !cat.type) throw new Error("no type");
    const tasksBefore = await db.select({ id: task.id }).from(task).where(eq(task.eventId, id));
    const base = {
      name: "Testflohmarkt",
      durationDays: 1,
      venueId: cat.venue.id,
      eventTypeId: cat.type.id,
    };
    const result = await updateEventBasics(owner, id, { ...base, eventTypeId: antique.id });
    expect(result.changed).toBe(true);
    expect(await load(id)).toMatchObject({ eventTypeId: antique.id });
    const tasksAfter = await db.select({ id: task.id }).from(task).where(eq(task.eventId, id));
    expect(tasksAfter).toEqual(tasksBefore);
    const [entry] = await auditsOf("event.update");
    expect(entry?.diff).toMatchObject({
      changes: { eventTypeId: { fromName: "Flohmarkt", toName: "Antikmarkt" } },
    });
    await expect(
      updateEventBasics(owner, id, {
        ...base,
        eventTypeId: "00000000-0000-4000-8000-000000000000",
      }),
    ).rejects.toMatchObject({ code: "invalid_type" });
    // Undo: back to the old type while the event still has the new one.
    await updateEventBasics(owner, id, base, { ...base, eventTypeId: antique.id });
    expect(await load(id)).toMatchObject({ eventTypeId: cat.type.id });
  });

  it("validates name, length and venue; undo is guarded", async () => {
    const id = await oneEvent();
    const base = {
      name: "Testflohmarkt",
      durationDays: 1,
      venueId: cat.venue.id,
      eventTypeId: cat.type.id,
    };
    expect((await updateEventBasics(owner, id, base)).changed).toBe(false);
    await expect(updateEventBasics(owner, id, { ...base, name: "  " })).rejects.toMatchObject({
      code: "invalid_name",
    });
    await expect(updateEventBasics(owner, id, { ...base, durationDays: 15 })).rejects.toMatchObject(
      { code: "invalid_duration" },
    );
    await db.update(venue).set({ archivedAt: new Date() }).where(eq(venue.id, cat.venue.id));
    const [other] = await db
      .insert(venue)
      .values({ name: "Alt", kind: "municipal", city: "Köln", archivedAt: new Date() })
      .returning();
    await expect(
      updateEventBasics(owner, id, { ...base, venueId: other?.id ?? "" }),
    ).rejects.toMatchObject({ code: "invalid_venue" });
    // The event may stay at its (now archived) venue while other fields change.
    const renamed = await updateEventBasics(owner, id, { ...base, name: "Neu" });
    expect(renamed.changed).toBe(true);
    await expect(
      updateEventBasics(owner, id, base, { ...base, name: "Anders" }),
    ).rejects.toMatchObject({ code: "conflict" });
  });

  it("previews a venue change with the venue's other events", async () => {
    const id = await oneEvent();
    const [other] = await db
      .insert(venue)
      .values({ name: "Rheinwiesen", kind: "municipal", city: "Köln" })
      .returning();
    if (!other) throw new Error("no venue");
    const [busy] = await createEventsFromPreset(owner, cat.presets.flea.id, ["2026-11-14"]);
    await db
      .update(event)
      .set({ venueId: other.id })
      .where(eq(event.id, busy?.id ?? ""));
    const preview = await previewEventSchedule(owner, id, { venueId: other.id, durationDays: 1 });
    expect(preview.check?.venueConflicts.map((c) => c.id)).toEqual([busy?.id]);
  });
});
