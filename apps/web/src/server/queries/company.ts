import "server-only";
import {
  can,
  huIntervalMonths,
  LEGAL_KEYS,
  OBLIGATION_STATUS_ORDER,
  type ObligationStatus,
  obligationStatus,
} from "@marktwerk/core";
import {
  legalParameter,
  obligation,
  obligationCompletion,
  staffMember,
  vehicle,
  vehicleIssue,
  venue,
} from "@marktwerk/db/schema";
import { and, asc, desc, eq, inArray, isNull, lte } from "drizzle-orm";
import { todayIn } from "@/lib/format";
import type { Actor } from "../actor";
import { db } from "../db";
import type { CalendarItem, DueItem } from "./due";

/*
 * Firma tab reads. Callers check `company:read` (pages) — `dueItems`/`calendarItems` check it themselves,
 * so Übersicht and Kalender can call them for any role.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (value: string) => UUID.test(value);

// ---------------------------------------------------------------------------------------------
// Obligations

export type ObligationRow = {
  id: string;
  kind: (typeof obligation.$inferSelect)["kind"];
  title: string;
  scope: "company" | "vehicle" | "venue";
  vehicleId: string | null;
  vehicleName: string | null;
  vehiclePlate: string | null;
  venueId: string | null;
  venueName: string | null;
  intervalMonths: number | null;
  intervalKm: number | null;
  nextDueOn: string | null;
  nextDueKm: number | null;
  leadDays: number;
  responsibleId: string;
  responsibleName: string;
  createsPayable: boolean;
  lastDoneOn: string | null;
  notes: string | null;
  /** Odometer of the vehicle (vehicle obligations), the basis for km targets. */
  currentKm: number | null;
  status: ObligationStatus;
  daysLeft: number | null;
  kmLeft: number | null;
  trigger: "date" | "km" | null;
};

const obligationSelect = {
  id: obligation.id,
  kind: obligation.kind,
  title: obligation.title,
  scope: obligation.scope,
  vehicleId: obligation.vehicleId,
  vehicleName: vehicle.name,
  vehiclePlate: vehicle.plate,
  venueId: obligation.venueId,
  venueName: venue.name,
  intervalMonths: obligation.intervalMonths,
  intervalKm: obligation.intervalKm,
  nextDueOn: obligation.nextDueOn,
  nextDueKm: obligation.nextDueKm,
  leadDays: obligation.leadDays,
  responsibleId: obligation.responsibleStaffMemberId,
  responsibleName: staffMember.displayName,
  createsPayable: obligation.createsPayable,
  lastDoneOn: obligation.lastDoneOn,
  notes: obligation.notes,
  currentKm: vehicle.odometerKm,
};

const SEVERITY = Object.fromEntries(OBLIGATION_STATUS_ORDER.map((s, i) => [s, i])) as Record<
  ObligationStatus,
  number
>;

function withStatus(
  row: Omit<ObligationRow, "status" | "daysLeft" | "kmLeft" | "trigger">,
  today: string,
): ObligationRow {
  return {
    ...row,
    ...obligationStatus({
      nextDueOn: row.nextDueOn,
      nextDueKm: row.nextDueKm,
      leadDays: row.leadDays,
      today,
      currentKm: row.currentKm,
    }),
  };
}

/** Worst first, then by date (without date last), then by title. */
function bySeverity(a: ObligationRow, b: ObligationRow): number {
  return (
    SEVERITY[a.status] - SEVERITY[b.status] ||
    (a.nextDueOn ?? "9999-12-31").localeCompare(b.nextDueOn ?? "9999-12-31") ||
    a.title.localeCompare(b.title, "de")
  );
}

function liveObligations() {
  return db
    .select(obligationSelect)
    .from(obligation)
    .leftJoin(vehicle, eq(vehicle.id, obligation.vehicleId))
    .leftJoin(venue, eq(venue.id, obligation.venueId))
    .innerJoin(staffMember, eq(staffMember.id, obligation.responsibleStaffMemberId));
}

