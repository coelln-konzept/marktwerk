import {
  auditLog,
  document,
  escalationLog,
  installment,
  legalParameter,
  notification,
  obligation,
  obligationCompletion,
  payable,
  staffMember,
  vehicle,
  vehicleIssue,
} from "@marktwerk/db/schema";
import { obligationReminders } from "@marktwerk/jobs";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Actor } from "@/server/actor";
import { db } from "@/server/db";
import {
  calendarItems,
  companyCounts,
  dueItems,
  getObligation,
  legalIntervals,
  listIssues,
  listObligations,
  listVehicles,
} from "@/server/queries/company";
import {
  archiveObligation,
  archiveVehicle,
  CompanyInputError,
  completeObligation,
  createObligation,
  createVehicle,
  type ObligationInput,
  recordOdometer,
  reportVehicleIssue,
  restoreObligation,
  restoreVehicle,
  setVehicleIssueStatus,
  undoObligationCompletion,
  undoOdometer,
  updateObligation,
  updateVehicle,
  type VehicleInput,
} from "@/server/services/company";
import { markInstallmentPaid } from "@/server/services/payables";
import { createActor, resetDatabase } from "../helpers/fixtures";

const TODAY = "2026-10-21";

let owner: Actor;
let anna: typeof staffMember.$inferSelect;
let ben: typeof staffMember.$inferSelect;
let manager: Actor;
let managerStaff: typeof staffMember.$inferSelect;

beforeEach(async () => {
  // Business "today" is the 21st of October 2026 (only Date is faked, timers and sockets stay real).
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-21T10:00:00+02:00"));
  await resetDatabase();
  owner = await createActor("owner");
  manager = await createActor("manager");
  const rows = await db
    .insert(staffMember)
    .values([
      { displayName: "Anna Test", firstName: "Anna", lastName: "Test" },
      { displayName: "Ben Test", firstName: "Ben", lastName: "Test" },
      {
        displayName: "Mona Manager",
        firstName: "Mona",
        lastName: "Manager",
        userId: manager.id,
      },
    ])
    .returning();
  [anna, ben, managerStaff] = rows as [typeof anna, typeof ben, typeof managerStaff];
  manager = { ...manager, staffMemberId: managerStaff.id };
});

afterEach(() => {
  vi.useRealTimers();
});

afterAll(async () => {
  await db.$client.end();
});

const isForbidden = (error: unknown) =>
  String((error as { digest?: unknown })?.digest ?? "").includes("403");

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof CompanyInputError) return error.code;
    throw error;
  }
  return "no error";
}

const vehicleInput = (over: Partial<VehicleInput> = {}): VehicleInput => ({
  name: "Transporter 1",
  plate: "k-mw 123",
  make: "Ford",
  model: "Transit",
  vin: "wf0xxxtttxkl12345",
  firstRegistrationOn: "2022-03-15",
  grossWeightKg: 3200,
  odometerKm: 90_000,
  odometerRecordedOn: "2026-10-01",
  insurer: "Testversicherung",
  policyNumber: "P-1",
  notes: null,
  ...over,
});

const obligationInput = (over: Partial<ObligationInput> = {}): ObligationInput => ({
  kind: "other",
  title: "Prüfung",
  scope: "company",
  vehicleId: null,
  venueId: null,
  intervalMonths: 12,
  intervalKm: null,
  nextDueOn: "2027-06-30",
  nextDueKm: null,
  leadDays: 14,
  responsibleStaffMemberId: anna.id,
  createsPayable: false,
  notes: null,
  ...over,
});

async function newVehicle(over: Partial<VehicleInput> = {}) {
  return (await createVehicle(owner, vehicleInput(over))).id;
}
async function newObligation(over: Partial<ObligationInput> = {}) {
  return (await createObligation(owner, obligationInput(over))).id;
}
const obligationRow = async (id: string) => {
  const [row] = await db.select().from(obligation).where(eq(obligation.id, id));
  if (!row) throw new Error("no obligation");
  return row;
};
const completionsOf = (id: string) =>
  db.select().from(obligationCompletion).where(eq(obligationCompletion.obligationId, id));
const auditsOf = (action: string) =>
  db.select().from(auditLog).where(eq(auditLog.action, action)).orderBy(auditLog.at);

// ---------------------------------------------------------------------------------------------

