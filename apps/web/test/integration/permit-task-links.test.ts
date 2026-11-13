import {
  auditLog,
  dutyRole,
  event,
  eventPermit,
  eventPreset,
  permit,
  permitRequirement,
  task,
} from "@marktwerk/db/schema";
import { and, eq, ne } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { createEventsFromPreset } from "@/server/services/events";
import { applyRequirementsToUpcomingEvents } from "@/server/services/permit-requirements";
import {
  linkEventsToPermit,
  linkPermitTasks,
  restorePermitStatus,
  setPermitStatus,
} from "@/server/services/permits";
import { PERMIT_SHARED_REASON, restoreTask, setTaskStatus } from "@/server/services/tasks";
import { applyTemplateVersion } from "@/server/services/template-propagation";
import { createDraft, publishDraft, updateTemplateItem } from "@/server/services/templates";
import { createActor, resetDatabase, seedCatalogue } from "../helpers/fixtures";
import { baseItem, seedPublishedTemplate } from "../helpers/templates";

/*
 * Template tasks that apply for a permit (template_item.permit_type, UX pass 2026-10-22): they are linked
 * to the event's permit of that type, done when it is applied for / granted, and the logbook fill does not
 * add a second "beantragen" task for them.
 */

let cat: Awaited<ReturnType<typeof seedCatalogue>>;
let owner: Awaited<ReturnType<typeof createActor>>;
let templateId: string;

const MARKT = "Marktgenehmigung bei der Stadt beantragen";
const PRUEFEN = "Standort prüfen";

