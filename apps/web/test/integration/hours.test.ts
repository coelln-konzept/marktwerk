import {
  auditLog,
  employmentContract,
  event,
  legalParameter,
  overrunJustification,
  payrollPeriod,
  shift,
  shiftRevision,
  staffMember,
  user,
} from "@marktwerk/db/schema";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { type Actor, visibleEvents } from "@/server/actor";
import { db } from "@/server/db";
import {
  calendarItems,
  closeChecksOf,
  dueItems,
  listContracts,
  listShiftRows,
  loadMonthFigures,
} from "@/server/queries/hours";
import { type ContractInput, ContractInputError, saveContract } from "@/server/services/contracts";
import { createEventsFromPreset } from "@/server/services/events";
import {
  approvePeriod,
  exportPeriod,
  lockPeriod,
  PayrollInputError,
  saveOverrunJustification,
  unlockPeriod,
} from "@/server/services/payroll";
import {
  createShift,
  listShiftRevisions,
  recordShiftTimes,
  type ShiftInput,
  updateShift,
} from "@/server/services/shifts";
import { createActor, resetDatabase, seedCatalogue } from "../helpers/fixtures";

let cat: Awaited<ReturnType<typeof seedCatalogue>>;
let owner: Actor;
let eventId: string;

/** A day after the test month, so the month is over and actual times are allowed. */
const TODAY = "2026-12-01";

const isForbidden = (error: unknown) =>
  String((error as { digest?: unknown })?.digest ?? "").includes("403");

const minijob = (patch: Partial<ContractInput> = {}): ContractInput => ({
  type: "minijob",
  hourlyRateCents: 1390,
  contractedHoursPerWeek: 10,
  fixedMonthlyPayCents: null,
  workingTimeAccount: false,
  otherMinijobDeclared: false,
  validFrom: "2026-01-01",
  validUntil: null,
  ...patch,
});

const shiftInput = (patch: Partial<ShiftInput> = {}): ShiftInput => ({
  eventId: null,
  staffMemberId: cat.staff.anna.id,
  dutyRoleId: null,
  workDate: "2026-11-02",
  plannedStart: null,
  plannedEnd: null,
  actualStart: "08:00",
  actualEnd: "16:30",
  breakMinutes: 30,
  ...patch,
});

async function seedLegal() {
  await db.insert(legalParameter).values([
    { key: "minimum_wage_cents_per_hour", value: 1390, validFrom: "2026-01-01" },
    { key: "minimum_wage_cents_per_hour", value: 1460, validFrom: "2027-01-01" },
    { key: "minijob_limit_cents_per_month", value: 60300, validFrom: "2026-01-01" },
    { key: "minijob_limit_cents_per_month", value: 63300, validFrom: "2027-01-01" },
    { key: "minijob_overrun_ceiling_factor", value: 2, validFrom: "2026-01-01" },
    { key: "minijob_max_overrun_months_12", value: 2, validFrom: "2026-01-01" },
  ]);
}

beforeEach(async () => {
  await resetDatabase();
  cat = await seedCatalogue();
  await seedLegal();
  owner = await createActor("owner");
  const [created] = await createEventsFromPreset(owner, cat.presets.flea.id, ["2026-11-14"]);
  if (!created) throw new Error("no event");
  eventId = created.id;
});

afterAll(async () => {
  await db.$client.end();
});