describe("vehicles", () => {
  it("creates a vehicle with normalised plate and VIN, audited", async () => {
    const id = await newVehicle();
    const [row] = await db.select().from(vehicle).where(eq(vehicle.id, id));
    expect(row).toMatchObject({
      plate: "K-MW 123",
      vin: "WF0XXXTTTXKL12345",
      grossWeightKg: 3200,
      odometerKm: 90_000,
      odometerRecordedOn: "2026-10-01",
    });
    const [entry] = await auditsOf("vehicle.create");
    expect(entry).toMatchObject({ actorId: owner.id, entityType: "vehicle", entityId: id });
  });

  it("defaults the odometer date to today when only km are given", async () => {
    const id = await newVehicle({ odometerRecordedOn: null });
    const [row] = await db.select().from(vehicle).where(eq(vehicle.id, id));
    expect(row?.odometerRecordedOn).toBe(TODAY);
  });

  it("rejects duplicate plates and VINs and bad input", async () => {
    await newVehicle();
    expect(await codeOf(createVehicle(owner, vehicleInput({ vin: null })))).toBe("plate_taken");
    expect(await codeOf(createVehicle(owner, vehicleInput({ plate: "K-MW 999" })))).toBe(
      "vin_taken",
    );
    expect(await codeOf(createVehicle(owner, vehicleInput({ name: " " })))).toBe("invalid_name");
    expect(await codeOf(createVehicle(owner, vehicleInput({ plate: "!" })))).toBe("invalid_plate");
    expect(await codeOf(createVehicle(owner, vehicleInput({ plate: "K-MW 5", vin: "ABC" })))).toBe(
      "invalid_vin",
    );
    expect(
      await codeOf(
        createVehicle(owner, vehicleInput({ plate: "K-MW 5", vin: null, grossWeightKg: 0 })),
      ),
    ).toBe("invalid_weight");
    expect(
      await codeOf(
        createVehicle(
          owner,
          vehicleInput({ plate: "K-MW 5", vin: null, firstRegistrationOn: "2030-01-01" }),
        ),
      ),
    ).toBe("future_date");
  });

  it("updates, audits the changed fields and reports no change for identical input", async () => {
    const id = await newVehicle();
    expect(await updateVehicle(owner, id, vehicleInput())).toEqual({ changed: false });
    expect(await updateVehicle(owner, id, vehicleInput({ insurer: "Neu AG" }))).toEqual({
      changed: true,
    });
    const [entry] = await auditsOf("vehicle.update");
    expect(entry?.diff).toEqual({
      changes: { insurer: { from: "Testversicherung", to: "Neu AG" } },
    });
    // Editing the plate to another vehicle's plate clashes.
    await newVehicle({ plate: "K-MW 456", vin: null });
    expect(await codeOf(updateVehicle(owner, id, vehicleInput({ plate: "K-MW 456" })))).toBe(
      "plate_taken",
    );
  });

  it("records an odometer reading with its date and undoes it", async () => {
    const id = await newVehicle();
    const { previous, next } = await recordOdometer(owner, id, 91_500, "2026-10-20");
    expect(next).toEqual({ odometerKm: 91_500, odometerRecordedOn: "2026-10-20" });
    expect(await codeOf(recordOdometer(owner, id, 91_000))).toBe("odometer_lower");
    expect(await codeOf(recordOdometer(owner, id, 92_000, "2026-12-01"))).toBe("future_date");

    await undoOdometer(owner, id, previous, next);
    const [row] = await db.select().from(vehicle).where(eq(vehicle.id, id));
    expect(row).toMatchObject({ odometerKm: 90_000, odometerRecordedOn: "2026-10-01" });
    // A second undo no longer matches the stored reading.
    expect(await codeOf(undoOdometer(owner, id, previous, next))).toBe("conflict");
    expect(await auditsOf("vehicle.odometer")).toHaveLength(2);
  });

  it("archives with its obligations and restores exactly those", async () => {
    const id = await newVehicle();
    const withVehicle = await newObligation({ scope: "vehicle", vehicleId: id, title: "HU" });
    const archivedBefore = await newObligation({ scope: "vehicle", vehicleId: id, title: "Alt" });
    await archiveObligation(owner, archivedBefore);

    // The clock is frozen in these tests; "archived with the vehicle" is told apart by its timestamp.
    vi.setSystemTime(new Date("2026-10-21T11:00:00+02:00"));
    await archiveVehicle(owner, id);
    expect((await listVehicles(TODAY)).map((v) => v.id)).toEqual([]);
    expect((await listObligations(TODAY)).map((o) => o.id)).toEqual([]);
    expect(await codeOf(updateVehicle(owner, id, vehicleInput()))).toBe("not_found");

    await restoreVehicle(owner, id);
    expect((await listObligations(TODAY)).map((o) => o.id)).toEqual([withVehicle]);
    expect((await obligationRow(archivedBefore)).archivedAt).not.toBeNull();
  });

  it.each(["staff", "field"] as const)("is forbidden to write for the %s role", async (role) => {
    const actor = await createActor(role);
    const error = await createVehicle(actor, vehicleInput()).catch((e) => e);
    expect(isForbidden(error)).toBe(true);
    expect(await db.select().from(vehicle)).toHaveLength(0);
  });
});

