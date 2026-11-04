import { auditLog, task } from "@marktwerk/db/schema";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { instantOf, notifyFormOf, notifyInputOf, wallClockOf } from "@/components/task/notify-form";
import type { Actor } from "@/server/actor";
import { db } from "@/server/db";
import { createTask, TaskInputError, updateTask } from "@/server/services/tasks";
import { createActor, resetDatabase } from "../helpers/fixtures";
import { getTask } from "../helpers/tasks";

let owner: Actor;
let other: Actor;

beforeEach(async () => {
  await resetDatabase();
  owner = await createActor("owner");
  other = await createActor("manager");
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

describe("task notify recipient (notify_user_id)", () => {
  it("is the person who sets it, kept on unrelated edits and on an unchanged setting", async () => {
    const { id } = await createTask(owner, { title: "T", dueOn: "2026-11-10", notify: mail });
    expect((await getTask(id)).notifyUserId).toBe(owner.id);
    const [created] = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.action, "task.create"), eq(auditLog.entityId, id)));
    expect(created?.diff).toMatchObject({ notify: { userId: owner.id } });

    // Someone else edits the title: the recipient stays.
    await updateTask(other, id, { title: "Neu" });
    expect((await getTask(id)).notifyUserId).toBe(owner.id);
    // Someone else saves the same setting again: nothing changes, the recipient stays.
    expect((await updateTask(other, id, { notify: mail })).changed).toBe(false);
    expect((await getTask(id)).notifyUserId).toBe(owner.id);
  });

  it("moves to the person who changes the setting and is audited", async () => {
    const { id } = await createTask(owner, { title: "T", dueOn: "2026-11-10", notify: mail });
    await updateTask(other, id, {
      notify: { channels: ["email", "whatsapp"], timing: "before_3d", at: null },
    });
    expect((await getTask(id)).notifyUserId).toBe(other.id);
    const entries = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.action, "task.update"), eq(auditLog.entityId, id)));
    expect(entries.at(-1)?.diff).toMatchObject({
      before: { notify: { userId: owner.id } },
      after: { notify: { userId: other.id } },
    });
  });

  it("is cleared with the channels and null without any", async () => {
    const none = await createTask(owner, { title: "Ohne" });
    expect((await getTask(none.id)).notifyUserId).toBeNull();
    const { id } = await createTask(owner, { title: "T", dueOn: "2026-11-10", notify: mail });
    await updateTask(owner, id, { notify: { channels: [], timing: null, at: null } });
    expect((await getTask(id)).notifyUserId).toBeNull();
  });

  it("is refused by the database without channels", async () => {
    const { id } = await createTask(owner, { title: "T" });
    await expect(
      db.update(task).set({ notifyUserId: owner.id }).where(eq(task.id, id)),
    ).rejects.toThrow();
  });
});

describe("task notify and template propagation", () => {
  it("a notify-only change does not mark the task customized; a content edit does", async () => {
    const { id } = await createTask(owner, { title: "T", dueOn: "2026-11-10" });
    await updateTask(owner, id, { notify: mail });
    expect((await getTask(id)).customized).toBe(false);
    // Notify together with a content edit still counts as an edit.
    await updateTask(owner, id, {
      title: "Anders",
      notify: { channels: [], timing: null, at: null },
    });
    expect((await getTask(id)).customized).toBe(true);
  });

  it("a due-date change with a non-relative timing saved still passes", async () => {
    const { id } = await createTask(owner, {
      title: "T",
      dueOn: "2026-11-10",
      notify: { channels: ["email"], timing: "custom", at: "2026-11-05T08:30:00.000Z" },
    });
    expect((await updateTask(owner, id, { dueOn: "2026-11-20" })).changed).toBe(true);
    expect((await updateTask(owner, id, { dueOn: null })).changed).toBe(true);
    expect((await getTask(id)).notifyTiming).toBe("custom");
  });
});

describe("notify form conversions (client helpers)", () => {
  const roundTrip = (wall: string) => {
    const instant = instantOf(wall);
    expect(instant).not.toBeNull();
    const back = wallClockOf((instant as Date).toISOString());
    // Whatever it resolved to is a valid wall clock that resolves to the same instant again.
    expect(back).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    expect(instantOf(back)?.toISOString()).toBe((instant as Date).toISOString());
    return { instant: (instant as Date).toISOString(), back };
  };

  it("round-trips winter and summer wall-clock times", () => {
    expect(roundTrip("2026-01-15T09:30")).toEqual({
      instant: "2026-01-15T08:30:00.000Z",
      back: "2026-01-15T09:30",
    });
    expect(roundTrip("2026-07-15T09:30")).toEqual({
      instant: "2026-07-15T07:30:00.000Z",
      back: "2026-07-15T09:30",
    });
  });

  it("resolves the non-existent 2026-03-29T02:30 deterministically and round-trips it", () => {
    const first = roundTrip("2026-03-29T02:30");
    expect(roundTrip("2026-03-29T02:30")).toEqual(first);
    expect(first.back.startsWith("2026-03-29T0")).toBe(true);
  });

  it("resolves the ambiguous 2026-10-25T02:30 deterministically and round-trips it", () => {
    const first = roundTrip("2026-10-25T02:30");
    expect(roundTrip("2026-10-25T02:30")).toEqual(first);
    expect(first.back).toBe("2026-10-25T02:30");
  });

  it("converts form state and saved settings both ways", () => {
    expect(instantOf("")).toBeNull();
    expect(instantOf("2026-07-15")).toBeNull();
    const input = notifyInputOf({ channels: ["email"], timing: "custom", at: "2026-07-15T09:30" });
    expect(input).toEqual({
      channels: ["email"],
      timing: "custom",
      at: "2026-07-15T07:30:00.000Z",
    });
    expect(notifyFormOf(input)).toEqual({
      channels: ["email"],
      timing: "custom",
      at: "2026-07-15T09:30",
    });
    // Relative timings carry no instant; no channels carries nothing.
    expect(notifyInputOf({ channels: ["email"], timing: "before_1d", at: "x" }).at).toBeNull();
    expect(notifyInputOf({ channels: [], timing: "custom", at: "2026-07-15T09:30" })).toEqual({
      channels: [],
      timing: null,
      at: null,
    });
  });
});
