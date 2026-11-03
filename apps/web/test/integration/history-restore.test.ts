import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { Actor } from "@/server/actor";
import { db } from "@/server/db";
import { listEventHistory } from "@/server/queries/event-detail";
import { setTaskStatus } from "@/server/services/tasks";
import { createActor, resetDatabase, seedCatalogue } from "../helpers/fixtures";
import { insertEvent, insertTask } from "../helpers/tasks";

let owner: Actor;
let eventId: string;

beforeEach(async () => {
  await resetDatabase();
  const cat = await seedCatalogue();
  owner = await createActor("owner");
  eventId = (await insertEvent(cat, "Testmarkt", "2026-11-14")).id;
});

afterAll(async () => {
  await db.$client.end();
});

const restorable = async () =>
  (await listEventHistory(owner, eventId))
    .filter((e) => e.restoreTaskId)
    .map((e) => ({ subject: e.subject, to: (e.diff as { to?: string }).to }));

describe("Verlauf: Wiederherstellen (UT-06)", () => {
  it("offers it on the newest entry that finished a task still done or skipped", async () => {
    const done = await insertTask({ title: "erledigt", eventId });
    const skipped = await insertTask({ title: "übersprungen", eventId });
    await setTaskStatus(owner, done.id, "done");
    await setTaskStatus(owner, skipped.id, "skipped", { reason: "entfällt" });
    expect(await restorable()).toEqual([
      { subject: "übersprungen", to: "skipped" },
      { subject: "erledigt", to: "done" },
    ]);
  });

  it("not once the task is open again, and only on the latest of several ticks", async () => {
    const task = await insertTask({ title: "zweimal", eventId });
    await setTaskStatus(owner, task.id, "done");
    await setTaskStatus(owner, task.id, "todo");
    expect(await restorable()).toEqual([]);
    await setTaskStatus(owner, task.id, "done");
    const entries = await listEventHistory(owner, eventId);
    const ticks = entries.filter((e) => (e.diff as { to?: string }).to === "done");
    expect(ticks).toHaveLength(2);
    expect(ticks.map((e) => e.restoreTaskId)).toEqual([task.id, null]);
  });
});
