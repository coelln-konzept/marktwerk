import { auditLog } from "@marktwerk/db/schema";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { Actor } from "@/server/actor";
import { db } from "@/server/db";
import { createTask, TaskInputError, updateTask } from "@/server/services/tasks";
import { createActor, resetDatabase } from "../helpers/fixtures";
import { getTask } from "../helpers/tasks";

let owner: Actor;

beforeEach(async () => {
  await resetDatabase();
  owner = await createActor("owner");
});

afterAll(async () => {
  await db.$client.end();
});

const code = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (error) {
    if (error instanceof TaskInputError) return error.code;
    throw error;
  }
  return "no error";
};

const mail = { channels: ["email" as const], timing: "before_1d" as const, at: null };

describe("task notify setting", () => {
  it("saves channels, timing and moment on a new task and audits them", async () => {
    const { id } = await createTask(owner, {
      title: "Mit Mail",
      dueOn: "2026-11-10",
      notify: mail,
    });
    expect(await getTask(id)).toMatchObject({
      notifyChannels: ["email"],
      notifyTiming: "before_1d",
      notifyAt: null,
    });
    const [entry] = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.action, "task.create"), eq(auditLog.entityId, id)));
    expect(entry?.diff).toMatchObject({ notify: mail });

    const custom = await createTask(owner, {
      title: "Eigenes Datum",
      notify: { channels: ["whatsapp"], timing: "custom", at: "2026-11-05T08:30:00.000Z" },
    });
    expect((await getTask(custom.id)).notifyAt?.toISOString()).toBe("2026-11-05T08:30:00.000Z");
  });

  it("defaults to no notification", async () => {
    const { id } = await createTask(owner, { title: "Ohne" });
    expect(await getTask(id)).toMatchObject({
      notifyChannels: [],
      notifyTiming: null,
      notifyAt: null,
    });
  });

  it("rejects a relative timing without a due date, a missing timing and a bad instant", async () => {
    expect(await code(createTask(owner, { title: "x", notify: mail }))).toBe("invalid_notify");
    expect(
      await code(
        createTask(owner, {
          title: "x",
          dueOn: "2026-11-10",
          notify: { channels: ["email"], timing: null, at: null },
        }),
      ),
    ).toBe("invalid_notify");
    expect(
      await code(
        createTask(owner, {
          title: "x",
          notify: { channels: ["email"], timing: "custom", at: null },
        }),
      ),
    ).toBe("invalid_notify");
    expect(
      await code(
        createTask(owner, {
          title: "x",
          notify: { channels: ["email"], timing: "custom", at: "gestern" },
        }),
      ),
    ).toBe("invalid_input");
    expect(
      await code(
        createTask(owner, {
          title: "x",
          notify: { channels: ["sms" as never], timing: "on_create", at: null },
        }),
      ),
    ).toBe("invalid_input");
    // "Sofort beim Anlegen" needs no due date.
    expect(
      await code(
        createTask(owner, {
          title: "x",
          notify: { channels: ["email"], timing: "on_create", at: null },
        }),
      ),
    ).toBe("no error");
  });

  it("updateTask changes the setting, audits before/after and clears timing with the channels", async () => {
    const { id } = await createTask(owner, { title: "T", dueOn: "2026-11-10", notify: mail });
    const result = await updateTask(owner, id, {
      notify: { channels: ["whatsapp"], timing: "custom", at: "2026-11-06T07:00:00.000Z" },
    });
    expect(result).toEqual({ changed: true, fields: ["notify"] });
    expect(await getTask(id)).toMatchObject({
      notifyChannels: ["whatsapp"],
      notifyTiming: "custom",
    });
    const [entry] = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.action, "task.update"), eq(auditLog.entityId, id)));
    expect(entry?.diff).toMatchObject({
      before: { notify: mail },
      after: { notify: { channels: ["whatsapp"], timing: "custom" } },
    });

    expect(
      await updateTask(owner, id, { notify: { channels: [], timing: "custom", at: null } }),
    ).toEqual({ changed: true, fields: ["notify"] });
    expect(await getTask(id)).toMatchObject({
      notifyChannels: [],
      notifyTiming: null,
      notifyAt: null,
    });
    // Same again: nothing to change.
    expect(
      (await updateTask(owner, id, { notify: { channels: [], timing: null, at: null } })).changed,
    ).toBe(false);
  });

  it("rejects removing the due date while a relative timing is saved", async () => {
    const { id } = await createTask(owner, { title: "T", dueOn: "2026-11-10", notify: mail });
    expect(await code(updateTask(owner, id, { dueOn: null }))).toBe("invalid_notify");
    expect((await getTask(id)).dueAt).not.toBeNull();
    // Changing the date is fine, and so is removing it together with switching to a custom moment.
    expect((await updateTask(owner, id, { dueOn: "2026-11-12" })).changed).toBe(true);
    expect(
      (
        await updateTask(owner, id, {
          dueOn: null,
          notify: { channels: ["email"], timing: "custom", at: "2026-11-09T07:00:00.000Z" },
        })
      ).changed,
    ).toBe(true);
    expect((await getTask(id)).dueAt).toBeNull();
  });

  it("rejects an update that makes the setting inconsistent", async () => {
    const { id } = await createTask(owner, { title: "T" });
    expect(await code(updateTask(owner, id, { notify: mail }))).toBe("invalid_notify");
  });
});