describe("contracts", () => {
  it("creates a contract, lists the history newest first and audits it", async () => {
    await saveContract(owner, cat.staff.anna.id, minijob({ validUntil: "2026-06-30" }));
    await saveContract(
      owner,
      cat.staff.anna.id,
      minijob({ validFrom: "2026-07-01", hourlyRateCents: 1450 }),
    );
    const list = await listContracts(cat.staff.anna.id);
    expect(list.map((c) => c.validFrom)).toEqual(["2026-07-01", "2026-01-01"]);
    expect(list[0]?.hourlyRateCents).toBe(1450);
    const audits = await db.select().from(auditLog).where(eq(auditLog.action, "contract.create"));
    expect(audits).toHaveLength(2);
    expect(audits[0]).toMatchObject({ actorId: owner.id, entityType: "staff_member" });
  });

  it("refuses overlapping contracts, allows touching ones, ignores itself when editing", async () => {
    const { id } = await saveContract(
      owner,
      cat.staff.anna.id,
      minijob({ validUntil: "2026-06-30" }),
    );
    await expect(
      saveContract(owner, cat.staff.anna.id, minijob({ validFrom: "2026-06-30" })),
    ).rejects.toMatchObject({ code: "overlap", detail: "2026-01-01" });
    await saveContract(owner, cat.staff.anna.id, minijob({ validFrom: "2026-07-01" }));
    // The first one can not be stretched into the second.
    await expect(
      saveContract(owner, cat.staff.anna.id, minijob({ validUntil: "2026-07-15" }), id),
    ).rejects.toMatchObject({ code: "overlap" });
    // But it can be edited without touching the dates.
    await saveContract(
      owner,
      cat.staff.anna.id,
      minijob({ validUntil: "2026-06-30", contractedHoursPerWeek: 12 }),
      id,
    );
    const [row] = await db.select().from(employmentContract).where(eq(employmentContract.id, id));
    expect(row?.contractedHoursPerWeek).toBe(12);
    const updates = await db.select().from(auditLog).where(eq(auditLog.action, "contract.update"));
    expect(updates).toHaveLength(1);
    expect(updates[0]?.diff).toMatchObject({ before: { contractedHoursPerWeek: 10 } });
  });

  it("allows contracts of different people at the same time", async () => {
    await saveContract(owner, cat.staff.anna.id, minijob());
    await saveContract(owner, cat.staff.ben.id, minijob());
    expect(await listContracts(cat.staff.ben.id)).toHaveLength(1);
  });

  it("applies the Minijob rules: contracted hours, hourly rate, minimum wage", async () => {
    await expect(
      saveContract(owner, cat.staff.anna.id, minijob({ contractedHoursPerWeek: null })),
    ).rejects.toMatchObject({ code: "hours_required" });
    await expect(
      saveContract(
        owner,
        cat.staff.anna.id,
        minijob({ hourlyRateCents: null, fixedMonthlyPayCents: 60300 }),
      ),
    ).rejects.toMatchObject({ code: "rate_required" });
    await expect(
      saveContract(owner, cat.staff.anna.id, minijob({ hourlyRateCents: 1200 })),
    ).rejects.toMatchObject({ code: "below_minimum_wage", detail: "1390" });
    // The minimum wage of the contract's start date counts (14,60 € from 2027).
    await expect(
      saveContract(
        owner,
        cat.staff.anna.id,
        minijob({ validFrom: "2027-01-01", hourlyRateCents: 1400 }),
      ),
    ).rejects.toMatchObject({ code: "below_minimum_wage", detail: "1460" });
    await expect(
      saveContract(owner, cat.staff.anna.id, minijob({ validUntil: "2025-12-31" })),
    ).rejects.toMatchObject({ code: "invalid_dates" });
    await expect(saveContract(owner, "not-a-uuid", minijob())).rejects.toBeInstanceOf(
      ContractInputError,
    );
  });

  it("requires team:manage", async () => {
    for (const role of ["staff", "field"] as const) {
      const actor = await createActor(role);
      await expect(saveContract(actor, cat.staff.anna.id, minijob())).rejects.toSatisfy(
        isForbidden,
      );
    }
    const manager = await createActor("manager");
    await saveContract(manager, cat.staff.anna.id, minijob());
  });

  it("does not change pay terms of a locked month", async () => {
    const { id } = await saveContract(owner, cat.staff.anna.id, minijob());
    await createShift(owner, shiftInput(), { today: TODAY });
    await lockPeriod(owner, "2026-11-01", { today: TODAY });
    await expect(
      saveContract(owner, cat.staff.anna.id, minijob({ hourlyRateCents: 1500 }), id),
    ).rejects.toMatchObject({ code: "period_locked" });
    // Notes and other-Minijob flags are not pay-relevant.
    await saveContract(owner, cat.staff.anna.id, minijob({ otherMinijobDeclared: true }), id);
  });
});

