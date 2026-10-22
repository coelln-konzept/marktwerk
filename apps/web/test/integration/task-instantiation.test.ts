import {
  auditLog,
  checklist,
  settings,
  task,
  taskCheckItem,
  taskDependency,
} from "@marktwerk/db/schema";
import { and, asc, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { createEventsFromPreset, createManualEvent } from "@/server/services/events";
import { instantiateTemplatesForEvents } from "@/server/services/task-instantiation";
import {
  addTemplateItem,
  createTemplate,
  setTemplateArchived,
  setTemplatePresets,
} from "@/server/services/templates";
import { createActor, resetDatabase, seedCatalogue } from "../helpers/fixtures";
import { baseItem, flohmarktItems, seedPublishedTemplate } from "../helpers/templates";

let cat: Awaited<ReturnType<typeof seedCatalogue>>;
let owner: Awaited<ReturnType<typeof createActor>>;
let templateId: string;
let versionId: string;

beforeEach(async () => {
  await resetDatabase();
  cat = await seedCatalogue();
  owner = await createActor("owner");
  ({ templateId, versionId } = await seedPublishedTemplate(owner, flohmarktItems(cat), {
    presetIds: [cat.presets.flea.id],
  }));
});

afterAll(async () => {
  await db.$client.end();
});

const tasksOf = (eventId: string) =>
  db.select().from(task).where(eq(task.eventId, eventId)).orderBy(asc(task.boardSort));

const byKey = async (eventId: string) =>
  new Map((await tasksOf(eventId)).map((t) => [t.templateStableKey, t]));

// Sa 13.03.2027: one day, so setup_day = event_day. Winter time (clocks change on 28.03.).
const EVENT_DAY = "2027-03-13";

async function oneEvent(presetId = cat.presets.flea.id, day = EVENT_DAY) {
  const [created] = await createEventsFromPreset(owner, presetId, [day]);
  if (!created) throw new Error("no event");
  return created.id;
}

describe("instantiation on event creation", () => {
  it("creates one checklist from the linked published version, with the applicable items as tasks", async () => {
    const eventId = await oneEvent();
    const lists = await db.select().from(checklist).where(eq(checklist.eventId, eventId));
    expect(lists).toHaveLength(1);
    expect(lists[0]).toMatchObject({
      templateId,
      templateVersionId: versionId,
      name: "Ablauf Flohmarkt",
      permitId: null,
    });
    const tasks = await byKey(eventId);
    // The Stadtfest-only item does not apply to a flea market.
    expect([...tasks.keys()]).toEqual([
      "marktgenehmigung_beantragen",
      "plakate_aufhaengen",
      "aufbau",
      "abrechnung",
    ]);
    for (const t of tasks.values()) {
      expect(t).toMatchObject({
        checklistId: lists[0]?.id,
        source: "template",
        status: "todo",
        customized: false,
        removedFromTemplate: false,
        dueOverridden: false,
        assigneeOverridden: false,
      });
      expect(t.templateItemId).not.toBeNull();
    }
  });

  it("copies title, category, priority, estimate, evidence and the schedule rule from the item", async () => {
    const tasks = await byKey(await oneEvent());
    expect(tasks.get("marktgenehmigung_beantragen")).toMatchObject({
      title: "Marktgenehmigung beantragen",
      phase: "pre",
      category: "permits",
      priority: "high",
      estimateMinutes: 30,
      anchorKey: "event_day",
      offsetDays: -60,
      dayMode: "calendar",
      requiresPhoto: false,
      isKey: true,
    });
    expect(tasks.get("plakate_aufhaengen")).toMatchObject({
      isKey: false,
      category: "communication",
      dayMode: "business",
      requiresPhoto: true,
    });
    expect(tasks.get("aufbau")).toMatchObject({
      phase: "live",
      anchorKey: "setup_day",
      offsetDays: 0,
      estimateMinutes: 120,
    });
    // Template order is kept as the board order.
    expect([...tasks.values()].map((t) => t.boardSort)).toEqual([0, 1, 2, 3]);
  });

  it("computes due dates: calendar days, business days (NRW) and the item's own time, Europe/Berlin", async () => {
    const tasks = await byKey(await oneEvent());
    // T-60 calendar → 12.01.2027, default time 09:00 CET = 08:00Z.
    expect(tasks.get("marktgenehmigung_beantragen")?.dueAt?.toISOString()).toBe(
      "2027-01-12T08:00:00.000Z",
    );
    // T-14 business days before Saturday 13.03. → Tuesday 23.02., 17:30 CET = 16:30Z.
    expect(tasks.get("plakate_aufhaengen")?.dueAt?.toISOString()).toBe("2027-02-23T16:30:00.000Z");
    // setup_day = event day for a one-day market.
    expect(tasks.get("aufbau")?.dueAt?.toISOString()).toBe("2027-03-13T08:00:00.000Z");
    // T+3 business days after Saturday → Wednesday 17.03.
    expect(tasks.get("abrechnung")?.dueAt?.toISOString()).toBe("2027-03-17T08:00:00.000Z");
  });

  it("keeps the wall-clock time across the switch to summer time", async () => {
    // Event on 10.04.2027; T-14 is 27.03. (winter time), T-1 is 09.04. (summer time).
    await seedPublishedTemplate(
      owner,
      [
        baseItem({ title: "Vor der Umstellung", offsetDays: -14 }),
        baseItem({ title: "Nach der Umstellung", offsetDays: -1 }),
      ],
      { name: "Sommerzeit", presetIds: [cat.presets.flea.id] },
    );
    const eventId = await oneEvent(cat.presets.flea.id, "2027-04-10");
    const tasks = await byKey(eventId);
    // 27.03.2027 09:00 CET = 08:00Z; 09.04.2027 09:00 CEST = 07:00Z.
    expect(tasks.get("vor_der_umstellung")?.dueAt?.toISOString()).toBe("2027-03-27T08:00:00.000Z");
    expect(tasks.get("nach_der_umstellung")?.dueAt?.toISOString()).toBe("2027-04-09T07:00:00.000Z");
  });

  it("uses the company's default due time from the settings", async () => {
    await db.insert(settings).values({ id: 1, defaultDueTime: "08:30" });
    const tasks = await byKey(await oneEvent());
    expect(tasks.get("marktgenehmigung_beantragen")?.dueAt?.toISOString()).toBe(
      "2027-01-12T07:30:00.000Z",
    );
    // An item's own time wins.
    expect(tasks.get("plakate_aufhaengen")?.dueAt?.toISOString()).toBe("2027-02-23T16:30:00.000Z");
  });

  it("assigns by duty role from the event's team; roles nobody fills stay unassigned", async () => {
    const tasks = await byKey(await oneEvent());
    expect(tasks.get("marktgenehmigung_beantragen")).toMatchObject({
      dutyRoleId: cat.roles.lead.id,
      assigneeId: cat.staff.anna.id,
    });
    expect(tasks.get("plakate_aufhaengen")).toMatchObject({
      dutyRoleId: cat.roles.setup.id,
      assigneeId: cat.staff.ben.id,
    });
    expect(tasks.get("aufbau")).toMatchObject({ dutyRoleId: null, assigneeId: null });

    // The festival preset has no default team; link the template and look again.
    await setTemplatePresets(owner, templateId, [cat.presets.flea.id, cat.presets.festival.id]);
    const festival = await byKey(await oneEvent(cat.presets.festival.id, "2027-05-07"));
    expect(festival.get("marktgenehmigung_beantragen")).toMatchObject({
      dutyRoleId: cat.roles.lead.id,
      assigneeId: null,
    });
  });

  it("creates check items and dependencies", async () => {
    const eventId = await oneEvent();
    const tasks = await byKey(eventId);
    const permit = tasks.get("marktgenehmigung_beantragen");
    const posters = tasks.get("plakate_aufhaengen");
    const steps = await db
      .select()
      .from(taskCheckItem)
      .where(eq(taskCheckItem.taskId, permit?.id ?? ""))
      .orderBy(asc(taskCheckItem.sort));
    expect(steps.map((s) => [s.title, s.done])).toEqual([
      ["Formular ausfüllen", false],
      ["Gebühr prüfen", false],
    ]);
    const deps = await db.select().from(taskDependency);
    expect(deps).toHaveLength(1);
    expect(deps[0]).toMatchObject({ taskId: posters?.id, dependsOnTaskId: permit?.id });
  });

  it("is idempotent: running it again changes nothing", async () => {
    const eventId = await oneEvent();
    const before = await tasksOf(eventId);
    const again = await db.transaction((tx) => instantiateTemplatesForEvents(tx, owner, [eventId]));
    expect(again).toEqual({ checklists: 0, tasks: 0 });
    expect(await tasksOf(eventId)).toHaveLength(before.length);
    expect(await db.select().from(checklist)).toHaveLength(1);
    expect(await db.select().from(taskCheckItem)).toHaveLength(2);
    expect(await db.select().from(taskDependency)).toHaveLength(1);
  });

  it("fills gaps without duplicating: a deleted task comes back, existing ones stay", async () => {
    const eventId = await oneEvent();
    const tasks = await byKey(eventId);
    await db.delete(task).where(eq(task.id, tasks.get("aufbau")?.id ?? ""));
    await db
      .update(task)
      .set({ title: "Von Hand geändert" })
      .where(eq(task.id, tasks.get("abrechnung")?.id ?? ""));
    const again = await db.transaction((tx) => instantiateTemplatesForEvents(tx, owner, [eventId]));
    expect(again).toEqual({ checklists: 0, tasks: 1 });
    const after = await byKey(eventId);
    expect(after.size).toBe(4);
    expect(after.get("abrechnung")?.title).toBe("Von Hand geändert");
  });

  it("makes one checklist per event of a run, and per linked template in the preset's order", async () => {
    const second = await seedPublishedTemplate(owner, [baseItem({ title: "Nachbereitung" })], {
      name: "Ablauf Nachbereitung",
      presetIds: [cat.presets.flea.id],
    });
    const created = await createEventsFromPreset(owner, cat.presets.flea.id, [
      "2027-03-13",
      "2027-04-10",
      "2027-05-08",
    ]);
    const lists = await db.select().from(checklist).orderBy(asc(checklist.sort));
    expect(lists).toHaveLength(6);
    for (const c of created) {
      const own = lists.filter((l) => l.eventId === c.id);
      expect(own.map((l) => [l.templateId, l.sort])).toEqual([
        [templateId, 0],
        [second.templateId, 1],
      ]);
    }
    expect((await db.select().from(task)).length).toBe(3 * (4 + 1));
  });

  it("leaves events without a preset, unpublished and archived templates alone", async () => {
    const manual = await createManualEvent(owner, {
      name: "Einzeltermin",
      eventTypeId: cat.type.id,
      venueId: cat.venue.id,
      durationDays: 1,
      times: cat.times,
      pricePerMCents: 1000,
      bookingFeeCents: 0,
      startsOn: EVENT_DAY,
    });
    expect(await tasksOf(manual.id)).toHaveLength(0);

    // Only a draft, linked to the festival preset: nothing to instantiate.
    const draftOnly = await createTemplate(owner, {
      name: "Nur Entwurf",
      description: null,
      eventTypeId: null,
    });
    await addTemplateItem(owner, draftOnly.versionId, baseItem({ title: "Entwurf" }));
    await setTemplatePresets(owner, draftOnly.id, [cat.presets.festival.id]);
    const festival = await oneEvent(cat.presets.festival.id, "2027-05-07");
    expect(await tasksOf(festival)).toHaveLength(0);

    // An archived template is skipped.
    await setTemplateArchived(owner, templateId, true);
    const flea = await oneEvent(cat.presets.flea.id, "2027-06-12");
    expect(await tasksOf(flea)).toHaveLength(0);
  });

  it("gives tasks with a missing anchor no due date, and honours conditions on the venue and type", async () => {
    const { templateId: t2 } = await seedPublishedTemplate(
      owner,
      [
        baseItem({ title: "Nach Entscheid", anchorKey: "permit_decision", offsetDays: 2 }),
        baseItem({ title: "Nur Flohmarkt", condition: { eventTypeKeys: ["flea"] } }),
        baseItem({ title: "Nur drinnen", condition: { venueKinds: ["indoor"] } }),
        baseItem({ title: "Nur im Messeplatz", condition: { venueIds: [cat.venue.id] } }),
      ],
      { name: "Bedingungen", presetIds: [cat.presets.festival.id] },
    );
    expect(t2).toBeTruthy();
    const eventId = await oneEvent(cat.presets.festival.id, "2027-05-07");
    const tasks = await byKey(eventId);
    expect([...tasks.keys()]).toEqual(["nach_entscheid", "nur_flohmarkt", "nur_im_messeplatz"]);
    expect(tasks.get("nach_entscheid")?.dueAt).toBeNull();
    expect(tasks.get("nach_entscheid")?.anchorKey).toBe("permit_decision");
  });

  it("audits every checklist and rolls back with a failing event creation", async () => {
    const eventId = await oneEvent();
    const [entry] = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.action, "checklist.create")));
    expect(entry).toMatchObject({ actorId: owner.id, entityType: "checklist" });
    expect(entry?.diff).toMatchObject({ eventId, templateId, version: 1, tasks: 4 });

    // The same transaction as the event: a failure after creation leaves neither events nor tasks.
    const before = (await db.select().from(task)).length;
    await expect(
      db.transaction(async (tx) => {
        const { instantiateEvents, presetTemplate } = await import("@/server/services/events");
        await instantiateEvents(
          tx,
          owner,
          await presetTemplate(cat.presets.flea.id),
          ["2027-07-10"],
          "preset",
        );
        throw new Error("abort");
      }),
    ).rejects.toThrow("abort");
    expect((await db.select().from(task)).length).toBe(before);
  });
});
