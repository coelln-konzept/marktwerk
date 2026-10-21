import { insertNotifications, notification } from "@marktwerk/db";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { Actor } from "@/server/actor";
import { db } from "@/server/db";
import {
  latestNotifications,
  listNotifications,
  unreadCount,
} from "@/server/queries/notifications";
import {
  markAllRead,
  markUnread,
  NotificationInputError,
  restoreNotification,
  setNotificationState,
  snoozeNotification,
  snoozeUntil,
} from "@/server/services/notifications";
import { createActor, resetDatabase, seedCatalogue } from "../helpers/fixtures";

let anna: Actor;
let ben: Actor;
let annaId: string;
let benId: string;
let loginOnly: Actor;

beforeEach(async () => {
  await resetDatabase();
  const cat = await seedCatalogue();
  annaId = cat.staff.anna.id;
  benId = cat.staff.ben.id;
  anna = { ...(await createActor("staff")), staffMemberId: annaId };
  ben = { ...(await createActor("manager")), staffMemberId: benId };
  loginOnly = await createActor("owner");
});

afterAll(async () => {
  await db.$client.end();
});

async function seed(
  recipient: string,
  items: {
    key: string;
    reason: "overdue" | "assigned" | "mentioned" | "permit_apply_by" | "escalated";
  }[],
) {
  await insertNotifications(
    db,
    items.map((i) => ({
      recipientStaffMemberId: recipient,
      reason: i.reason,
      title: `Titel ${i.key}`,
      link: `/x/${i.key}`,
      dedupeKey: i.key,
    })),
  );
  const rows = await db
    .select()
    .from(notification)
    .where(eq(notification.recipientStaffMemberId, recipient));
  return new Map(rows.map((r) => [r.dedupeKey, r.id]));
}

describe("notification state", () => {
  it("moves between unread, read, saved and done and reports the previous state", async () => {
    const ids = await seed(annaId, [{ key: "a", reason: "overdue" }]);
    const id = ids.get("a") as string;
    expect(await unreadCount(anna)).toBe(1);

    const read = await setNotificationState(anna, id, "read");
    expect(read.changed).toBe(true);
    expect(read.previous.state).toBe("unread");
    expect(await unreadCount(anna)).toBe(0);
    const [row] = await db.select().from(notification).where(eq(notification.id, id));
    expect(row?.state).toBe("read");
    expect(row?.readAt).toBeInstanceOf(Date);

    expect((await setNotificationState(anna, id, "read")).changed).toBe(false);
    await setNotificationState(anna, id, "saved");
    await setNotificationState(anna, id, "done");
    const done = await listNotifications(anna, { view: "done" });
    expect(done.rows.map((r) => r.id)).toEqual([id]);
    expect((await listNotifications(anna, { view: "open" })).rows).toHaveLength(0);

    // Undo goes back to what it was before the last change.
    const last = await setNotificationState(anna, id, "unread");
    expect(last.previous.state).toBe("done");
    await restoreNotification(anna, id, last.previous);
    const [back] = await db.select().from(notification).where(eq(notification.id, id));
    expect(back?.state).toBe("done");
  });

  it("only lets the recipient change a notification", async () => {
    const ids = await seed(annaId, [{ key: "a", reason: "overdue" }]);
    const id = ids.get("a") as string;
    await expect(setNotificationState(ben, id, "read")).rejects.toMatchObject({
      code: "not_found",
    });
    await expect(setNotificationState(loginOnly, id, "read")).rejects.toMatchObject({
      code: "not_found",
    });
    await expect(setNotificationState(anna, "nope", "read")).rejects.toBeInstanceOf(
      NotificationInputError,
    );
    await expect(setNotificationState(anna, id, "archived")).rejects.toMatchObject({
      code: "invalid_state",
    });
    const [row] = await db.select().from(notification).where(eq(notification.id, id));
    expect(row?.state).toBe("unread");
    // A login without a staff record has no inbox.
    expect(await unreadCount(loginOnly)).toBe(0);
    expect((await listNotifications(loginOnly, { view: "all" })).rows).toEqual([]);
    expect(await latestNotifications(loginOnly)).toEqual([]);
  });
});

