import { companyDedupeKey } from "@marktwerk/core";
import {
  auditLog,
  eventPermit,
  notification,
  outboundMessage,
  permit,
  task,
} from "@marktwerk/db/schema";
import { deadlineSweep } from "@marktwerk/jobs";
import { and, eq, isNull } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { Actor } from "@/server/actor";
import { db } from "@/server/db";
import {
  companyBell,
  listCompanyNotifications,
  listNotifications,
} from "@/server/queries/notifications";
import { NotificationInputError } from "@/server/services/notifications";
import {
  markAllCompanyRead,
  markCompanyUnread,
  restoreCompanyNotification,
  setCompanyNotificationState,
  snoozeCompanyNotification,
} from "@/server/services/notifications-company";
import { setTaskStatus, snoozeTask } from "@/server/services/tasks";
import { createActor, resetDatabase, seedCatalogue } from "../helpers/fixtures";
import { insertEvent } from "../helpers/tasks";

/** Wed 21.10.2026, 12:00 Berlin (CEST). */
const NOW = new Date("2026-10-21T10:00:00Z");
const DAY = 24 * 60 * 60 * 1000;
const daysFromNow = (days: number) => new Date(NOW.getTime() + days * DAY);
const OPEN = { status: "open", sort: "urgency" } as const;

let cat: Awaited<ReturnType<typeof seedCatalogue>>;
let owner: Actor;
let manager: Actor;
let staff: Actor;

beforeEach(async () => {
  await resetDatabase();
  cat = await seedCatalogue();
  owner = await createActor("owner");
  manager = await createActor("manager");
  staff = { ...(await createActor("staff")), staffMemberId: cat.staff.anna.id };
});

afterAll(async () => {
  await db.$client.end();
});

type NewTask = typeof task.$inferInsert;
const addTask = async (values: NewTask) => {
  const [row] = await db.insert(task).values(values).returning();
  if (!row) throw new Error("no task");
  return row;
};
const addPermit = async (values: Partial<typeof permit.$inferInsert> = {}) => {
  const [row] = await db
    .insert(permit)
    .values({
      venueId: cat.venue.id,
      category: "city",
      permitType: "water",
      title: "Wasser 2027",
      ...values,
    })
    .returning();
  if (!row) throw new Error("no permit");
  return row;
};
const companyRows = () =>
  db.select().from(notification).where(isNull(notification.recipientStaffMemberId));

