import { addDays } from "@marktwerk/core";
import {
  auditLog,
  event,
  eventAnchor,
  eventDuty,
  eventPreset,
  notification,
} from "@marktwerk/db/schema";
import { asc, eq, inArray } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { changeEventStatus, updateEventNotes } from "@/server/services/event-lifecycle";
import {
  createEventsFromPreset,
  EventInputError,
  MAX_DATES_PER_RUN,
  undoGeneratedEvents,
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

const counts = async () => ({
  events: (await db.select().from(event)).length,
  audit: (await db.select().from(auditLog)).length,
});

/** `forbidden()` from next/navigation throws an error carrying a 403 digest. */
const isForbidden = (error: unknown) =>
  String((error as { digest?: unknown })?.digest ?? "").includes("403");

describe("createEventsFromPreset", () => {
  it("creates one planned event per date, copied from the preset", async () => {
    const created = await createEventsFromPreset(owner, cat.presets.flea.id, [
      "2026-11-14",
      "2026-11-28",
    ]);
    expect(created.map((c) => c.startsOn)).toEqual(["2026-11-14", "2026-11-28"]);

    const rows = await db.select().from(event).orderBy(asc(event.startsOn));
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row).toMatchObject({
        presetId: cat.presets.flea.id,
        eventTypeId: cat.type.id,
        venueId: cat.venue.id,
        name: "Testflohmarkt",
        season: 2026,
        status: "planned",
        pricePerMCents: 1200,
        bookingFeeCents: 500,
        times: cat.times,
        archivedAt: null,
      });
    }
    expect(rows.map((r) => [r.startsOn, r.endsOn])).toEqual([
      ["2026-11-14", "2026-11-14"],
      ["2026-11-28", "2026-11-28"],
    ]);
  });

  it("sorts and de-duplicates the dates and sets the season from the year", async () => {
    const created = await createEventsFromPreset(owner, cat.presets.flea.id, [
      "2027-01-09",
      "2026-12-12",
      "2027-01-09",
    ]);
    expect(created.map((c) => c.startsOn)).toEqual(["2026-12-12", "2027-01-09"]);
    const rows = await db.select().from(event).orderBy(asc(event.startsOn));
    expect(rows.map((r) => r.season)).toEqual([2026, 2027]);
  });

  it("sets the four anchors; booking cutoff is the Monday before the event", async () => {
    // 2026-11-14 is a Saturday, 2026-11-15 a Sunday.
    const [sat, sun] = await createEventsFromPreset(owner, cat.presets.flea.id, [
      "2026-11-14",
      "2026-11-15",
    ]);
    const anchorsOf = async (id: string) =>
      Object.fromEntries(
        (await db.select().from(eventAnchor).where(eq(eventAnchor.eventId, id))).map((a) => [
          a.key,
          a.date,
        ]),
      );
    expect(await anchorsOf(sat?.id ?? "")).toEqual({
      event_day: "2026-11-14",
      setup_day: "2026-11-14",
      teardown_day: "2026-11-14",
      booking_cutoff: "2026-11-09",
    });
    expect((await anchorsOf(sun?.id ?? "")).booking_cutoff).toBe("2026-11-09");
  });

  it("handles multi-day presets: end date, setup the day before, teardown on the last day", async () => {
    const [created] = await createEventsFromPreset(owner, cat.presets.festival.id, ["2026-12-04"]);
    const [row] = await db
      .select()
      .from(event)
      .where(eq(event.id, created?.id ?? ""));
    expect(row).toMatchObject({
      startsOn: "2026-12-04",
      endsOn: "2026-12-06",
      pricePerMCents: 2000,
    });
    const anchors = Object.fromEntries(
      (
        await db
          .select()
          .from(eventAnchor)
          .where(eq(eventAnchor.eventId, created?.id ?? ""))
      ).map((a) => [a.key, a.date]),
    );
    expect(anchors).toEqual({
      event_day: "2026-12-04",
      setup_day: "2026-12-03",
      teardown_day: "2026-12-06",
      booking_cutoff: "2026-11-30",
    });
  });

  it("copies default duties by role key and skips keys without a duty role", async () => {
    const [created] = await createEventsFromPreset(owner, cat.presets.flea.id, ["2026-11-14"]);
    const duties = await db
      .select()
      .from(eventDuty)
      .where(eq(eventDuty.eventId, created?.id ?? ""));
    expect(duties.map((d) => [d.dutyRoleId, d.staffMemberId]).sort()).toEqual(
      [
        [cat.roles.lead.id, cat.staff.anna.id],
        [cat.roles.setup.id, cat.staff.ben.id],
      ].sort(),
    );
  });

  it("writes one audit_log row per event, in the same run", async () => {
    const created = await createEventsFromPreset(owner, cat.presets.flea.id, [
      "2026-11-14",
      "2026-11-28",
      "2026-12-12",
    ]);
    const entries = await db.select().from(auditLog);
    expect(entries).toHaveLength(3);
    expect(entries.every((e) => e.action === "event.create" && e.entityType === "event")).toBe(
      true,
    );
    expect(entries.every((e) => e.actorId === owner.id)).toBe(true);
    expect(new Set(entries.map((e) => e.entityId))).toEqual(new Set(created.map((c) => c.id)));
    expect(entries.map((e) => e.diff)).toContainEqual({
      presetId: cat.presets.flea.id,
      startsOn: "2026-11-14",
      source: "preset",
    });
  });

  it("allows managers too", async () => {
    const manager = await createActor("manager");
    await expect(
      createEventsFromPreset(manager, cat.presets.flea.id, ["2026-11-14"]),
    ).resolves.toHaveLength(1);
  });

  describe("rejects bad input without writing anything", () => {
    it.each([
      ["no dates", [], "no_dates"],
      ["a malformed date", ["14.11.2026"], "invalid_date"],
      ["a non-existent calendar day", ["2026-02-30"], "invalid_date"],
    ])("%s", async (_label, dates, code) => {
      await expect(createEventsFromPreset(owner, cat.presets.flea.id, dates)).rejects.toThrow(
        new EventInputError(code),
      );
      expect(await counts()).toEqual({ events: 0, audit: 0 });
    });

    it("more than the maximum number of dates", async () => {
      const dates = Array.from({ length: MAX_DATES_PER_RUN + 1 }, (_, i) =>
        addDays("2026-11-01", i * 7),
      );
      await expect(createEventsFromPreset(owner, cat.presets.flea.id, dates)).rejects.toThrow(
        new EventInputError("too_many_dates"),
      );
      expect(await counts()).toEqual({ events: 0, audit: 0 });
    });

    it("accepts exactly the maximum number of dates", async () => {
      const dates = Array.from({ length: MAX_DATES_PER_RUN }, (_, i) =>
        addDays("2026-11-01", i * 7),
      );
      await expect(createEventsFromPreset(owner, cat.presets.flea.id, dates)).resolves.toHaveLength(
        MAX_DATES_PER_RUN,
      );
    });

    it("an inactive preset", async () => {
      await db
        .update(eventPreset)
        .set({ active: false })
        .where(eq(eventPreset.id, cat.presets.flea.id));
      await expect(
        createEventsFromPreset(owner, cat.presets.flea.id, ["2026-11-14"]),
      ).rejects.toThrow(new EventInputError("preset_not_found"));
      expect(await counts()).toEqual({ events: 0, audit: 0 });
    });

    it("an archived preset", async () => {
      await db
        .update(eventPreset)
        .set({ archivedAt: new Date() })
        .where(eq(eventPreset.id, cat.presets.flea.id));
      await expect(
        createEventsFromPreset(owner, cat.presets.flea.id, ["2026-11-14"]),
      ).rejects.toThrow(new EventInputError("preset_not_found"));
    });

    it("an unknown preset", async () => {
      await expect(
        createEventsFromPreset(owner, "019f0000-0000-7000-8000-000000000000", ["2026-11-14"]),
      ).rejects.toThrow(new EventInputError("preset_not_found"));
    });
  });

  it.each(["staff", "field"] as const)("is forbidden for the %s role", async (role) => {
    const actor = await createActor(role);
    const error = await createEventsFromPreset(actor, cat.presets.flea.id, ["2026-11-14"]).then(
      () => null,
      (e: unknown) => e,
    );
    expect(isForbidden(error)).toBe(true);
    expect(await counts()).toEqual({ events: 0, audit: 0 });
  });

  it("is all or nothing: a failure in the transaction rolls every event back", async () => {
    // A default duty pointing at a staff member that doesn't exist violates the FK on event_duty.
    await db
      .update(eventPreset)
      .set({ defaultDuties: { market_lead: "019f0000-0000-7000-8000-000000000000" } })
      .where(eq(eventPreset.id, cat.presets.flea.id));
    await expect(
      createEventsFromPreset(owner, cat.presets.flea.id, ["2026-11-14", "2026-11-28"]),
    ).rejects.toThrow();
    expect(await counts()).toEqual({ events: 0, audit: 0 });
    expect(await db.select().from(eventAnchor)).toHaveLength(0);
  });
});

