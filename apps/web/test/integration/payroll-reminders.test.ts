import { notification, payrollPeriod, shift, staffMember, user } from "@marktwerk/db/schema";
import { JOBS, payrollReminders } from "@marktwerk/jobs";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { createShift } from "@/server/services/shifts";
import { createActor, resetDatabase, seedCatalogue } from "../helpers/fixtures";

let cat: Awaited<ReturnType<typeof seedCatalogue>>;
let ownerStaffId: string;
let managerStaffId: string;
let fieldStaffId: string;

/** 08:00 Berlin time on a day (summer/winter time does not matter for the date). */
const at = (day: string) => new Date(`${day}T06:30:00Z`);

beforeEach(async () => {
  await resetDatabase();
  cat = await seedCatalogue();
  const owner = await createActor("owner");
  const manager = await createActor("manager");
  const field = await createActor("field");
  const [o, m, f] = await db
    .insert(staffMember)
    .values([
      { displayName: "Olga Owner", firstName: "Olga", lastName: "Owner", userId: owner.id },
      { displayName: "Max Manager", firstName: "Max", lastName: "Manager", userId: manager.id },
      { displayName: "Fiona Field", firstName: "Fiona", lastName: "Field", userId: field.id },
    ])
    .returning();
  if (!o || !m || !f) throw new Error("no staff");
  ownerStaffId = o.id;
  managerStaffId = m.id;
  fieldStaffId = f.id;
  await db.update(user).set({ role: "field" }).where(eq(user.id, field.id));
});

afterAll(async () => {
  await db.$client.end();
});

const reminders = () =>
  db.select().from(notification).where(eq(notification.reason, "payroll_close"));
const missing = () =>
  db.select().from(notification).where(eq(notification.reason, "hours_missing"));

/** One worked shift in October 2026 so the month has something to close. */
async function octoberWork() {
  const actor = await createActor("owner");
  await createShift(
    actor,
    {
      eventId: null,
      staffMemberId: cat.staff.anna.id,
      dutyRoleId: null,
      workDate: "2026-10-10",
      plannedStart: null,
      plannedEnd: null,
      actualStart: "08:00",
      actualEnd: "14:00",
      breakMinutes: 0,
    },
    { today: "2026-10-20" },
  );
}

describe("payroll-reminders job", () => {
  it("is registered to run daily", () => {
    expect(JOBS["payroll-reminders"].cron).toMatch(/^\d+ 7 \* \* \*$/);
  });

  it("does nothing before the 12th", async () => {
    await octoberWork();
    expect(await payrollReminders(db, at("2026-11-11"))).toEqual({ created: 0 });
    expect(await reminders()).toHaveLength(0);
  });

  it("reminds the office on the 12th, once, and only people who manage hours", async () => {
    await octoberWork();
    const first = await payrollReminders(db, at("2026-11-12"));
    expect(first.created).toBe(2);
    const rows = await reminders();
    expect(rows.map((r) => r.recipientStaffMemberId).sort()).toEqual(
      [ownerStaffId, managerStaffId].sort(),
    );
    expect(rows.some((r) => r.recipientStaffMemberId === fieldStaffId)).toBe(false);
    expect(rows[0]).toMatchObject({
      severity: "warning",
      link: "/team/stunden/abschluss?month=2026-10",
      dedupeKey: "payroll_close:2026-10:remind",
    });
    expect(rows[0]?.title).toContain("Oktober 2026");

    // Running again the same day, or on the 13th and 14th, adds nothing.
    expect(await payrollReminders(db, at("2026-11-12"))).toEqual({ created: 0 });
    expect(await payrollReminders(db, at("2026-11-14"))).toEqual({ created: 0 });
    expect(await reminders()).toHaveLength(2);
  });

  it("escalates on the deadline and after it", async () => {
    await octoberWork();
    await payrollReminders(db, at("2026-11-12"));
    await payrollReminders(db, at("2026-11-15"));
    await payrollReminders(db, at("2026-11-16"));
    await payrollReminders(db, at("2026-11-17"));
    const keys = (await reminders()).map((r) => r.dedupeKey).sort();
    expect(keys.filter((k) => k?.endsWith(":due"))).toHaveLength(2);
    expect(keys.filter((k) => k?.endsWith(":overdue"))).toHaveLength(2);
    const overdue = (await reminders()).find((r) => r.dedupeKey?.endsWith(":overdue"));
    expect(overdue?.severity).toBe("critical");
  });

  it("starts with the stage of the day when it first runs late", async () => {
    await octoberWork();
    await payrollReminders(db, at("2026-11-20"));
    expect((await reminders()).map((r) => r.dedupeKey)).toEqual([
      "payroll_close:2026-10:overdue",
      "payroll_close:2026-10:overdue",
    ]);
  });

  it("stops once the month is exported and when there is nothing to close", async () => {
    expect(await payrollReminders(db, at("2026-11-12"))).toEqual({ created: 0 });
    await octoberWork();
    // Entering the shift created the (open) period row.
    await db
      .update(payrollPeriod)
      .set({
        status: "exported",
        lockedAt: new Date(),
        approvedAt: new Date(),
        exportedAt: new Date(),
      })
      .where(eq(payrollPeriod.month, "2026-10-01"));
    expect(await payrollReminders(db, at("2026-11-12"))).toEqual({ created: 0 });
  });

  it("warns on day 5 and day 7 about shifts without times, grouped per day", async () => {
    const actor = await createActor("owner");
    const planned = (staffMemberId: string) =>
      createShift(
        actor,
        {
          eventId: null,
          staffMemberId,
          dutyRoleId: null,
          workDate: "2026-11-02",
          plannedStart: "08:00",
          plannedEnd: "14:00",
          actualStart: null,
          actualEnd: null,
          breakMinutes: 0,
        },
        { today: "2026-11-02" },
      );
    await planned(cat.staff.anna.id);
    await planned(cat.staff.ben.id);

    expect(await payrollReminders(db, at("2026-11-06"))).toEqual({ created: 0 });
    await payrollReminders(db, at("2026-11-07"));
    let rows = await missing();
    // One notification per office person for the whole day (2 shifts), not per shift.
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      severity: "warning",
      dedupeKey: "hours_missing:office:2026-11-02:alert",
    });
    expect(rows[0]?.title).toContain("(2)");

    await payrollReminders(db, at("2026-11-08"));
    expect(await missing()).toHaveLength(2);
    await payrollReminders(db, at("2026-11-09"));
    rows = await missing();
    expect(rows.filter((r) => r.severity === "critical")).toHaveLength(2);
    expect(rows.find((r) => r.severity === "critical")?.dedupeKey).toBe(
      "hours_missing:office:2026-11-02:deadline",
    );
    await payrollReminders(db, at("2026-11-10"));
    expect(await missing()).toHaveLength(6);
    await payrollReminders(db, at("2026-11-10"));
    expect(await missing()).toHaveLength(6);
  });

  it("is quiet once the times are in", async () => {
    const actor = await createActor("owner");
    const { id } = await createShift(
      actor,
      {
        eventId: null,
        staffMemberId: cat.staff.anna.id,
        dutyRoleId: null,
        workDate: "2026-11-02",
        plannedStart: "08:00",
        plannedEnd: "14:00",
        actualStart: null,
        actualEnd: null,
        breakMinutes: 0,
      },
      { today: "2026-11-02" },
    );
    await db
      .update(shift)
      .set({ actualStart: "08:00", actualEnd: "14:00", status: "worked" })
      .where(eq(shift.id, id));
    expect(await payrollReminders(db, at("2026-11-07"))).toEqual({ created: 0 });
  });
});