describe("shifts", () => {
  beforeEach(async () => {
    await saveContract(owner, cat.staff.anna.id, minijob());
  });

  it("creates event and office shifts and audits them", async () => {
    const office = await createShift(owner, shiftInput(), { today: TODAY });
    const atEvent = await createShift(
      owner,
      shiftInput({
        eventId,
        dutyRoleId: cat.roles.setup.id,
        workDate: "2026-11-14",
        plannedStart: "06:00",
        plannedEnd: "14:00",
        actualStart: null,
        actualEnd: null,
        breakMinutes: 30,
      }),
      { today: TODAY },
    );
    const [a, b] = await Promise.all([
      db.select().from(shift).where(eq(shift.id, office.id)),
      db.select().from(shift).where(eq(shift.id, atEvent.id)),
    ]);
    expect(a[0]).toMatchObject({ eventId: null, status: "worked", version: 1 });
    expect(a[0]?.recordedAt).toBeInstanceOf(Date);
    expect(b[0]).toMatchObject({ eventId, status: "confirmed", recordedAt: null });
    const audits = await db.select().from(auditLog).where(eq(auditLog.action, "shift.create"));
    expect(audits).toHaveLength(2);
  });

  it("validates times, breaks and dates", async () => {
    const expectCode = (patch: Partial<ShiftInput>, code: string) =>
      expect(createShift(owner, shiftInput(patch), { today: TODAY })).rejects.toMatchObject({
        code,
      });
    await expectCode({ actualEnd: null }, "times_incomplete");
    await expectCode({ actualStart: "25:00" }, "invalid_time");
    await expectCode({ actualStart: null, actualEnd: null }, "no_times");
    await expectCode({ breakMinutes: -5 }, "invalid_break");
    await expectCode({ actualStart: "08:00", actualEnd: "07:00" }, "too_long");
    await expectCode(
      { actualStart: "08:00", actualEnd: "08:20", breakMinutes: 30 },
      "break_too_long",
    );
    await expectCode({ workDate: "2026-02-30" }, "invalid_date");
    await expectCode({ workDate: "2026-12-05" }, "future_actual");
    await expectCode({ staffMemberId: "00000000-0000-0000-0000-000000000000" }, "invalid_person");
    await expectCode({ eventId: "00000000-0000-0000-0000-000000000000" }, "invalid_event");
    await expectCode({ status: "confirmed" }, "status_conflict");
    // Planning ahead (planned times only) is fine for the future.
    await createShift(
      owner,
      shiftInput({
        workDate: "2026-12-05",
        actualStart: null,
        actualEnd: null,
        plannedStart: "09:00",
        plannedEnd: "13:00",
      }),
      { today: TODAY },
    );
  });

  it("refuses an exact duplicate", async () => {
    await createShift(owner, shiftInput(), { today: TODAY });
    await expect(createShift(owner, shiftInput(), { today: TODAY })).rejects.toMatchObject({
      code: "duplicate",
    });
  });

  it("handles a shift past midnight and counts it on its start day", async () => {
    const { id } = await createShift(
      owner,
      shiftInput({ actualStart: "22:00", actualEnd: "06:00", breakMinutes: 30 }),
      { today: TODAY },
    );
    const [row] = await listShiftRows(owner, { from: "2026-11-01", to: "2026-11-30" }, TODAY);
    expect(row).toMatchObject({ id, minutes: 450, workDate: "2026-11-02" });
  });

  it("versions every change with a reason and keeps the old state", async () => {
    const { id, version } = await createShift(owner, shiftInput(), { today: TODAY });
    await expect(
      updateShift(owner, id, { actualEnd: "17:00" }, "  ", version, { today: TODAY }),
    ).rejects.toMatchObject({ code: "reason_required" });

    const changed = await updateShift(
      owner,
      id,
      { actualEnd: "17:00", breakMinutes: 45 },
      "Pause nachgetragen, Ende laut Platzteam",
      version,
      { today: TODAY },
    );
    expect(changed).toEqual({ id, version: 2, changed: true });

    const [current] = await db.select().from(shift).where(eq(shift.id, id));
    expect(current).toMatchObject({ version: 2, actualEnd: "17:00:00", breakMinutes: 45 });
    const revisions = await listShiftRevisions(id);
    expect(revisions).toHaveLength(1);
    expect(revisions[0]).toMatchObject({
      version: 1,
      reason: "Pause nachgetragen, Ende laut Platzteam",
    });
    expect(revisions[0]?.before).toMatchObject({
      actualEnd: "16:30:00",
      breakMinutes: 30,
      version: 1,
    });

    const [audit] = await db.select().from(auditLog).where(eq(auditLog.action, "shift.update"));
    expect(audit?.diff).toMatchObject({
      reason: "Pause nachgetragen, Ende laut Platzteam",
      before: { actualEnd: "16:30", breakMinutes: 30 },
      after: { actualEnd: "17:00", breakMinutes: 45 },
    });

    // A stale version is a conflict, an unchanged save creates no revision.
    await expect(
      updateShift(owner, id, { actualEnd: "18:00" }, "zu spät", version, { today: TODAY }),
    ).rejects.toMatchObject({ code: "conflict" });
    const same = await updateShift(owner, id, { actualEnd: "17:00" }, "nichts", 2, {
      today: TODAY,
    });
    expect(same.changed).toBe(false);
    expect(await db.select().from(shiftRevision)).toHaveLength(1);
  });

  it("records actual times once without a reason, corrections need one", async () => {
    const { id, version } = await createShift(
      owner,
      shiftInput({
        actualStart: null,
        actualEnd: null,
        plannedStart: "08:00",
        plannedEnd: "16:00",
      }),
      { today: TODAY },
    );
    const times = { actualStart: "08:10", actualEnd: "16:05", breakMinutes: 30 };
    const first = await recordShiftTimes(owner, id, times, version, undefined, { today: TODAY });
    expect(first).toMatchObject({ version: 1, changed: true });
    const [row] = await db.select().from(shift).where(eq(shift.id, id));
    expect(row).toMatchObject({ status: "worked", actualStart: "08:10:00" });
    expect(row?.recordedAt).toBeInstanceOf(Date);
    expect(await db.select().from(shiftRevision)).toHaveLength(0);

    await expect(
      recordShiftTimes(owner, id, { ...times, actualEnd: "17:00" }, 1, undefined, { today: TODAY }),
    ).rejects.toMatchObject({ code: "reason_required" });
    const second = await recordShiftTimes(
      owner,
      id,
      { ...times, actualEnd: "17:00" },
      1,
      "Ende korrigiert",
      {
        today: TODAY,
      },
    );
    expect(second).toMatchObject({ version: 2, changed: true });
    expect(await db.select().from(shiftRevision)).toHaveLength(1);
  });

  it("is locked once the month is locked, until it is unlocked with a reason", async () => {
    const { id, version } = await createShift(owner, shiftInput(), { today: TODAY });
    await lockPeriod(owner, "2026-11-01", { today: TODAY });
    await expect(
      updateShift(owner, id, { actualEnd: "17:00" }, "Korrektur", version, { today: TODAY }),
    ).rejects.toMatchObject({ code: "period_locked" });
    await expect(
      createShift(owner, shiftInput({ workDate: "2026-11-03" }), { today: TODAY }),
    ).rejects.toMatchObject({ code: "period_locked" });
    // Other months stay editable.
    await createShift(owner, shiftInput({ workDate: "2026-10-03" }), { today: TODAY });

    await expect(unlockPeriod(owner, "2026-11-01", "")).rejects.toMatchObject({
      code: "reason_required",
    });
    await unlockPeriod(owner, "2026-11-01", "Pause vergessen");
    const result = await updateShift(owner, id, { actualEnd: "17:00" }, "Korrektur", version, {
      today: TODAY,
    });
    expect(result.version).toBe(2);
  });

  it("is only for team:manage", async () => {
    for (const role of ["staff", "field"] as const) {
      const actor = await createActor(role);
      await expect(createShift(actor, shiftInput(), { today: TODAY })).rejects.toSatisfy(
        isForbidden,
      );
    }
    const { id, version } = await createShift(owner, shiftInput(), { today: TODAY });
    const staff = await createActor("staff");
    await expect(
      updateShift(staff, id, { notes: "x" }, "weil", version, { today: TODAY }),
    ).rejects.toSatisfy(isForbidden);
  });
});