beforeEach(async () => {
  await resetDatabase();
  cat = await seedCatalogue();
  owner = await createActor("owner");
  await db.insert(dutyRole).values({ key: "permits", nameDe: "Genehmigungen", nameEn: "Permits" });
  await db
    .update(eventPreset)
    .set({ defaultDuties: { permits: cat.staff.anna.id } })
    .where(eq(eventPreset.id, cat.presets.flea.id));
  ({ templateId } = await seedPublishedTemplate(
    owner,
    [
      baseItem({
        title: MARKT,
        category: "permits",
        offsetDays: -120,
        permitType: "market_permit",
      }),
      // Only checks something: stays unlinked.
      baseItem({ title: PRUEFEN, category: "permits", offsetDays: -100 }),
    ],
    { presetIds: [cat.presets.flea.id] },
  ));
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
      permitType: "market_permit",
      title: "Marktgenehmigung",
      cadence: "per_season",
      leadTimeDays: 120,
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

const taskTitled = async (eventId: string, title: string) => {
  const [row] = await db
    .select()
    .from(task)
    .where(and(eq(task.eventId, eventId), eq(task.title, title)));
  if (!row) throw new Error(`no task ${title}`);
  return row;
};

describe("creating events", () => {
  it("links the template task to the new permit and adds no duplicate permit task", async () => {
    await requirement();
    const [id] = await generate("2027-05-02");
    const [p] = await db.select().from(permit);
    const linked = await taskTitled(id as string, MARKT);
    expect(linked).toMatchObject({ permitId: p?.id, source: "template", status: "todo" });
    expect(await taskTitled(id as string, PRUEFEN)).toMatchObject({ permitId: null });
    // The fill created the permit but not its own "beantragen" task: the template covers that work.
    expect(await db.select().from(task).where(eq(task.source, "permit"))).toHaveLength(0);
  });

  it("still creates its own permit task when no template task covers the permit", async () => {
    await requirement({ permitType: "water", title: "Wasserentnahme" });
    await generate("2027-05-02");
    const own = await db.select().from(task).where(eq(task.source, "permit"));
    expect(own.map((t) => t.title)).toEqual(["Wasserentnahme beantragen"]);
  });

  it("completes the task at creation when the permit is already granted", async () => {
    const req = await requirement();
    await db.insert(permit).values({
      requirementId: req.id,
      venueId: cat.venue.id,
      season: 2027,
      category: "city",
      permitType: "market_permit",
      title: "Marktgenehmigung",
      status: "granted",
      grantedAt: "2026-12-01",
      validFrom: "2027-01-01",
      validUntil: "2027-12-31",
    });
    const [id] = await generate("2027-05-02");
    const done = await taskTitled(id as string, MARKT);
    expect(done.status).toBe("done");
    expect(done.completedAt).not.toBeNull();
    expect(done.permitId).not.toBeNull();
    // The check task stays open.
    expect((await taskTitled(id as string, PRUEFEN)).status).toBe("todo");
    const [entry] = await db.select().from(auditLog).where(eq(auditLog.entityId, done.id));
    expect(entry).toMatchObject({
      action: "task.status",
      diff: { from: "todo", to: "done", auto: true, reason: "Genehmigung beantragt/erteilt" },
    });
    expect(await db.select().from(task).where(eq(task.source, "permit"))).toHaveLength(0);
  });
});

describe("one apply task per permit covering several events (Fahrplan 18)", () => {
  const SEVEN = [
    "2027-04-04",
    "2027-05-02",
    "2027-06-06",
    "2027-07-04",
    "2027-08-01",
    "2027-09-05",
    "2027-10-03",
  ];
  /** Apply tasks of a permit that are not deleted. */
  const applyTasks = (permitId: string) =>
    db
      .select()
      .from(task)
      .where(and(eq(task.permitId, permitId), ne(task.status, "cancelled")));

  it("a season permit covering 7 markets creates 1 apply task, on the first market", async () => {
    await requirement();
    await generate(...SEVEN.slice().reverse());
    const permits = await db.select().from(permit);
    expect(permits).toHaveLength(1);
    const p = permits[0] as typeof permit.$inferSelect;
    expect(await db.select().from(eventPermit)).toHaveLength(7);

    const tasks = await applyTasks(p.id);
    expect(tasks).toHaveLength(1);
    const [first] = await db.select().from(event).where(eq(event.startsOn, "2027-04-04"));
    const firstEvent = first?.id as string;
    expect(tasks[0]).toMatchObject({ title: MARKT, eventId: firstEvent, status: "todo" });

    // The other six markets' template tasks are deleted (cancelled), audited and linked for the record.
    const removed = await db
      .select()
      .from(task)
      .where(and(eq(task.title, MARKT), eq(task.status, "cancelled")));
    expect(removed).toHaveLength(6);
    expect(removed.every((t) => t.permitId === p.id && t.eventId !== firstEvent)).toBe(true);
    const [entry] = await db
      .select()
      .from(auditLog)
      .where(
        and(eq(auditLog.entityId, removed[0]?.id as string), eq(auditLog.action, "task.delete")),
      );
    expect(entry?.diff).toMatchObject({ auto: true, reason: PERMIT_SHARED_REASON, permitId: p.id });
    // No own "beantragen" task on top, and the check items stay on every market.
    expect(await db.select().from(task).where(eq(task.source, "permit"))).toHaveLength(0);
    expect(
      await db
        .select()
        .from(task)
        .where(and(eq(task.title, PRUEFEN), eq(task.status, "todo"))),
    ).toHaveLength(7);

    // Applying for it closes the one task.
    const applied = await setPermitStatus(owner, p.id, "applied");
    expect(applied.closedTaskIds).toEqual([tasks[0]?.id]);
  });

  it("per_event permits keep one apply task per event", async () => {
    await requirement({ cadence: "per_event" });
    await generate(...SEVEN.slice(0, 3));
    const permits = await db.select().from(permit);
    expect(permits).toHaveLength(3);
    for (const p of permits) expect(await applyTasks(p.id)).toHaveLength(1);
    expect(await db.select().from(task).where(eq(task.status, "cancelled"))).toHaveLength(0);
  });

  it("a season permit without a template task gets its own one task, not one per market", async () => {
    await requirement({ permitType: "water", title: "Wasserentnahme" });
    await generate(...SEVEN);
    const [p] = await db.select().from(permit);
    const tasks = await applyTasks(p?.id as string);
    expect(tasks.map((t) => [t.title, t.source, t.eventId])).toEqual([
      ["Wasserentnahme beantragen", "permit", null],
    ]);
  });

  it("markets added later join the season permit without a second apply task", async () => {
    await requirement({ cadence: "per_year" });
    const [june] = await generate("2027-06-06");
    const [p] = await db.select().from(permit);
    const [kept] = await applyTasks(p?.id as string);
    expect(kept?.eventId).toBe(june);
    // An earlier and a later market: both link to the permit, the existing task stays the one.
    await generate("2027-04-04", "2027-09-05");
    expect((await applyTasks(p?.id as string)).map((t) => t.id)).toEqual([kept?.id]);
    expect(await db.select().from(permit)).toHaveLength(1);
  });

  it("a restored duplicate stays (the person's choice); linking again leaves it alone", async () => {
    await requirement();
    const ids = await generate("2027-04-04", "2027-05-02");
    const [p] = await db.select().from(permit);
    const second = await taskTitled(ids[1] as string, MARKT);
    expect(second.status).toBe("cancelled");
    await restoreTask(owner, second.id);
    expect((await taskTitled(ids[1] as string, MARKT)).status).toBe("todo");
    const again = await db.transaction((tx) => linkPermitTasks(tx, ids, owner));
    expect(again.cancelledTaskIds).toEqual([]);
    expect(await applyTasks(p?.id as string)).toHaveLength(2);
  });

  it("a requirement added later keeps the tasks somebody worked on and removes untouched ones", async () => {
    const ids = await generate("2027-04-04", "2027-05-02", "2027-06-06", "2027-07-04");
    const [april, may, june, july] = ids as [string, string, string, string];
    await setTaskStatus(owner, (await taskTitled(may, MARKT)).id, "in_progress");
    await setTaskStatus(owner, (await taskTitled(june, MARKT)).id, "done");
    await requirement();
    await applyRequirementsToUpcomingEvents(owner, cat.venue.id);
    const [p] = await db.select().from(permit);
    const byEvent = new Map(
      (await db.select().from(task).where(eq(task.title, MARKT))).map((t) => [t.eventId, t]),
    );
    expect(byEvent.get(may)).toMatchObject({ status: "in_progress", permitId: p?.id });
    expect(byEvent.get(june)).toMatchObject({ status: "done", permitId: p?.id });
    expect(byEvent.get(april)?.status).toBe("cancelled");
    expect(byEvent.get(july)?.status).toBe("cancelled");
  });

  it("two items of one template that both apply for the permit stay on the carrier event", async () => {
    const draft = await createDraft(owner, templateId);
    const [id] = await generate("2027-05-02");
    const check = await taskTitled(id as string, PRUEFEN);
    await updateTemplateItem(owner, draft.versionId, check.templateStableKey as string, {
      ...baseItem({ title: PRUEFEN, category: "permits", offsetDays: -100 }),
      permitType: "market_permit",
    });
    await publishDraft(owner, draft.versionId, "Version 2");
    await requirement();
    const ids = await generate("2027-06-06", "2027-07-04");
    const [p] = await db.select().from(permit);
    // The first market of the batch carries both items, the second one has none left.
    const open = await applyTasks(p?.id as string);
    expect(open.map((t) => [t.eventId, t.title]).sort()).toEqual(
      [
        [ids[0], MARKT],
        [ids[0], PRUEFEN],
      ].sort(),
    );
  });
});

describe("permit status", () => {
  it("applied completes the linked template task, granted keeps it done, undo reopens it", async () => {
    await requirement();
    const [id] = await generate("2027-05-02");
    const [p] = await db.select().from(permit);
    const permitId = p?.id as string;

    const applied = await setPermitStatus(owner, permitId, "applied");
    const linked = await taskTitled(id as string, MARKT);
    expect(linked.status).toBe("done");
    expect(applied.closedTaskIds).toContain(linked.id);
    expect((await taskTitled(id as string, PRUEFEN)).status).toBe("todo");

    await restorePermitStatus(owner, permitId, "applied", applied.previous, applied.closedTaskIds);
    expect((await taskTitled(id as string, MARKT)).status).toBe("todo");

    const granted = await setPermitStatus(owner, permitId, "granted");
    expect((await taskTitled(id as string, MARKT)).status).toBe("done");
    expect(granted.closedTaskIds).toContain(linked.id);
  });

  it("not_required leaves the template task alone", async () => {
    await requirement();
    const [id] = await generate("2027-05-02");
    const [p] = await db.select().from(permit);
    await setPermitStatus(owner, p?.id as string, "not_required");
    expect((await taskTitled(id as string, MARKT)).status).toBe("todo");
  });

  it("completing a template task that needs evidence is left to the person", async () => {
    await requirement();
    const [id] = await generate("2027-05-02");
    const [p] = await db.select().from(permit);
    await db
      .update(task)
      .set({ requiresPhoto: true })
      .where(and(eq(task.eventId, id as string), eq(task.title, MARKT)));
    await setPermitStatus(owner, p?.id as string, "granted");
    expect((await taskTitled(id as string, MARKT)).status).toBe("todo");
  });
});

describe("linking permits to existing events", () => {
  it("linkEventsToPermit links the template task and completes it for a held permit", async () => {
    const [id] = await generate("2027-05-02");
    expect((await taskTitled(id as string, MARKT)).permitId).toBeNull();
    const [p] = await db
      .insert(permit)
      .values({
        venueId: cat.venue.id,
        category: "city",
        permitType: "market_permit",
        title: "Von Hand",
        status: "granted",
      })
      .returning();
    await linkEventsToPermit(owner, p?.id as string, [id as string]);
    const t = await taskTitled(id as string, MARKT);
    expect(t).toMatchObject({ permitId: p?.id, status: "done" });
  });

  it("prefers the permit that is required and further along; is idempotent", async () => {
    const [id] = await generate("2027-05-02");
    const [open, held] = await db
      .insert(permit)
      .values([
        {
          venueId: cat.venue.id,
          category: "city" as const,
          permitType: "market_permit" as const,
          title: "Offen",
          status: "not_started" as const,
        },
        {
          venueId: cat.venue.id,
          category: "city" as const,
          permitType: "market_permit" as const,
          title: "Erteilt",
          status: "granted" as const,
        },
      ])
      .returning();
    await db.insert(eventPermit).values([
      { eventId: id as string, permitId: open?.id as string },
      { eventId: id as string, permitId: held?.id as string },
    ]);
    const first = await db.transaction((tx) => linkPermitTasks(tx, [id as string], owner));
    expect(first.linked).toBe(1);
    expect((await taskTitled(id as string, MARKT)).permitId).toBe(held?.id);
    const again = await db.transaction((tx) => linkPermitTasks(tx, [id as string], owner));
    expect(again).toEqual({ linked: 0, completedTaskIds: [], cancelledTaskIds: [] });
  });
});

describe("template propagation", () => {
  it("a new version that names a permit type links and completes the existing task", async () => {
    // An event made from version 1 (no permit requirement yet, so nothing is linked).
    const [id] = await generate("2027-05-02");
    const check = await taskTitled(id as string, PRUEFEN);
    expect(check.permitId).toBeNull();
    const req = await requirement();
    const [p] = await db
      .insert(permit)
      .values({
        requirementId: req.id,
        venueId: cat.venue.id,
        season: 2027,
        category: "city",
        permitType: "market_permit",
        title: "Marktgenehmigung",
        status: "applied",
      })
      .returning();
    await db.insert(eventPermit).values({ eventId: id as string, permitId: p?.id as string });

    // Version 2: the check item now belongs to the market permit.
    const draft = await createDraft(owner, templateId);
    await updateTemplateItem(owner, draft.versionId, check.templateStableKey as string, {
      ...baseItem({ title: PRUEFEN, category: "permits", offsetDays: -100 }),
      permitType: "market_permit",
    });
    await publishDraft(owner, draft.versionId, "Version 2");
    const result = await applyTemplateVersion(owner, templateId, [id as string]);
    expect(result.updated).toBe(1);
    expect(await taskTitled(id as string, PRUEFEN)).toMatchObject({
      permitId: p?.id,
      status: "done",
    });
  });
});