describe("obligations", () => {
  it("creates an obligation for a vehicle and audits it", async () => {
    const vehicleId = await newVehicle();
    const id = await newObligation({
      kind: "service",
      scope: "vehicle",
      vehicleId,
      intervalKm: 30_000,
      nextDueKm: 120_000,
      createsPayable: true,
    });
    expect(await obligationRow(id)).toMatchObject({
      scope: "vehicle",
      vehicleId,
      intervalMonths: 12,
      intervalKm: 30_000,
      nextDueKm: 120_000,
      createsPayable: true,
    });
    const [entry] = await auditsOf("obligation.create");
    expect(entry).toMatchObject({ entityType: "obligation", entityId: id });
  });

  it("validates scope targets, intervals, dates and the responsible person", async () => {
    const vehicleId = await newVehicle();
    const code = (over: Partial<ObligationInput>) =>
      codeOf(createObligation(owner, obligationInput(over)));
    expect(await code({ scope: "vehicle", vehicleId: null })).toBe("invalid_vehicle");
    expect(await code({ scope: "venue", venueId: null })).toBe("invalid_venue");
    expect(await code({ scope: "company", intervalKm: 1000 })).toBe("invalid_interval");
    expect(await code({ scope: "vehicle", vehicleId, intervalMonths: 0 })).toBe("invalid_interval");
    expect(await code({ nextDueOn: "2026-02-30" })).toBe("invalid_date");
    expect(await code({ leadDays: -1 })).toBe("invalid_lead_days");
    expect(await code({ kind: "wat" })).toBe("invalid_kind");
    expect(await code({ title: "  " })).toBe("invalid_name");
    expect(await code({ responsibleStaffMemberId: "nope" })).toBe("invalid_staff");
    await db.update(staffMember).set({ active: false }).where(eq(staffMember.id, ben.id));
    expect(await code({ responsibleStaffMemberId: ben.id })).toBe("invalid_staff");
    expect(await db.select().from(obligation)).toHaveLength(0);
  });

  it("updates (also the due date by hand), archives and restores", async () => {
    const id = await newObligation();
    expect(await updateObligation(owner, id, obligationInput())).toEqual({ changed: false });
    expect(
      await updateObligation(owner, id, obligationInput({ nextDueOn: "2027-07-31", leadDays: 30 })),
    ).toEqual({ changed: true });
    const [entry] = await auditsOf("obligation.update");
    expect(entry?.diff).toEqual({
      changes: {
        nextDueOn: { from: "2027-06-30", to: "2027-07-31" },
        leadDays: { from: 14, to: 30 },
      },
    });
    await archiveObligation(owner, id);
    expect(await listObligations(TODAY)).toHaveLength(0);
    expect(await codeOf(archiveObligation(owner, id))).toBe("not_found");
    await restoreObligation(owner, id);
    expect(await listObligations(TODAY)).toHaveLength(1);
  });

  it.each(["staff", "field"] as const)("is forbidden to write for the %s role", async (role) => {
    const actor = await createActor(role);
    const error = await createObligation(actor, obligationInput()).catch((e) => e);
    expect(isForbidden(error)).toBe(true);
    const id = await newObligation();
    const done = await completeObligation(actor, id, {
      doneOn: "2026-10-20",
      doneKm: null,
      costCents: null,
      checkerName: null,
      notes: null,
    }).catch((e) => e);
    expect(isForbidden(done)).toBe(true);
    expect(await completionsOf(id)).toHaveLength(0);
  });
});