describe("warnings", () => {
  beforeEach(async () => {
    await saveContract(owner, cat.staff.anna.id, minijob());
  });

  it("flags more than 10 hours, short rest and a missing break", async () => {
    await createShift(
      owner,
      shiftInput({
        workDate: "2026-11-06",
        actualStart: "06:00",
        actualEnd: "18:00",
        breakMinutes: 45,
      }),
      { today: TODAY },
    );
    await createShift(
      owner,
      shiftInput({
        workDate: "2026-11-07",
        actualStart: "04:00",
        actualEnd: "10:00",
        breakMinutes: 0,
      }),
      { today: TODAY },
    );
    const rows = await listShiftRows(owner, { from: "2026-11-01", to: "2026-11-30" }, TODAY);
    const codes = (day: string) =>
      rows
        .filter((r) => r.workDate === day)
        .flatMap((r) => r.warnings)
        .flatMap((w) => (w.kind === "arbzg" ? [w.warning.code] : []));
    expect(codes("2026-11-06")).toContain("daily_max");
    expect(codes("2026-11-06")).not.toContain("break_missing");
    expect(codes("2026-11-07")).toContain("rest_period");
    expect(codes("2026-11-07")).not.toContain("break_missing"); // exactly 6 h needs no break
  });

  it("reports Minijob level, remaining allowance and overrun months", async () => {
    // 48 h × 13,90 € = 667,20 € > 603 €
    for (let day = 2; day <= 7; day += 1) {
      await createShift(owner, shiftInput({ workDate: `2026-11-0${day}` }), { today: TODAY });
    }
    const figures = await loadMonthFigures(db, "2026-11-01", TODAY);
    const anna = figures.rows.find((r) => r.staffMemberId === cat.staff.anna.id);
    expect(anna?.month.workedMinutes).toBe(48 * 60);
    expect(anna?.month.grossCents).toBe(66_720);
    expect(anna?.minijob?.status).toMatchObject({ level: "amber", earnedCents: 66_720 });
    expect(anna?.minijob?.overrunMonths).toBe(1);

    // Two earlier months over the limit make this the third: red.
    for (const month of ["2026-09", "2026-10"]) {
      for (let day = 1; day <= 6; day += 1) {
        await createShift(owner, shiftInput({ workDate: `${month}-0${day}` }), { today: TODAY });
      }
    }
    const again = await loadMonthFigures(db, "2026-11-01", TODAY);
    const red = again.rows.find((r) => r.staffMemberId === cat.staff.anna.id);
    expect(red?.minijob?.history.previousOverrunMonths).toBe(2);
    expect(red?.minijob?.status.level).toBe("red");
    expect(red?.minijob?.status.reasons).toContain("too_many_overrun_months");
  });

  it("takes the limit from legal_parameter for the month in question", async () => {
    // 43 h x 14,60 EUR = 627,80 EUR: over the 2026 limit (603 EUR) but under the 2027 limit (633 EUR).
    await saveContract(
      owner,
      cat.staff.ben.id,
      minijob({ validFrom: "2027-01-01", hourlyRateCents: 1460 }),
    );
    const long = { actualStart: "08:00", actualEnd: "17:30", breakMinutes: 30 };
    for (const day of ["04", "05", "06", "07"]) {
      await createShift(
        owner,
        shiftInput({ staffMemberId: cat.staff.ben.id, workDate: `2027-01-${day}`, ...long }),
        { today: "2027-03-01" },
      );
    }
    await createShift(
      owner,
      shiftInput({
        staffMemberId: cat.staff.ben.id,
        workDate: "2027-01-08",
        actualStart: "08:00",
        actualEnd: "15:30",
        breakMinutes: 30,
      }),
      { today: "2027-03-01" },
    );
    const figures = await loadMonthFigures(db, "2027-01-01", "2027-03-01");
    const ben = figures.rows.find((r) => r.staffMemberId === cat.staff.ben.id);
    expect(figures.params?.limitCents).toBe(63_300);
    expect(ben?.month.grossCents).toBe(62_780);
    expect(ben?.minijob?.status.level).toBe("ok");
    expect((await loadMonthFigures(db, "2026-11-01", "2027-03-01")).params?.limitCents).toBe(
      60_300,
    );
  });
});