describe("sweep: company-wide generation", () => {
  it("creates one notification per overdue or due-soon task, once, without email", async () => {
    const market = await insertEvent(cat, "Flohmarkt Test", "2026-11-08");
    const overdue = await addTask({
      title: "Überfällig",
      dueAt: daysFromNow(-2),
      eventId: market.id,
    });
    const key = await addTask({
      title: "Kernaufgabe in 3 Tagen",
      dueAt: daysFromNow(3),
      isKey: true,
      eventId: market.id,
    });
    const tomorrow = await addTask({ title: "Morgen", dueAt: daysFromNow(1), eventId: market.id });
    await addTask({ title: "Zu weit weg", dueAt: daysFromNow(3), eventId: market.id });
    await addTask({ title: "Erledigt", dueAt: daysFromNow(-2), status: "done", completedAt: NOW });
    await addTask({ title: "Ohne Datum" });
    // waiting for the authority: "wartet seit …", never overdue
    await addTask({ title: "Wartet", dueAt: daysFromNow(-2), status: "waiting_external" });
    // the logbook's "beantragen" task: the permit's apply-by item covers it
    await addTask({ title: "Beantragen", dueAt: daysFromNow(-2), source: "permit" });
    // snoozed: no notification
    await addTask({ title: "Zurückgestellt", dueAt: daysFromNow(-2), snoozedUntil: "2026-10-25" });
    // market long over
    const past = await insertEvent(cat, "Alter Markt", "2026-09-01");
    await addTask({ title: "Vergangener Markt", dueAt: daysFromNow(-40), eventId: past.id });

    const first = await deadlineSweep(db, NOW);
    expect(first.company.created).toBe(3);
    const rows = await companyRows();
    expect(rows).toHaveLength(3);
    const bySubject = new Map(rows.map((r) => [r.subjectId, r]));
    expect(bySubject.get(overdue.id)).toMatchObject({
      reason: "overdue",
      severity: "warning",
      recipientStaffMemberId: null,
      dedupeKey: companyDedupeKey("task_overdue", overdue.id, "2026-10-19"),
    });
    expect(bySubject.get(key.id)).toMatchObject({ reason: "due_soon", severity: "warning" });
    expect(bySubject.get(tomorrow.id)).toMatchObject({ reason: "due_soon", severity: "info" });

    // idempotent
    expect((await deadlineSweep(db, NOW)).company).toEqual({ created: 0, resolved: 0 });
    expect(await companyRows()).toHaveLength(3);
    // never by email
    expect(await db.select().from(outboundMessage)).toHaveLength(0);
  });

  it("makes overdue Kernaufgaben critical and a moved due date a new item", async () => {
    const t = await addTask({ title: "Kern", dueAt: daysFromNow(-1), isKey: true });
    await deadlineSweep(db, NOW);
    expect((await companyRows())[0]).toMatchObject({ severity: "critical" });
    // the due date moves: the old notification resolves, a new one exists for the new date
    await db
      .update(task)
      .set({ dueAt: daysFromNow(-3) })
      .where(eq(task.id, t.id));
    const again = await deadlineSweep(db, NOW);
    expect(again.company).toEqual({ created: 1, resolved: 1 });
    const open = (await listCompanyNotifications(owner, OPEN, NOW)).rows;
    expect(open).toHaveLength(1);
    expect(open[0]?.dueOn).toBe("2026-10-18");
  });

  it("lists permits by apply-by within the horizon, decisions due and permits ending before a market", async () => {
    const applyBy = await addPermit({
      title: "Antrag",
      status: "preparing",
      applyBy: "2026-10-30",
    });
    await addPermit({ title: "Zu früh", status: "not_started", applyBy: "2026-12-30" });
    const decision = await addPermit({
      title: "Entscheidung",
      status: "applied",
      expectedDecisionOn: "2026-10-25",
    });
    const market = await insertEvent(cat, "Markt im November", "2026-11-14");
    const expiring = await addPermit({
      title: "Läuft ab",
      status: "granted",
      validUntil: "2026-11-01",
    });
    await db
      .insert(eventPermit)
      .values({ eventId: market.id, permitId: expiring.id, required: true });
    const fine = await addPermit({ title: "Gültig", status: "granted", validUntil: "2026-12-31" });
    await db.insert(eventPermit).values({ eventId: market.id, permitId: fine.id, required: true });

    const result = await deadlineSweep(db, NOW);
    expect(result.company.created).toBe(3);
    const rows = await companyRows();
    expect(rows.map((r) => r.subjectId).sort()).toEqual(
      [applyBy.id, decision.id, expiring.id].sort(),
    );
    const center = await listCompanyNotifications(owner, { ...OPEN, art: "permits" }, NOW);
    expect(center.rows.map((r) => r.kind).sort()).toEqual([
      "permit_apply_by",
      "permit_decision",
      "permit_expiry",
    ]);
    expect(center.rows.find((r) => r.kind === "permit_expiry")?.market?.name).toBe(
      "Markt im November",
    );
  });
});

