import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { permit } from "@marktwerk/db/schema";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Actor } from "@/server/actor";
import { db } from "@/server/db";
import { listLinkedDocuments } from "@/server/queries/documents";
import { getTaskDetail } from "@/server/queries/tasks";
import { createVehicle, reportVehicleIssue } from "@/server/services/company";
import { archiveDocument, createDocument } from "@/server/services/documents";
import { setTaskStatus, TaskInputError } from "@/server/services/tasks";
import { createLocalStorage, setStorageForTests } from "@/server/storage";
import { createActor, resetDatabase, seedCatalogue } from "../helpers/fixtures";
import { asStaff, getTask, insertEvent, insertTask, TODAY } from "../helpers/tasks";

/**
 * Documents as the links between modules: photo/attachment evidence on tasks (switched on), permit and
 * event documents, vehicle issue photos.
 */

let dir: string;
let cat: Awaited<ReturnType<typeof seedCatalogue>>;
let owner: Actor;
let staff: Actor;
let field: Actor;
let eventId: string;
const clock = { today: TODAY, now: new Date("2026-10-21T10:00:00Z") };

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "marktwerk-links-"));
  setStorageForTests(createLocalStorage(dir));
});

afterAll(async () => {
  setStorageForTests(null);
  await rm(dir, { recursive: true, force: true });
  await db.$client.end();
});

beforeEach(async () => {
  await resetDatabase();
  cat = await seedCatalogue();
  owner = await createActor("owner");
  staff = asStaff(await createActor("staff"), cat.staff.anna);
  field = asStaff(await createActor("field"), cat.staff.anna);
  eventId = (
    await insertEvent(cat, "Testmarkt", "2026-11-14", [
      { roleId: cat.roles.lead.id, staffId: cat.staff.anna.id },
    ])
  ).id;
});

const isForbidden = (error: unknown) =>
  String((error as { digest?: unknown })?.digest ?? "").includes("403");

const bytes = (...parts: (number[] | string)[]) =>
  Uint8Array.from(
    parts.flatMap((p) => (typeof p === "string" ? [...p].map((c) => c.charCodeAt(0)) : p)),
  );
const pdf = (seed = "a") => bytes(`%PDF-1.4\n% ${seed}\n1 0 obj<<>>endobj\n%%EOF`);
const jpeg = (seed = "a") => bytes([0xff, 0xd8, 0xff, 0xe0], `JFIF ${seed} padding padding`);

describe("task evidence", () => {
  const missingOf = async (promise: Promise<unknown>) => {
    try {
      await promise;
    } catch (error) {
      if (error instanceof TaskInputError) return error.detail ?? error.code;
      throw error;
    }
    return null;
  };

  it("needs a photo document and an attachment document on the task before it can be done", async () => {
    const t = await insertTask({
      title: "Schilder aufstellen",
      eventId,
      requiresPhoto: true,
      requiresAttachment: true,
    });
    expect(await missingOf(setTaskStatus(owner, t.id, "done", {}, clock))).toEqual([
      "photo",
      "attachment",
    ]);

    // A photo document satisfies the photo only.
    await createDocument(owner, {
      fileName: "schilder.jpg",
      bytes: jpeg("1"),
      link: { taskId: t.id },
      kind: "photo",
    });
    expect(await missingOf(setTaskStatus(owner, t.id, "done", {}, clock))).toEqual(["attachment"]);

    // Any other kind counts as the attachment.
    await createDocument(owner, {
      fileName: "protokoll.pdf",
      bytes: pdf("1"),
      link: { taskId: t.id },
      kind: "other",
    });
    await setTaskStatus(owner, t.id, "done", {}, clock);
    expect((await getTask(t.id)).status).toBe("done");
  });

  it("a removed (archived) photo no longer counts", async () => {
    const t = await insertTask({ title: "Foto", eventId, requiresPhoto: true });
    const photo = await createDocument(owner, {
      fileName: "a.jpg",
      bytes: jpeg("2"),
      link: { taskId: t.id },
      kind: "photo",
    });
    await archiveDocument(owner, photo.id);
    expect(await missingOf(setTaskStatus(owner, t.id, "done", {}, clock))).toEqual(["photo"]);
  });

  it("only the evidence a task asks for is checked", async () => {
    const t = await insertTask({ title: "Nur Foto", eventId, requiresPhoto: true });
    await createDocument(owner, {
      fileName: "a.jpg",
      bytes: jpeg("3"),
      link: { taskId: t.id },
      kind: "photo",
    });
    await setTaskStatus(owner, t.id, "done", {}, clock);
    const plain = await insertTask({ title: "Nichts nötig", eventId });
    await setTaskStatus(owner, plain.id, "done", {}, clock);
  });

  it("the drawer's data lists the files and which evidence is given", async () => {
    const t = await insertTask({
      title: "Beides",
      eventId,
      requiresPhoto: true,
      requiresAttachment: true,
    });
    await createDocument(staff, {
      fileName: "a.jpg",
      bytes: jpeg("4"),
      link: { taskId: t.id },
      kind: "photo",
    });
    const detail = await getTaskDetail(staff, t.id);
    expect(detail).toMatchObject({ hasPhoto: true, hasAttachment: false });
    expect(detail?.documents.map((d) => d.fileName)).toEqual(["a.jpg"]);
  });

  it("field users, who may write tasks, can add the evidence", async () => {
    const t = await insertTask({ title: "Platz", eventId, requiresPhoto: true });
    await createDocument(field, {
      fileName: "platz.jpg",
      bytes: jpeg("5"),
      link: { taskId: t.id },
      kind: "photo",
    });
    expect((await getTaskDetail(field, t.id))?.hasPhoto).toBe(true);
  });
});