/** Active obligations of company, vehicles and venues; archived ones and those of archived vehicles are left out. */
export async function listObligations(
  today: string,
  filter: { vehicleId?: string } = {},
): Promise<ObligationRow[]> {
  const rows = await liveObligations().where(
    and(
      isNull(obligation.archivedAt),
      isNull(vehicle.archivedAt),
      filter.vehicleId ? eq(obligation.vehicleId, filter.vehicleId) : undefined,
    ),
  );
  return rows.map((r) => withStatus(r, today)).sort(bySeverity);
}

export type CompletionRow = {
  id: string;
  doneOn: string;
  doneKm: number | null;
  costCents: number | null;
  doneByName: string | null;
  checkerName: string | null;
  notes: string | null;
  nextDueOnAfter: string | null;
  nextDueKmAfter: number | null;
};

export async function getObligation(
  id: string,
  today: string,
): Promise<{ obligation: ObligationRow; completions: CompletionRow[]; archived: boolean } | null> {
  if (!isUuid(id)) return null;
  const [row] = await liveObligations().where(eq(obligation.id, id));
  if (!row) return null;
  const [archivedRow] = await db
    .select({ archivedAt: obligation.archivedAt })
    .from(obligation)
    .where(eq(obligation.id, id));
  const completions = await db
    .select({
      id: obligationCompletion.id,
      doneOn: obligationCompletion.doneOn,
      doneKm: obligationCompletion.doneKm,
      costCents: obligationCompletion.costCents,
      doneByName: staffMember.displayName,
      checkerName: obligationCompletion.checkerName,
      notes: obligationCompletion.notes,
      nextDueOnAfter: obligationCompletion.nextDueOnAfter,
      nextDueKmAfter: obligationCompletion.nextDueKmAfter,
    })
    .from(obligationCompletion)
    .leftJoin(staffMember, eq(staffMember.id, obligationCompletion.doneById))
    .where(eq(obligationCompletion.obligationId, id))
    .orderBy(desc(obligationCompletion.doneOn));
  return {
    obligation: withStatus(row, today),
    completions,
    archived: archivedRow?.archivedAt != null,
  };
}

// ---------------------------------------------------------------------------------------------
// Vehicles

export type VehicleRow = {
  id: string;
  name: string;
  plate: string;
  make: string | null;
  model: string | null;
  grossWeightKg: number | null;
  odometerKm: number | null;
  odometerRecordedOn: string | null;
  insurer: string | null;
  /** Count of this vehicle's obligations per status. */
  statusCounts: Record<ObligationStatus, number>;
  worstStatus: ObligationStatus;
  openIssues: number;
  criticalIssues: number;
};

const emptyCounts = (): Record<ObligationStatus, number> => ({
  overdue: 0,
  due: 0,
  soon: 0,
  ok: 0,
});

export async function listVehicles(today: string): Promise<VehicleRow[]> {
  const [vehicles, obligations, issues] = await Promise.all([
    db
      .select({
        id: vehicle.id,
        name: vehicle.name,
        plate: vehicle.plate,
        make: vehicle.make,
        model: vehicle.model,
        grossWeightKg: vehicle.grossWeightKg,
        odometerKm: vehicle.odometerKm,
        odometerRecordedOn: vehicle.odometerRecordedOn,
        insurer: vehicle.insurer,
      })
      .from(vehicle)
      .where(isNull(vehicle.archivedAt))
      .orderBy(asc(vehicle.name)),
    listObligations(today),
    db
      .select({
        vehicleId: vehicleIssue.vehicleId,
        severity: vehicleIssue.severity,
      })
      .from(vehicleIssue)
      .where(inArray(vehicleIssue.status, ["open", "in_progress"])),
  ]);
  return vehicles.map((v) => {
    const statusCounts = emptyCounts();
    for (const o of obligations) if (o.vehicleId === v.id) statusCounts[o.status] += 1;
    const mine = issues.filter((i) => i.vehicleId === v.id);
    return {
      ...v,
      statusCounts,
      worstStatus: OBLIGATION_STATUS_ORDER.find((s) => statusCounts[s] > 0) ?? "ok",
      openIssues: mine.length,
      criticalIssues: mine.filter((i) => i.severity === "critical").length,
    };
  });
}

export async function getVehicle(id: string, today: string) {
  if (!isUuid(id)) return null;
  const [row] = await db.select().from(vehicle).where(eq(vehicle.id, id));
  if (!row) return null;
  const [obligations, issues] = await Promise.all([
    listObligations(today, { vehicleId: id }),
    listIssues({ vehicleId: id }),
  ]);
  return { vehicle: row, obligations, issues };
}

