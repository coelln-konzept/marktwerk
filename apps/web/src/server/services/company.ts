import "server-only";
import {
  can,
  isIsoDate,
  MAX_COST_CENTS,
  OBLIGATION_KINDS,
  type ObligationKind,
  rollForward,
} from "@marktwerk/core";
import {
  obligation,
  obligationCompletion,
  staffMember,
  vehicle,
  vehicleIssue,
  venue,
} from "@marktwerk/db/schema";
import { and, eq, isNull, sql } from "drizzle-orm";
import { forbidden } from "next/navigation";
import { todayIn } from "@/lib/format";
import type { Actor } from "../actor";
import { db } from "../db";
import { audit } from "./audit";

/*
 * Firma tab (M6): vehicles, recurring obligations with their completions, vehicle issues.
 * Reading needs `company:read` (done by the pages/queries); every function here mutates and needs `company:write`.
 */

export type CompanyErrorCode =
  | "not_found"
  | "conflict"
  | "invalid_name"
  | "invalid_plate"
  | "plate_taken"
  | "invalid_vin"
  | "vin_taken"
  | "invalid_date"
  | "invalid_weight"
  | "invalid_odometer"
  | "odometer_lower"
  | "invalid_text"
  | "invalid_kind"
  | "invalid_scope"
  | "invalid_vehicle"
  | "invalid_venue"
  | "invalid_interval"
  | "invalid_due"
  | "invalid_lead_days"
  | "invalid_staff"
  | "invalid_cost"
  | "invalid_severity"
  | "invalid_status"
  | "future_date"
  | "km_required"
  | "checker_required"
  | "already_done_on";