describe("undoGeneratedEvents", () => {
  it("archives freshly created events only; events anyone changed since stay", async () => {
    const created = await createEventsFromPreset(owner, cat.presets.flea.id, [
      "2026-11-14",
      "2026-11-28",
      "2026-12-12",
      "2026-12-19",
    ]);
    const [fresh, moved, fresh2, noted] = created.map((c) => c.id) as [
      string,
      string,
      string,
      string,
    ];
    // Someone confirmed one by hand and edited the notes of another after the run.
    await changeEventStatus(owner, moved, "confirmed");
    await updateEventNotes(owner, noted, "Bitte Strom klären");
    await db.delete(notification);
    const auditBefore = await db.select().from(auditLog);

    const archived = await undoGeneratedEvents(owner, [fresh, moved, fresh2, noted]);
    expect(archived).toBe(2);

    const rows = await db
      .select()
      .from(event)
      .where(inArray(event.id, [fresh, moved, fresh2, noted]));
    const byId = new Map(rows.map((r) => [r.id, r]));
    expect(byId.get(fresh)?.archivedAt).toBeInstanceOf(Date);
    expect(byId.get(fresh2)?.archivedAt).toBeInstanceOf(Date);
    expect(byId.get(moved)?.archivedAt).toBeNull();
    expect(byId.get(moved)?.status).toBe("confirmed");
    expect(byId.get(noted)?.archivedAt).toBeNull();

    const entries = (await db.select().from(auditLog)).filter((e) => e.action === "event.archive");
    expect(entries).toHaveLength(2);
    expect(auditBefore.some((e) => e.action === "event.archive")).toBe(false);
    expect(entries.every((e) => e.actorId === owner.id)).toBe(true);
    expect(entries.map((e) => e.diff)).toEqual([{ reason: "undo" }, { reason: "undo" }]);
    expect(new Set(entries.map((e) => e.entityId))).toEqual(new Set([fresh, fresh2]));
  });

  it("also undoes an event that was confirmed right away by an existing permit", async () => {
    const [created] = await createEventsFromPreset(owner, cat.presets.flea.id, ["2026-11-14"]);
    const id = created?.id ?? "";
    // Simulate the automatic confirmation of the creation run (see permits.test.ts for the real flow).
    await db.update(event).set({ status: "confirmed" }).where(eq(event.id, id));
    await db.insert(auditLog).values({
      actorId: owner.id,
      action: "event.status",
      entityType: "event",
      entityId: id,
      diff: { from: "planned", to: "confirmed", auto: true, source: "logbook_fill" },
    });
    expect(await undoGeneratedEvents(owner, [id])).toBe(1);
  });

  it("is idempotent: already archived events are not archived or audited again", async () => {
    const [created] = await createEventsFromPreset(owner, cat.presets.flea.id, ["2026-11-14"]);
    const ids = [created?.id ?? ""];
    expect(await undoGeneratedEvents(owner, ids)).toBe(1);
    const before = await counts();
    expect(await undoGeneratedEvents(owner, ids)).toBe(0);
    expect(await counts()).toEqual(before);
  });

  it("rejects an empty or oversized selection", async () => {
    await expect(undoGeneratedEvents(owner, [])).rejects.toThrow(
      new EventInputError("invalid_selection"),
    );
    const many = Array.from({ length: MAX_DATES_PER_RUN + 1 }, (_, i) => String(i));
    await expect(undoGeneratedEvents(owner, many)).rejects.toThrow(
      new EventInputError("invalid_selection"),
    );
  });

  it("is forbidden without event:write and leaves the events alone", async () => {
    const [created] = await createEventsFromPreset(owner, cat.presets.flea.id, ["2026-11-14"]);
    const staff = await createActor("staff");
    const error = await undoGeneratedEvents(staff, [created?.id ?? ""]).then(
      () => null,
      (e: unknown) => e,
    );
    expect(isForbidden(error)).toBe(true);
    const [row] = await db
      .select()
      .from(event)
      .where(eq(event.id, created?.id ?? ""));
    expect(row?.archivedAt).toBeNull();
  });
});
