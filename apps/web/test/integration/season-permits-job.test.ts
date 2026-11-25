import {
  auditLog,
  dutyRole,
  eventPermit,
  eventPreset,
  notification,
  permit,
  permitRequirement,
  task,
  venue,
} from "@marktwerk/db/schema";
import { JOBS, seasonPermits } from "@marktwerk/jobs";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { createEventsFromPreset } from "@/server/services/events";
import { createActor, resetDatabase, seedCatalogue } from "../helpers/fixtures";

/*
 * Season permits created yearly from the Ort's requirements (ADR 0024, Fahrplan SAI4): the nightly job
 * `season-permits` makes next season's permit with its own "… beantragen" task 30 days before its apply-by,
 * before any date of that season exists; dates created later link to it.
 */

let cat: Awaited<ReturnType<typeof seedCatalogue>>;
let owner: Awaited<ReturnType<typeof createActor>>;

/** Berlin noon of a day (the job reads the Berlin date of `now`). */
const at = (day: string) => new Date(`${day}T11:00:00Z`);

beforeEach(async () => {
  await resetDatabase();
  cat = await seedCatalogue();
  owner = await createActor("owner");
  await db.insert(dutyRole).values({
    key: "permits",
    nameDe: "Genehmigungen",
    nameEn: "Permits",
    defaultStaffMemberId: cat.staff.anna.id,
  });
  await db
    .update(eventPreset)
    .set({ defaultDuties: { permits: cat.staff.anna.id } })
    .where(eq(eventPreset.id, cat.presets.flea.id));
});

afterAll(async () => {
  await db.$client.end();
});

async function requirement(patch: Partial<typeof permitRequirement.$inferInsert> = {}) {
  const [row] = await db
    .insert(permitRequirement)
    .values({
      venueId: cat.venue.id,
      category: "city",
      permitType: "market_fixing",
      title: "Festsetzung",
      cadence: "per_season",
      // Apply-by 2026-09-02 for the 2027 season (1 March), so the job creates it on 2026-08-03.
      leadTimeDays: 180,
      expectedDecisionMd: "10-15",
      ...patch,
    })
    .returning();
  if (!row) throw new Error("no requirement");
  return row;
}

