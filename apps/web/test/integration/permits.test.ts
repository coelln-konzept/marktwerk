import {
  auditLog,
  dutyRole,
  event,
  eventPermit,
  eventPreset,
  eventType,
  notification,
  permit,
  permitRequirement,
  task,
} from "@marktwerk/db/schema";
import { and, asc, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { changeEventStatus } from "@/server/services/event-lifecycle";
import { createEventsFromPreset, undoGeneratedEvents } from "@/server/services/events";
import {
  archivePermit,
  createPermit,
  fillLogbookForEvents,
  linkEventsToPermit,
  PermitInputError,
  restorePermit,
  restorePermitStatus,
  setEventPermitRequired,
  setPermitStatus,
  unlinkEventFromPermit,
  updatePermit,
} from "@/server/services/permits";
import { createActor, resetDatabase, seedCatalogue } from "../helpers/fixtures";

let cat: Awaited<ReturnType<typeof seedCatalogue>>;
let owner: Awaited<ReturnType<typeof createActor>>;
let permitsRoleId: string;

const isForbidden = (error: unknown) =>
  String((error as { digest?: unknown })?.digest ?? "").includes("403");

beforeEach(async () => {
  await resetDatabase();
  cat = await seedCatalogue();
  owner = await createActor("owner");
  const [role] = await db
    .insert(dutyRole)
    .values({ key: "permits", nameDe: "Genehmigungen", nameEn: "Permits" })
    .returning();
  if (!role) throw new Error("no role");
  permitsRoleId = role.id;
  // The "permits" holder of every event made from the flea preset is Anna.
  await db
    .update(eventPreset)
    .set({ defaultDuties: { permits: cat.staff.anna.id } })
    .where(eq(eventPreset.id, cat.presets.flea.id));
});

afterAll(async () => {
  await db.$client.end();
});

type Requirement = typeof permitRequirement.$inferInsert;

async function requirement(patch: Partial<Requirement> = {}) {
  const [row] = await db
    .insert(permitRequirement)
    .values({
      venueId: cat.venue.id,
      category: "city",
      permitType: "market_permit",
      title: "Marktgenehmigung",
      cadence: "per_season",
      leadTimeDays: 120,
      submissionWindowStartMd: "10-01",
      submissionWindowEndMd: "11-30",
      expectedDecisionMd: "01-15",
      ...patch,
    })
    .returning();
  if (!row) throw new Error("no requirement");
  return row;
}

async function generate(...days: string[]) {
  const created = await createEventsFromPreset(owner, cat.presets.flea.id, days);
  return created.map((c) => c.id);
}

describe("logbook fill on event creation", () => {
  it("creates one season permit for several events, with apply-by from the window, a task and links", async () => {
    const req = await requirement();
    const ids = await generate("2027-05-02", "2027-06-06");

    const permits = await db.select().from(permit);
    expect(permits).toHaveLength(1);
    expect(permits[0]).toMatchObject({
      requirementId: req.id,
      venueId: cat.venue.id,
      season: 2027,
      category: "city",
      permitType: "market_permit",
      title: "Marktgenehmigung",
      status: "not_started",
      // 120 days before 02.05.2027 is 02.01.2027: the city collected applications until 30.11.2026.
      applyBy: "2026-11-30",
      expectedDecisionOn: "2027-01-15",
      responsibleStaffMemberId: cat.staff.anna.id,
    });

    const links = await db.select().from(eventPermit);
    expect(links.map((l) => l.eventId).sort()).toEqual([...ids].sort());
    expect(links.every((l) => l.required)).toBe(true);

    const tasks = await db.select().from(task);
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({
      permitId: permits[0]?.id,
      eventId: null,
      source: "permit",
      category: "permits",
      title: "Marktgenehmigung beantragen",
      assigneeId: cat.staff.anna.id,
      dutyRoleId: permitsRoleId,
      status: "todo",
    });
    expect(tasks[0]?.dueAt?.toISOString()).toBe("2026-11-30T22:59:00.000Z");
    const entries = await db.select().from(auditLog).where(eq(auditLog.action, "permit.create"));
    expect(entries).toHaveLength(1);
  });

  it("attaches an existing valid permit instead of creating a new one (covered vs missing)", async () => {
    const req = await requirement({ submissionWindowStartMd: null, submissionWindowEndMd: null });
    const [held] = await db
      .insert(permit)
      .values({
        requirementId: req.id,
        venueId: cat.venue.id,
        season: 2027,
        category: "city",
        permitType: "market_permit",
        title: "Marktgenehmigung",
        status: "granted",
        validFrom: "2027-01-01",
        validUntil: "2027-12-31",
      })
      .returning();
    const ids = await generate("2027-05-02", "2028-05-07");

    const permits = await db.select().from(permit).orderBy(asc(permit.season));
    // 2027 is covered; 2028 is missing and gets its own application.
    expect(permits).toHaveLength(2);
    expect(permits[0]?.id).toBe(held?.id);
    expect(permits[1]).toMatchObject({
      season: 2028,
      status: "not_started",
      applyBy: "2028-01-08",
    });

    const links = await db.select().from(eventPermit);
    const covered = links.find((l) => l.eventId === ids[0]);
    expect(covered?.permitId).toBe(held?.id);
    // Only the missing permit has a task.
    const tasks = await db.select().from(task);
    expect(tasks).toHaveLength(1);
    expect(tasks[0]?.permitId).toBe(permits[1]?.id);
    // The granted permit is not touched.
    expect(permits[0]?.status).toBe("granted");
  });

  it("does not let a permit cover days outside its entered validity", async () => {
    const req = await requirement({ submissionWindowStartMd: null, submissionWindowEndMd: null });
    await db.insert(permit).values({
      requirementId: req.id,
      venueId: cat.venue.id,
      season: 2027,
      category: "city",
      permitType: "market_permit",
      title: "Marktgenehmigung",
      status: "granted",
      validFrom: "2027-01-01",
      validUntil: "2027-06-30",
    });
    await generate("2027-09-05");
    expect(await db.select().from(permit)).toHaveLength(2);
  });

  it("covers multi-year permits inside their validity and keeps tasks only for missing ones", async () => {
    const owner_ = await requirement({
      category: "external",
      permitType: "landowner_ok",
      title: "Einverständnis Eigentümer",
      cadence: "multi_year",
      leadTimeDays: 30,
      submissionWindowStartMd: null,
      submissionWindowEndMd: null,
      expectedDecisionMd: null,
    });
    const [held] = await db
      .insert(permit)
      .values({
        requirementId: owner_.id,
        venueId: cat.venue.id,
        season: null,
        category: "external",
        permitType: "landowner_ok",
        title: "Einverständnis Eigentümer",
        status: "granted",
        validFrom: "2026-01-01",
        validUntil: "2028-12-31",
      })
      .returning();
    await generate("2027-05-02", "2029-05-06");
    const permits = await db.select().from(permit).orderBy(asc(permit.createdAt));
    expect(permits).toHaveLength(2);
    expect(permits[0]?.id).toBe(held?.id);
    // 2029 is outside the validity: a new multi-year permit with no season.
    expect(permits[1]).toMatchObject({
      season: null,
      status: "not_started",
      applyBy: "2029-04-06",
    });
  });

  it("creates one permit per event for per-event requirements, with the event on the task", async () => {
    await requirement({
      permitType: "no_parking",
      title: "Halteverbot",
      cadence: "per_event",
      leadTimeDays: 21,
      submissionWindowStartMd: null,
      submissionWindowEndMd: null,
      expectedDecisionMd: null,
    });
    const ids = await generate("2027-05-02", "2027-06-06");
    const permits = await db.select().from(permit).orderBy(asc(permit.applyBy));
    expect(permits.map((p) => [p.title, p.season, p.applyBy])).toEqual([
      ["Halteverbot – 2027-05-02", 2027, "2027-04-11"],
      ["Halteverbot – 2027-06-06", 2027, "2027-05-16"],
    ]);
    const tasks = await db.select().from(task);
    expect(tasks.map((t) => t.eventId).sort()).toEqual([...ids].sort());
  });

  it("respects the event type narrowing", async () => {
    const [other] = await db
      .insert(eventType)
      .values({
        key: "food",
        nameDe: "Food & Wine",
        nameEn: "Food & Wine",
        rules: cat.type.rules,
      })
      .returning();
    await requirement({ eventTypeId: other?.id, title: "Schankgenehmigung" });
    await requirement({ eventTypeId: cat.type.id, title: "Marktgenehmigung" });
    await generate("2027-05-02");
    const permits = await db.select().from(permit);
    expect(permits.map((p) => p.title)).toEqual(["Marktgenehmigung"]);
  });

  it("is idempotent and moves the deadline when an earlier event joins an unfiled permit", async () => {
    await requirement({
      title: "Wasser",
      permitType: "water",
      leadTimeDays: 30,
      submissionWindowStartMd: null,
      submissionWindowEndMd: null,
      expectedDecisionMd: null,
    });
    const [first] = await generate("2027-06-06");
    expect(first).toBeDefined();
    const before = await db.select().from(permit);
    expect(before[0]?.applyBy).toBe("2027-05-07");

    // Same event again: nothing new.
    await db.transaction((tx) => fillLogbookForEvents(tx, [first as string], owner));
    expect(await db.select().from(permit)).toHaveLength(1);
    expect(await db.select().from(eventPermit)).toHaveLength(1);

    await generate("2027-05-02");
    const after = await db.select().from(permit);
    expect(after).toHaveLength(1);
    expect(after[0]?.applyBy).toBe("2027-04-02");
    const [t] = await db.select().from(task);
    expect(t?.dueAt?.toISOString()).toBe("2027-04-02T21:59:00.000Z");
    expect(await db.select().from(eventPermit)).toHaveLength(2);
  });

  it("creates events without requirements untouched and sends one grouped notification", async () => {
    await generate("2027-05-02");
    expect(await db.select().from(permit)).toHaveLength(0);

    await requirement({ title: "A" });
    await requirement({ permitType: "water", title: "B", cadence: "per_event" });
    await generate("2027-06-06");
    const rows = await db.select().from(notification);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      recipientStaffMemberId: cat.staff.anna.id,
      reason: "assigned",
      title: "2 neue Aufgaben: Genehmigungen beantragen",
    });
  });

  it("an event with no 'permits' duty holder gets unassigned tasks", async () => {
    await requirement();
    await createEventsFromPreset(owner, cat.presets.festival.id, ["2027-07-02"]);
    const [t] = await db.select().from(task);
    expect(t?.assigneeId).toBeNull();
    const [p] = await db.select().from(permit);
    expect(p?.responsibleStaffMemberId).toBeNull();
  });
});