describe("month close", () => {
  beforeEach(async () => {
    await saveContract(owner, cat.staff.anna.id, minijob());
    await saveContract(
      owner,
      cat.staff.ben.id,
      minijob({
        type: "full_time",
        hourlyRateCents: null,
        fixedMonthlyPayCents: 320_000,
        contractedHoursPerWeek: 40,
      }),
    );
    for (let day = 2; day <= 7; day += 1) {
      await createShift(owner, shiftInput({ workDate: `2026-11-0${day}` }), { today: TODAY });
    }
  });

  it("blocks the lock while times are missing or an overrun has no justification", async () => {
    await createShift(
      owner,
      shiftInput({
        workDate: "2026-11-20",
        actualStart: null,
        actualEnd: null,
        plannedStart: "09:00",
        plannedEnd: "13:00",
      }),
      { today: TODAY },
    );
    const error = await lockPeriod(owner, "2026-11-01", { today: TODAY }).catch((e) => e);
    expect(error).toBeInstanceOf(PayrollInputError);
    expect(error.code).toBe("checks_failed");
    expect(error.blockers.map((b: { code: string }) => b.code).sort()).toEqual([
      "missing_times",
      "overrun_unjustified",
    ]);
    const [period] = await db.select().from(payrollPeriod);
    expect(period?.status).toBe("open");
  });

  it("does not lock a month that is not over", async () => {
    const error = await lockPeriod(owner, "2026-11-01", { today: "2026-11-30" }).catch((e) => e);
    expect(error.code).toBe("checks_failed");
    expect(error.blockers.map((b: { code: string }) => b.code)).toContain("month_open");
  });

  it("takes the justification only for a real overrun, once per month", async () => {
    await expect(
      saveOverrunJustification(owner, cat.staff.ben.id, "2026-11-01", "Krankheitsvertretung", {
        today: TODAY,
      }),
    ).rejects.toMatchObject({ code: "no_overrun" });
    await expect(
      saveOverrunJustification(owner, cat.staff.anna.id, "2026-11-01", "kurz", { today: TODAY }),
    ).rejects.toMatchObject({ code: "reason_too_short" });
    const first = await saveOverrunJustification(
      owner,
      cat.staff.anna.id,
      "2026-11-01",
      "Krankheitsvertretung",
      { today: TODAY },
    );
    expect(first.created).toBe(true);
    const second = await saveOverrunJustification(
      owner,
      cat.staff.anna.id,
      "2026-11-01",
      "Krankheitsvertretung am Sa 07.11.",
      { today: TODAY },
    );
    expect(second.created).toBe(false);
    const rows = await db.select().from(overrunJustification);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.reason).toBe("Krankheitsvertretung am Sa 07.11.");
    const figures = await loadMonthFigures(db, "2026-11-01", TODAY);
    expect(closeChecksOf(figures, TODAY).filter((c) => c.level === "blocker")).toEqual([]);
  });

  it("walks open, locked, approved, exported and exports the CSV", async () => {
    await saveOverrunJustification(owner, cat.staff.anna.id, "2026-11-01", "Krankheitsvertretung", {
      today: TODAY,
    });
    await expect(approvePeriod(owner, "2026-11-01")).rejects.toMatchObject({
      code: "invalid_status",
    });
    await expect(exportPeriod(owner, "2026-11-01")).rejects.toMatchObject({
      code: "invalid_status",
    });

    await lockPeriod(owner, "2026-11-01", { today: TODAY });
    await expect(lockPeriod(owner, "2026-11-01", { today: TODAY })).rejects.toMatchObject({
      code: "invalid_status",
    });
    // No more justification edits in a locked month.
    await expect(
      saveOverrunJustification(owner, cat.staff.anna.id, "2026-11-01", "anders", { today: TODAY }),
    ).rejects.toMatchObject({ code: "period_locked" });

    await approvePeriod(owner, "2026-11-01");
    const approvedShifts = await db.select().from(shift).where(eq(shift.status, "worked"));
    expect(approvedShifts.every((s) => s.approvedAt !== null)).toBe(true);

    const file = await exportPeriod(owner, "2026-11-01");
    expect(file.filename).toBe("lohn_2026-11.csv");
    expect(file.rows).toBe(2);
    expect(file.csv.charCodeAt(0)).toBe(0xfeff);
    expect(file.csv.slice(1)).toBe(
      [
        "Name;Vertrag;Stunden;Stundenlohn;Brutto;Begruendung",
        "Anna Test;Minijob;48,00;13,90;667,20;Krankheitsvertretung",
        "Ben Test;Vollzeit;0,00;;3200,00;",
        "",
      ].join("\r\n"),
    );
    const [period] = await db.select().from(payrollPeriod);
    expect(period).toMatchObject({ status: "exported" });
    expect(period?.lockedAt).toBeInstanceOf(Date);
    expect(period?.exportedAt).toBeInstanceOf(Date);

    // Exporting again is allowed and audited as such.
    await exportPeriod(owner, "2026-11-01");
    const actions = (await db.select().from(auditLog)).map((a) => a.action);
    expect(actions).toEqual(
      expect.arrayContaining([
        "payroll.lock",
        "payroll.approve",
        "payroll.export",
        "payroll.reexport",
        "payroll.justify",
      ]),
    );
  });

  it("unlocking clears the approval and needs a reason", async () => {
    await saveOverrunJustification(owner, cat.staff.anna.id, "2026-11-01", "Krankheitsvertretung", {
      today: TODAY,
    });
    await lockPeriod(owner, "2026-11-01", { today: TODAY });
    await approvePeriod(owner, "2026-11-01");
    await unlockPeriod(owner, "2026-11-01", "Stunden von Ayse fehlen");
    const [period] = await db.select().from(payrollPeriod);
    expect(period).toMatchObject({
      status: "open",
      lockedAt: null,
      approvedAt: null,
      exportedAt: null,
    });
    const worked = await db
      .select()
      .from(shift)
      .where(and(eq(shift.status, "worked")));
    expect(worked.every((s) => s.approvedAt === null)).toBe(true);
    const [entry] = await db.select().from(auditLog).where(eq(auditLog.action, "payroll.unlock"));
    expect(entry?.diff).toMatchObject({ from: "approved", reason: "Stunden von Ayse fehlen" });
  });

  it("requires team:manage for every step", async () => {
    const staff = await createActor("staff");
    await expect(lockPeriod(staff, "2026-11-01", { today: TODAY })).rejects.toSatisfy(isForbidden);
    await expect(approvePeriod(staff, "2026-11-01")).rejects.toSatisfy(isForbidden);
    await expect(exportPeriod(staff, "2026-11-01")).rejects.toSatisfy(isForbidden);
    await expect(unlockPeriod(staff, "2026-11-01", "weil")).rejects.toSatisfy(isForbidden);
    await expect(
      saveOverrunJustification(staff, cat.staff.anna.id, "2026-11-01", "Krankheit"),
    ).rejects.toSatisfy(isForbidden);
    const manager = await createActor("manager");
    await saveOverrunJustification(
      manager,
      cat.staff.anna.id,
      "2026-11-01",
      "Krankheitsvertretung",
      { today: TODAY },
    );
    await lockPeriod(manager, "2026-11-01", { today: TODAY });
  });

  it("rejects a month that is not the first day", async () => {
    await expect(lockPeriod(owner, "2026-11-15", { today: TODAY })).rejects.toMatchObject({
      code: "invalid_month",
    });
  });
});

