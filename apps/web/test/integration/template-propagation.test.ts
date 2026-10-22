import { auditLog, checklist, event, task, taskCheckItem } from "@marktwerk/db/schema";
import { and, asc, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { createEventsFromPreset } from "@/server/services/events";
import {
  applyTemplateVersion,
  previewTemplateApplication,
  TemplateApplyError,
} from "@/server/services/template-propagation";
import {
  addTemplateItem,
  createDraft,
  deleteTemplateItem,
  publishDraft,
  setTemplateArchived,
  setTemplatePresets,
  updateTemplateItem,
} from "@/server/services/templates";
import { createActor, resetDatabase, seedCatalogue } from "../helpers/fixtures";
import { baseItem, flohmarktItems, seedPublishedTemplate } from "../helpers/templates";

let cat: Awaited<ReturnType<typeof seedCatalogue>>;
let owner: Awaited<ReturnType<typeof createActor>>;
let templateId: string;
let items: ReturnType<typeof flohmarktItems>;
let e1: string; // 13.03.2027
let e2: string; // 10.04.2027
let e3: string; // 08.05.2027

beforeEach(async () => {
  await resetDatabase();
  cat = await seedCatalogue();
  owner = await createActor("owner");
  items = flohmarktItems(cat);
  ({ templateId } = await seedPublishedTemplate(owner, items, {
    presetIds: [cat.presets.flea.id],
  }));
  const created = await createEventsFromPreset(owner, cat.presets.flea.id, [
    "2027-03-13",
    "2027-04-10",
    "2027-05-08",
  ]);
  [e1, e2, e3] = created.map((c) => c.id) as [string, string, string];
});

afterAll(async () => {
  await db.$client.end();
});

const codeOf = async (promise: Promise<unknown>) => {
  try {
    await promise;
    return null;
  } catch (error) {
    return error instanceof TemplateApplyError ? error.code : error;
  }
};

const isForbidden = (error: unknown) =>
  String((error as { digest?: unknown })?.digest ?? "").includes("403");

const taskOf = async (eventId: string, key: string) => {
  const [row] = await db
    .select()
    .from(task)
    .where(and(eq(task.eventId, eventId), eq(task.templateStableKey, key)));
  return row;
};

const tasksOf = (eventId: string) =>
  db.select().from(task).where(eq(task.eventId, eventId)).orderBy(asc(task.boardSort));

/**
 * Version 2: the permit task is renamed and due earlier, "Abrechnung" is gone, "Aufbau" gets a duty
 * role, and "Foto der Fläche" is new (with check items).
 */
async function publishVersion2() {
  const draft = await createDraft(owner, templateId);
  await updateTemplateItem(owner, draft.versionId, "marktgenehmigung_beantragen", {
    ...(items[0] as (typeof items)[number]),
    title: "Marktgenehmigung früh beantragen",
    offsetDays: -90,
  });
  await updateTemplateItem(owner, draft.versionId, "aufbau", {
    ...(items[2] as (typeof items)[number]),
    dutyRoleId: cat.roles.lead.id,
    isKey: true,
  });
  await deleteTemplateItem(owner, draft.versionId, "abrechnung");
  await addTemplateItem(
    owner,
    draft.versionId,
    baseItem({ title: "Foto der Fläche", checkItems: ["Vorher", "Nachher"], offsetDays: 1 }),
  );
  await publishDraft(owner, draft.versionId, "Version 2");
  return draft;
}

describe("publishing never changes existing events", () => {
  it("leaves every task as it was until someone applies the version", async () => {
    const before = await tasksOf(e2);
    await publishVersion2();
    expect(await tasksOf(e2)).toEqual(before);
    const lists = await db.select().from(checklist).where(eq(checklist.eventId, e2));
    expect(lists[0]?.templateVersionId).not.toBeNull();
    // New events do get the new version.
    const [fresh] = await createEventsFromPreset(owner, cat.presets.flea.id, ["2027-06-12"]);
    const freshTasks = await tasksOf(fresh?.id ?? "");
    expect(freshTasks.map((t) => t.templateStableKey)).toContain("foto_der_flaeche");
    expect(freshTasks.map((t) => t.templateStableKey)).not.toContain("abrechnung");
  });
});

describe("previewTemplateApplication", () => {
  it("needs a published newer version: with only version 1 nothing qualifies", async () => {
    const preview = await previewTemplateApplication(owner, templateId);
    expect(preview.version.version).toBe(1);
    expect(preview.events).toEqual([]);
  });

  it("lists upcoming events per what would change, writing nothing", async () => {
    // e1: the permit task was edited (customised), the posters are done, Abrechnung is untouched.
    await db
      .update(task)
      .set({ customized: true })
      .where(eq(task.id, (await taskOf(e1, "marktgenehmigung_beantragen"))?.id ?? ""));
    await db
      .update(task)
      .set({ status: "done", completedAt: new Date() })
      .where(eq(task.id, (await taskOf(e1, "plakate_aufhaengen"))?.id ?? ""));
    await publishVersion2();
    const snapshot = await tasksOf(e1);

    const preview = await previewTemplateApplication(owner, templateId);
    expect(preview.version).toMatchObject({ version: 2, changeNote: "Version 2" });
    expect(preview.events.map((e) => e.eventId)).toEqual([e1, e2, e3]);
    const p1 = preview.events[0];
    expect(p1).toMatchObject({ fromVersion: 1, size: 3 });
    expect(p1?.add.map((a) => a.key)).toEqual(["foto_der_flaeche"]);
    expect(p1?.remove.map((r) => r.title)).toEqual(["Abrechnung"]);
    // The aufbau task gets its duty role: an update.
    expect(p1?.update.map((u) => [u.key, u.changes])).toEqual([["aufbau", ["key", "duty"]]]);
    expect(p1?.keep.map((k) => [k.title, k.reason])).toEqual([
      ["Marktgenehmigung beantragen", "customized"],
      ["Plakate aufhängen", "closed"],
    ]);

    const p2 = preview.events[1];
    expect(p2?.update.map((u) => [u.key, u.changes])).toEqual([
      ["marktgenehmigung_beantragen", ["title", "due"]],
      ["aufbau", ["key", "duty"]],
    ]);
    expect(p2?.size).toBe(4);
    expect(await tasksOf(e1)).toEqual(snapshot);
    expect(await db.select().from(auditLog).where(eq(auditLog.action, "template.apply"))).toEqual(
      [],
    );
  });

  it("leaves out past, cancelled and finished events", async () => {
    const [past] = await createEventsFromPreset(owner, cat.presets.flea.id, ["2026-01-10"]);
    await db.update(event).set({ status: "cancelled" }).where(eq(event.id, e3));
    await db.update(event).set({ status: "completed" }).where(eq(event.id, e2));
    await publishVersion2();
    const preview = await previewTemplateApplication(owner, templateId);
    expect(preview.events.map((e) => e.eventId)).toEqual([e1]);
    expect(preview.events.map((e) => e.eventId)).not.toContain(past?.id);
  });

  it("includes events of linked presets that have no checklist yet, as a full set of new tasks", async () => {
    const [festival] = await createEventsFromPreset(owner, cat.presets.festival.id, ["2027-05-07"]);
    expect(await tasksOf(festival?.id ?? "")).toHaveLength(0);
    await setTemplatePresets(owner, templateId, [cat.presets.flea.id, cat.presets.festival.id]);
    await publishVersion2();
    const preview = await previewTemplateApplication(owner, templateId);
    const entry = preview.events.find((e) => e.eventId === festival?.id);
    expect(entry).toMatchObject({ checklistId: null, fromVersion: null });
    expect(entry?.add.map((a) => a.key)).toEqual([
      "marktgenehmigung_beantragen",
      "plakate_aufhaengen",
      "aufbau",
      "foto_der_flaeche",
    ]);
  });

  it("is forbidden for staff and refuses unknown or archived templates", async () => {
    const staff = await createActor("staff");
    expect(isForbidden(await previewTemplateApplication(staff, templateId).catch((e) => e))).toBe(
      true,
    );
    expect(isForbidden(await applyTemplateVersion(staff, templateId, [e1]).catch((e) => e))).toBe(
      true,
    );
    expect(
      await codeOf(previewTemplateApplication(owner, "00000000-0000-4000-8000-000000000000")),
    ).toBe("not_found");
    await setTemplateArchived(owner, templateId, true);
    expect(await codeOf(previewTemplateApplication(owner, templateId))).toBe("not_found");
  });
});

describe("applyTemplateVersion", () => {
  it("applies to the chosen events only: adds, updates open untouched tasks, flags removed ones", async () => {
    await publishVersion2();
    const result = await applyTemplateVersion(owner, templateId, [e2]);
    expect(result).toMatchObject({ events: 1, added: 1, updated: 2, removed: 1 });

    const permit = await taskOf(e2, "marktgenehmigung_beantragen");
    expect(permit).toMatchObject({
      title: "Marktgenehmigung früh beantragen",
      offsetDays: -90,
      removedFromTemplate: false,
    });
    // 10.04.2027 minus 90 days = 10.01.2027, 09:00 CET.
    expect(permit?.dueAt?.toISOString()).toBe("2027-01-10T08:00:00.000Z");
    expect(await taskOf(e2, "aufbau")).toMatchObject({
      dutyRoleId: cat.roles.lead.id,
      assigneeId: cat.staff.anna.id,
      isKey: true,
    });
    // The flag flows through the same path as the other copied fields.
    expect(await taskOf(e2, "marktgenehmigung_beantragen")).toMatchObject({ isKey: true });
    expect(await taskOf(e1, "aufbau")).toMatchObject({ isKey: false });
    // Removed from the template: marked, not deleted.
    expect(await taskOf(e2, "abrechnung")).toMatchObject({
      removedFromTemplate: true,
      title: "Abrechnung",
      status: "todo",
    });
    const photo = await taskOf(e2, "foto_der_flaeche");
    expect(photo).toMatchObject({ source: "template", dueAt: expect.any(Date) });
    expect(
      (
        await db
          .select()
          .from(taskCheckItem)
          .where(eq(taskCheckItem.taskId, photo?.id ?? ""))
      ).map((c) => c.title),
    ).toEqual(["Vorher", "Nachher"]);

    // Untouched events stay as they were; the checklist knows its version.
    expect(await taskOf(e1, "foto_der_flaeche")).toBeUndefined();
    expect((await taskOf(e1, "marktgenehmigung_beantragen"))?.title).toBe(
      "Marktgenehmigung beantragen",
    );
    const lists = await db.select().from(checklist);
    const versionOf = async (eventId: string) =>
      lists.find((l) => l.eventId === eventId)?.templateVersionId;
    expect(await versionOf(e2)).not.toBe(await versionOf(e1));

    const preview = await previewTemplateApplication(owner, templateId);
    expect(preview.events.map((e) => e.eventId)).toEqual([e1, e3]);
  });

  it("never touches customised or done tasks, nor hand-set dates and assignees", async () => {
    // e1: permit customised, posters done. e3: permit date set by hand, aufbau assigned by hand.
    await db
      .update(task)
      .set({ customized: true })
      .where(eq(task.id, (await taskOf(e1, "marktgenehmigung_beantragen"))?.id ?? ""));
    await db
      .update(task)
      .set({ status: "done", completedAt: new Date() })
      .where(eq(task.id, (await taskOf(e1, "abrechnung"))?.id ?? ""));
    const handSet = new Date("2027-04-01T10:00:00Z");
    await db
      .update(task)
      .set({ dueAt: handSet, dueOverridden: true })
      .where(eq(task.id, (await taskOf(e3, "marktgenehmigung_beantragen"))?.id ?? ""));
    await db
      .update(task)
      .set({ assigneeId: cat.staff.ben.id, assigneeOverridden: true })
      .where(eq(task.id, (await taskOf(e3, "aufbau"))?.id ?? ""));
    await publishVersion2();
    const e1Before = await tasksOf(e1);

    await applyTemplateVersion(owner, templateId, [e1, e3]);

    // e1: only the new task was added and the untouched "Aufbau" updated; everything else is as before.
    const e1After = await tasksOf(e1);
    for (const key of ["marktgenehmigung_beantragen", "plakate_aufhaengen", "abrechnung"]) {
      const before = e1Before.find((t) => t.templateStableKey === key);
      const after = e1After.find((t) => t.templateStableKey === key);
      expect(after).toEqual(before);
    }
    expect((await taskOf(e1, "abrechnung"))?.removedFromTemplate).toBe(false); // done: not even flagged

    // e3: the title follows, the date and the assignee stay.
    const permit = await taskOf(e3, "marktgenehmigung_beantragen");
    expect(permit?.title).toBe("Marktgenehmigung früh beantragen");
    expect(permit?.dueAt?.toISOString()).toBe(handSet.toISOString());
    expect(permit?.offsetDays).toBe(-90);
    expect((await taskOf(e3, "aufbau"))?.assigneeId).toBe(cat.staff.ben.id);
  });

  it("creates the checklist and all tasks for a linked event that had none", async () => {
    const [festival] = await createEventsFromPreset(owner, cat.presets.festival.id, ["2027-05-07"]);
    await setTemplatePresets(owner, templateId, [cat.presets.flea.id, cat.presets.festival.id]);
    await publishVersion2();
    const result = await applyTemplateVersion(owner, templateId, [festival?.id ?? ""]);
    expect(result).toMatchObject({ events: 1, added: 4, updated: 0, removed: 0 });
    const lists = await db
      .select()
      .from(checklist)
      .where(eq(checklist.eventId, festival?.id ?? ""));
    expect(lists).toHaveLength(1);
    expect(await tasksOf(festival?.id ?? "")).toHaveLength(4);
  });

  it("is repeatable: a second run finds nothing to do", async () => {
    await publishVersion2();
    await applyTemplateVersion(owner, templateId, [e1, e2, e3]);
    const after = await tasksOf(e1);
    expect(await codeOf(applyTemplateVersion(owner, templateId, [e1]))).toBe("not_applicable");
    expect(await tasksOf(e1)).toEqual(after);
    expect((await previewTemplateApplication(owner, templateId)).events).toEqual([]);
  });

  it("restores a task whose item came back in a later version", async () => {
    await publishVersion2();
    await applyTemplateVersion(owner, templateId, [e2]);
    expect((await taskOf(e2, "abrechnung"))?.removedFromTemplate).toBe(true);
    const draft = await createDraft(owner, templateId);
    await addTemplateItem(owner, draft.versionId, items[3] as (typeof items)[number]);
    await publishDraft(owner, draft.versionId);
    await applyTemplateVersion(owner, templateId, [e2]);
    expect((await taskOf(e2, "abrechnung"))?.removedFromTemplate).toBe(false);
    // Same stable key, still one task.
    expect((await tasksOf(e2)).filter((t) => t.templateStableKey === "abrechnung")).toHaveLength(1);
  });

  it("audits one entry per event with the counts", async () => {
    await publishVersion2();
    await applyTemplateVersion(owner, templateId, [e1, e2]);
    const entries = await db.select().from(auditLog).where(eq(auditLog.action, "template.apply"));
    expect(entries).toHaveLength(2);
    expect(entries.map((e) => e.entityId).sort()).toEqual([e1, e2].sort());
    expect(entries[0]).toMatchObject({ actorId: owner.id, entityType: "event" });
    expect(entries[0]?.diff).toMatchObject({
      templateId,
      fromVersion: 1,
      toVersion: 2,
      added: 1,
      removed: 1,
    });
  });

  it("validates the selection", async () => {
    await publishVersion2();
    expect(await codeOf(applyTemplateVersion(owner, templateId, []))).toBe("no_events");
    expect(await codeOf(applyTemplateVersion(owner, templateId, ["nope"]))).toBe("not_applicable");
    expect(
      await codeOf(
        applyTemplateVersion(owner, templateId, ["00000000-0000-4000-8000-000000000000"]),
      ),
    ).toBe("not_applicable");
    // One bad id rejects the whole run: nothing was applied.
    expect(
      await codeOf(
        applyTemplateVersion(owner, templateId, [e1, "00000000-0000-4000-8000-000000000000"]),
      ),
    ).toBe("not_applicable");
    expect(await taskOf(e1, "foto_der_flaeche")).toBeUndefined();
  });
});