describe("permit status flow", () => {
  async function newPermit() {
    await requirement({ submissionWindowStartMd: null, submissionWindowEndMd: null });
    await generate("2027-05-02");
    const [p] = await db.select().from(permit);
    if (!p) throw new Error("no permit");
    return p;
  }

  it("walks not_started → preparing → applied → granted and stamps dates", async () => {
    const p = await newPermit();
    expect((await setPermitStatus(owner, p.id, "preparing")).changed).toBe(true);
    const applied = await setPermitStatus(owner, p.id, "applied");
    // Applying completes the "beantragen" task.
    expect(applied.closedTaskIds).toHaveLength(1);
    const [done] = await db.select().from(task).where(eq(task.permitId, p.id));
    expect(done?.status).toBe("done");
    expect(done?.completedAt).toBeInstanceOf(Date);
    await setPermitStatus(owner, p.id, "granted");
    const [row] = await db.select().from(permit).where(eq(permit.id, p.id));
    expect(row?.status).toBe("granted");
    expect(row?.appliedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(row?.grantedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const entries = await db.select().from(auditLog).where(eq(auditLog.action, "permit.status"));
    expect(entries).toHaveLength(3);
    // Back from "Genehmigt": "Erteilt am" is cleared, "Beantragt am" stays.
    const back = await setPermitStatus(owner, p.id, "applied");
    expect(back.previous.grantedAt).toBe(row?.grantedAt);
    const [again] = await db.select().from(permit).where(eq(permit.id, p.id));
    expect(again?.status).toBe("applied");
    expect(again?.grantedAt).toBeNull();
    expect(again?.appliedAt).toBe(row?.appliedAt);
  });

  it("refuses transitions the flow does not allow and unknown statuses", async () => {
    const p = await newPermit();
    await expect(setPermitStatus(owner, p.id, "rejected")).rejects.toMatchObject({
      code: "invalid_transition",
    });
    await expect(setPermitStatus(owner, p.id, "bogus")).rejects.toMatchObject({
      code: "invalid_status",
    });
    await expect(setPermitStatus(owner, "nope", "preparing")).rejects.toMatchObject({
      code: "not_found",
    });
    expect((await setPermitStatus(owner, p.id, "not_started")).changed).toBe(false);
  });

  it("marking not required cancels the task, and undo restores status, dates and task", async () => {
    const p = await newPermit();
    const moved = await setPermitStatus(owner, p.id, "applied");
    expect(moved.previous.status).toBe("not_started");
    const restored = await restorePermitStatus(
      owner,
      p.id,
      "applied",
      moved.previous,
      moved.closedTaskIds,
    );
    expect(restored.changed).toBe(true);
    const [row] = await db.select().from(permit).where(eq(permit.id, p.id));
    expect(row).toMatchObject({ status: "not_started", appliedAt: null });
    const [t] = await db.select().from(task).where(eq(task.permitId, p.id));
    expect(t).toMatchObject({ status: "todo", completedAt: null });
    // The toast is only valid while the status is still the one it was made for.
    await expect(
      restorePermitStatus(owner, p.id, "applied", moved.previous, moved.closedTaskIds),
    ).rejects.toMatchObject({ code: "conflict" });

    const skipped = await setPermitStatus(owner, p.id, "not_required");
    expect(skipped.closedTaskIds).toHaveLength(1);
    const [cancelled] = await db.select().from(task).where(eq(task.permitId, p.id));
    expect(cancelled?.status).toBe("cancelled");
  });

  it("allows staff to change status but only owner/manager to archive; field is forbidden", async () => {
    const p = await newPermit();
    const staff = await createActor("staff");
    const field = await createActor("field");
    await setPermitStatus(staff, p.id, "preparing");
    await expect(archivePermit(staff, p.id)).rejects.toSatisfy(isForbidden);
    await expect(setPermitStatus(field, p.id, "applied")).rejects.toSatisfy(isForbidden);
    await expect(updatePermit(field, p.id, { notes: "x" })).rejects.toSatisfy(isForbidden);
    await expect(
      createPermit(field, {
        venueId: cat.venue.id,
        category: "city",
        permitType: "other",
        title: "x",
        season: null,
        applyBy: null,
      }),
    ).rejects.toSatisfy(isForbidden);

    expect((await archivePermit(owner, p.id)).title).toBe("Marktgenehmigung");
    await expect(setPermitStatus(owner, p.id, "applied")).rejects.toMatchObject({
      code: "not_found",
    });
    await restorePermit(owner, p.id);
    expect((await setPermitStatus(owner, p.id, "applied")).changed).toBe(true);
  });
});

describe("editing a permit", () => {
  async function newPermit() {
    await requirement({ submissionWindowStartMd: null, submissionWindowEndMd: null });
    await generate("2027-05-02");
    const [p] = await db.select().from(permit);
    if (!p) throw new Error("no permit");
    return p;
  }

  it("saves fields, audits the diff and returns the previous values for undo", async () => {
    const p = await newPermit();
    const result = await updatePermit(owner, p.id, {
      referenceNo: "  OA-2027-1  ",
      validFrom: "2027-01-01",
      validUntil: "2027-12-31",
      deliverablesReceived: { stickers: 100 },
      notes: "Rückruf Frau Meier",
    });
    expect(result.changed).toBe(true);
    expect(result.previous).toMatchObject({ referenceNo: null, validFrom: null, notes: null });
    const [row] = await db.select().from(permit).where(eq(permit.id, p.id));
    expect(row).toMatchObject({
      referenceNo: "OA-2027-1",
      validUntil: "2027-12-31",
      deliverablesReceived: { stickers: 100 },
    });
    const [entry] = await db.select().from(auditLog).where(eq(auditLog.action, "permit.update"));
    expect(entry?.diff).toMatchObject({
      changes: { referenceNo: { from: null, to: "OA-2027-1" } },
    });

    expect((await updatePermit(owner, p.id, { referenceNo: "OA-2027-1" })).changed).toBe(false);
    await updatePermit(owner, p.id, result.previous, { undo: true });
    const [back] = await db.select().from(permit).where(eq(permit.id, p.id));
    expect(back).toMatchObject({ referenceNo: null, validUntil: null, deliverablesReceived: {} });
  });

  it("validates input", async () => {
    const p = await newPermit();
    await expect(updatePermit(owner, p.id, { title: "  " })).rejects.toMatchObject({
      code: "invalid_title",
    });
    await expect(updatePermit(owner, p.id, { applyBy: "31.12.2026" })).rejects.toMatchObject({
      code: "invalid_date",
    });
    await expect(
      updatePermit(owner, p.id, { validFrom: "2027-02-01", validUntil: "2027-01-01" }),
    ).rejects.toMatchObject({ code: "invalid_period" });
    await expect(
      updatePermit(owner, p.id, { deliverablesReceived: { stickers: -1 } }),
    ).rejects.toMatchObject({ code: "invalid_deliverables" });
    await expect(
      updatePermit(owner, p.id, {
        responsibleStaffMemberId: "11111111-1111-4111-8111-111111111111",
      }),
    ).rejects.toBeInstanceOf(PermitInputError);
    await expect(
      updatePermit(owner, p.id, { authorityContactId: "not-a-uuid" }),
    ).rejects.toMatchObject({ code: "invalid_contact" });
  });

  it("moves the open task when apply-by changes and the assignee when the responsible person does", async () => {
    const p = await newPermit();
    await updatePermit(owner, p.id, {
      applyBy: "2027-03-01",
      responsibleStaffMemberId: cat.staff.ben.id,
    });
    const [t] = await db.select().from(task).where(eq(task.permitId, p.id));
    expect(t?.dueAt?.toISOString()).toBe("2027-03-01T22:59:00.000Z");
    expect(t?.assigneeId).toBe(cat.staff.ben.id);
  });

  it("turns conditions into tasks once, keeps them on edits, cancels removed ones", async () => {
    const p = await newPermit();
    await updatePermit(owner, p.id, {
      conditions: ["Schilder 24 Stunden vorher aufstellen", "Standrohr zurückgeben"],
      responsibleStaffMemberId: cat.staff.ben.id,
    });
    const conditionTasks = () =>
      db
        .select()
        .from(task)
        .where(and(eq(task.permitId, p.id), eq(task.source, "permit_condition")))
        .orderBy(asc(task.title));
    let rows = await conditionTasks();
    expect(rows.map((r) => r.title)).toEqual([
      "Schilder 24 Stunden vorher aufstellen",
      "Standrohr zurückgeben",
    ]);
    expect(rows[0]?.assigneeId).toBe(cat.staff.ben.id);
    // Due the day before the first upcoming event it covers (02.05.2027 → 01.05.2027).
    expect(rows[0]?.dueAt?.toISOString()).toBe("2027-05-01T21:59:00.000Z");

    // Saving again with one more and one fewer condition.
    await updatePermit(owner, p.id, {
      conditions: ["Standrohr zurückgeben", "Müll mitnehmen", "  Müll mitnehmen "],
    });
    rows = await conditionTasks();
    expect(rows.map((r) => [r.title, r.status])).toEqual([
      ["Müll mitnehmen", "todo"],
      ["Schilder 24 Stunden vorher aufstellen", "cancelled"],
      ["Standrohr zurückgeben", "todo"],
    ]);
  });
});

describe("events of a permit", () => {
  it("links, unlinks and marks single events as not required", async () => {
    const created = await createPermit(owner, {
      venueId: cat.venue.id,
      category: "external",
      permitType: "toilets",
      title: "Toiletten 2027",
      season: 2027,
      applyBy: "2027-03-01",
    });
    const ids = await generate("2027-05-02", "2027-06-06");
    expect((await linkEventsToPermit(owner, created.id, ids)).added).toBe(2);
    expect((await linkEventsToPermit(owner, created.id, ids)).added).toBe(0);
    await expect(linkEventsToPermit(owner, created.id, ["nope"])).rejects.toMatchObject({
      code: "invalid_event",
    });
    const [first] = ids;
    expect((await setEventPermitRequired(owner, created.id, first as string, false)).changed).toBe(
      true,
    );
    const [link] = await db
      .select()
      .from(eventPermit)
      .where(and(eq(eventPermit.permitId, created.id), eq(eventPermit.eventId, first as string)));
    expect(link?.required).toBe(false);
    expect((await unlinkEventFromPermit(owner, created.id, first as string)).removed).toBe(true);
    expect(
      await db.select().from(eventPermit).where(eq(eventPermit.permitId, created.id)),
    ).toHaveLength(1);
    // A cancelled event cannot be added.
    await db
      .update(event)
      .set({ status: "cancelled" })
      .where(eq(event.id, ids[1] as string));
    await expect(linkEventsToPermit(owner, created.id, [ids[1] as string])).rejects.toMatchObject({
      code: "invalid_event",
    });
  });

  it("an ad-hoc permit with apply-by gets its task; without it none", async () => {
    const withDate = await createPermit(owner, {
      venueId: cat.venue.id,
      category: "city",
      permitType: "other",
      title: "Sondergenehmigung",
      season: null,
      applyBy: "2027-02-01",
    });
    await createPermit(owner, {
      venueId: cat.venue.id,
      category: "city",
      permitType: "other",
      title: "Ohne Frist",
      season: null,
      applyBy: null,
    });
    const tasks = await db.select().from(task);
    expect(tasks).toHaveLength(1);
    expect(tasks[0]?.permitId).toBe(withDate.id);
  });
});

describe("auto-confirmation of planned events", () => {
  const statusOf = async (id: string) =>
    (await db.select({ status: event.status }).from(event).where(eq(event.id, id)))[0]?.status;
  const autoAudit = async () =>
    (await db.select().from(auditLog).where(eq(auditLog.action, "event.status"))).filter(
      (a) => (a.diff as { auto?: boolean }).auto === true,
    );
  const permitOf = async (title: string) =>
    (await db.select().from(permit).where(eq(permit.title, title)))[0]?.id ?? "";

  it("confirms the event when its last required permit is granted (audit + notification)", async () => {
    await requirement();
    const [id] = await generate("2027-05-02");
    const permitId = (await db.select().from(permit))[0]?.id ?? "";
    expect(await statusOf(id ?? "")).toBe("planned");

    await setPermitStatus(owner, permitId, "granted");

    expect(await statusOf(id ?? "")).toBe("confirmed");
    const entries = await autoAudit();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      actorId: owner.id,
      entityType: "event",
      entityId: id,
      diff: {
        from: "planned",
        to: "confirmed",
        auto: true,
        reason: "alle Genehmigungen erteilt",
        source: "permit_status",
      },
    });
    const notes = (await db.select().from(notification)).filter(
      (n) => n.reason === "event_confirmed",
    );
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({
      recipientStaffMemberId: cat.staff.anna.id,
      subjectType: "event",
      subjectId: id,
      link: `/veranstaltungen/${id}/genehmigungen`,
    });
  });

  it("stays planned while one of two required permits is still open", async () => {
    await requirement();
    await requirement({ title: "Sondernutzung", permitType: "other" });
    const [id] = await generate("2027-05-02");
    await setPermitStatus(owner, await permitOf("Marktgenehmigung"), "granted");
    expect(await statusOf(id ?? "")).toBe("planned");
    expect(await autoAudit()).toHaveLength(0);

    await setPermitStatus(owner, await permitOf("Sondernutzung"), "granted");
    expect(await statusOf(id ?? "")).toBe("confirmed");
  });

  it("leaves an event without any required permit planned", async () => {
    const [id] = await generate("2027-05-02");
    expect(await statusOf(id ?? "")).toBe("planned");
    const other = await createPermit(owner, {
      venueId: cat.venue.id,
      category: "city",
      permitType: "other",
      title: "Nicht verknüpft",
      season: 2027,
      applyBy: null,
    });
    await setPermitStatus(owner, other.id, "granted");
    expect(await statusOf(id ?? "")).toBe("planned");
    // Once linked and granted it is a required permit and confirms; "not needed" removes it again.
    await linkEventsToPermit(owner, other.id, [id ?? ""]);
    expect(await statusOf(id ?? "")).toBe("confirmed");
    await db
      .update(event)
      .set({ status: "planned" })
      .where(eq(event.id, id ?? ""));
    await setEventPermitRequired(owner, other.id, id ?? "", false);
    expect(await statusOf(id ?? "")).toBe("planned");
  });

  it("does not touch draft or cancelled events", async () => {
    await requirement();
    const [draftId, cancelledId] = await generate("2027-05-02", "2027-06-06");
    await changeEventStatus(owner, draftId ?? "", "draft");
    await changeEventStatus(owner, cancelledId ?? "", "cancelled", "Regen");
    await setPermitStatus(owner, (await db.select().from(permit))[0]?.id ?? "", "granted");
    expect(await statusOf(draftId ?? "")).toBe("draft");
    expect(await statusOf(cancelledId ?? "")).toBe("cancelled");
    expect(await autoAudit()).toHaveLength(0);
  });

  it("never moves a confirmed event back when the permit is withdrawn later", async () => {
    await requirement();
    const [id] = await generate("2027-05-02");
    const permitId = (await db.select().from(permit))[0]?.id ?? "";
    await setPermitStatus(owner, permitId, "granted");
    await setPermitStatus(owner, permitId, "applied");
    expect(await statusOf(id ?? "")).toBe("confirmed");
  });

  it("confirms the event of a granted permit that is linked afterwards", async () => {
    const [id] = await generate("2027-05-02");
    const created = await createPermit(owner, {
      venueId: cat.venue.id,
      category: "city",
      permitType: "other",
      title: "Vorab erteilt",
      season: 2027,
      applyBy: null,
    });
    await setPermitStatus(owner, created.id, "granted");
    await linkEventsToPermit(owner, created.id, [id ?? ""]);
    expect(await statusOf(id ?? "")).toBe("confirmed");
    expect((await autoAudit())[0]?.diff).toMatchObject({ source: "permit_link" });
  });

  it("creates a new event as confirmed right away when an existing permit covers it", async () => {
    await requirement();
    await generate("2027-05-02");
    await setPermitStatus(owner, (await db.select().from(permit))[0]?.id ?? "", "granted");
    await db.delete(notification);
    await db.delete(auditLog);

    const [second] = await generate("2027-06-06");
    expect(await statusOf(second ?? "")).toBe("confirmed");
    const links = await db
      .select()
      .from(eventPermit)
      .where(eq(eventPermit.eventId, second ?? ""));
    expect(links).toHaveLength(1);
    expect(await db.select().from(permit)).toHaveLength(1); // linked, no second application
    expect((await autoAudit())[0]).toMatchObject({
      entityId: second,
      diff: { auto: true, source: "logbook_fill" },
    });
    // The generation can still be undone for it.
    expect(await undoGeneratedEvents(owner, [second ?? ""])).toBe(1);
  });
});
