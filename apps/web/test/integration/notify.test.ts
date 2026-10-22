import { insertNotifications, notification, staffMember } from "@marktwerk/db";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { resetDatabase } from "../helpers/fixtures";

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await db.$client.end();
});

describe("insertNotifications", () => {
  it("stores each (recipient, dedupe key) once and reports only new rows", async () => {
    const [anna] = await db
      .insert(staffMember)
      .values({ displayName: "Anna Test", firstName: "Anna", lastName: "Test" })
      .returning();
    if (!anna) throw new Error("no staff");
    const item = {
      recipientStaffMemberId: anna.id,
      reason: "overdue" as const,
      title: "Aufgabe überfällig",
      dedupeKey: "task:1:overdue:2026-11-01",
    };
    expect(await insertNotifications(db, [item])).toBe(1);
    expect(await insertNotifications(db, [item, { ...item, dedupeKey: "task:2:overdue" }])).toBe(1);
    const rows = await db.select().from(notification);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ severity: "info", state: "unread" });
    expect(await insertNotifications(db, [])).toBe(0);
  });
});