describe("auto-resolve", () => {
  it("a done task resolves its notification at query time and in the sweep", async () => {
    const t = await addTask({ title: "Plakate", dueAt: daysFromNow(-1) });
    await deadlineSweep(db, NOW);
    expect((await listCompanyNotifications(owner, OPEN, NOW)).rows).toHaveLength(1);

    await setTaskStatus(owner, t.id, "done", {}, { now: NOW, today: "2026-10-21" });
    // before any sweep: never shown as open
    const before = await listCompanyNotifications(owner, OPEN, NOW);
    expect(before.rows).toHaveLength(0);
    expect(before.statusCounts).toEqual({ open: 0, snoozed: 0, done: 1 });
    expect((await companyRows())[0]?.state).toBe("unread");

    const sweep = await deadlineSweep(db, NOW);
    expect(sweep.company.resolved).toBe(1);
    expect((await companyRows())[0]?.state).toBe("done");
  });

  it("a snoozed task shows as snoozed until its date and is not done", async () => {
    const t = await addTask({ title: "Zurückstellen", dueAt: daysFromNow(-1) });
    await deadlineSweep(db, NOW);
    await snoozeTask(owner, t.id, "2026-10-26", { now: NOW, today: "2026-10-21" });
    const center = await listCompanyNotifications(
      owner,
      { status: "snoozed", sort: "urgency" },
      NOW,
    );
    expect(center.rows).toHaveLength(1);
    expect(center.rows[0]?.snoozedUntil).toBe("2026-10-26");
    await deadlineSweep(db, NOW);
    expect((await companyRows())[0]?.state).toBe("unread");
    // after the snooze date it is open again
    const later = new Date("2026-10-27T10:00:00Z");
    expect((await listCompanyNotifications(owner, OPEN, later)).rows).toHaveLength(1);
  });

  it("a granted or no longer required permit resolves its notification", async () => {
    const p = await addPermit({ status: "preparing", applyBy: "2026-10-25" });
    await deadlineSweep(db, NOW);
    expect((await listCompanyNotifications(owner, OPEN, NOW)).rows).toHaveLength(1);
    await db
      .update(permit)
      .set({ status: "applied", appliedAt: "2026-10-21" })
      .where(eq(permit.id, p.id));
    expect((await listCompanyNotifications(owner, OPEN, NOW)).rows).toHaveLength(0);
    expect((await deadlineSweep(db, NOW)).company.resolved).toBe(1);

    const q = await addPermit({ title: "Nicht nötig", status: "preparing", applyBy: "2026-10-25" });
    await deadlineSweep(db, NOW);
    await db.update(permit).set({ status: "not_required" }).where(eq(permit.id, q.id));
    expect((await listCompanyNotifications(owner, OPEN, NOW)).rows).toHaveLength(0);
  });
});

