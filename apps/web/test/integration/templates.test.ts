import {
  auditLog,
  checklistTemplate,
  eventPresetTemplate,
  templateItem,
  templateVersion,
} from "@marktwerk/db/schema";
import { asc, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import {
  addTemplateItem,
  createDraft,
  createTemplate,
  deleteTemplateItem,
  discardDraft,
  duplicateTemplateItem,
  moveTemplateItem,
  publishDraft,
  setTemplateArchived,
  setTemplatePresets,
  TemplateInputError,
  updateTemplate,
  updateTemplateItem,
} from "@/server/services/templates";
import { createActor, resetDatabase, seedCatalogue } from "../helpers/fixtures";
import { baseItem, seedPublishedTemplate } from "../helpers/templates";

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

const versionsOf = (templateId: string) =>
  db
    .select()
    .from(templateVersion)
    .where(eq(templateVersion.templateId, templateId))
    .orderBy(asc(templateVersion.version));

const itemsOf = (versionId: string) =>
  db
    .select()
    .from(templateItem)
    .where(eq(templateItem.versionId, versionId))
    .orderBy(asc(templateItem.sort));

const audits = (action: string) => db.select().from(auditLog).where(eq(auditLog.action, action));

const codeOf = async (promise: Promise<unknown>) => {
  try {
    await promise;
    return null;
  } catch (error) {
    return error instanceof TemplateInputError ? error.code : error;
  }
};

describe("templates", () => {
  it("creates a template with an empty first draft and audits it", async () => {
    const { id, versionId } = await createTemplate(owner, {
      name: "  Ablauf   Flohmarkt ",
      description: "  Standard ",
      eventTypeId: cat.type.id,
    });
    const [template] = await db
      .select()
      .from(checklistTemplate)
      .where(eq(checklistTemplate.id, id));
    expect(template).toMatchObject({
      name: "Ablauf Flohmarkt",
      description: "Standard",
      kind: "event",
      eventTypeId: cat.type.id,
    });
    expect(await versionsOf(id)).toMatchObject([{ id: versionId, version: 1, status: "draft" }]);
    const [entry] = await audits("template.create");
    expect(entry).toMatchObject({ actorId: owner.id, entityId: id });
  });

  it("validates name and event type", async () => {
    const input = { name: "x", description: null, eventTypeId: null };
    expect(await codeOf(createTemplate(owner, { ...input, name: "  " }))).toBe("invalid_name");
    expect(await codeOf(createTemplate(owner, { ...input, name: "x".repeat(121) }))).toBe(
      "invalid_name",
    );
    expect(
      await codeOf(
        createTemplate(owner, { ...input, eventTypeId: "00000000-0000-4000-8000-000000000000" }),
      ),
    ).toBe("invalid_type");
  });

  it("renames, and does nothing (and audits nothing) without a change", async () => {
    const { id } = await createTemplate(owner, {
      name: "Alt",
      description: null,
      eventTypeId: null,
    });
    expect(
      await updateTemplate(owner, id, { name: "Alt", description: null, eventTypeId: null }),
    ).toEqual({ changed: false });
    expect(await audits("template.update")).toHaveLength(0);
    expect(
      await updateTemplate(owner, id, {
        name: "Neu",
        description: "Text",
        eventTypeId: cat.type.id,
      }),
    ).toEqual({ changed: true });
    const [entry] = await audits("template.update");
    expect(entry?.diff).toMatchObject({
      changes: { name: { from: "Alt", to: "Neu" }, description: { from: null, to: "Text" } },
    });
  });

  it("archives and restores", async () => {
    const { id } = await createTemplate(owner, { name: "A", description: null, eventTypeId: null });
    expect(await setTemplateArchived(owner, id, true)).toEqual({ changed: true });
    expect(await setTemplateArchived(owner, id, true)).toEqual({ changed: false });
    // An archived template cannot be edited.
    expect(await codeOf(createDraft(owner, id))).toBe("not_found");
    expect(await setTemplateArchived(owner, id, false)).toEqual({ changed: true });
    expect(await audits("template.archive")).toHaveLength(1);
    expect(await audits("template.restore")).toHaveLength(1);
  });

  it("is forbidden without template:write", async () => {
    const staff = await createActor("staff");
    const field = await createActor("field");
    const { templateId: id, versionId } = await seedPublishedTemplate(owner, [
      baseItem({ title: "A" }),
    ]);
    for (const actor of [staff, field]) {
      expect(
        isForbidden(
          await createTemplate(actor, { name: "x", description: null, eventTypeId: null }).catch(
            (e) => e,
          ),
        ),
      ).toBe(true);
      expect(isForbidden(await createDraft(actor, id).catch((e) => e))).toBe(true);
      expect(isForbidden(await publishDraft(actor, versionId).catch((e) => e))).toBe(true);
      expect(isForbidden(await addTemplateItem(actor, versionId, baseItem()).catch((e) => e))).toBe(
        true,
      );
      expect(isForbidden(await setTemplatePresets(actor, id, []).catch((e) => e))).toBe(true);
    }
    // A manager may.
    const manager = await createActor("manager");
    expect((await createDraft(manager, id)).version).toBe(2);
  });
});

describe("draft items", () => {
  let draftId: string;

  beforeEach(async () => {
    ({ versionId: draftId } = await createTemplate(owner, {
      name: "Ablauf",
      description: null,
      eventTypeId: null,
    }));
  });

  it("adds rows with stable keys from the title, in order, and audits them", async () => {
    const a = await addTemplateItem(owner, draftId, baseItem({ title: "Plakate bestellen" }));
    const b = await addTemplateItem(owner, draftId, baseItem({ title: "Plakate bestellen" }));
    const c = await addTemplateItem(
      owner,
      draftId,
      baseItem({ title: "Genehmigung prüfen" }),
      a.key, // directly after the first row
    );
    expect(a.key).toBe("plakate_bestellen");
    expect(b.key).toBe("plakate_bestellen_2");
    expect((await itemsOf(draftId)).map((i) => i.stableKey)).toEqual([
      "plakate_bestellen",
      "genehmigung_pruefen",
      "plakate_bestellen_2",
    ]);
    expect((await itemsOf(draftId)).map((i) => i.sort)).toEqual([0, 1, 2]);
    expect(c.key).toBe("genehmigung_pruefen");
    expect(await audits("template.item_add")).toHaveLength(3);
  });

  it("validates fields and references", async () => {
    const bad = (patch: Parameters<typeof baseItem>[0]) =>
      codeOf(addTemplateItem(owner, draftId, baseItem({ title: "X", ...patch })));
    expect(await bad({ title: " " })).toBe("invalid_title");
    expect(await bad({ offsetDays: 1000 })).toBe("invalid_offset");
    expect(await bad({ anchorKey: "Event Day" })).toBe("invalid_anchor");
    expect(await bad({ dueTime: "25:00" })).toBe("invalid_time");
    expect(await bad({ estimateMinutes: -5 })).toBe("invalid_estimate");
    expect(await bad({ dutyRoleId: "00000000-0000-4000-8000-000000000000" })).toBe("invalid_role");
    expect(await bad({ dependsOnKeys: ["gibt_es_nicht"] })).toBe("invalid_dependency");
    expect(await itemsOf(draftId)).toHaveLength(0);
  });

  it("updates a row, keeps its key and audits what changed", async () => {
    const { key } = await addTemplateItem(owner, draftId, baseItem({ title: "Plakate" }));
    const result = await updateTemplateItem(
      owner,
      draftId,
      key,
      baseItem({
        title: "  Plakate   aufhängen ",
        offsetDays: -21,
        dayMode: "business",
        dueTime: "9:30",
        dutyRoleId: cat.roles.lead.id,
        checkItems: ["Plakate holen", "  ", "Aufhängen"],
      }),
    );
    expect(result).toEqual({ changed: true });
    const [row] = await itemsOf(draftId);
    expect(row).toMatchObject({
      stableKey: "plakate",
      title: "Plakate aufhängen",
      offsetDays: -21,
      dayMode: "business",
      dueTime: "09:30:00",
      dutyRoleId: cat.roles.lead.id,
      checkItems: ["Plakate holen", "Aufhängen"],
    });
    const [entry] = await audits("template.item_update");
    expect(entry?.diff).toMatchObject({
      key: "plakate",
      changes: { offsetDays: { from: -7, to: -21 }, dayMode: { from: "calendar", to: "business" } },
    });
    // Same values again: no write, no audit entry.
    expect(
      (
        await updateTemplateItem(
          owner,
          draftId,
          key,
          baseItem({
            title: "Plakate aufhängen",
            offsetDays: -21,
            dayMode: "business",
            dueTime: "09:30",
            dutyRoleId: cat.roles.lead.id,
            checkItems: ["Plakate holen", "Aufhängen"],
          }),
        )
      ).changed,
    ).toBe(false);
    expect(await audits("template.item_update")).toHaveLength(1);
    expect(await codeOf(updateTemplateItem(owner, draftId, "nope", baseItem()))).toBe(
      "item_not_found",
    );
  });

  it("moves rows up and down, duplicates and deletes (cleaning up dependencies)", async () => {
    const a = await addTemplateItem(owner, draftId, baseItem({ title: "Eins" }));
    const b = await addTemplateItem(
      owner,
      draftId,
      baseItem({ title: "Zwei", dependsOnKeys: [a.key] }),
    );
    await addTemplateItem(owner, draftId, baseItem({ title: "Drei" }));
    expect(await moveTemplateItem(owner, draftId, b.key, "up")).toEqual({ moved: true });
    expect((await itemsOf(draftId)).map((i) => i.stableKey)).toEqual(["zwei", "eins", "drei"]);
    expect(await moveTemplateItem(owner, draftId, "zwei", "up")).toEqual({ moved: false });
    expect(await moveTemplateItem(owner, draftId, "drei", "down")).toEqual({ moved: false });

    const copy = await duplicateTemplateItem(owner, draftId, "eins");
    expect(copy.key).toBe("eins_2");
    expect((await itemsOf(draftId)).map((i) => i.title)).toEqual([
      "Zwei",
      "Eins",
      "Eins (Kopie)",
      "Drei",
    ]);

    await deleteTemplateItem(owner, draftId, "eins");
    const rows = await itemsOf(draftId);
    expect(rows.map((i) => i.stableKey)).toEqual(["zwei", "eins_2", "drei"]);
    expect(rows.map((i) => i.sort)).toEqual([0, 1, 2]);
    // "Zwei" depended on "Eins": the dependency is gone with it.
    expect(rows[0]?.dependsOnKeys).toEqual([]);
  });

  it("refuses dependency loops and self references", async () => {
    const a = await addTemplateItem(owner, draftId, baseItem({ title: "Eins" }));
    const b = await addTemplateItem(
      owner,
      draftId,
      baseItem({ title: "Zwei", dependsOnKeys: [a.key] }),
    );
    expect(
      await codeOf(
        updateTemplateItem(
          owner,
          draftId,
          a.key,
          baseItem({ title: "Eins", dependsOnKeys: [b.key] }),
        ),
      ),
    ).toBe("dependency_cycle");
    expect(
      await codeOf(
        updateTemplateItem(
          owner,
          draftId,
          a.key,
          baseItem({ title: "Eins", dependsOnKeys: [a.key] }),
        ),
      ),
    ).toBe("invalid_dependency");
  });

  it("refuses to publish an empty draft", async () => {
    expect(await codeOf(publishDraft(owner, draftId))).toBe("empty");
  });
});

describe("versions", () => {
  it("publishes the draft, makes it immutable and retires the old version on the next publish", async () => {
    const { templateId, versionId: v1 } = await seedPublishedTemplate(owner, [
      baseItem({ title: "Eins" }),
      baseItem({ title: "Zwei" }),
    ]);
    expect(await versionsOf(templateId)).toMatchObject([
      { id: v1, version: 1, status: "published", changeNote: "Erste Fassung" },
    ]);
    expect((await versionsOf(templateId))[0]?.publishedAt).toBeInstanceOf(Date);
    const [published] = await audits("template.publish");
    expect(published?.diff).toMatchObject({ version: 1, items: 2, retiredVersion: null });

    // Published versions can't be edited in any way.
    expect(await codeOf(addTemplateItem(owner, v1, baseItem({ title: "Drei" })))).toBe("not_draft");
    expect(await codeOf(updateTemplateItem(owner, v1, "eins", baseItem({ title: "Eins" })))).toBe(
      "not_draft",
    );
    expect(await codeOf(deleteTemplateItem(owner, v1, "eins"))).toBe("not_draft");
    expect(await codeOf(moveTemplateItem(owner, v1, "eins", "down"))).toBe("not_draft");
    expect(await codeOf(duplicateTemplateItem(owner, v1, "eins"))).toBe("not_draft");
    expect(await codeOf(publishDraft(owner, v1))).toBe("not_draft");
    expect(await codeOf(discardDraft(owner, v1))).toBe("not_draft");
    expect(await itemsOf(v1)).toHaveLength(2);

    // New draft = copy of the published version, with the same stable keys.
    const draft = await createDraft(owner, templateId);
    expect(draft.version).toBe(2);
    expect((await itemsOf(draft.versionId)).map((i) => i.stableKey)).toEqual(["eins", "zwei"]);
    expect(await codeOf(createDraft(owner, templateId))).toBe("draft_exists");

    // Publishing without a difference is refused.
    expect(await codeOf(publishDraft(owner, draft.versionId))).toBe("no_changes");

    await updateTemplateItem(
      owner,
      draft.versionId,
      "eins",
      baseItem({ title: "Eins", offsetDays: -30 }),
    );
    await addTemplateItem(owner, draft.versionId, baseItem({ title: "Drei" }));
    const result = await publishDraft(owner, draft.versionId, "  Drei neu ");
    expect(result).toEqual({ templateId, version: 2, retired: 1 });
    expect((await versionsOf(templateId)).map((v) => [v.version, v.status])).toEqual([
      [1, "retired"],
      [2, "published"],
    ]);
    // The retired version keeps its content.
    expect((await itemsOf(v1)).map((i) => [i.stableKey, i.offsetDays])).toEqual([
      ["eins", -7],
      ["zwei", -7],
    ]);
    expect((await versionsOf(templateId))[1]?.changeNote).toBe("Drei neu");
  });

  it("discards a draft without touching published versions", async () => {
    const { templateId } = await seedPublishedTemplate(owner, [baseItem({ title: "Eins" })]);
    const draft = await createDraft(owner, templateId);
    await addTemplateItem(owner, draft.versionId, baseItem({ title: "Zwei" }));
    expect(await discardDraft(owner, draft.versionId)).toEqual({ templateId });
    expect((await versionsOf(templateId)).map((v) => v.status)).toEqual(["published"]);
    expect(await audits("template.draft_discard")).toHaveLength(1);
    // A fresh draft can be made again and gets the same number.
    expect((await createDraft(owner, templateId)).version).toBe(2);
  });
});

describe("preset links", () => {
  it("links and unlinks presets, new links go last, other templates' links stay", async () => {
    const { templateId } = await seedPublishedTemplate(owner, [baseItem({ title: "Eins" })]);
    const other = await seedPublishedTemplate(owner, [baseItem({ title: "Zwei" })], {
      name: "Ablauf 2",
    });
    await setTemplatePresets(owner, other.templateId, [cat.presets.flea.id]);
    expect(
      await setTemplatePresets(owner, templateId, [cat.presets.flea.id, cat.presets.festival.id]),
    ).toEqual({ added: 2, removed: 0 });
    const links = await db.select().from(eventPresetTemplate);
    const sortOf = (presetId: string, tplId: string) =>
      links.find((l) => l.presetId === presetId && l.templateId === tplId)?.sort;
    expect(sortOf(cat.presets.flea.id, other.templateId)).toBe(0);
    expect(sortOf(cat.presets.flea.id, templateId)).toBe(1);
    expect(sortOf(cat.presets.festival.id, templateId)).toBe(0);

    expect(await setTemplatePresets(owner, templateId, [cat.presets.festival.id])).toEqual({
      added: 0,
      removed: 1,
    });
    expect(await setTemplatePresets(owner, templateId, [cat.presets.festival.id])).toEqual({
      added: 0,
      removed: 0,
    });
    expect((await db.select().from(eventPresetTemplate)).length).toBe(2);
    expect(await audits("template.presets")).toHaveLength(3);
    expect(
      await codeOf(setTemplatePresets(owner, templateId, ["00000000-0000-4000-8000-000000000000"])),
    ).toBe("invalid_preset");
  });
});