describe("completing an obligation", () => {
  const done = (over: Partial<Parameters<typeof completeObligation>[2]> = {}) => ({
    doneOn: "2026-10-20",
    doneKm: null,
    costCents: null,
    checkerName: null,
    notes: null,
    ...over,
  });

  it("rolls the date forward from the interval and keeps a history row", async () => {
    const id = await newObligation({ intervalMonths: 24, nextDueOn: "2027-06-30" });
    const result = await completeObligation(
      owner,
      id,
      done({ costCents: 12_050, notes: "TÜV Köln" }),
    );
    expect(result.next).toEqual({
      lastDoneOn: "2026-10-20",
      nextDueOn: "2028-10-20",
      nextDueKm: null,
    });
    expect(result.previous).toEqual({ lastDoneOn: null, nextDueOn: "2027-06-30", nextDueKm: null });

    expect(await obligationRow(id)).toMatchObject({
      lastDoneOn: "2026-10-20",
      nextDueOn: "2028-10-20",
    });
    const [completion] = await completionsOf(id);
    expect(completion).toMatchObject({
      doneOn: "2026-10-20",
      costCents: 12_050,
      notes: "TÜV Köln",
      nextDueOnAfter: "2028-10-20",
    });
    const [entry] = await auditsOf("obligation.complete");
    expect(entry).toMatchObject({ actorId: owner.id, entityId: id });
  });

  it("clamps month ends when rolling forward", async () => {
    const id = await newObligation({ intervalMonths: 1, nextDueOn: null });
    const result = await completeObligation(owner, id, done({ doneOn: "2026-01-31" }));
    expect(result.next.nextDueOn).toBe("2026-02-28");
  });

  it("keeps the old due date as anchor when done inside the reminder window", async () => {
    const id = await newObligation({
      kind: "report",
      title: "KSK",
      intervalMonths: 12,
      nextDueOn: "2026-03-31",
      leadDays: 30,
    });
    const result = await completeObligation(owner, id, done({ doneOn: "2026-03-20" }));
    expect(result.next.nextDueOn).toBe("2027-03-31");
  });

  it("rolls km from the reading and raises the vehicle's odometer", async () => {
    const vehicleId = await newVehicle();
    const id = await newObligation({
      kind: "service",
      scope: "vehicle",
      vehicleId,
      intervalMonths: null,
      intervalKm: 30_000,
      nextDueOn: null,
      nextDueKm: 91_000,
    });
    expect(await codeOf(completeObligation(owner, id, done()))).toBe("km_required");

    const result = await completeObligation(owner, id, done({ doneKm: 91_400 }));
    expect(result.next).toEqual({ lastDoneOn: "2026-10-20", nextDueOn: null, nextDueKm: 121_400 });
    expect(result.odometer?.next).toEqual({ odometerKm: 91_400, odometerRecordedOn: "2026-10-20" });
    const [v] = await db.select().from(vehicle).where(eq(vehicle.id, vehicleId));
    expect(v).toMatchObject({ odometerKm: 91_400, odometerRecordedOn: "2026-10-20" });
  });

  it("does not lower the odometer when the reading is below it", async () => {
    const vehicleId = await newVehicle({ odometerKm: 95_000 });
    const id = await newObligation({
      scope: "vehicle",
      vehicleId,
      intervalMonths: null,
      intervalKm: 10_000,
      nextDueOn: null,
    });
    const result = await completeObligation(owner, id, done({ doneKm: 94_000 }));
    expect(result.odometer).toBeNull();
    const [v] = await db.select().from(vehicle).where(eq(vehicle.id, vehicleId));
    expect(v?.odometerKm).toBe(95_000);
  });

  it("rolls date and km together, whichever comes first stays a target of its own", async () => {
    const vehicleId = await newVehicle();
    const id = await newObligation({
      kind: "service",
      scope: "vehicle",
      vehicleId,
      intervalMonths: 12,
      intervalKm: 30_000,
      nextDueOn: "2026-11-01",
      nextDueKm: 91_000,
    });
    const result = await completeObligation(owner, id, done({ doneKm: 90_800 }));
    expect(result.next).toEqual({
      lastDoneOn: "2026-10-20",
      nextDueOn: "2027-11-01",
      nextDueKm: 120_800,
    });
    const [completion] = await completionsOf(id);
    expect(completion).toMatchObject({
      doneKm: 90_800,
      nextDueOnAfter: "2027-11-01",
      nextDueKmAfter: 120_800,
    });
  });

  it("rejects bad input and doing it twice on the same day", async () => {
    const id = await newObligation();
    expect(await codeOf(completeObligation(owner, id, done({ doneOn: "2026-10-22" })))).toBe(
      "future_date",
    );
    expect(await codeOf(completeObligation(owner, id, done({ doneOn: "bad" })))).toBe(
      "invalid_date",
    );
    expect(await codeOf(completeObligation(owner, id, done({ costCents: -1 })))).toBe(
      "invalid_cost",
    );
    expect(await codeOf(completeObligation(owner, "nope", done()))).toBe("not_found");
    await completeObligation(owner, id, done());
    expect(await codeOf(completeObligation(owner, id, done()))).toBe("already_done_on");
    expect(await completionsOf(id)).toHaveLength(1);
  });

  it("needs the checker for a licence check and stores no more than that", async () => {
    const id = await newObligation({
      kind: "licence_check",
      title: "Führerscheinkontrolle",
      intervalMonths: 6,
    });
    expect(await codeOf(completeObligation(owner, id, done()))).toBe("checker_required");
    const result = await completeObligation(owner, id, done({ checkerName: "Anna Test" }));
    expect(result.next.nextDueOn).toBe("2027-04-20");
    const [completion] = await completionsOf(id);
    expect(completion?.checkerName).toBe("Anna Test");
  });

  it("keeps a full history; a back-dated completion leaves the schedule alone", async () => {
    const id = await newObligation({ intervalMonths: 12, nextDueOn: "2027-01-01" });
    await completeObligation(owner, id, done({ doneOn: "2026-10-01" }));
    const after = await obligationRow(id);
    expect(after.nextDueOn).toBe("2027-10-01");

    const old = await completeObligation(owner, id, done({ doneOn: "2025-10-01" }));
    expect(old.next).toEqual({
      lastDoneOn: "2026-10-01",
      nextDueOn: "2027-10-01",
      nextDueKm: null,
    });
    expect(await obligationRow(id)).toMatchObject({
      lastDoneOn: "2026-10-01",
      nextDueOn: "2027-10-01",
    });

    const detail = await getObligation(id, TODAY);
    expect(detail?.completions.map((c) => c.doneOn)).toEqual(["2026-10-01", "2025-10-01"]);
  });

  it("records who did it (the actor's staff record)", async () => {
    const id = await newObligation();
    await completeObligation({ ...owner, staffMemberId: ben.id }, id, done());
    const [completion] = await completionsOf(id);
    expect(completion?.doneById).toBe(ben.id);
    const withoutStaff = await newObligation({ title: "Zweite" });
    await completeObligation(owner, withoutStaff, done());
    const [second] = await completionsOf(withoutStaff);
    expect(second?.doneById).toBeNull();
  });

  it("undoes a completion: schedule, history and odometer come back", async () => {
    const vehicleId = await newVehicle();
    const id = await newObligation({
      kind: "service",
      scope: "vehicle",
      vehicleId,
      intervalMonths: 12,
      intervalKm: 30_000,
      nextDueOn: "2026-11-01",
      nextDueKm: 91_000,
    });
    const result = await completeObligation(owner, id, done({ doneKm: 91_400 }));
    await undoObligationCompletion(owner, result.completionId, result.previous, result.odometer);

    expect(await completionsOf(id)).toHaveLength(0);
    expect(await obligationRow(id)).toMatchObject({
      lastDoneOn: null,
      nextDueOn: "2026-11-01",
      nextDueKm: 91_000,
    });
    const [v] = await db.select().from(vehicle).where(eq(vehicle.id, vehicleId));
    expect(v).toMatchObject({ odometerKm: 90_000, odometerRecordedOn: "2026-10-01" });
    expect(await auditsOf("obligation.complete_undo")).toHaveLength(1);

    // It can be done again afterwards, and a second undo of the same completion finds nothing.
    expect(
      await codeOf(undoObligationCompletion(owner, result.completionId, result.previous, null)),
    ).toBe("not_found");
    await completeObligation(owner, id, done({ doneKm: 91_400 }));
  });

  it("refuses to undo when the schedule was changed in between", async () => {
    const id = await newObligation();
    const result = await completeObligation(owner, id, done());
    await updateObligation(owner, id, obligationInput({ nextDueOn: "2030-01-01" }));
    expect(
      await codeOf(undoObligationCompletion(owner, result.completionId, result.previous, null)),
    ).toBe("conflict");
    expect(await completionsOf(id)).toHaveLength(1);
  });

  it("leaves the odometer alone on undo when it moved on since", async () => {
    const vehicleId = await newVehicle();
    const id = await newObligation({
      scope: "vehicle",
      vehicleId,
      intervalMonths: null,
      intervalKm: 10_000,
      nextDueOn: null,
    });
    const result = await completeObligation(owner, id, done({ doneKm: 91_400 }));
    await recordOdometer(owner, vehicleId, 92_000);
    await undoObligationCompletion(owner, result.completionId, result.previous, result.odometer);
    const [v] = await db.select().from(vehicle).where(eq(vehicle.id, vehicleId));
    expect(v?.odometerKm).toBe(92_000);
  });
});