describe("center: actions, undo and audit", () => {
  const idOf = async () => {
    const rows = await companyRows();
    return rows[0]?.id as string;
  };

  it("marks done and restores", async () => {
    await addPermit({ status: "preparing", applyBy: "2026-10-25" });
    await deadlineSweep(db, NOW);
    const id = await idOf();
    const done = await setCompanyNotificationState(owner, id, "done", NOW);
    expect(done.changed).toBe(true);
    const center = await listCompanyNotifications(owner, { status: "done", sort: "newest" }, NOW);
    expect(center.rows.map((r) => r.id)).toEqual([id]);
    expect((await listCompanyNotifications(owner, OPEN, NOW)).rows).toHaveLength(0);

    await restoreCompanyNotification(owner, id, done.previous);
    expect((await listCompanyNotifications(owner, OPEN, NOW)).rows).toHaveLength(1);
    const audits = await db.select().from(auditLog).where(eq(auditLog.entityId, id));
    expect(audits.map((a) => a.action).sort()).toEqual([
      "notification.done",
      "notification.restore",
    ]);
  });

  it("snoozes until a date, reopens, and rejects a date that is not after today", async () => {
    await addPermit({ status: "preparing", applyBy: "2026-10-25" });
    await deadlineSweep(db, NOW);
    const id = await idOf();
    await expect(snoozeCompanyNotification(owner, id, "2026-10-21", NOW)).rejects.toMatchObject({
      code: "invalid_snooze",
    });
    const result = await snoozeCompanyNotification(owner, id, "2026-10-24", NOW);
    expect(result.until.toISOString()).toBe("2026-10-24T06:00:00.000Z");
    const snoozed = await listCompanyNotifications(
      owner,
      { status: "snoozed", sort: "urgency" },
      NOW,
    );
    expect(snoozed.rows).toHaveLength(1);
    expect((await listCompanyNotifications(owner, OPEN, NOW)).rows).toHaveLength(0);
    // wakes up by itself
    const woken = new Date("2026-10-24T07:00:00Z");
    expect((await listCompanyNotifications(owner, OPEN, woken)).rows).toHaveLength(1);

    await setCompanyNotificationState(owner, id, "unread", NOW);
    expect((await listCompanyNotifications(owner, OPEN, NOW)).rows).toHaveLength(1);
  });

  it("marks everything read and undoes it; the bell counts unread open items", async () => {
    await addPermit({ status: "preparing", applyBy: "2026-10-25" });
    await addTask({ title: "A", dueAt: daysFromNow(-1) });
    await deadlineSweep(db, NOW);
    expect((await companyBell(manager, 5, NOW)).unread).toBe(2);
    const { ids } = await markAllCompanyRead(manager, {}, NOW);
    expect(ids).toHaveLength(2);
    const bell = await companyBell(manager, 5, NOW);
    expect(bell).toMatchObject({ unread: 0, open: 2 });
    await markCompanyUnread(manager, ids);
    expect((await companyBell(manager, 5, NOW)).unread).toBe(2);
  });

  it("filters by Art and Markt and sorts by urgency or newest", async () => {
    const market = await insertEvent(cat, "Flohmarkt A", "2026-11-08");
    await addTask({ title: "Spät", dueAt: daysFromNow(-1), eventId: market.id });
    await addTask({ title: "Kern früh", dueAt: daysFromNow(-5), isKey: true });
    await addPermit({ status: "preparing", applyBy: "2026-10-25" });
    await deadlineSweep(db, NOW);
    const all = await listCompanyNotifications(owner, OPEN, NOW);
    expect(all.rows.map((r) => r.title)).toEqual(["Kern früh", "Spät", "Wasser 2027"]);
    expect(all.artCounts).toEqual({ tasks: 2, permits: 1 });
    const tasks = await listCompanyNotifications(owner, { ...OPEN, art: "tasks" }, NOW);
    expect(tasks.rows).toHaveLength(2);
    const newest = await listCompanyNotifications(owner, { status: "open", sort: "newest" }, NOW);
    expect(newest.rows).toHaveLength(3);
  });

  it("rejects a notification that is not company-wide and unknown ids", async () => {
    await expect(
      setCompanyNotificationState(owner, "00000000-0000-4000-8000-000000000000", "done"),
    ).rejects.toBeInstanceOf(NotificationInputError);
    const [personal] = await db
      .insert(notification)
      .values({
        recipientStaffMemberId: cat.staff.anna.id,
        reason: "overdue",
        title: "Persönlich",
        dedupeKey: "personal-1",
      })
      .returning();
    await expect(
      setCompanyNotificationState(owner, personal?.id as string, "done"),
    ).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("permissions", () => {
  it("staff do not see or change company-wide notifications and keep their personal ones", async () => {
    await addTask({ title: "A", dueAt: daysFromNow(-1) });
    await deadlineSweep(db, NOW);
    const id = (await companyRows())[0]?.id as string;
    expect((await listCompanyNotifications(staff, OPEN, NOW)).rows).toHaveLength(0);
    expect(await companyBell(staff, 5, NOW)).toEqual({ unread: 0, open: 0, items: [] });
    await expect(setCompanyNotificationState(staff, id, "done")).rejects.toMatchObject({
      code: "forbidden",
    });
    await expect(snoozeCompanyNotification(staff, id, "2026-10-25")).rejects.toMatchObject({
      code: "forbidden",
    });
    // personal inbox: only what was sent to the person
    const personal = await listNotifications(staff, { view: "open" });
    expect(personal.rows.every((r) => r.id !== id)).toBe(true);
    // owner and manager do
    expect((await listCompanyNotifications(manager, OPEN, NOW)).rows).toHaveLength(1);
    expect(
      await db
        .select()
        .from(notification)
        .where(and(eq(notification.id, id), eq(notification.state, "unread"))),
    ).toHaveLength(1);
  });
});