describe("season-permits job (ADR 0024, SAI4)", () => {
  it("is scheduled nightly like the other jobs", () => {
    expect(JOBS["season-permits"].cron).toBe("25 0 * * *");
  });

  it("creates next season's permit once and on time, with its own apply task, audited by the system", async () => {
    const req = await requirement();
    expect(await seasonPermits(db, at("2026-08-02"))).toEqual({ created: 0 });
    expect(await db.select().from(permit)).toHaveLength(0);

    expect(await seasonPermits(db, at("2026-08-03"))).toEqual({ created: 1 });
    const [p] = await db.select().from(permit);
    expect(p).toMatchObject({
      requirementId: req.id,
      venueId: cat.venue.id,
      season: 2027,
      category: "city",
      permitType: "market_fixing",
      title: "Festsetzung",
      status: "not_started",
      applyBy: "2026-09-02",
      expectedDecisionOn: "2026-10-15",
      responsibleStaffMemberId: cat.staff.anna.id,
    });
    const tasks = await db.select().from(task);
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({
      permitId: p?.id,
      eventId: null,
      source: "permit",
      title: "Festsetzung beantragen",
      category: "permits",
      assigneeId: cat.staff.anna.id,
      status: "todo",
    });
    // 23:59 Berlin summer time.
    expect(tasks[0]?.dueAt?.toISOString()).toBe("2026-09-02T21:59:00.000Z");
    const entries = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.entityId, p?.id as string));
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      actorId: null,
      action: "permit.create",
      diff: { source: "season_job", season: 2027, applyBy: "2026-09-02", taskId: tasks[0]?.id },
    });
    const notes = await db
      .select()
      .from(notification)
      .where(eq(notification.recipientStaffMemberId, cat.staff.anna.id));
    expect(notes.map((n) => n.title)).toEqual(["Neue Aufgabe: Genehmigung beantragen"]);

    // Re-runs (the same night, later nights) create nothing.
    expect(await seasonPermits(db, at("2026-08-03"))).toEqual({ created: 0 });
    expect(await seasonPermits(db, at("2026-11-25"))).toEqual({ created: 0 });
    expect(await db.select().from(permit)).toHaveLength(1);
    expect(await db.select().from(task)).toHaveLength(1);
  });

  it("takes apply-by from the submission window when the requirement has one", async () => {
    await requirement({ submissionWindowStartMd: "10-01", submissionWindowEndMd: "11-30" });
    expect(await seasonPermits(db, at("2026-10-30"))).toEqual({ created: 0 });
    expect(await seasonPermits(db, at("2026-10-31"))).toEqual({ created: 1 });
    const [p] = await db.select().from(permit);
    expect(p?.applyBy).toBe("2026-11-30");
    const [t] = await db.select().from(task);
    // 23:59 Berlin winter time.
    expect(t?.dueAt?.toISOString()).toBe("2026-11-30T22:59:00.000Z");
  });

  it("leaves per_event requirements alone (each date has its own permit)", async () => {
    await requirement({ permitType: "no_parking", title: "Halteverbot", cadence: "per_event" });
    expect(await seasonPermits(db, at("2026-12-15"))).toEqual({ created: 0 });
    expect(await db.select().from(permit)).toHaveLength(0);
  });

  it("ignores archived requirements and requirements of archived Orte", async () => {
    await requirement({ archivedAt: new Date() });
    expect(await seasonPermits(db, at("2026-12-15"))).toEqual({ created: 0 });
    await requirement();
    await db.update(venue).set({ archivedAt: new Date() }).where(eq(venue.id, cat.venue.id));
    expect(await seasonPermits(db, at("2026-12-15"))).toEqual({ created: 0 });
    expect(await db.select().from(permit)).toHaveLength(0);
  });

  it("a date of that season created later links to the job's permit instead of making another", async () => {
    await requirement();
    await seasonPermits(db, at("2026-08-03"));
    const [p] = await db.select().from(permit);
    const [created] = await createEventsFromPreset(owner, cat.presets.flea.id, ["2027-05-02"]);
    expect(await db.select().from(permit)).toHaveLength(1);
    expect(
      await db
        .select()
        .from(eventPermit)
        .where(
          and(
            eq(eventPermit.eventId, created?.id as string),
            eq(eventPermit.permitId, p?.id as string),
          ),
        ),
    ).toHaveLength(1);
    // Still exactly one apply task: the permit's own, without an event.
    const own = await db
      .select()
      .from(task)
      .where(eq(task.permitId, p?.id as string));
    expect(own.map((t) => [t.source, t.eventId])).toEqual([["permit", null]]);
    // The deadline stays: a date in May asks for nothing earlier than the season's apply-by.
    expect((await db.select().from(permit))[0]?.applyBy).toBe("2026-09-02");
  });

  it("renews a multi-year permit only when the current one runs out", async () => {
    const req = await requirement({
      category: "external",
      permitType: "landowner_ok",
      title: "Einverständnis Eigentümer",
      cadence: "multi_year",
      leadTimeDays: 90,
      expectedDecisionMd: null,
    });
    await db.insert(permit).values({
      requirementId: req.id,
      venueId: cat.venue.id,
      season: null,
      category: "external",
      permitType: "landowner_ok",
      title: "Einverständnis Eigentümer",
      status: "granted",
      validFrom: "2025-01-01",
      validUntil: "2027-12-31",
    });
    // Valid through 2027: nothing for the 2027 season.
    expect(await seasonPermits(db, at("2026-11-25"))).toEqual({ created: 0 });
    // Runs out before 2028: the renewal comes 30 days before its apply-by (2027-12-02, made 2027-11-02).
    expect(await seasonPermits(db, at("2027-11-01"))).toEqual({ created: 0 });
    expect(await seasonPermits(db, at("2027-11-02"))).toEqual({ created: 1 });
    const renewal = (await db.select().from(permit)).find((p) => p.status === "not_started");
    expect(renewal).toMatchObject({ season: null, applyBy: "2027-12-02", validUntil: null });
    expect(await seasonPermits(db, at("2027-12-20"))).toEqual({ created: 0 });
  });
});