describe("vehicle issues", () => {
  it("reports an issue (reporter defaults to the actor's staff record) and audits it", async () => {
    const vehicleId = await newVehicle();
    const id = (
      await reportVehicleIssue(
        { ...owner, staffMemberId: anna.id },
        { vehicleId, title: "Bremse quietscht", description: "Vorne links", severity: "critical" },
      )
    ).id;
    const [row] = await db.select().from(vehicleIssue).where(eq(vehicleIssue.id, id));
    expect(row).toMatchObject({
      vehicleId,
      title: "Bremse quietscht",
      severity: "critical",
      status: "open",
      reportedByStaffMemberId: anna.id,
    });
    const [entry] = await auditsOf("vehicle_issue.report");
    expect(entry).toMatchObject({ entityType: "vehicle_issue", entityId: id });

    const other = (
      await reportVehicleIssue(owner, {
        vehicleId,
        title: "Kratzer",
        description: null,
        severity: "minor",
        reportedByStaffMemberId: ben.id,
      })
    ).id;
    const [row2] = await db.select().from(vehicleIssue).where(eq(vehicleIssue.id, other));
    expect(row2?.reportedByStaffMemberId).toBe(ben.id);
    // Owner without a staff record and no explicit reporter: null.
    const third = (
      await reportVehicleIssue(owner, {
        vehicleId,
        title: "x",
        description: null,
        severity: "minor",
      })
    ).id;
    const [row3] = await db.select().from(vehicleIssue).where(eq(vehicleIssue.id, third));
    expect(row3?.reportedByStaffMemberId).toBeNull();
  });

  it("validates vehicle, severity, title and reporter", async () => {
    const vehicleId = await newVehicle();
    const base = { vehicleId, title: "Defekt", description: null, severity: "minor" };
    expect(await codeOf(reportVehicleIssue(owner, { ...base, vehicleId: "nope" }))).toBe(
      "invalid_vehicle",
    );
    expect(
      await codeOf(
        reportVehicleIssue(owner, { ...base, vehicleId: "00000000-0000-4000-8000-000000000000" }),
      ),
    ).toBe("invalid_vehicle");
    expect(await codeOf(reportVehicleIssue(owner, { ...base, severity: "bad" }))).toBe(
      "invalid_severity",
    );
    expect(await codeOf(reportVehicleIssue(owner, { ...base, title: " " }))).toBe("invalid_name");
    expect(
      await codeOf(
        reportVehicleIssue(owner, {
          ...base,
          reportedByStaffMemberId: "00000000-0000-4000-8000-000000000000",
        }),
      ),
    ).toBe("invalid_staff");
    expect(await db.select().from(vehicleIssue)).toHaveLength(0);
  });

  it("moves open -> in repair -> fixed with who and when, and back", async () => {
    const vehicleId = await newVehicle();
    const { id } = await reportVehicleIssue(owner, {
      vehicleId,
      title: "Licht",
      description: null,
      severity: "major",
    });
    const actor = { ...owner, staffMemberId: ben.id };
    expect(await setVehicleIssueStatus(actor, id, "in_progress")).toEqual({
      changed: true,
      from: "open",
      to: "in_progress",
    });
    expect(await setVehicleIssueStatus(actor, id, "in_progress")).toMatchObject({ changed: false });

    await setVehicleIssueStatus(actor, id, "resolved", { resolutionNote: "Birne getauscht" });
    const [fixed] = await db.select().from(vehicleIssue).where(eq(vehicleIssue.id, id));
    expect(fixed).toMatchObject({
      status: "resolved",
      resolvedByStaffMemberId: ben.id,
      resolutionNote: "Birne getauscht",
    });
    expect(fixed?.resolvedAt).toBeInstanceOf(Date);

    await setVehicleIssueStatus(actor, id, "open");
    const [reopened] = await db.select().from(vehicleIssue).where(eq(vehicleIssue.id, id));
    expect(reopened).toMatchObject({ status: "open", resolvedAt: null, resolutionNote: null });
    expect(await auditsOf("vehicle_issue.status")).toHaveLength(3);
  });

  it("undo only applies while the status is the one just set", async () => {
    const vehicleId = await newVehicle();
    const { id } = await reportVehicleIssue(owner, {
      vehicleId,
      title: "Licht",
      description: null,
      severity: "minor",
    });
    await setVehicleIssueStatus(owner, id, "in_progress");
    await setVehicleIssueStatus(owner, id, "open", { expected: "in_progress" });
    expect(
      await codeOf(setVehicleIssueStatus(owner, id, "open", { expected: "in_progress" })),
    ).toBe("conflict");
    expect(await codeOf(setVehicleIssueStatus(owner, id, "wat"))).toBe("invalid_status");
    expect(await codeOf(setVehicleIssueStatus(owner, "nope", "open"))).toBe("not_found");
  });

  it("lists unresolved first, worst first; resolved ones last", async () => {
    const vehicleId = await newVehicle();
    const make = (title: string, severity: string) =>
      reportVehicleIssue(owner, { vehicleId, title, description: null, severity });
    const minor = await make("klein", "minor");
    const critical = await make("kritisch", "critical");
    const fixed = await make("behoben", "critical");
    await setVehicleIssueStatus(owner, fixed.id, "resolved");
    expect((await listIssues()).map((i) => i.id)).toEqual([critical.id, minor.id, fixed.id]);
    expect((await listIssues({ status: "resolved" })).map((i) => i.id)).toEqual([fixed.id]);
    expect(await companyCounts(TODAY)).toMatchObject({ openIssues: 2, criticalIssues: 1 });
  });

  it.each(["staff", "field"] as const)("is forbidden to report for the %s role", async (role) => {
    const vehicleId = await newVehicle();
    const actor = await createActor(role);
    const error = await reportVehicleIssue(actor, {
      vehicleId,
      title: "x",
      description: null,
      severity: "minor",
    }).catch((e) => e);
    expect(isForbidden(error)).toBe(true);
  });
});