export type VehicleOption = {
  id: string;
  name: string;
  plate: string;
  grossWeightKg: number | null;
};

export async function listVehicleOptions(): Promise<VehicleOption[]> {
  return db
    .select({
      id: vehicle.id,
      name: vehicle.name,
      plate: vehicle.plate,
      grossWeightKg: vehicle.grossWeightKg,
    })
    .from(vehicle)
    .where(isNull(vehicle.archivedAt))
    .orderBy(asc(vehicle.name));
}

export type StaffOption = { id: string; name: string };

/** Active staff members for "verantwortlich" and "gemeldet von". */
export async function listStaffOptions(): Promise<StaffOption[]> {
  return db
    .select({ id: staffMember.id, name: staffMember.displayName })
    .from(staffMember)
    .where(and(eq(staffMember.active, true), isNull(staffMember.archivedAt)))
    .orderBy(asc(staffMember.displayName));
}

// ---------------------------------------------------------------------------------------------
// Issues

export type IssueRow = {
  id: string;
  vehicleId: string;
  vehicleName: string;
  vehiclePlate: string;
  title: string;
  description: string | null;
  severity: "minor" | "major" | "critical";
  status: "open" | "in_progress" | "resolved";
  reportedByName: string | null;
  reportedAt: Date;
  resolvedAt: Date | null;
  resolvedByName: string | null;
  resolutionNote: string | null;
};

const SEVERITY_RANK = { critical: 0, major: 1, minor: 2 } as const;
const STATUS_RANK = { open: 0, in_progress: 1, resolved: 2 } as const;

/** Unresolved first, within them the worst, newest first. */
export async function listIssues(
  filter: { vehicleId?: string; status?: IssueRow["status"] } = {},
): Promise<IssueRow[]> {
  const reporter = db
    .select({ id: staffMember.id, name: staffMember.displayName })
    .from(staffMember)
    .as("reporter");
  const resolver = db
    .select({ id: staffMember.id, name: staffMember.displayName })
    .from(staffMember)
    .as("resolver");
  const rows = await db
    .select({
      id: vehicleIssue.id,
      vehicleId: vehicleIssue.vehicleId,
      vehicleName: vehicle.name,
      vehiclePlate: vehicle.plate,
      title: vehicleIssue.title,
      description: vehicleIssue.description,
      severity: vehicleIssue.severity,
      status: vehicleIssue.status,
      reportedByName: reporter.name,
      reportedAt: vehicleIssue.reportedAt,
      resolvedAt: vehicleIssue.resolvedAt,
      resolvedByName: resolver.name,
      resolutionNote: vehicleIssue.resolutionNote,
    })
    .from(vehicleIssue)
    .innerJoin(vehicle, eq(vehicle.id, vehicleIssue.vehicleId))
    .leftJoin(reporter, eq(reporter.id, vehicleIssue.reportedByStaffMemberId))
    .leftJoin(resolver, eq(resolver.id, vehicleIssue.resolvedByStaffMemberId))
    .where(
      and(
        filter.vehicleId ? eq(vehicleIssue.vehicleId, filter.vehicleId) : undefined,
        filter.status ? eq(vehicleIssue.status, filter.status) : undefined,
      ),
    );
  return rows.sort(
    (a, b) =>
      (a.status === "resolved" ? 1 : 0) - (b.status === "resolved" ? 1 : 0) ||
      SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
      STATUS_RANK[a.status] - STATUS_RANK[b.status] ||
      b.reportedAt.getTime() - a.reportedAt.getTime(),
  );
}

// ---------------------------------------------------------------------------------------------
// Tab counts and legal numbers

export type CompanyCounts = {
  /** Obligations overdue or due today. */
  needsAction: number;
  /** Obligations "bald" (within their lead time). */
  soon: number;
  openIssues: number;
  criticalIssues: number;
};

