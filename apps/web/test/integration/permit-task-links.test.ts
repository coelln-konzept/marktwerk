import {
  dutyRole,
  eventPermit,
  eventPreset,
  permit,
  permitRequirement,
  task,
} from "@marktwerk/db/schema";
import { and, eq, ne } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/server/db";
import { createEventsFromPreset } from "@/server/services/events";
import { applyRequirementsToUpcomingEvents } from "@/server/services/permit-requirements";
import {
  linkEventsToPermit,
  linkPermitTasks,
  restorePermitStatus,
  setPermitStatus,
} from "@/server/services/permits";
import { setTaskStatus } from "@/server/services/tasks";
import { applyTemplateVersion } from "@/server/services/template-propagation";
import { createDraft, publishDraft, updateTemplateItem } from "@/server/services/templates";
import { createActor, resetDatabase, seedCatalogue } from "../helpers/fixtures";
import { baseItem, seedPublishedTemplate } from "../helpers/templates";

/*
 * Template tasks that apply for a permit (template_item.permit_type, UX pass 2026-10-22): they are linked
 * to the event's per-date permit of that type, done when it is applied for / granted, and the logbook fill does
 * not add a second "beantragen" task for them. A permit covering several dates is one per Ort and season with its
 * own "beantragen" task; template tasks never apply for it (ADR 0024).
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
      cadence: "per_event",
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
  it("links the template task to the new per-date permit and adds no duplicate permit task", async () => {
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

  it("a date joining a granted season permit adds no task, and the template task stays unlinked", async () => {
    const req = await requirement({ cadence: "per_season" });
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
    expect(await db.select().from(eventPermit)).toHaveLength(1);
    expect(await taskTitled(id as string, MARKT)).toMatchObject({ permitId: null, status: "todo" });
    expect(await db.select().from(task).where(eq(task.source, "permit"))).toHaveLength(0);
  });
});

describe("one permit per Ort and season with its own apply task (ADR 0024)", () => {
  // A season permit's apply-by depends on whether its season has started (core `fillApplyBy`): fix the day.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-26T10:00:00+01:00"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

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

  it("a season permit covering 7 dates has exactly its own apply task; template tasks never apply for it", async () => {
    await requirement({ cadence: "per_season" });
    await generate(...SEVEN.slice().reverse());
    const permits = await db.select().from(permit);
    expect(permits).toHaveLength(1);
    const p = permits[0] as typeof permit.$inferSelect;
    expect(await db.select().from(eventPermit)).toHaveLength(7);

    const tasks = await applyTasks(p.id);
    expect(tasks.map((t) => [t.title, t.source, t.eventId])).toEqual([
      ["Marktgenehmigung beantragen", "permit", null],
    ]);
    // Due at apply-by (lead time before the season starts on 1 March, SAI8), end of the day in Berlin.
    expect(p.applyBy).toBe("2026-11-01");
    expect(tasks[0]?.dueAt?.toISOString()).toBe("2026-11-01T22:59:00.000Z");
    // Nothing is deleted: the template's items stay on every date, unlinked.
    expect(await db.select().from(task).where(eq(task.status, "cancelled"))).toHaveLength(0);
    const items = await db.select().from(task).where(eq(task.title, MARKT));
    expect(items).toHaveLength(7);
    expect(items.every((t) => t.permitId === null)).toBe(true);

    // Applying for it closes the one task.
    const applied = await setPermitStatus(owner, p.id, "applied");
    expect(applied.closedTaskIds).toEqual([tasks[0]?.id]);
  });

  it("per_event permits keep one apply task per event", async () => {
    await requirement();
    await generate(...SEVEN.slice(0, 3));
    const permits = await db.select().from(permit);
    expect(permits).toHaveLength(3);
    for (const p of permits) expect(await applyTasks(p.id)).toHaveLength(1);
    expect(await db.select().from(task).where(eq(task.status, "cancelled"))).toHaveLength(0);
  });

  it("dates added later join the season permit without a second apply task; one before 1 March moves its deadline", async () => {
    await requirement({ cadence: "per_year" });
    await generate("2027-06-06");
    const [p] = await db.select().from(permit);
    const [kept] = await applyTasks(p?.id as string);
    expect(kept).toMatchObject({ source: "permit", eventId: null });
    expect(p?.applyBy).toBe("2026-11-01");
    await generate("2027-04-04", "2027-09-05");
    expect((await applyTasks(p?.id as string)).map((t) => t.id)).toEqual([kept?.id]);
    expect(await db.select().from(permit)).toHaveLength(1);
    expect((await db.select().from(permit))[0]?.applyBy).toBe("2026-11-01");
    await generate("2027-01-10");
    const [moved] = await db.select().from(permit);
    expect(moved?.applyBy).toBe("2026-09-12");
    const [task2] = await applyTasks(p?.id as string);
    expect(task2?.dueAt?.toISOString()).toBe("2026-09-12T21:59:00.000Z");
  });

  it("a season requirement added later gets its permit and own task; worked-on template tasks stay as they are", async () => {
    const ids = await generate("2027-04-04", "2027-05-02");
    const [april, may] = ids as [string, string];
    await setTaskStatus(owner, (await taskTitled(may, MARKT)).id, "in_progress");
    await requirement({ cadence: "per_season" });
    await applyRequirementsToUpcomingEvents(owner, cat.venue.id);
    const [p] = await db.select().from(permit);
    expect((await applyTasks(p?.id as string)).map((t) => t.source)).toEqual(["permit"]);
    expect(await taskTitled(april, MARKT)).toMatchObject({ status: "todo", permitId: null });
    expect(await taskTitled(may, MARKT)).toMatchObject({ status: "in_progress", permitId: null });
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
    expect(again).toEqual({ linked: 0, completedTaskIds: [] });
  });
});

describe("one task applies for a permit, never two (ADR 0024)", () => {
  /** Tasks applying for a permit (not deleted). */
  const applying = (permitId: string) =>
    db
      .select({ title: task.title, source: task.source })
      .from(task)
      .where(and(eq(task.permitId, permitId), ne(task.status, "cancelled")));

  it("a template item that names a per-date permit's type later leaves the permit's own task the only one", async () => {
    // Version 1 names no water item: the per-date Standrohr permit gets its own "… beantragen" task.
    await requirement({ permitType: "water", title: "Wasserentnahme" });
    const [id] = await generate("2027-05-02");
    const [p] = await db.select().from(permit);
    expect(await applying(p?.id as string)).toEqual([
      { title: "Wasserentnahme beantragen", source: "permit" },
    ]);

    // Version 2: the check item now names the water permit; propagating it must not add a second applying task.
    const check = await taskTitled(id as string, PRUEFEN);
    const draft = await createDraft(owner, templateId);
    await updateTemplateItem(owner, draft.versionId, check.templateStableKey as string, {
      ...baseItem({ title: PRUEFEN, category: "permits", offsetDays: -100 }),
      permitType: "water",
    });
    await publishDraft(owner, draft.versionId, "Version 2");
    await applyTemplateVersion(owner, templateId, [id as string]);
    expect(await taskTitled(id as string, PRUEFEN)).toMatchObject({
      permitId: null,
      status: "todo",
    });
    expect(await applying(p?.id as string)).toEqual([
      { title: "Wasserentnahme beantragen", source: "permit" },
    ]);
  });

  it("a hand-made permit linked to two dates gets one applying task: the earliest due", async () => {
    const [may, june] = await generate("2027-05-02", "2027-06-06");
    const [p] = await db
      .insert(permit)
      .values({
        venueId: cat.venue.id,
        category: "city",
        permitType: "market_permit",
        title: "Von Hand",
        status: "not_started",
      })
      .returning();
    await linkEventsToPermit(owner, p?.id as string, [june as string, may as string]);
    expect(await applying(p?.id as string)).toEqual([{ title: MARKT, source: "template" }]);
    expect((await taskTitled(may as string, MARKT)).permitId).toBe(p?.id);
    expect((await taskTitled(june as string, MARKT)).permitId).toBeNull();
    // Running the link again changes nothing.
    const again = await db.transaction((tx) =>
      linkPermitTasks(tx, [may as string, june as string], owner),
    );
    expect(again.linked).toBe(0);
  });

  it("a season permit never gets a template task, whatever the template names", async () => {
    await requirement({ cadence: "per_season" });
    await generate("2027-04-04", "2027-05-02", "2027-06-06");
    const [p] = await db.select().from(permit);
    expect(await applying(p?.id as string)).toEqual([
      { title: "Marktgenehmigung beantragen", source: "permit" },
    ]);
    // The template's item stays a plain task on every date.
    const items = await db.select().from(task).where(eq(task.title, MARKT));
    expect(items).toHaveLength(3);
    for (const t of items) expect(t.permitId).toBeNull();
  });
});

describe("template propagation", () => {
  it("a new version that names a permit type links and completes the existing task", async () => {
    // An event made from version 1 (no permit requirement yet, so nothing is linked).
    const [id] = await generate("2027-05-02");
    const check = await taskTitled(id as string, PRUEFEN);
    expect(check.permitId).toBeNull();
    // A per-date water permit (no other item names its type, so the check item is the one to apply for it).
    const req = await requirement({ permitType: "water", title: "Wasserentnahme" });
    const [p] = await db
      .insert(permit)
      .values({
        requirementId: req.id,
        venueId: cat.venue.id,
        season: 2027,
        category: "external",
        permitType: "water",
        title: "Wasserentnahme",
        status: "applied",
      })
      .returning();
    await db.insert(eventPermit).values({ eventId: id as string, permitId: p?.id as string });

    // Version 2: the check item now belongs to the water permit.
    const draft = await createDraft(owner, templateId);
    await updateTemplateItem(owner, draft.versionId, check.templateStableKey as string, {
      ...baseItem({ title: PRUEFEN, category: "permits", offsetDays: -100 }),
      permitType: "water",
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
