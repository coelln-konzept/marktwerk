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
  restoreTemplateItems,
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
      expect(
        isForbidden(
          await restoreTemplateItems(actor, versionId, [{ ...baseItem(), key: "x" }]).catch(
            (e) => e,
          ),
        ),
      ).toBe(true);
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
    expect(await bad({ parentKey: "gibt_es_nicht" })).toBe("invalid_parent");
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
      parentKey: null,
      ownDue: false,
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
          }),
        )
      ).changed,
    ).toBe(false);
    expect(await audits("template.item_update")).toHaveLength(1);
    expect(await codeOf(updateTemplateItem(owner, draftId, "nope", baseItem()))).toBe(
      "item_not_found",
    );
  });

  it("moves rows up and down, duplicates and deletes", async () => {
    await addTemplateItem(owner, draftId, baseItem({ title: "Eins" }));
    const b = await addTemplateItem(owner, draftId, baseItem({ title: "Zwei" }));
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
  });

  it("keeps child items one level deep and deletes them with their parent (ADR 0021)", async () => {
    const a = await addTemplateItem(owner, draftId, baseItem({ title: "Eins" }));
    const child = await addTemplateItem(
      owner,
      draftId,
      baseItem({ title: "Eins A", parentKey: a.key }),
    );
    const b = await addTemplateItem(owner, draftId, baseItem({ title: "Zwei" }));
    expect((await itemsOf(draftId)).find((i) => i.stableKey === child.key)).toMatchObject({
      parentKey: "eins",
      ownDue: false,
    });
    // no second level: neither under a child, nor a parent with children under another item
    expect(
      await codeOf(
        addTemplateItem(owner, draftId, baseItem({ title: "Eins A 1", parentKey: child.key })),
      ),
    ).toBe("invalid_parent");
    expect(
      await codeOf(
        updateTemplateItem(owner, draftId, a.key, baseItem({ title: "Eins", parentKey: b.key })),
      ),
    ).toBe("invalid_parent");
    expect(
      await codeOf(
        updateTemplateItem(owner, draftId, a.key, baseItem({ title: "Eins", parentKey: a.key })),
      ),
    ).toBe("invalid_parent");
    // a child can move to another parent
    await updateTemplateItem(
      owner,
      draftId,
      child.key,
      baseItem({ title: "Eins A", parentKey: b.key, ownDue: true }),
    );
    expect((await itemsOf(draftId)).find((i) => i.stableKey === child.key)).toMatchObject({
      parentKey: "zwei",
      ownDue: true,
    });
    await deleteTemplateItem(owner, draftId, b.key);
    expect((await itemsOf(draftId)).map((i) => i.stableKey)).toEqual(["eins"]);
    const [entry] = await audits("template.item_delete");
    expect(entry?.diff).toMatchObject({ key: "zwei", children: ["eins_a"] });
  });

  it("keeps child items in their parent's phase, also when the parent moves to another phase", async () => {
    const a = await addTemplateItem(owner, draftId, baseItem({ title: "Aufbau", phase: "live" }));
    // "+ Unteraufgabe" sends the parent's fields; a stray phase is corrected to the parent's.
    const child = await addTemplateItem(
      owner,
      draftId,
      baseItem({ title: "Pavillons", phase: "pre", parentKey: a.key }),
      a.key,
    );
    const phaseOf = async (key: string) =>
      (await itemsOf(draftId)).find((i) => i.stableKey === key)?.phase;
    expect(await phaseOf(child.key)).toBe("live");

    await updateTemplateItem(
      owner,
      draftId,
      a.key,
      baseItem({ title: "Aufbau", phase: "pre", offsetDays: -1 }),
    );
    expect(await phaseOf(child.key)).toBe("pre");
    const [entry] = await audits("template.item_update");
    expect(entry?.diff).toMatchObject({
      key: "aufbau",
      changes: { phase: { from: "live", to: "pre" } },
      childrenPhase: ["pavillons"],
    });

    // Editing the child with another phase keeps it with the parent.
    await updateTemplateItem(
      owner,
      draftId,
      child.key,
      baseItem({ title: "Pavillons", phase: "post", parentKey: a.key, ownDue: true }),
    );
    expect(await phaseOf(child.key)).toBe("pre");
  });

  it("makes a top-level row a child and back, with its own role and due date (ADR 0021)", async () => {
    const a = await addTemplateItem(owner, draftId, baseItem({ title: "Genehmigung" }));
    const b = await addTemplateItem(
      owner,
      draftId,
      baseItem({ title: "Formular", offsetDays: -20, phase: "post" }),
    );
    // "Unteraufgabe von …": inherits by default, "wie Hauptaufgabe" for the role.
    await updateTemplateItem(
      owner,
      draftId,
      b.key,
      baseItem({ title: "Formular", offsetDays: -20, phase: "post", parentKey: a.key }),
    );
    expect((await itemsOf(draftId)).find((i) => i.stableKey === b.key)).toMatchObject({
      parentKey: "genehmigung",
      ownDue: false,
      dutyRoleId: null,
      phase: "pre",
    });
    // "Eigene Fälligkeit" and an own role.
    await updateTemplateItem(
      owner,
      draftId,
      b.key,
      baseItem({
        title: "Formular",
        offsetDays: -20,
        parentKey: a.key,
        ownDue: true,
        dutyRoleId: cat.roles.lead.id,
      }),
    );
    const [entry] = (await audits("template.item_update")).slice(-1);
    expect(entry?.diff).toMatchObject({
      key: "formular",
      changes: {
        ownDue: { from: false, to: true },
        dutyRoleId: { from: null, to: cat.roles.lead.id },
      },
    });
    // A row with children can't become a child.
    const c = await addTemplateItem(owner, draftId, baseItem({ title: "Gebühr" }));
    expect(
      await codeOf(
        updateTemplateItem(
          owner,
          draftId,
          a.key,
          baseItem({ title: "Genehmigung", parentKey: c.key }),
        ),
      ),
    ).toBe("invalid_parent");
    // "Eigenständig".
    await updateTemplateItem(
      owner,
      draftId,
      b.key,
      baseItem({ title: "Formular", offsetDays: -20, parentKey: null, ownDue: false }),
    );
    expect((await itemsOf(draftId)).find((i) => i.stableKey === b.key)).toMatchObject({
      parentKey: null,
      offsetDays: -20,
    });
  });

  it("moves child items among their siblings and top-level rows past whole groups", async () => {
    const a = await addTemplateItem(owner, draftId, baseItem({ title: "Eins" }));
    const b = await addTemplateItem(owner, draftId, baseItem({ title: "Zwei" }));
    // Children of "Eins" stored after "Zwei" (as the drawer's "+ Unteraufgabe" may do after reordering).
    await addTemplateItem(owner, draftId, baseItem({ title: "Eins A", parentKey: a.key }));
    await addTemplateItem(owner, draftId, baseItem({ title: "Eins B", parentKey: a.key }));
    await addTemplateItem(owner, draftId, baseItem({ title: "Zwei A", parentKey: b.key }));
    const order = async () => (await itemsOf(draftId)).map((i) => i.stableKey);

    // "Eins B" up: past its sibling "Eins A", not past "Zwei" (another parent's row).
    expect(await moveTemplateItem(owner, draftId, "eins_b", "up")).toEqual({ moved: true });
    expect(await order()).toEqual(["eins", "zwei", "eins_b", "eins_a", "zwei_a"]);
    expect(await moveTemplateItem(owner, draftId, "eins_b", "up")).toEqual({ moved: false });
    expect(await moveTemplateItem(owner, draftId, "eins_a", "down")).toEqual({ moved: false });
    // The only child of "Zwei" has no sibling to pass.
    expect(await moveTemplateItem(owner, draftId, "zwei_a", "up")).toEqual({ moved: false });
    // Top-level: "Zwei" up passes "Eins" (children don't count as steps).
    expect(await moveTemplateItem(owner, draftId, "zwei", "down")).toEqual({ moved: false });
    expect(await moveTemplateItem(owner, draftId, "zwei", "up")).toEqual({ moved: true });
    expect((await order()).filter((k) => !k.includes("_"))).toEqual(["zwei", "eins"]);
  });

  it("removes a child item and puts it back with the same key (the drawer's undo)", async () => {
    const a = await addTemplateItem(owner, draftId, baseItem({ title: "Aufbau" }));
    await addTemplateItem(owner, draftId, baseItem({ title: "Tische", parentKey: a.key }));
    await addTemplateItem(owner, draftId, baseItem({ title: "Strom", parentKey: a.key }));
    await addTemplateItem(owner, draftId, baseItem({ title: "Abbau" }));
    expect(await deleteTemplateItem(owner, draftId, "tische")).toEqual({ title: "Tische" });
    expect((await itemsOf(draftId)).map((i) => i.stableKey)).toEqual(["aufbau", "strom", "abbau"]);
    // Undo: the same fields before the next row.
    const back = await addTemplateItem(
      owner,
      draftId,
      baseItem({ title: "Tische", parentKey: a.key }),
      "aufbau",
      "strom",
    );
    expect(back.key).toBe("tische");
    expect((await itemsOf(draftId)).map((i) => [i.stableKey, i.parentKey])).toEqual([
      ["aufbau", null],
      ["tische", "aufbau"],
      ["strom", "aufbau"],
      ["abbau", null],
    ]);
  });

  it("restores a deleted row with its children and own keys at the same place (the grid's undo)", async () => {
    await addTemplateItem(owner, draftId, baseItem({ title: "Eins" }));
    // A key that the title would not give again ("eins_2" for "Eins (Kopie)").
    const copy = await duplicateTemplateItem(owner, draftId, "eins");
    await addTemplateItem(
      owner,
      draftId,
      baseItem({ title: "Tische", parentKey: copy.key, dutyRoleId: cat.roles.setup.id }),
    );
    await addTemplateItem(owner, draftId, baseItem({ title: "Strom", parentKey: copy.key }));
    await addTemplateItem(owner, draftId, baseItem({ title: "Drei" }));
    const before = await itemsOf(draftId);
    const view = (key: string) => {
      const row = before.find((i) => i.stableKey === key);
      if (!row) throw new Error(key);
      return {
        ...baseItem({
          title: row.title,
          parentKey: row.parentKey,
          dutyRoleId: row.dutyRoleId,
          offsetDays: row.offsetDays,
        }),
        key,
      };
    };
    const rows = [view(copy.key), view("tische"), view("strom")];

    await deleteTemplateItem(owner, draftId, copy.key);
    expect((await itemsOf(draftId)).map((i) => i.stableKey)).toEqual(["eins", "drei"]);

    expect(await restoreTemplateItems(owner, draftId, rows, "eins", "drei")).toEqual({
      keys: ["eins_2", "tische", "strom"],
    });
    const after = await itemsOf(draftId);
    expect(after.map((i) => [i.stableKey, i.parentKey, i.title])).toEqual([
      ["eins", null, "Eins"],
      ["eins_2", null, "Eins (Kopie)"],
      ["tische", "eins_2", "Tische"],
      ["strom", "eins_2", "Strom"],
      ["drei", null, "Drei"],
    ]);
    expect(after.map((i) => i.sort)).toEqual([0, 1, 2, 3, 4]);
    expect(after.find((i) => i.stableKey === "tische")?.dutyRoleId).toBe(cat.roles.setup.id);
    const [entry] = await audits("template.item_restore");
    expect(entry?.diff).toMatchObject({
      keys: ["eins_2", "tische", "strom"],
      title: "Eins (Kopie)",
    });

    // A second undo finds the keys taken; a child without its parent is refused; nothing is written.
    expect(await codeOf(restoreTemplateItems(owner, draftId, rows, null, null))).toBe(
      "item_exists",
    );
    await deleteTemplateItem(owner, draftId, copy.key);
    expect(await codeOf(restoreTemplateItems(owner, draftId, [view("tische")], null, null))).toBe(
      "invalid_parent",
    );
    expect(await codeOf(restoreTemplateItems(owner, draftId, [], null, null))).toBe(
      "invalid_input",
    );
    expect((await itemsOf(draftId)).map((i) => i.stableKey)).toEqual(["eins", "drei"]);
  });

  it("takes only the item fields from the client and restores a child listed before its parent", async () => {
    const { versionId: published } = await seedPublishedTemplate(owner, [
      baseItem({ title: "Alt" }),
    ]);
    await addTemplateItem(owner, draftId, baseItem({ title: "Eins" }));
    // Foreign keys in a row (a crafted server action payload) are dropped: the row lands in the draft, under
    // its own key, at the given place.
    const foreign = {
      versionId: published,
      stableKey: "anders",
      id: crypto.randomUUID(),
      sort: 99,
    };
    const forged = (fields: Parameters<typeof baseItem>[0], key: string) => ({
      ...baseItem(fields),
      ...foreign,
      key,
    });
    expect(
      await restoreTemplateItems(
        owner,
        draftId,
        [
          forged({ title: "Kind", parentKey: "vater", phase: "post", scope: "event" }, "kind"),
          forged({ title: "Vater", phase: "live" }, "vater"),
        ],
        "eins",
        null,
      ),
    ).toEqual({ keys: ["kind", "vater"] });
    const after = await itemsOf(draftId);
    expect(after.map((i) => [i.stableKey, i.parentKey, i.phase, i.sort])).toEqual([
      ["eins", null, "pre", 0],
      ["kind", "vater", "live", 1],
      ["vater", null, "live", 2],
    ]);
    expect((await itemsOf(published)).map((i) => i.stableKey)).toEqual(["alt"]);
    await addTemplateItem(owner, draftId, { ...baseItem({ title: "Zwei" }), ...foreign });
    await updateTemplateItem(owner, draftId, "zwei", {
      ...baseItem({ title: "Zwei" }),
      ...foreign,
    });
    expect((await itemsOf(draftId)).map((i) => i.stableKey)).toEqual([
      "eins",
      "kind",
      "vater",
      "zwei",
    ]);
    expect((await itemsOf(published)).map((i) => i.stableKey)).toEqual(["alt"]);

    // A key that is not a stable key is refused.
    for (const key of ["", "Mit Leerzeichen", "x".repeat(201), "ä"])
      expect(
        await codeOf(restoreTemplateItems(owner, draftId, [{ ...baseItem(), key }], null, null)),
      ).toBe("invalid_input");
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
    expect(
      await codeOf(
        restoreTemplateItems(owner, v1, [{ ...baseItem({ title: "Neu" }), key: "neu" }]),
      ),
    ).toBe("not_draft");
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