export class CompanyInputError extends Error {
  constructor(readonly code: CompanyErrorCode) {
    super(code);
  }
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const MAX_NAME_LENGTH = 120;
export const MAX_TEXT_LENGTH = 2000;
export const MAX_KM = 5_000_000;
export const MAX_INTERVAL_MONTHS = 600;
export const MAX_LEAD_DAYS = 365;
const MIN_DATE = "1950-01-01";
const MAX_DATE = "2100-12-31";

const squash = (value: string | null | undefined) => (value ?? "").trim().replace(/\s+/g, " ");
const orNull = (value: string | null | undefined) => {
  const text = squash(value);
  return text === "" ? null : text;
};
/** Multi-line text keeps its line breaks. */
const longText = (value: string | null | undefined) => {
  const text = (value ?? "").trim();
  if (text.length > MAX_TEXT_LENGTH) throw new CompanyInputError("invalid_text");
  return text === "" ? null : text;
};
const isInt = (value: unknown, min: number, max: number): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
const dateOrNull = (value: string | null | undefined) => {
  if (value === null || value === undefined || value === "") return null;
  if (!isIsoDate(value) || value < MIN_DATE || value > MAX_DATE)
    throw new CompanyInputError("invalid_date");
  return value;
};
const intOrNull = (value: number | null | undefined, max: number, code: CompanyErrorCode) => {
  if (value === null || value === undefined) return null;
  if (!isInt(value, 0, max)) throw new CompanyInputError(code);
  return value;
};
const uuidOrThrow = (value: string | null | undefined, code: CompanyErrorCode) => {
  if (!value || !UUID.test(value)) throw new CompanyInputError(code);
  return value;
};

function isUniqueViolation(error: unknown): string | null {
  const e = error as { code?: string; constraint?: string; cause?: unknown } | null;
  if (!e) return null;
  if (e.code === "23505") return e.constraint ?? "";
  return e.cause ? isUniqueViolation(e.cause) : null;
}

// ---------------------------------------------------------------------------------------------
// Vehicles

export type VehicleInput = {
  name: string;
  plate: string;
  make: string | null;
  model: string | null;
  vin: string | null;
  firstRegistrationOn: string | null;
  grossWeightKg: number | null;
  odometerKm: number | null;
  /** Date of the odometer reading; defaults to today when the km changed. */
  odometerRecordedOn?: string | null;
  insurer: string | null;
  policyNumber: string | null;
  notes: string | null;
};

type CleanVehicle = Omit<typeof vehicle.$inferInsert, "id" | "createdAt" | "updatedAt">;

const VEHICLE_FIELDS = [
  "name",
  "plate",
  "make",
  "model",
  "vin",
  "firstRegistrationOn",
  "grossWeightKg",
  "odometerKm",
  "odometerRecordedOn",
  "insurer",
  "policyNumber",
  "notes",
] as const satisfies readonly (keyof CleanVehicle)[];

const normalizePlate = (value: string) => squash(value).toUpperCase();

function cleanVehicle(input: VehicleInput, today: string): CleanVehicle {
  const name = squash(input.name);
  if (name === "" || name.length > MAX_NAME_LENGTH) throw new CompanyInputError("invalid_name");
  const plate = normalizePlate(input.plate ?? "");
  if (!/^[A-ZÄÖÜ0-9][A-ZÄÖÜ0-9 -]{1,14}$/.test(plate)) throw new CompanyInputError("invalid_plate");
  const vin = orNull(input.vin)?.replace(/\s+/g, "").toUpperCase() ?? null;
  if (vin !== null && !/^[A-HJ-NPR-Z0-9]{11,17}$/.test(vin))
    throw new CompanyInputError("invalid_vin");
  const make = orNull(input.make);
  const model = orNull(input.model);
  const insurer = orNull(input.insurer);
  const policyNumber = orNull(input.policyNumber);
  for (const text of [make, model, insurer, policyNumber])
    if (text && text.length > MAX_NAME_LENGTH) throw new CompanyInputError("invalid_text");
  const grossWeightKg = input.grossWeightKg ?? null;
  if (grossWeightKg !== null && !isInt(grossWeightKg, 1, 100_000))
    throw new CompanyInputError("invalid_weight");
  const odometerKm = intOrNull(input.odometerKm, MAX_KM, "invalid_odometer");
  const firstRegistrationOn = dateOrNull(input.firstRegistrationOn);
  if (firstRegistrationOn && firstRegistrationOn > today)
    throw new CompanyInputError("future_date");
  let odometerRecordedOn = dateOrNull(input.odometerRecordedOn);
  if (odometerKm === null) odometerRecordedOn = null;
  else if (odometerRecordedOn === null) odometerRecordedOn = today;
  if (odometerRecordedOn && odometerRecordedOn > today) throw new CompanyInputError("future_date");
  return {
    name,
    plate,
    make,
    model,
    vin,
    firstRegistrationOn,
    grossWeightKg,
    odometerKm,
    odometerRecordedOn,
    insurer,
    policyNumber,
    notes: longText(input.notes),
  };
}

async function checkVehicleUnique(
  tx: Tx,
  values: Pick<CleanVehicle, "plate" | "vin">,
  exceptId?: string,
) {
  const clash = (column: typeof vehicle.plate | typeof vehicle.vin, value: string) =>
    tx
      .select({ id: vehicle.id })
      .from(vehicle)
      .where(and(eq(column, value), exceptId ? sql`${vehicle.id} <> ${exceptId}` : undefined))
      .limit(1);
  if ((await clash(vehicle.plate, values.plate)).length > 0)
    throw new CompanyInputError("plate_taken");
  if (values.vin && (await clash(vehicle.vin, values.vin)).length > 0)
    throw new CompanyInputError("vin_taken");
}

/** Maps the unique violation of a racing insert/update to the same codes as the pre-check. */
function rethrowUnique(error: unknown): never {
  const constraint = isUniqueViolation(error);
  if (constraint !== null) {
    throw new CompanyInputError(constraint.includes("vin") ? "vin_taken" : "plate_taken");
  }
  throw error;
}

async function lockVehicle(tx: Tx, id: string, { archived = false } = {}) {
  if (!UUID.test(id)) throw new CompanyInputError("not_found");
  const [row] = await tx
    .select()
    .from(vehicle)
    .where(and(eq(vehicle.id, id), archived ? undefined : isNull(vehicle.archivedAt)))
    .for("update");
  if (!row) throw new CompanyInputError("not_found");
  return row;
}

/** "Fahrzeug anlegen". Audited as "vehicle.create". */
export async function createVehicle(actor: Actor, input: VehicleInput): Promise<{ id: string }> {
  if (!can(actor.role, "company", "write")) forbidden();
  const values = cleanVehicle(input, todayIn());
  try {
    return await db.transaction(async (tx) => {
      await checkVehicleUnique(tx, values);
      const [row] = await tx.insert(vehicle).values(values).returning({ id: vehicle.id });
      if (!row) throw new Error("insert failed");
      await audit(tx, actor.id, [
        { action: "vehicle.create", entityType: "vehicle", entityId: row.id, diff: { values } },
      ]);
      return row;
    });
  } catch (error) {
    return rethrowUnique(error);
  }
}

/** "Fahrzeug bearbeiten". Audited as "vehicle.update" with {field: {from, to}}. */
export async function updateVehicle(
  actor: Actor,
  id: string,
  input: VehicleInput,
): Promise<{ changed: boolean }> {
  if (!can(actor.role, "company", "write")) forbidden();
  const today = todayIn();
  const next = cleanVehicle(input, today);
  try {
    return await db.transaction(async (tx) => {
      const current = await lockVehicle(tx, id);
      // An unchanged odometer keeps its reading date unless the form sent a new one.
      if (next.odometerKm === current.odometerKm && !input.odometerRecordedOn)
        next.odometerRecordedOn = current.odometerRecordedOn;
      await checkVehicleUnique(tx, next, id);
      const changes: Record<string, { from: unknown; to: unknown }> = {};
      for (const field of VEHICLE_FIELDS) {
        if (current[field] !== next[field])
          changes[field] = { from: current[field], to: next[field] };
      }
      if (Object.keys(changes).length === 0) return { changed: false };
      await tx.update(vehicle).set(next).where(eq(vehicle.id, id));
      await audit(tx, actor.id, [
        { action: "vehicle.update", entityType: "vehicle", entityId: id, diff: { changes } },
      ]);
      return { changed: true };
    });
  } catch (error) {
    return rethrowUnique(error);
  }
}

export type OdometerSnapshot = { odometerKm: number | null; odometerRecordedOn: string | null };

/**
 * "Kilometerstand eintragen": a new reading with its date. It can't be lower than the stored one (a typo is
 * corrected through "Fahrzeug bearbeiten"). Audited as "vehicle.odometer"; `undoOdometer` is the undo toast.
 */
export async function recordOdometer(
  actor: Actor,
  vehicleId: string,
  km: number,
  recordedOn?: string | null,
): Promise<{ previous: OdometerSnapshot; next: OdometerSnapshot }> {
  if (!can(actor.role, "company", "write")) forbidden();
  if (!isInt(km, 0, MAX_KM)) throw new CompanyInputError("invalid_odometer");
  const today = todayIn();
  const on = dateOrNull(recordedOn) ?? today;
  if (on > today) throw new CompanyInputError("future_date");
  return db.transaction(async (tx) => {
    const current = await lockVehicle(tx, vehicleId);
    if (current.odometerKm !== null && km < current.odometerKm)
      throw new CompanyInputError("odometer_lower");
    const previous = {
      odometerKm: current.odometerKm,
      odometerRecordedOn: current.odometerRecordedOn,
    };
    const next = { odometerKm: km, odometerRecordedOn: on };
    await tx.update(vehicle).set(next).where(eq(vehicle.id, vehicleId));
    await audit(tx, actor.id, [
      {
        action: "vehicle.odometer",
        entityType: "vehicle",
        entityId: vehicleId,
        diff: { from: previous, to: next },
      },
    ]);
    return { previous, next };
  });
}

/** Undo of `recordOdometer`: only while the reading still equals `next`. Audited as "vehicle.odometer" (undo). */
export async function undoOdometer(
  actor: Actor,
  vehicleId: string,
  previous: OdometerSnapshot,
  next: OdometerSnapshot,
): Promise<void> {
  if (!can(actor.role, "company", "write")) forbidden();
  const prev = {
    odometerKm: intOrNull(previous?.odometerKm, MAX_KM, "invalid_odometer"),
    odometerRecordedOn: dateOrNull(previous?.odometerRecordedOn),
  };
  await db.transaction(async (tx) => {
    const current = await lockVehicle(tx, vehicleId);
    if (
      current.odometerKm !== next?.odometerKm ||
      current.odometerRecordedOn !== next?.odometerRecordedOn
    )
      throw new CompanyInputError("conflict");
    await tx.update(vehicle).set(prev).where(eq(vehicle.id, vehicleId));
    await audit(tx, actor.id, [
      {
        action: "vehicle.odometer",
        entityType: "vehicle",
        entityId: vehicleId,
        diff: { from: next, to: prev, undo: true },
      },
    ]);
  });
}

/**
 * "Fahrzeug archivieren" (sold or scrapped): the vehicle and its active obligations leave the lists and the
 * reminders. Issues and history stay. Both get the same `archived_at`, so `restoreVehicle` brings back exactly those.
 */
export async function archiveVehicle(actor: Actor, id: string): Promise<{ name: string }> {
  if (!can(actor.role, "company", "write")) forbidden();
  return db.transaction(async (tx) => {
    const current = await lockVehicle(tx, id);
    const at = new Date();
    await tx.update(vehicle).set({ archivedAt: at }).where(eq(vehicle.id, id));
    const archived = await tx
      .update(obligation)
      .set({ archivedAt: at })
      .where(and(eq(obligation.vehicleId, id), isNull(obligation.archivedAt)))
      .returning({ id: obligation.id });
    await audit(tx, actor.id, [
      {
        action: "vehicle.archive",
        entityType: "vehicle",
        entityId: id,
        diff: { name: current.name, obligations: archived.map((o) => o.id) },
      },
    ]);
    return { name: current.name };
  });
}

/** Undo of `archiveVehicle`. Audited as "vehicle.restore". */
export async function restoreVehicle(actor: Actor, id: string): Promise<{ name: string }> {
  if (!can(actor.role, "company", "write")) forbidden();
  return db.transaction(async (tx) => {
    const current = await lockVehicle(tx, id, { archived: true });
    if (!current.archivedAt) throw new CompanyInputError("conflict");
    await tx.update(vehicle).set({ archivedAt: null }).where(eq(vehicle.id, id));
    const restored = await tx
      .update(obligation)
      .set({ archivedAt: null })
      .where(and(eq(obligation.vehicleId, id), eq(obligation.archivedAt, current.archivedAt)))
      .returning({ id: obligation.id });
    await audit(tx, actor.id, [
      {
        action: "vehicle.restore",
        entityType: "vehicle",
        entityId: id,
        diff: { name: current.name, obligations: restored.map((o) => o.id) },
      },
    ]);
    return { name: current.name };
  });
}

// ---------------------------------------------------------------------------------------------
// Obligations

export type ObligationInput = {
  kind: string;
  title: string;
  scope: string;
  vehicleId: string | null;
  venueId: string | null;
  intervalMonths: number | null;
  intervalKm: number | null;
  nextDueOn: string | null;
  nextDueKm: number | null;
  leadDays: number;
  responsibleStaffMemberId: string;
  createsPayable: boolean;
  notes: string | null;
};

type CleanObligation = Omit<
  typeof obligation.$inferInsert,
  "id" | "createdAt" | "updatedAt" | "archivedAt" | "lastDoneOn"
>;

const OBLIGATION_FIELDS = [
  "kind",
  "title",
  "scope",
  "vehicleId",
  "venueId",
  "intervalMonths",
  "intervalKm",
  "nextDueOn",
  "nextDueKm",
  "leadDays",
  "responsibleStaffMemberId",
  "createsPayable",
  "notes",
] as const satisfies readonly (keyof CleanObligation)[];

const isKind = (value: string): value is ObligationKind =>
  (OBLIGATION_KINDS as readonly string[]).includes(value);
const isScope = (value: string): value is "company" | "vehicle" | "venue" =>
  value === "company" || value === "vehicle" || value === "venue";

function cleanObligation(input: ObligationInput): CleanObligation {
  if (!isKind(input.kind)) throw new CompanyInputError("invalid_kind");
  const title = squash(input.title);
  if (title === "" || title.length > MAX_NAME_LENGTH) throw new CompanyInputError("invalid_name");
  if (!isScope(input.scope)) throw new CompanyInputError("invalid_scope");
  const vehicleId =
    input.scope === "vehicle" ? uuidOrThrow(input.vehicleId, "invalid_vehicle") : null;
  const venueId = input.scope === "venue" ? uuidOrThrow(input.venueId, "invalid_venue") : null;
  const intervalMonths = input.intervalMonths ?? null;
  if (intervalMonths !== null && !isInt(intervalMonths, 1, MAX_INTERVAL_MONTHS))
    throw new CompanyInputError("invalid_interval");
  const intervalKm = input.intervalKm ?? null;
  if (intervalKm !== null && !isInt(intervalKm, 1, MAX_KM))
    throw new CompanyInputError("invalid_interval");
  // Km only make sense on a vehicle.
  if (intervalKm !== null && input.scope !== "vehicle")
    throw new CompanyInputError("invalid_interval");
  const nextDueOn = dateOrNull(input.nextDueOn);
  const nextDueKm = intOrNull(input.nextDueKm, MAX_KM, "invalid_due");
  if (nextDueKm !== null && input.scope !== "vehicle") throw new CompanyInputError("invalid_due");
  if (!isInt(input.leadDays, 0, MAX_LEAD_DAYS)) throw new CompanyInputError("invalid_lead_days");
  return {
    kind: input.kind,
    title,
    scope: input.scope,
    vehicleId,
    venueId,
    intervalMonths,
    intervalKm,
    nextDueOn,
    nextDueKm,
    leadDays: input.leadDays,
    responsibleStaffMemberId: uuidOrThrow(input.responsibleStaffMemberId, "invalid_staff"),
    createsPayable: input.createsPayable === true,
    notes: longText(input.notes),
  };
}

async function checkObligationRefs(
  tx: Tx,
  values: CleanObligation,
  current?: typeof obligation.$inferSelect,
) {
  if (values.vehicleId && values.vehicleId !== current?.vehicleId) {
    const [row] = await tx
      .select({ id: vehicle.id })
      .from(vehicle)
      .where(and(eq(vehicle.id, values.vehicleId), isNull(vehicle.archivedAt)));
    if (!row) throw new CompanyInputError("invalid_vehicle");
  }
  if (values.venueId && values.venueId !== current?.venueId) {
    const [row] = await tx
      .select({ id: venue.id })
      .from(venue)
      .where(and(eq(venue.id, values.venueId), isNull(venue.archivedAt)));
    if (!row) throw new CompanyInputError("invalid_venue");
  }
  if (values.responsibleStaffMemberId !== current?.responsibleStaffMemberId) {
    const [row] = await tx
      .select({ id: staffMember.id })
      .from(staffMember)
      .where(
        and(
          eq(staffMember.id, values.responsibleStaffMemberId),
          eq(staffMember.active, true),
          isNull(staffMember.archivedAt),
        ),
      );
    if (!row) throw new CompanyInputError("invalid_staff");
  }
}

async function lockObligation(tx: Tx, id: string, { archived = false } = {}) {
  if (!UUID.test(id)) throw new CompanyInputError("not_found");
  const [row] = await tx
    .select()
    .from(obligation)
    .where(and(eq(obligation.id, id), archived ? undefined : isNull(obligation.archivedAt)))
    .for("update");
  if (!row) throw new CompanyInputError("not_found");
  return row;
}

/** "Pflicht anlegen". Audited as "obligation.create". */
export async function createObligation(
  actor: Actor,
  input: ObligationInput,
): Promise<{ id: string }> {
  if (!can(actor.role, "company", "write")) forbidden();
  const values = cleanObligation(input);
  return db.transaction(async (tx) => {
    await checkObligationRefs(tx, values);
    const [row] = await tx.insert(obligation).values(values).returning({ id: obligation.id });
    if (!row) throw new Error("insert failed");
    await audit(tx, actor.id, [
      { action: "obligation.create", entityType: "obligation", entityId: row.id, diff: { values } },
    ]);
    return row;
  });
}

/** "Pflicht bearbeiten" (also the manual correction of the due date). Audited as "obligation.update". */
export async function updateObligation(
  actor: Actor,
  id: string,
  input: ObligationInput,
): Promise<{ changed: boolean }> {
  if (!can(actor.role, "company", "write")) forbidden();
  const next = cleanObligation(input);
  return db.transaction(async (tx) => {
    const current = await lockObligation(tx, id);
    await checkObligationRefs(tx, next, current);
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    for (const field of OBLIGATION_FIELDS) {
      if (current[field] !== next[field])
        changes[field] = { from: current[field], to: next[field] };
    }
    if (Object.keys(changes).length === 0) return { changed: false };
    await tx.update(obligation).set(next).where(eq(obligation.id, id));
    await audit(tx, actor.id, [
      { action: "obligation.update", entityType: "obligation", entityId: id, diff: { changes } },
    ]);
    return { changed: true };
  });
}

/** "Pflicht archivieren": no more reminders, history stays. Audited as "obligation.archive". */
export async function archiveObligation(actor: Actor, id: string): Promise<{ title: string }> {
  if (!can(actor.role, "company", "write")) forbidden();
  return db.transaction(async (tx) => {
    const current = await lockObligation(tx, id);
    await tx.update(obligation).set({ archivedAt: new Date() }).where(eq(obligation.id, id));
    await audit(tx, actor.id, [
      {
        action: "obligation.archive",
        entityType: "obligation",
        entityId: id,
        diff: { title: current.title },
      },
    ]);
    return { title: current.title };
  });
}

/** Undo of `archiveObligation`. Audited as "obligation.restore". */
export async function restoreObligation(actor: Actor, id: string): Promise<{ title: string }> {
  if (!can(actor.role, "company", "write")) forbidden();
  return db.transaction(async (tx) => {
    const current = await lockObligation(tx, id, { archived: true });
    if (!current.archivedAt) throw new CompanyInputError("conflict");
    await tx.update(obligation).set({ archivedAt: null }).where(eq(obligation.id, id));
    await audit(tx, actor.id, [
      {
        action: "obligation.restore",
        entityType: "obligation",
        entityId: id,
        diff: { title: current.title },
      },
    ]);
    return { title: current.title };
  });
}

// --- Completing -------------------------------------------------------------------------------

export type CompletionInput = {
  doneOn: string;
  /** Odometer at completion; required when the obligation has a km interval. */
  doneKm: number | null;
  costCents: number | null;
  /** Licence check: who checked (the date is `doneOn`; no copy of the licence is stored). */
  checkerName: string | null;
  notes: string | null;
};

/** The obligation's schedule fields, kept in the result so an undo can put them back. */
export type ObligationSchedule = {
  lastDoneOn: string | null;
  nextDueOn: string | null;
  nextDueKm: number | null;
};

export type CompletionResult = {
  completionId: string;
  previous: ObligationSchedule;
  next: ObligationSchedule;
  /** Set when the vehicle's odometer was raised by this completion. */
  odometer: { previous: OdometerSnapshot; next: OdometerSnapshot } | null;
};

const scheduleOf = (row: typeof obligation.$inferSelect): ObligationSchedule => ({
  lastDoneOn: row.lastDoneOn,
  nextDueOn: row.nextDueOn,
  nextDueKm: row.nextDueKm,
});

/**
 * "Erledigt": records the completion and rolls the next due date/km forward from the interval
 * (`rollForward` in @marktwerk/core: whichever of date and km comes first stays a target of its own).
 * A completion dated before the last one is recorded for the history but leaves the schedule alone.
 * A km reading above the vehicle's odometer raises the odometer. Audited as "obligation.complete".
 *
 * TODO(M5 payables): when `obligation.createsPayable` is set, create a payable here (inside this transaction,
 * `payable.obligation_id` = this obligation, vehicle/venue from the obligation, amount from `costCents` if
 * given) and return its id so the undo can remove it again. The payables service is being built separately;
 * until it exists, completing does not create one.
 */
export async function completeObligation(
  actor: Actor,
  id: string,
  input: CompletionInput,
): Promise<CompletionResult> {
  if (!can(actor.role, "company", "write")) forbidden();
  const today = todayIn();
  const doneOn = dateOrNull(input.doneOn);
  if (!doneOn) throw new CompanyInputError("invalid_date");
  if (doneOn > today) throw new CompanyInputError("future_date");
  const doneKm = intOrNull(input.doneKm, MAX_KM, "invalid_odometer");
  const costCents = intOrNull(input.costCents, MAX_COST_CENTS, "invalid_cost");
  const checkerName = orNull(input.checkerName);
  if (checkerName && checkerName.length > MAX_NAME_LENGTH)
    throw new CompanyInputError("invalid_text");
  const notes = longText(input.notes);

  return db.transaction(async (tx) => {
    const current = await lockObligation(tx, id);
    if (current.intervalKm !== null && doneKm === null) throw new CompanyInputError("km_required");
    if (current.kind === "licence_check" && !checkerName)
      throw new CompanyInputError("checker_required");
    const [same] = await tx
      .select({ id: obligationCompletion.id })
      .from(obligationCompletion)
      .where(
        and(eq(obligationCompletion.obligationId, id), eq(obligationCompletion.doneOn, doneOn)),
      );
    if (same) throw new CompanyInputError("already_done_on");

    const previous = scheduleOf(current);
    const isNewest = current.lastDoneOn === null || doneOn >= current.lastDoneOn;
    const rolled = isNewest
      ? rollForward({
          intervalMonths: current.intervalMonths,
          intervalKm: current.intervalKm,
          nextDueOn: current.nextDueOn,
          leadDays: current.leadDays,
          doneOn,
          doneKm,
        })
      : { nextDueOn: current.nextDueOn, nextDueKm: current.nextDueKm };
    const next: ObligationSchedule = {
      lastDoneOn: isNewest ? doneOn : current.lastDoneOn,
      ...rolled,
    };

    const [completion] = await tx
      .insert(obligationCompletion)
      .values({
        obligationId: id,
        doneOn,
        doneKm,
        costCents,
        doneById: actor.staffMemberId,
        checkerName,
        notes,
        nextDueOnAfter: next.nextDueOn,
        nextDueKmAfter: next.nextDueKm,
      })
      .returning({ id: obligationCompletion.id });
    if (!completion) throw new Error("insert failed");
    if (isNewest) await tx.update(obligation).set(next).where(eq(obligation.id, id));

    // A reading taken at completion also updates the vehicle (never lowers it).
    let odometer: CompletionResult["odometer"] = null;
    if (current.vehicleId && doneKm !== null) {
      const [v] = await tx
        .select()
        .from(vehicle)
        .where(eq(vehicle.id, current.vehicleId))
        .for("update");
      if (v && (v.odometerKm === null || doneKm > v.odometerKm)) {
        const before = { odometerKm: v.odometerKm, odometerRecordedOn: v.odometerRecordedOn };
        const after = { odometerKm: doneKm, odometerRecordedOn: doneOn };
        await tx.update(vehicle).set(after).where(eq(vehicle.id, v.id));
        odometer = { previous: before, next: after };
      }
    }

    // TODO(M5 payables): create the payable when `current.createsPayable` (see the function comment).

    await audit(tx, actor.id, [
      {
        action: "obligation.complete",
        entityType: "obligation",
        entityId: id,
        diff: {
          completionId: completion.id,
          doneOn,
          doneKm,
          costCents,
          checkerName,
          from: previous,
          to: next,
          odometer,
        },
      },
    ]);
    return { completionId: completion.id, previous, next, odometer };
  });
}

/**
 * Undo toast of "Erledigt": removes the completion and puts the schedule (and a raised odometer) back.
 * Applies only while nothing changed since (the obligation still has the schedule the completion produced),
 * otherwise `conflict`. Audited as "obligation.complete_undo".
 *
 * TODO(M5 payables): also remove the payable that `completeObligation` created, once that exists.
 */
export async function undoObligationCompletion(
  actor: Actor,
  completionId: string,
  previous: ObligationSchedule,
  odometer: CompletionResult["odometer"],
): Promise<void> {
  if (!can(actor.role, "company", "write")) forbidden();
  if (!UUID.test(completionId)) throw new CompanyInputError("not_found");
  const prev: ObligationSchedule = {
    lastDoneOn: dateOrNull(previous?.lastDoneOn),
    nextDueOn: dateOrNull(previous?.nextDueOn),
    nextDueKm: intOrNull(previous?.nextDueKm, MAX_KM, "invalid_due"),
  };
  await db.transaction(async (tx) => {
    const [completion] = await tx
      .select()
      .from(obligationCompletion)
      .where(eq(obligationCompletion.id, completionId));
    if (!completion) throw new CompanyInputError("not_found");
    const current = await lockObligation(tx, completion.obligationId);
    // Only the newest completion owns the live schedule; undoing it needs that schedule untouched since.
    const isNewest = current.lastDoneOn === completion.doneOn;
    if (
      isNewest &&
      (current.nextDueOn !== completion.nextDueOnAfter ||
        current.nextDueKm !== completion.nextDueKmAfter)
    )
      throw new CompanyInputError("conflict");

    await tx.delete(obligationCompletion).where(eq(obligationCompletion.id, completionId));
    if (isNewest) await tx.update(obligation).set(prev).where(eq(obligation.id, current.id));

    if (odometer && current.vehicleId) {
      const [v] = await tx
        .select()
        .from(vehicle)
        .where(eq(vehicle.id, current.vehicleId))
        .for("update");
      if (
        v &&
        v.odometerKm === odometer.next.odometerKm &&
        v.odometerRecordedOn === odometer.next.odometerRecordedOn
      ) {
        await tx
          .update(vehicle)
          .set({
            odometerKm: odometer.previous.odometerKm,
            odometerRecordedOn: odometer.previous.odometerRecordedOn,
          })
          .where(eq(vehicle.id, v.id));
      }
    }
    await audit(tx, actor.id, [
      {
        action: "obligation.complete_undo",
        entityType: "obligation",
        entityId: current.id,
        diff: { completionId, doneOn: completion.doneOn, restored: isNewest ? prev : null },
      },
    ]);
  });
}

// ---------------------------------------------------------------------------------------------
// Vehicle issues (Mängel)

export const ISSUE_SEVERITIES = ["minor", "major", "critical"] as const;
export const ISSUE_STATUSES = ["open", "in_progress", "resolved"] as const;
export type IssueSeverity = (typeof ISSUE_SEVERITIES)[number];
export type IssueStatus = (typeof ISSUE_STATUSES)[number];

export type IssueInput = {
  vehicleId: string;
  title: string;
  description: string | null;
  severity: string;
  /** Staff member who noticed it; defaults to the actor's own staff record. */
  reportedByStaffMemberId?: string | null;
};

/**
 * "Mangel melden". Status starts as `open`. Photos: not yet. The documents module (another milestone)
 * stores them as `document` rows with `vehicle_issue_id`; until then the form has a marked placeholder.
 * Audited as "vehicle_issue.report".
 */
export async function reportVehicleIssue(actor: Actor, input: IssueInput): Promise<{ id: string }> {
  if (!can(actor.role, "company", "write")) forbidden();
  const title = squash(input.title);
  if (title === "" || title.length > MAX_NAME_LENGTH) throw new CompanyInputError("invalid_name");
  if (!(ISSUE_SEVERITIES as readonly string[]).includes(input.severity))
    throw new CompanyInputError("invalid_severity");
  const severity = input.severity as IssueSeverity;
  const description = longText(input.description);
  const vehicleId = uuidOrThrow(input.vehicleId, "invalid_vehicle");
  const reporter =
    input.reportedByStaffMemberId === undefined
      ? actor.staffMemberId
      : input.reportedByStaffMemberId || null;
  return db.transaction(async (tx) => {
    try {
      await lockVehicle(tx, vehicleId);
    } catch (error) {
      throw error instanceof CompanyInputError ? new CompanyInputError("invalid_vehicle") : error;
    }
    if (reporter) {
      if (!UUID.test(reporter)) throw new CompanyInputError("invalid_staff");
      const [person] = await tx
        .select({ id: staffMember.id })
        .from(staffMember)
        .where(and(eq(staffMember.id, reporter), isNull(staffMember.archivedAt)));
      if (!person) throw new CompanyInputError("invalid_staff");
    }
    const [row] = await tx
      .insert(vehicleIssue)
      .values({
        vehicleId,
        title,
        description,
        severity,
        status: "open",
        reportedByStaffMemberId: reporter,
      })
      .returning({ id: vehicleIssue.id });
    if (!row) throw new Error("insert failed");
    await audit(tx, actor.id, [
      {
        action: "vehicle_issue.report",
        entityType: "vehicle_issue",
        entityId: row.id,
        diff: { vehicleId, title, severity, reportedBy: reporter },
      },
    ]);
    return row;
  });
}

/**
 * Open → in repair → fixed (also back, e.g. when a repair did not hold). "Behoben" records who and when, with
 * an optional note. `expected` (undo toast) applies only while the issue still has that status.
 * Audited as "vehicle_issue.status".
 */
export async function setVehicleIssueStatus(
  actor: Actor,
  issueId: string,
  status: string,
  options: { resolutionNote?: string | null; expected?: IssueStatus } = {},
): Promise<{ changed: boolean; from: IssueStatus; to: IssueStatus }> {
  if (!can(actor.role, "company", "write")) forbidden();
  if (!(ISSUE_STATUSES as readonly string[]).includes(status))
    throw new CompanyInputError("invalid_status");
  const to = status as IssueStatus;
  const note = longText(options.resolutionNote);
  if (!UUID.test(issueId)) throw new CompanyInputError("not_found");
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(vehicleIssue)
      .where(eq(vehicleIssue.id, issueId))
      .for("update");
    if (!current) throw new CompanyInputError("not_found");
    if (options.expected && current.status !== options.expected)
      throw new CompanyInputError("conflict");
    if (current.status === to) return { changed: false, from: current.status, to };
    const resolved =
      to === "resolved"
        ? {
            resolvedAt: new Date(),
            resolvedByStaffMemberId: actor.staffMemberId,
            resolutionNote: note,
          }
        : { resolvedAt: null, resolvedByStaffMemberId: null, resolutionNote: null };
    await tx
      .update(vehicleIssue)
      .set({ status: to, ...resolved })
      .where(eq(vehicleIssue.id, issueId));
    await audit(tx, actor.id, [
      {
        action: "vehicle_issue.status",
        entityType: "vehicle_issue",
        entityId: issueId,
        diff: { from: current.status, to, vehicleId: current.vehicleId, note },
      },
    ]);
    return { changed: true, from: current.status, to };
  });
}
