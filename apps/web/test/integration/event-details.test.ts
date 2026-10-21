import { auditLog, event, eventAnchor, eventPreset } from "@marktwerk/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import {
  moveEvent,
  previewEventMove,
  setEventBookingFlag,
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

const facts = {
  times: { setup: "06:00", open: "09:00", close: "17:00", teardown: "19:00" },
  pricePerMCents: 1500,
  bookingFeeCents: 300,
};

describe("updateEventFacts", () => {
  it("updates times and prices of this event only and audits what changed", async () => {
    const id = await oneEvent();
    const result = await updateEventFacts(owner, id, { ...facts, bookingFeeCents: 500 });
    expect(result.changed).toBe(true);
    expect(result.previous).toEqual({
      times: cat.times,
      pricePerMCents: 1200,
      bookingFeeCents: 500,
    });

    const row = await load(id);
    expect(row).toMatchObject({ times: facts.times, pricePerMCents: 1500, bookingFeeCents: 500 });
    const [preset] = await db
      .select()
      .from(eventPreset)
      .where(eq(eventPreset.id, cat.presets.flea.id));
    expect(preset).toMatchObject({ defaultTimes: cat.times, pricePerMCents: 1200 });

    const [entry] = await auditsOf("event.update");
    expect(entry?.diff).toEqual({
      changes: {
        times: { from: cat.times, to: facts.times },
        pricePerMCents: { from: 1200, to: 1500 },
      },
    });
  });

  it("writes nothing when nothing changed", async () => {
    const id = await oneEvent();
    const same = { times: cat.times, pricePerMCents: 1200, bookingFeeCents: 500 };
    expect((await updateEventFacts(owner, id, same)).changed).toBe(false);
    expect(await auditsOf("event.update")).toHaveLength(0);
  });

  it("checks the order of the times (setup may be late only for multi-day events)", async () => {
    const id = await oneEvent();
    const lateSetup = { ...facts, times: { ...facts.times, setup: "10:00" } };
    await expect(updateEventFacts(owner, id, lateSetup)).rejects.toMatchObject({
      code: "setup_after_open",
    });
    await expect(
      updateEventFacts(owner, id, { ...facts, times: { ...facts.times, close: "08:00" } }),
    ).rejects.toMatchObject({ code: "open_after_close" });
    await expect(
      updateEventFacts(owner, id, { ...facts, pricePerMCents: -1 }),
    ).rejects.toMatchObject({ code: "invalid_price" });

    const festival = await oneEvent(cat.presets.festival.id, "2026-12-04");
    expect((await updateEventFacts(owner, festival, lateSetup)).changed).toBe(true);
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
      announced: false,
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
    expect(result).toEqual({ changed: true, from: "2026-12-04", to: "2027-01-08" });
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