describe("permit and event documents", () => {
  async function makePermit() {
    const [row] = await db
      .insert(permit)
      .values({
        venueId: cat.venue.id,
        category: "city",
        permitType: "water",
        title: "Wasser",
        season: 2026,
      })
      .returning();
    if (!row) throw new Error("permit");
    return row;
  }

  it("a permit's notice hangs on the permit; staff may add it, field users may not see or add it", async () => {
    const p = await makePermit();
    await createDocument(staff, {
      fileName: "bescheid.pdf",
      bytes: pdf("p"),
      link: { permitId: p.id },
      kind: "permit",
    });
    const staffView = await listLinkedDocuments(staff, "permitId", [p.id]);
    expect(staffView.get(p.id)?.map((d) => [d.fileName, d.kind])).toEqual([
      ["bescheid.pdf", "permit"],
    ]);
    expect((await listLinkedDocuments(field, "permitId", [p.id])).size).toBe(0);
    const refused = await createDocument(field, {
      fileName: "x.pdf",
      bytes: pdf("q"),
      link: { permitId: p.id },
    }).catch((e) => e);
    expect(isForbidden(refused)).toBe(true);
  });

  it("event documents: office writes, everyone who may read the event reads", async () => {
    await createDocument(owner, {
      fileName: "plan.pdf",
      bytes: pdf("e"),
      link: { eventId },
      kind: "other",
    });
    for (const actor of [owner, staff, field])
      expect((await listLinkedDocuments(actor, "eventId", [eventId])).get(eventId)).toHaveLength(1);
    // Staff have event:read only.
    const refused = await createDocument(staff, {
      fileName: "x.pdf",
      bytes: pdf("f"),
      link: { eventId },
    }).catch((e) => e);
    expect(isForbidden(refused)).toBe(true);
  });
});

describe("vehicle issue photos", () => {
  it("a photo links to the issue; the list finds it by issue", async () => {
    const vehicle = await createVehicle(owner, {
      name: "Transporter",
      plate: "K-MW 1",
      make: null,
      model: null,
      vin: null,
      firstRegistrationOn: null,
      grossWeightKg: 3000,
      odometerKm: null,
      odometerRecordedOn: null,
      insurer: null,
      policyNumber: null,
      notes: null,
    });
    const issue = await reportVehicleIssue(owner, {
      vehicleId: vehicle.id,
      title: "Spiegel gebrochen",
      description: null,
      severity: "minor",
    });
    await createDocument(owner, {
      fileName: "spiegel.jpg",
      bytes: jpeg("v"),
      link: { vehicleIssueId: issue.id },
      kind: "photo",
    });
    const docs = (await listLinkedDocuments(owner, "vehicleIssueId", [issue.id])).get(issue.id);
    expect(docs?.map((d) => [d.fileName, d.kind])).toEqual([["spiegel.jpg", "photo"]]);
    // Staff may read company records but not add to them.
    expect(
      (await listLinkedDocuments(staff, "vehicleIssueId", [issue.id])).get(issue.id),
    ).toHaveLength(1);
    const refused = await createDocument(staff, {
      fileName: "x.jpg",
      bytes: jpeg("w"),
      link: { vehicleIssueId: issue.id },
    }).catch((e) => e);
    expect(isForbidden(refused)).toBe(true);
    // Field users read nothing of the company area.
    expect((await listLinkedDocuments(field, "vehicleIssueId", [issue.id])).size).toBe(0);
  });
});