describe("queries", () => {
  it("orders obligations by status and reports status, days and km", async () => {
    const vehicleId = await newVehicle();
    const later = await newObligation({ title: "Spät", nextDueOn: "2027-06-30" });
    const soon = await newObligation({ title: "Bald", nextDueOn: "2026-11-02" });
    const overdue = await newObligation({ title: "Alt", nextDueOn: "2026-10-01" });
    const kmDue = await newObligation({
      title: "Service",
      scope: "vehicle",
      vehicleId,
      intervalMonths: null,
      intervalKm: 30_000,
      nextDueOn: null,
      nextDueKm: 89_000,
    });
    const today = await newObligation({ title: "Heute", nextDueOn: TODAY });

    const rows = await listObligations(TODAY);
    expect(rows.map((r) => [r.id, r.status])).toEqual([
      [overdue, "overdue"],
      [kmDue, "overdue"],
      [today, "due"],
      [soon, "soon"],
      [later, "ok"],
    ]);
    expect(rows[1]).toMatchObject({ trigger: "km", kmLeft: -1000, currentKm: 90_000 });
    expect(rows[0]).toMatchObject({ daysLeft: -20, responsibleName: "Anna Test" });
    expect(await companyCounts(TODAY)).toMatchObject({ needsAction: 3, soon: 1 });
    const vehicles = await listVehicles(TODAY);
    expect(vehicles[0]).toMatchObject({ worstStatus: "overdue", openIssues: 0 });
  });

  it("offers dueItems (7 days) and calendarItems with the shapes Übersicht and Kalender expect", async () => {
    const vehicleId = await newVehicle();
    const overdue = await newObligation({
      title: "HU",
      scope: "vehicle",
      vehicleId,
      nextDueOn: "2026-10-01",
    });
    const soon = await newObligation({ title: "Versicherung", nextDueOn: "2026-10-27" });
    await newObligation({ title: "Weit weg", nextDueOn: "2027-03-31" });

    const staff = await createActor("staff");
    const items = await dueItems(staff, TODAY);
    expect(items).toEqual([
      {
        kind: "obligation",
        id: overdue,
        title: "HU · K-MW 123",
        dueOn: "2026-10-01",
        urgency: "overdue",
        href: `/firma/pflichten/${overdue}`,
        meta: "Transporter 1",
        assigneeName: "Anna Test",
      },
      {
        kind: "obligation",
        id: soon,
        title: "Versicherung",
        dueOn: "2026-10-27",
        urgency: "soon",
        href: `/firma/pflichten/${soon}`,
        meta: undefined,
        assigneeName: "Anna Test",
      },
    ]);

    const calendar = await calendarItems(staff, "2026-10-01", "2026-10-31");
    expect(calendar).toEqual([
      {
        layer: "obligations",
        id: overdue,
        date: "2026-10-01",
        title: "HU · K-MW 123",
        href: `/firma/pflichten/${overdue}`,
        tone: "critical",
      },
      {
        layer: "obligations",
        id: soon,
        date: "2026-10-27",
        title: "Versicherung",
        href: `/firma/pflichten/${soon}`,
        tone: "warn",
      },
    ]);
  });

  it("returns nothing for a role without company:read", async () => {
    await newObligation({ nextDueOn: "2026-10-01" });
    const field = await createActor("field");
    expect(await dueItems(field, TODAY)).toEqual([]);
    expect(await calendarItems(field, "2026-10-01", "2026-10-31")).toEqual([]);
  });

  it("reads the legal intervals valid on a day from legal_parameter", async () => {
    await db.insert(legalParameter).values([
      { key: "hu_interval_months_up_to_3500kg", value: 24, validFrom: "2026-01-01" },
      { key: "hu_interval_months_over_3500kg", value: 12, validFrom: "2026-01-01" },
      { key: "hu_interval_months_over_3500kg", value: 6, validFrom: "2030-01-01" },
    ]);
    expect(await legalIntervals(TODAY)).toEqual({ huUpTo3500: 24, huOver3500: 12, uvv: null });
    expect(await legalIntervals("2031-01-01")).toMatchObject({ huOver3500: 6 });
    expect(await legalIntervals("2025-12-31")).toEqual({
      huUpTo3500: null,
      huOver3500: null,
      uvv: null,
    });
  });
});