export async function companyCounts(today: string): Promise<CompanyCounts> {
  const [obligations, issues] = await Promise.all([
    listObligations(today),
    db
      .select({ severity: vehicleIssue.severity })
      .from(vehicleIssue)
      .where(inArray(vehicleIssue.status, ["open", "in_progress"])),
  ]);
  return {
    needsAction: obligations.filter((o) => o.status === "overdue" || o.status === "due").length,
    soon: obligations.filter((o) => o.status === "soon").length,
    openIssues: issues.length,
    criticalIssues: issues.filter((i) => i.severity === "critical").length,
  };
}

export type LegalIntervals = {
  huUpTo3500: number | null;
  huOver3500: number | null;
  uvv: number | null;
};

/** The value valid on `on` for a key: the row with the latest `valid_from` ≤ that day. */
async function legalValue(key: string, on: string): Promise<number | null> {
  const [row] = await db
    .select({ value: legalParameter.value })
    .from(legalParameter)
    .where(and(eq(legalParameter.key, key), lte(legalParameter.validFrom, on)))
    .orderBy(desc(legalParameter.validFrom))
    .limit(1);
  return row?.value ?? null;
}

/** HU and UVV intervals (months) from `legal_parameter`; null where the table has no value. */
export async function legalIntervals(on: string): Promise<LegalIntervals> {
  const [huUpTo3500, huOver3500, uvv] = await Promise.all([
    legalValue(LEGAL_KEYS.huUpTo3500, on),
    legalValue(LEGAL_KEYS.huOver3500, on),
    legalValue(LEGAL_KEYS.uvv, on),
  ]);
  return { huUpTo3500, huOver3500, uvv };
}

/** HU interval for a vehicle by its gross weight (see `huIntervalMonths`). */
export function huFor(grossWeightKg: number | null, legal: LegalIntervals): number | null {
  return huIntervalMonths(grossWeightKg, {
    upTo3500: legal.huUpTo3500,
    over3500: legal.huOver3500,
  });
}

// ---------------------------------------------------------------------------------------------
// Übersicht and Kalender

const SOON_DAYS = 7;
const TONE = { overdue: "critical", due: "warn", soon: "warn", ok: "neutral" } as const;

const obligationHref = (id: string) => `/firma/pflichten/${id}`;

/**
 * Obligations for the Übersicht: overdue, due today or due within 7 days (by date), plus km targets that are
 * reached or overrun (shown as due today / overdue). Empty for roles without `company:read`.
 */
export async function dueItems(actor: Actor, today: string): Promise<DueItem[]> {
  if (!can(actor.role, "company", "read")) return [];
  const rows = await listObligations(today);
  const items: DueItem[] = [];
  for (const o of rows) {
    const byDate = o.daysLeft !== null && o.daysLeft <= SOON_DAYS;
    const byKm = o.kmLeft !== null && o.kmLeft <= 0;
    if (!byDate && !byKm) continue;
    const overdue = (o.daysLeft !== null && o.daysLeft < 0) || (o.kmLeft !== null && o.kmLeft < 0);
    const dueToday = o.daysLeft === 0 || o.kmLeft === 0;
    // A reached km target has no date of its own: it counts from today.
    const dueOn = byDate && o.nextDueOn ? o.nextDueOn : today;
    items.push({
      kind: "obligation",
      id: o.id,
      title: o.vehiclePlate ? `${o.title} · ${o.vehiclePlate}` : o.title,
      dueOn,
      urgency: overdue ? "overdue" : dueToday ? "today" : "soon",
      href: obligationHref(o.id),
      meta: o.vehicleName ?? o.venueName ?? undefined,
      assigneeName: o.responsibleName,
    });
  }
  return items.sort((a, b) => a.dueOn.localeCompare(b.dueOn));
}

/** Due dates in [from, to] for the Kalender layer "Pflichten". Empty for roles without `company:read`. */
export async function calendarItems(
  actor: Actor,
  from: string,
  to: string,
): Promise<CalendarItem[]> {
  if (!can(actor.role, "company", "read")) return [];
  const rows = await listObligations(todayIn());
  return rows
    .filter((o) => o.nextDueOn !== null && o.nextDueOn >= from && o.nextDueOn <= to)
    .map((o) => ({
      layer: "obligations" as const,
      id: o.id,
      date: o.nextDueOn as string,
      title: o.vehiclePlate ? `${o.title} · ${o.vehiclePlate}` : o.title,
      href: obligationHref(o.id),
      tone: TONE[o.status],
    }));
}