describe("dueItems and calendarItems", () => {
  beforeEach(async () => {
    await saveContract(owner, cat.staff.anna.id, minijob());
  });

  it("lists shifts without times grouped per day with the §17 deadline", async () => {
    const planned = (workDate: string, eventIdOrNull: string | null) =>
      createShift(
        owner,
        shiftInput({
          eventId: eventIdOrNull,
          workDate,
          actualStart: null,
          actualEnd: null,
          plannedStart: "08:00",
          plannedEnd: "14:00",
        }),
        { today: TODAY },
      );
    await planned("2026-11-14", eventId);
    await createShift(
      owner,
      shiftInput({
        staffMemberId: cat.staff.ben.id,
        eventId,
        workDate: "2026-11-14",
        actualStart: null,
        actualEnd: null,
        plannedStart: "08:00",
        plannedEnd: "14:00",
      }),
      { today: TODAY },
    );
    await planned("2026-11-27", null);

    const items = await dueItems(owner, "2026-11-22");
    const event = items.find((i) => i.id === `hours:${eventId}:2026-11-14`);
    expect(event).toMatchObject({
      kind: "hours",
      dueOn: "2026-11-21",
      urgency: "overdue",
      href: `/veranstaltungen/${eventId}/team`,
      eventId,
    });
    expect(event?.title).toContain("2");
    // The office shift is in the future relative to that day: not due yet.
    expect(items.some((i) => i.id.includes("office"))).toBe(false);

    const later = await dueItems(owner, "2026-11-29");
    expect(later.find((i) => i.id === "hours:office:2026-11-27")?.urgency).toBe("soon");
  });

  it("offers the month close from a week before the 15th until exported", async () => {
    await createShift(owner, shiftInput(), { today: TODAY });
    expect((await dueItems(owner, "2026-12-07")).some((i) => i.id.startsWith("payroll:"))).toBe(
      false,
    );
    const items = await dueItems(owner, "2026-12-08");
    const close = items.find((i) => i.id === "payroll:2026-11");
    expect(close).toMatchObject({
      dueOn: "2026-12-15",
      urgency: "soon",
      href: "/team/stunden/abschluss?month=2026-11",
    });
    expect(
      (await dueItems(owner, "2026-12-16")).find((i) => i.id === "payroll:2026-11")?.urgency,
    ).toBe("overdue");

    await lockPeriod(owner, "2026-11-01", { today: TODAY });
    await approvePeriod(owner, "2026-11-01");
    await exportPeriod(owner, "2026-11-01");
    expect((await dueItems(owner, "2026-12-16")).some((i) => i.id === "payroll:2026-11")).toBe(
      false,
    );
  });

  it("shows hours items only to people who manage hours", async () => {
    await createShift(
      owner,
      shiftInput({
        actualStart: null,
        actualEnd: null,
        plannedStart: "08:00",
        plannedEnd: "14:00",
      }),
      { today: TODAY },
    );
    const staff = await createActor("staff");
    expect(await dueItems(staff, "2026-12-10")).toEqual([]);
    const manager = await createActor("manager");
    expect((await dueItems(manager, "2026-12-10")).length).toBeGreaterThan(0);
  });

  it("puts shifts on the calendar, one entry per event and day, red when overdue", async () => {
    await createShift(
      owner,
      shiftInput({
        eventId,
        workDate: "2026-11-14",
        actualStart: null,
        actualEnd: null,
        plannedStart: "08:00",
        plannedEnd: "14:00",
      }),
      { today: TODAY },
    );
    await createShift(
      owner,
      shiftInput({
        staffMemberId: cat.staff.ben.id,
        eventId,
        workDate: "2026-11-14",
        actualStart: "08:00",
        actualEnd: "14:00",
        breakMinutes: 0,
      }),
      { today: TODAY },
    );
    await createShift(owner, shiftInput({ workDate: "2026-11-20" }), { today: TODAY });
    const items = await calendarItems(owner, "2026-11-01", "2026-11-30");
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      layer: "shifts",
      date: "2026-11-14",
      href: `/veranstaltungen/${eventId}/team`,
    });
    expect(items[0]?.title).toContain("2");
    expect(items[1]).toMatchObject({ date: "2026-11-20", tone: "neutral" });
    const staff = await createActor("staff");
    expect(await calendarItems(staff, "2026-11-01", "2026-11-30")).toEqual([]);
  });

  it("gives a field user their own shifts and the events they work at", async () => {
    await createShift(
      owner,
      shiftInput({
        eventId,
        workDate: "2026-11-14",
        actualStart: null,
        actualEnd: null,
        plannedStart: "08:00",
        plannedEnd: "14:00",
      }),
      { today: TODAY },
    );
    const base = await createActor("field");
    await db.update(user).set({ role: "field" }).where(eq(user.id, base.id));
    // Ben has no duty at the event (the preset gives Anna and Ben duties; remove it for the check).
    const benField: Actor = { ...base, staffMemberId: cat.staff.ben.id };
    const annaField: Actor = { ...base, staffMemberId: cat.staff.anna.id };
    expect((await calendarItems(benField, "2026-11-01", "2026-11-30")).length).toBe(0);
    expect((await calendarItems(annaField, "2026-11-01", "2026-11-30")).length).toBe(1);
    const rows = await listShiftRows(annaField, {}, TODAY);
    expect(rows).toHaveLength(1);
    expect(await listShiftRows(benField, {}, TODAY)).toHaveLength(0);

    // A field user with a shift but no duty at the event sees the event.
    const [cleo] = await db
      .insert(staffMember)
      .values({ displayName: "Cleo Test", firstName: "Cleo", lastName: "Test" })
      .returning();
    if (!cleo) throw new Error("no staff");
    const cleoField: Actor = { ...base, staffMemberId: cleo.id };
    expect(
      await db.select({ id: event.id }).from(event).where(visibleEvents(cleoField)),
    ).toHaveLength(0);
    await createShift(
      owner,
      shiftInput({
        staffMemberId: cleo.id,
        eventId,
        workDate: "2026-11-14",
        actualStart: null,
        actualEnd: null,
        plannedStart: "08:00",
        plannedEnd: "14:00",
      }),
      { today: TODAY },
    );
    expect(
      await db.select({ id: event.id }).from(event).where(visibleEvents(cleoField)),
    ).toHaveLength(1);
  });
});