describe("obligation reminders job", () => {
  const at = (iso: string) => new Date(`${iso}T08:00:00+02:00`);
  const notificationsOf = () => db.select().from(notification).orderBy(notification.title);

  it("stays quiet while nothing is near", async () => {
    await newObligation({ nextDueOn: "2027-03-31" });
    expect(await obligationReminders(db, at(TODAY))).toEqual({ reminded: 0, escalated: 0 });
    expect(await notificationsOf()).toHaveLength(0);
  });

  it("reminds the responsible person from lead_days before the due date, once", async () => {
    const id = await newObligation({
      title: "Versicherung",
      nextDueOn: "2026-11-04",
      leadDays: 14,
    });
    // 15 days before: nothing. 14 days before: reminder.
    expect(await obligationReminders(db, at("2026-10-20"))).toEqual({ reminded: 0, escalated: 0 });
    expect(await obligationReminders(db, at(TODAY))).toEqual({ reminded: 1, escalated: 0 });
    const [n] = await notificationsOf();
    expect(n).toMatchObject({
      recipientStaffMemberId: anna.id,
      reason: "obligation_due",
      severity: "info",
      subjectType: "obligation",
      subjectId: id,
      link: `/firma/pflichten/${id}`,
      state: "unread",
    });
    expect(n?.title).toContain("Versicherung");
    expect(n?.body).toContain("04.11.2026");

    // Idempotent: running again, later the same day or the next, adds nothing for the same stage.
    expect(await obligationReminders(db, at(TODAY))).toEqual({ reminded: 0, escalated: 0 });
    expect(await obligationReminders(db, at("2026-10-25"))).toEqual({ reminded: 0, escalated: 0 });
    expect(await db.select().from(notification)).toHaveLength(1);
  });

  it("notifies again when overdue, and tells the manager one day later (once)", async () => {
    const id = await newObligation({ title: "HU", nextDueOn: "2026-10-20", leadDays: 14 });
    // Reminded already before it was due.
    await obligationReminders(db, at("2026-10-10"));
    expect(await db.select().from(notification)).toHaveLength(1);

    // The day after the due date: overdue for the responsible person, manager not yet.
    expect(await obligationReminders(db, at(TODAY))).toEqual({ reminded: 1, escalated: 0 });
    // Two days after: the manager is told.
    expect(await obligationReminders(db, at("2026-10-22"))).toEqual({ reminded: 0, escalated: 1 });
    expect(await obligationReminders(db, at("2026-10-23"))).toEqual({ reminded: 0, escalated: 0 });

    const rows = await db.select().from(notification);
    const byRecipient = (staffId: string) =>
      rows.filter((r) => r.recipientStaffMemberId === staffId);
    expect(
      byRecipient(anna.id)
        .map((r) => r.severity)
        .sort(),
    ).toEqual(["info", "warning"]);
    expect(byRecipient(managerStaff.id)).toHaveLength(1);
    expect(byRecipient(managerStaff.id)[0]).toMatchObject({
      reason: "escalated",
      severity: "critical",
      subjectId: id,
    });
    expect(byRecipient(ben.id)).toHaveLength(0);

    const log = await db.select().from(escalationLog);
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({
      subjectType: "obligation",
      subjectId: id,
      level: 2,
      escalatedToStaffMemberId: managerStaff.id,
    });
  });

  it("does not escalate to the manager who is the responsible person already", async () => {
    await newObligation({ nextDueOn: "2026-10-01", responsibleStaffMemberId: managerStaff.id });
    expect(await obligationReminders(db, at(TODAY))).toEqual({ reminded: 1, escalated: 0 });
    expect(await db.select().from(escalationLog)).toHaveLength(0);
  });

  it("re-arms after completing: the new due date gets its own reminders", async () => {
    const id = await newObligation({ nextDueOn: "2026-10-20", intervalMonths: 1, leadDays: 5 });
    await obligationReminders(db, at(TODAY));
    expect(await db.select().from(notification)).toHaveLength(1);

    await completeObligation(owner, id, {
      doneOn: "2026-10-21",
      doneKm: null,
      costCents: null,
      checkerName: null,
      notes: null,
    });
    // Next due: 2026-11-20 (anchored on the old date + 1 month). Not near yet -> quiet.
    expect(await obligationReminders(db, at(TODAY))).toEqual({ reminded: 0, escalated: 0 });
    // Five days before the new due date a fresh reminder is created.
    expect(await obligationReminders(db, at("2026-11-15"))).toEqual({ reminded: 1, escalated: 0 });
    expect(await db.select().from(notification)).toHaveLength(2);
  });

  it("reminds about a km target that is reached, and ignores archived vehicles and obligations", async () => {
    const vehicleId = await newVehicle();
    const km = await newObligation({
      title: "Service",
      scope: "vehicle",
      vehicleId,
      intervalMonths: null,
      intervalKm: 30_000,
      nextDueOn: null,
      nextDueKm: 90_500,
    });
    const archived = await newObligation({ title: "Alt", nextDueOn: "2026-10-01" });
    await archiveObligation(owner, archived);

    expect(await obligationReminders(db, at(TODAY))).toEqual({ reminded: 1, escalated: 0 });
    const [n] = await db.select().from(notification);
    expect(n).toMatchObject({ subjectId: km, severity: "info" });

    await archiveVehicle(owner, vehicleId);
    await db.delete(notification);
    expect(await obligationReminders(db, at(TODAY))).toEqual({ reminded: 0, escalated: 0 });
  });
});

