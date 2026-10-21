import { MINIJOB_LIMIT_2026_CENTS } from "../constants";
import { addDays, berlinInstant } from "../lib/dates";
import type { Rng } from "../lib/rng";
import type { EmploymentContract, Event, Shift } from "../types";

/** Minijob cap used by the generator for 2026 (the dataset also stores the legal parameter). */
const CAP_CENTS = MINIJOB_LIMIT_2026_CENTS;
/** Two person-months may take one extra shift past the cap ("slightly over"), as in the brief. */

function minutesOf(time: string): number {
  const [hours = 0, minutes = 0] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function timeOf(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export interface ShiftContext {
  events: Event[];
  today: string;
  contracts: EmploymentContract[];
  crewStaffIds: string[];
  recordedById: string;
  dutyRoleIdByStaffId: Map<string, string>;
  setupDutyRoleId: string;
}

/**
 * Field-crew shifts for past 2026 events (one shift per person per event day). Minijob earnings are
 * capped at the 2026 limit by choosing the least-earning eligible person first. Two person-months get a
 * slight overrun. Events in the last seven days keep their shifts without actual times (not yet recorded).
 */
export function buildShifts(rng: Rng, ctx: ShiftContext): Shift[] {
  const contractByStaff = new Map(
    ctx.contracts.map((contract) => [contract.staffMemberId, contract]),
  );
  const crew = ctx.crewStaffIds.filter((id) => contractByStaff.has(id));
  const earnings = new Map<string, number>();
  // person|month → extra shifts that may push earnings past the cap (one each, two in total).
  const overrunAllowance = new Map<string, number>();
  const minijobCrew = crew.filter((id) => contractByStaff.get(id)?.type === "minijob");
  if (minijobCrew[1]) overrunAllowance.set(`${minijobCrew[1]}|2026-08`, 1);
  if (minijobCrew[4]) overrunAllowance.set(`${minijobCrew[4]}|2026-08`, 1);

  const pastEvents = ctx.events
    .filter(
      (event) => event.season === 2026 && event.status !== "cancelled" && event.endsOn < ctx.today,
    )
    .sort((a, b) => (a.startsOn < b.startsOn ? -1 : a.startsOn > b.startsOn ? 1 : 0));

  const shifts: Shift[] = [];
  for (const event of pastEvents) {
    const month = event.startsOn.slice(0, 7);
    const crewSize = rng.int(4, 5);
    // Least earned first (ties keep crew order), so Minijob hours spread evenly.
    const ordered = [...crew].sort(
      (a, b) => (earnings.get(`${a}|${month}`) ?? 0) - (earnings.get(`${b}|${month}`) ?? 0),
    );
    let assigned = 0;
    for (const staffId of ordered) {
      if (assigned >= crewSize) break;
      const contract = contractByStaff.get(staffId);
      const rateCents = contract?.hourlyRateCents;
      if (!contract || rateCents === null || rateCents === undefined) continue;

      const startMinutes = rng.pick([5 * 60, 6 * 60, 7 * 60]);
      const breakMinutes = rng.pick([30, 35, 40, 45]);
      const plannedStart = timeOf(startMinutes);
      const plannedEnd = timeOf(startMinutes + 9 * 60 + 30);
      const netMinutes = 9 * 60 + 30 - breakMinutes;
      const shiftCents = Math.round((netMinutes / 60) * rateCents);

      const key = `${staffId}|${month}`;
      const current = earnings.get(key) ?? 0;
      if (contract.type === "minijob" && current + shiftCents > CAP_CENTS) {
        const allowance = overrunAllowance.get(key) ?? 0;
        if (allowance <= 0) continue;
        overrunAllowance.set(key, allowance - 1);
      }
      earnings.set(key, current + shiftCents);
      assigned += 1;

      const recentlyEnded = event.endsOn >= addDays(ctx.today, -7);
      const missingActuals = recentlyEnded && rng.chance(0.5);
      const actualStart = missingActuals ? null : timeOf(startMinutes + rng.int(-5, 10));
      const actualEnd = missingActuals ? null : timeOf(minutesOf(plannedEnd) + rng.int(-10, 15));
      shifts.push({
        id: rng.uuid(),
        eventId: event.id,
        staffMemberId: staffId,
        dutyRoleId: ctx.dutyRoleIdByStaffId.get(staffId) ?? ctx.setupDutyRoleId,
        workDate: event.startsOn,
        plannedStart,
        plannedEnd,
        actualStart,
        actualEnd,
        breakMinutes,
        status: missingActuals ? "confirmed" : "worked",
        recordedById: missingActuals ? null : ctx.recordedById,
        recordedAt: missingActuals ? null : berlinInstant(addDays(event.startsOn, 1), "10:00"),
      });
    }
  }
  return shifts;
}