describe("snooze", () => {
  it("hides until the time, then the notification is unread again", async () => {
    const ids = await seed(annaId, [{ key: "a", reason: "overdue" }]);
    const id = ids.get("a") as string;
    const now = new Date("2026-10-21T10:00:00Z");
    const { until } = await snoozeNotification(anna, id, "hour", now);
    expect(until.toISOString()).toBe("2026-10-21T11:00:00.000Z");

    expect(await unreadCount(anna, now)).toBe(0);
    expect(await latestNotifications(anna, 8, now)).toHaveLength(0);
    const hidden = await listNotifications(anna, { view: "open" }, now);
    expect(hidden.rows).toHaveLength(0);
    expect(hidden.snoozed).toBe(1);

    const later = new Date("2026-10-21T11:00:01Z");
    expect(await unreadCount(anna, later)).toBe(1);
    expect(await latestNotifications(anna, 8, later)).toHaveLength(1);
  });

  it("computes 'tomorrow' and 'next week' as 08:00 company time", () => {
    // Wed 21.10.2026 10:00 UTC = 12:00 CEST (DST ends 25.10.)
    const now = new Date("2026-10-21T10:00:00Z");
    expect(snoozeUntil("tomorrow", now).toISOString()).toBe("2026-10-22T06:00:00.000Z");
    // Next Monday is 26.10.2026, after the switch to CET.
    expect(snoozeUntil("next_week", now).toISOString()).toBe("2026-10-26T07:00:00.000Z");
  });

  it("refuses unknown choices and reading ends a snooze", async () => {
    const ids = await seed(annaId, [{ key: "a", reason: "overdue" }]);
    const id = ids.get("a") as string;
    await expect(snoozeNotification(anna, id, "forever")).rejects.toMatchObject({
      code: "invalid_snooze",
    });
    await snoozeNotification(anna, id, "tomorrow");
    await setNotificationState(anna, id, "read");
    const [row] = await db.select().from(notification).where(eq(notification.id, id));
    expect(row?.snoozedUntil).toBeNull();
    expect((await listNotifications(anna, { view: "open" })).rows).toHaveLength(1);
  });
});

describe("mark all read", () => {
  it("marks unread ones, optionally of one reason group, and can be undone", async () => {
    const ids = await seed(annaId, [
      { key: "a", reason: "overdue" },
      { key: "b", reason: "permit_apply_by" },
      { key: "c", reason: "mentioned" },
      { key: "d", reason: "assigned" },
    ]);
    await seed(benId, [{ key: "x", reason: "overdue" }]);
    expect(await unreadCount(anna)).toBe(4);

    const deadlines = await markAllRead(anna, "deadlines");
    expect(deadlines.ids.sort()).toEqual([ids.get("a"), ids.get("b")].sort());
    expect(await unreadCount(anna)).toBe(2);

    const all = await markAllRead(anna);
    expect(all.ids).toHaveLength(2);
    expect(await unreadCount(anna)).toBe(0);
    // Ben's inbox is untouched.
    expect(await unreadCount(ben)).toBe(1);

    expect((await markUnread(anna, all.ids)).count).toBe(2);
    expect(await unreadCount(anna)).toBe(2);
    expect((await markAllRead(loginOnly)).ids).toEqual([]);
  });
});

describe("listing", () => {
  it("filters by reason group, counts groups and pages the bell to the latest eight", async () => {
    const items = Array.from({ length: 10 }, (_, i) => ({
      key: `n${i}`,
      reason: (i % 2 === 0 ? "overdue" : "mentioned") as "overdue" | "mentioned",
    }));
    await seed(annaId, items);
    const page = await listNotifications(anna, { view: "open" });
    expect(page.rows).toHaveLength(10);
    expect(page.groupCounts).toMatchObject({
      deadlines: 5,
      mentioned: 5,
      assigned: 0,
      escalated: 0,
    });
    expect(page.total).toBe(10);
    expect(page.unread).toBe(10);

    const mentioned = await listNotifications(anna, { view: "open", group: "mentioned" });
    expect(mentioned.rows.every((r) => r.reason === "mentioned")).toBe(true);
    expect(mentioned.rows).toHaveLength(5);

    expect(await latestNotifications(anna)).toHaveLength(8);
    const small = await listNotifications(anna, { view: "open", limit: 3 });
    expect(small.rows).toHaveLength(3);
    expect(small.hasMore).toBe(true);
  });
});