describe("completing an obligation that creates a payable", () => {
  const done = (over: Partial<Parameters<typeof completeObligation>[2]> = {}) => ({
    doneOn: "2026-10-20",
    doneKm: null,
    costCents: 25_000,
    checkerName: null,
    notes: null,
    ...over,
  });
  const payables = () => db.select().from(payable);
  const rates = () => db.select().from(installment);

  it("creates the payable with one rate, in the same step, linked to the obligation", async () => {
    const vehicleId = await newVehicle();
    const id = await newObligation({
      kind: "hu",
      title: "Hauptuntersuchung",
      scope: "vehicle",
      vehicleId,
      createsPayable: true,
    });
    const result = await completeObligation(owner, id, done());
    expect(result.payableId).not.toBeNull();

    const [created] = await payables();
    expect(created).toMatchObject({
      id: result.payableId,
      title: "Hauptuntersuchung · K-MW 123",
      scope: "vehicle",
      category: "vehicle",
      vehicleId,
      obligationId: id,
      totalGrossCents: 25_000,
    });
    // Due on the completion date, but never in the past: the completion was dated yesterday, so it is due today.
    expect(await rates()).toEqual([
      expect.objectContaining({
        payableId: created?.id,
        sort: 1,
        dueOn: TODAY,
        amountCents: 25_000,
        status: "open",
      }),
    ]);
    // Both changes are audited, the payable through the payables service.
    expect(await auditsOf("payable.create")).toHaveLength(1);
    const [entry] = await auditsOf("obligation.complete");
    expect(entry?.diff).toMatchObject({ payableId: result.payableId });
  });

  it("uses insurance and tax categories, and the company scope without a vehicle", async () => {
    const id = await newObligation({
      kind: "insurance",
      title: "Haftpflicht",
      createsPayable: true,
    });
    await completeObligation(owner, id, done({ doneOn: TODAY }));
    expect(await payables()).toEqual([
      expect.objectContaining({ category: "insurance", scope: "company", vehicleId: null }),
    ]);
  });

  it("creates nothing without a cost, or when the obligation does not create payables", async () => {
    const withFlag = await newObligation({ createsPayable: true });
    expect(
      (await completeObligation(owner, withFlag, done({ costCents: null }))).payableId,
    ).toBeNull();
    const without = await newObligation({ title: "Andere", createsPayable: false });
    expect((await completeObligation(owner, without, done())).payableId).toBeNull();
    expect(await payables()).toHaveLength(0);
  });

  it("undo removes the payable together with the completion", async () => {
    const id = await newObligation({ createsPayable: true });
    const result = await completeObligation(owner, id, done());
    await undoObligationCompletion(
      owner,
      result.completionId,
      result.previous,
      null,
      result.payableId,
    );
    expect(await payables()).toHaveLength(0);
    expect(await rates()).toHaveLength(0);
    expect(await completionsOf(id)).toHaveLength(0);
    const [entry] = await auditsOf("payable.remove");
    expect(entry).toMatchObject({ entityId: result.payableId });
  });

  it("undo is refused once a rate was paid, and nothing is undone", async () => {
    const id = await newObligation({ createsPayable: true });
    const result = await completeObligation(owner, id, done());
    const [rate] = await rates();
    await markInstallmentPaid(owner, rate?.id as string, {
      paidOn: TODAY,
      amountCents: 25_000,
      method: "cash",
    });
    expect(
      await codeOf(
        undoObligationCompletion(
          owner,
          result.completionId,
          result.previous,
          null,
          result.payableId,
        ),
      ),
    ).toBe("conflict");
    expect(await payables()).toHaveLength(1);
    expect(await completionsOf(id)).toHaveLength(1);
  });

  it("undo is refused once a document hangs on the payable", async () => {
    const id = await newObligation({ createsPayable: true });
    const result = await completeObligation(owner, id, done());
    await db.insert(document).values({
      fileName: "rechnung.pdf",
      mimeType: "application/pdf",
      sizeBytes: 10,
      sha256: "a".repeat(64),
      storageKey: "test/rechnung.pdf",
      payableId: result.payableId,
    });
    expect(
      await codeOf(
        undoObligationCompletion(
          owner,
          result.completionId,
          result.previous,
          null,
          result.payableId,
        ),
      ),
    ).toBe("conflict");
    expect(await payables()).toHaveLength(1);
  });

  it("undo does not touch a payable of another obligation", async () => {
    const mine = await newObligation({ createsPayable: true });
    const other = await newObligation({ title: "Andere", createsPayable: true });
    const a = await completeObligation(owner, mine, done());
    const b = await completeObligation(owner, other, done({ doneOn: TODAY }));
    expect(
      await codeOf(undoObligationCompletion(owner, a.completionId, a.previous, null, b.payableId)),
    ).toBe("conflict");
    expect(await payables()).toHaveLength(2);
  });
});
