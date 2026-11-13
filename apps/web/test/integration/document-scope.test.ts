import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { user } from "@marktwerk/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Actor } from "@/server/actor";
import { db } from "@/server/db";
import { listArchiveDocuments } from "@/server/queries/archive";
import { archiveDocument, createDocument, readDocument } from "@/server/services/documents";
import { createEventsFromPreset } from "@/server/services/events";
import { createLocalStorage, setStorageForTests } from "@/server/storage";
import { createActor, resetDatabase, seedCatalogue } from "../helpers/fixtures";
import { insertTask } from "../helpers/tasks";

/**
 * AU7: documents follow the row scope of the record they hang on. A field user only reaches documents of events
 * they work at and of tasks they can see (`visibleEvents` / `visibleTasks`), in the download and in the Archiv.
 * Office roles keep seeing everything their grants allow.
 */

let dir: string;
let owner: Actor;
let staff: Actor;
let field: Actor;
/** Document ids by name; `allowed` ones the field user (Anna) may reach, `forbidden` ones not. */
let docs: Record<string, string>;
const ALLOWED = ["myEvent", "myEventTask", "myLooseTask"];
const FORBIDDEN = ["otherEvent", "otherEventTask", "othersLooseTask"];

const pdf = (seed: string) =>
  Uint8Array.from([...`%PDF-1.4\n% ${seed}\n1 0 obj<<>>endobj\n%%EOF`].map((c) => c.charCodeAt(0)));

const isForbidden = (error: unknown) =>
  String((error as { digest?: unknown })?.digest ?? "").includes("403");

const forbiddenFor = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (error) {
    if (isForbidden(error)) return true;
    throw error;
  }
  return false;
};

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "marktwerk-files-"));
  setStorageForTests(createLocalStorage(dir));
});

afterAll(async () => {
  setStorageForTests(null);
  await rm(dir, { recursive: true, force: true });
  await db.$client.end();
});

beforeEach(async () => {
  await resetDatabase();
  const cat = await seedCatalogue();
  owner = await createActor("owner");
  staff = await createActor("staff");
  const base = await createActor("field");
  await db.update(user).set({ role: "field" }).where(eq(user.id, base.id));
  // The field login is Anna's (ADR 0012); the flea preset gives her a duty, the festival has none.
  field = {
    ...base,
    staffMemberId: cat.staff.anna.id,
    firstName: "Anna",
    displayName: "Anna Test",
  };

  const [mine] = await createEventsFromPreset(owner, cat.presets.flea.id, ["2026-11-14"]);
  const [other] = await createEventsFromPreset(owner, cat.presets.festival.id, ["2026-12-04"]);
  if (!mine || !other) throw new Error("fixture failed");
  const tasks = {
    myEventTask: await insertTask({ title: "Aufbau", eventId: mine.id }),
    otherEventTask: await insertTask({ title: "Bühne", eventId: other.id }),
    myLooseTask: await insertTask({ title: "Schlüssel holen", assigneeId: cat.staff.anna.id }),
    othersLooseTask: await insertTask({ title: "Steuer", assigneeId: cat.staff.ben.id }),
  };
  const links: Record<string, Record<string, string>> = {
    myEvent: { eventId: mine.id },
    otherEvent: { eventId: other.id },
    ...Object.fromEntries(Object.entries(tasks).map(([name, t]) => [name, { taskId: t.id }])),
  };
  docs = {};
  for (const [name, link] of Object.entries(links)) {
    const { id } = await createDocument(owner, { fileName: `${name}.pdf`, bytes: pdf(name), link });
    docs[name] = id;
  }
});

const names = (rows: { id: string }[]) =>
  rows.map((r) => Object.entries(docs).find(([, id]) => id === r.id)?.[0]).sort();

describe("documents for a field user", () => {
  it("downloads documents of its own events and visible tasks", async () => {
    for (const name of ALLOWED) {
      const { row } = await readDocument(field, docs[name] as string);
      expect(row.fileName).toBe(`${name}.pdf`);
    }
  });

  it("is refused (403) documents of other events and of tasks it cannot see", async () => {
    for (const name of FORBIDDEN) {
      expect(await forbiddenFor(readDocument(field, docs[name] as string)), name).toBe(true);
    }
  });

  it("the Archiv lists only the documents it may open", async () => {
    const page = await listArchiveDocuments(field, { page: 1, size: 50 });
    expect(names(page.rows)).toEqual([...ALLOWED].sort());
    expect(page.total).toBe(ALLOWED.length);
    const found = await listArchiveDocuments(field, { q: "other", page: 1, size: 50 });
    expect(found.rows).toEqual([]);
    expect(found.total).toBe(0);
  });

  it("a field login without a staff record reaches no document", async () => {
    const unlinked = { ...field, staffMemberId: null };
    expect(await forbiddenFor(readDocument(unlinked, docs.myEvent as string))).toBe(true);
    expect((await listArchiveDocuments(unlinked, { page: 1, size: 50 })).total).toBe(0);
  });

  it("cannot attach to or archive documents of a task it cannot see", async () => {
    const otherTaskDoc = await readDocument(owner, docs.otherEventTask as string);
    const otherTaskId = otherTaskDoc.row.taskId as string;
    expect(
      await forbiddenFor(
        createDocument(field, {
          fileName: "foto.pdf",
          bytes: pdf("field-other"),
          link: { taskId: otherTaskId },
        }),
      ),
    ).toBe(true);
    expect(await forbiddenFor(archiveDocument(field, docs.otherEventTask as string))).toBe(true);

    const myTaskId = (await readDocument(owner, docs.myEventTask as string)).row.taskId as string;
    const created = await createDocument(field, {
      fileName: "foto.pdf",
      bytes: pdf("field-mine"),
      link: { taskId: myTaskId },
    });
    expect((await readDocument(field, created.id)).row.fileName).toBe("foto.pdf");
  });
});

describe("documents for office roles", () => {
  it("owner and staff keep full access, in the download and the Archiv", async () => {
    for (const actor of [owner, staff]) {
      for (const id of Object.values(docs)) await readDocument(actor, id);
      const page = await listArchiveDocuments(actor, { page: 1, size: 50 });
      expect(names(page.rows)).toEqual(Object.keys(docs).sort());
    }
  });
});
