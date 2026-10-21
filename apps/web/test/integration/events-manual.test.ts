import { auditLog, event, eventAnchor, eventDuty } from "@marktwerk/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import {
  archiveDraftEvents,
  createManualEvent,
  EventInputError,
  type ManualEventInput,
} from "@/server/services/events";
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

const input = (): ManualEventInput & { startsOn: string } => ({
  name: "Sommerfest am See",
  eventTypeId: cat.type.id,
  venueId: cat.venue.id,
  startsOn: "2026-12-04",
  durationDays: 1,
  times: { setup: "6:00", open: "08:00", close: "16:30", teardown: "18:00" },
  pricePerMCents: 1500,
  bookingFeeCents: 0,
});

const counts = async () => ({
  events: (await db.select().from(event)).length,
  audit: (await db.select().from(auditLog)).length,
});

const isForbidden = (error: unknown) =>
  String((error as { digest?: unknown })?.digest ?? "").includes("403");

describe("createManualEvent (Einzeltermin)", () => {
  it("creates one draft event without a preset, with anchors and an empty team", async () => {
    const created = await createManualEvent(owner, input());
    expect(created.startsOn).toBe("2026-12-04");

    const [row] = await db.select().from(event).where(eq(event.id, created.id));
    expect(row).toMatchObject({
      presetId: null,
      locationAgreementId: null,
      eventTypeId: cat.type.id,
      venueId: cat.venue.id,
      name: "Sommerfest am See",
      season: 2026,
      status: "draft",
      startsOn: "2026-12-04",
      endsOn: "2026-12-04",
      pricePerMCents: 1500,
      bookingFeeCents: 0,
      archivedAt: null,
    });
    // Times are stored as normalised 24-hour text.
    expect(row?.times).toEqual({
      setup: "06:00",
      open: "08:00",
      close: "16:30",
      teardown: "18:00",
    });
    expect(await db.select().from(eventDuty).where(eq(eventDuty.eventId, created.id))).toEqual([]);
    const anchors = Object.fromEntries(
      (await db.select().from(eventAnchor).where(eq(eventAnchor.eventId, created.id))).map((a) => [
        a.key,
        a.date,
      ]),
    );
    expect(anchors).toEqual({
      event_day: "2026-12-04",
      setup_day: "2026-12-04",
      teardown_day: "2026-12-04",
      booking_cutoff: "2026-11-30",
    });
  });

  it("handles several days: end date, setup the day before", async () => {
    const created = await createManualEvent(owner, {
      ...input(),
      durationDays: 3,
      times: { setup: "14:00", open: "10:00", close: "20:00", teardown: "22:00" },
    });
    const [row] = await db.select().from(event).where(eq(event.id, created.id));
    expect(row).toMatchObject({ startsOn: "2026-12-04", endsOn: "2026-12-06" });
    const anchors = await db.select().from(eventAnchor).where(eq(eventAnchor.eventId, created.id));
    expect(Object.fromEntries(anchors.map((a) => [a.key, a.date]))).toMatchObject({
      setup_day: "2026-12-03",
      teardown_day: "2026-12-06",
    });
  });

  it("writes one audit entry with source manual and no preset", async () => {
    const created = await createManualEvent(owner, input());
    const entries = await db.select().from(auditLog);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      action: "event.create",
      entityType: "event",
      entityId: created.id,
      actorId: owner.id,
      diff: { startsOn: "2026-12-04", source: "manual" },
    });
  });

  it("can be undone like a generation run (draft is archived)", async () => {
    const created = await createManualEvent(owner, input());
    expect(await archiveDraftEvents(owner, [created.id])).toBe(1);
    const [row] = await db.select().from(event).where(eq(event.id, created.id));
    expect(row?.archivedAt).toBeInstanceOf(Date);
  });

  it("allows managers", async () => {
    const manager = await createActor("manager");
    await expect(createManualEvent(manager, input())).resolves.toMatchObject({
      startsOn: "2026-12-04",
    });
  });

  describe("rejects bad input without writing anything", () => {
    it.each([
      ["an empty name", { name: "   " }, "invalid_name"],
      ["a very long name", { name: "x".repeat(121) }, "invalid_name"],
      ["zero days", { durationDays: 0 }, "invalid_duration"],
      ["more than 14 days", { durationDays: 15 }, "invalid_duration"],
      ["a fractional number of days", { durationDays: 1.5 }, "invalid_duration"],
      ["a malformed first day", { startsOn: "04.12.2026" }, "invalid_date"],
      ["a non-existent first day", { startsOn: "2026-02-30" }, "invalid_date"],
      [
        "a time that isn't one",
        { times: { setup: "5", open: "25:00", close: "16:00", teardown: "18:00" } },
        "invalid_time",
      ],
      [
        "opening after closing",
        { times: { setup: "05:00", open: "17:00", close: "16:00", teardown: "18:00" } },
        "open_after_close",
      ],
      [
        "closing after teardown",
        { times: { setup: "05:00", open: "08:00", close: "19:00", teardown: "18:00" } },
        "close_after_teardown",
      ],
      [
        "setup after opening on a single day",
        { times: { setup: "09:00", open: "08:00", close: "16:00", teardown: "18:00" } },
        "setup_after_open",
      ],
      ["a negative price", { pricePerMCents: -1 }, "invalid_price"],
      ["a price above the maximum", { pricePerMCents: 1_000_001 }, "invalid_price"],
      ["a fractional fee", { bookingFeeCents: 10.5 }, "invalid_price"],
      [
        "an unknown event type",
        { eventTypeId: "019f0000-0000-7000-8000-000000000000" },
        "invalid_event_type",
      ],
      ["a malformed venue id", { venueId: "nope" }, "invalid_venue"],
      ["an unknown venue", { venueId: "019f0000-0000-7000-8000-000000000000" }, "invalid_venue"],
    ])("%s", async (_label, patch, code) => {
      await expect(createManualEvent(owner, { ...input(), ...patch })).rejects.toThrow(
        new EventInputError(code),
      );
      expect(await counts()).toEqual({ events: 0, audit: 0 });
    });
  });

  it("accepts setup after opening when the event lasts several days", async () => {
    await expect(
      createManualEvent(owner, {
        ...input(),
        durationDays: 2,
        times: { setup: "15:00", open: "08:00", close: "16:00", teardown: "18:00" },
      }),
    ).resolves.toBeDefined();
  });

  it.each(["staff", "field"] as const)("is forbidden for the %s role", async (role) => {
    const actor = await createActor(role);
    const error = await createManualEvent(actor, input()).then(
      () => null,
      (e: unknown) => e,
    );
    expect(isForbidden(error)).toBe(true);
    expect(await counts()).toEqual({ events: 0, audit: 0 });
  });
});
