import { needsFromStaffing, type StaffingRow, slotMinutes } from "@marktwerk/core";
import { addDays, daysBetween } from "../lib/dates";
import type { Rng } from "../lib/rng";
import type {
  EmploymentContract,
  Event,
  Shift,
  ShiftNeed,
  ShiftStatus,
  StaffUnavailability,
} from "../types";

/** Default monthly hour budget of the planner when a contract has none. */
const DEFAULT_BUDGET_HOURS = 40;
/** The one higher-paid person: 16 EUR per hour and a smaller budget of 35 h. */
const PREMIUM_RATE_CENTS = 1600;
const PREMIUM_BUDGET_HOURS = 35;
/** About this share of the slots gets a person, up to the end of March of the window's last year. */
const FILL_SHARE = 0.7;
/** Later events keep most of their needs open so the planner shows gaps. */
const LATE_FILL_SHARE = 0.15;
/** Longer slots (derived from the whole day's window) stay open: nobody is planned for a 17 h day. */
const MAX_SLOT_NET_MINUTES = 10 * 60;

/**
 * "Personalbedarf" per market (setup · open · teardown): the Kerpen Stadtfest runs 3 · 2 · 3, every other
 * market 2 · 1 · 2. Setup and teardown take the crew, the open hours the cash desk.
 */
export function presetStaffing(presetKey: string): StaffingRow[] {
  const [setup, open, teardown] = presetKey === "kerpen-stadtfest" ? [3, 2, 3] : [2, 1, 2];
  return [
    { dutyRoleKey: "setup_crew", count: setup, scheduleKind: "setup" },
    { dutyRoleKey: "cash", count: open, scheduleKind: "open" },
    { dutyRoleKey: "setup_crew", count: teardown, scheduleKind: "teardown" },
  ];
}

export interface PlanningContext {
  events: Event[];
  /** The reference date: events from this day on (through 30 April of the next season) get needs. */
  today: string;
  /** The season after the reference one: its March is the last month that is mostly planned. */
  nextSeason: number;
  contracts: EmploymentContract[];
  crewStaffIds: string[];
  recordedById: string;
  dutyRoleIdByKey: Map<string, string>;
}

export interface Planning {
  needs: ShiftNeed[];
  shifts: Shift[];
  unavailability: StaffUnavailability[];
  /** staff member id → monthly hour budget in hours (only people who differ from the default). */
  budgets: Map<string, number>;
  /** The contracts with the budget and the higher rate applied. */
  contracts: EmploymentContract[];
}

/**
 * The planner's window (reference date through 30 April of next season): shift needs from every event's
 * Personalbedarf; events up to 31 March get about 70 % of the slots planned (60 % bestätigt, 30 % angefragt, the
 * rest open), April stays mostly open. One declined request whose slot stays open, a few days
 * "nicht verfügbar", and one higher-paid person with a smaller hour budget. Planned minutes never exceed a
 * person's budget.
 */
export function buildPlanning(rng: Rng, ctx: PlanningContext): Planning {
  const windowEnd = `${ctx.nextSeason}-04-30`;
  const fullyPlannedUntil = `${ctx.nextSeason}-03-31`;
  const windowEvents = ctx.events
    .filter((e) => e.status !== "cancelled" && e.startsOn >= ctx.today && e.startsOn <= windowEnd)
    .sort((a, b) => (a.startsOn < b.startsOn ? -1 : a.startsOn > b.startsOn ? 1 : 0));

  // Budgets: the best-paid crew member becomes the 16 EUR / 35 h person.
  const rateOf = (c: EmploymentContract) => c.hourlyRateCents ?? 0;
  const crewContracts = ctx.crewStaffIds
    .map((id) => ctx.contracts.find((c) => c.staffMemberId === id))
    .filter((c): c is EmploymentContract => c !== undefined && c.hourlyRateCents !== null);
  const premium = crewContracts.reduce<EmploymentContract | undefined>(
    (best, c) => (best === undefined || rateOf(c) > rateOf(best) ? c : best),
    undefined,
  );
  const budgets = new Map<string, number>();
  const contracts = ctx.contracts.map((c) => {
    if (c.id !== premium?.id) return c;
    budgets.set(c.staffMemberId, PREMIUM_BUDGET_HOURS);
    return { ...c, hourlyRateCents: PREMIUM_RATE_CENTS, monthlyHourBudget: PREMIUM_BUDGET_HOURS };
  });
  const monthKey = (id: string, date: string) => `${id}|${date.slice(0, 7)}`;
  const budgetMinutes = (staffId: string): number =>
    (budgets.get(staffId) ?? DEFAULT_BUDGET_HOURS) * 60;

  // Unavailability on market days of the window (not on the setup day before).
  const marketDays = windowEvents.flatMap((e) =>
    Array.from({ length: daysBetween(e.startsOn, e.endsOn) + 1 }, (_, i) => addDays(e.startsOn, i)),
  );
  const unavailability: StaffUnavailability[] = [];
  const unavailable = new Set<string>();
  const wanted = Math.min(rng.int(3, 4), marketDays.length);
  const notes = ["nur bis 15 Uhr", "Urlaub", null, null];
  for (let attempts = 0; unavailability.length < wanted && attempts < 200; attempts += 1) {
    const staffMemberId = rng.pick(ctx.crewStaffIds);
    const date = rng.pick(marketDays);
    const key = `${staffMemberId}|${date}`;
    if (unavailable.has(key)) continue;
    unavailable.add(key);
    unavailability.push({
      id: rng.uuid(),
      staffMemberId,
      date,
      note: notes[unavailability.length] ?? null,
      createdByStaffMemberId: ctx.recordedById,
    });
  }

  const needs: ShiftNeed[] = [];
  const shifts: Shift[] = [];
  /** person|month → planned net minutes. */
  const usedMinutes = new Map<string, number>();
  const busy = new Set<string>(); // person|date: one planned shift per person and day
  const openSlots: ShiftNeed[] = [];
  let planned = 0;
  // April and later: at most 20 % of the slots get a person, whatever the dice say.
  const lateSlots = windowEvents
    .filter((e) => e.startsOn > fullyPlannedUntil)
    .reduce(
      (sum, e) =>
        sum +
        needsFromStaffing(
          e.staffing,
          e.schedule,
          e.startsOn,
          daysBetween(e.startsOn, e.endsOn) + 1,
        ).reduce((n, d) => n + d.headcount, 0),
      0,
    );
  const lateCap = Math.floor(lateSlots * 0.2);
  let lateFilled = 0;

  const shiftFor = (need: ShiftNeed, staffMemberId: string, status: ShiftStatus): Shift | null => {
    if (need.plannedStart === null || need.plannedEnd === null) return null;
    const slot = {
      workDate: need.workDate,
      plannedStart: need.plannedStart,
      plannedEnd: need.plannedEnd,
    };
    return {
      id: rng.uuid(),
      eventId: need.eventId,
      needId: need.id,
      staffMemberId,
      dutyRoleId: need.dutyRoleId,
      workDate: need.workDate,
      plannedStart: need.plannedStart,
      plannedEnd: need.plannedEnd,
      actualStart: null,
      actualEnd: null,
      breakMinutes: slotMinutes(slot).breakMinutes,
      status,
      recordedById: null,
      recordedAt: null,
    };
  };

  for (const event of windowEvents) {
    const durationDays = daysBetween(event.startsOn, event.endsOn) + 1;
    for (const draft of needsFromStaffing(
      event.staffing,
      event.schedule,
      event.startsOn,
      durationDays,
    )) {
      const dutyRoleId = ctx.dutyRoleIdByKey.get(draft.dutyRoleKey);
      if (dutyRoleId === undefined) throw new Error(`Unknown duty role ${draft.dutyRoleKey}`);
      const need: ShiftNeed = {
        id: rng.uuid(),
        eventId: event.id,
        workDate: draft.workDate,
        dutyRoleId,
        scheduleKind: draft.scheduleKind,
        headcount: draft.headcount,
        plannedStart: draft.plannedStart,
        plannedEnd: draft.plannedEnd,
      };
      needs.push(need);
      const net =
        need.plannedStart !== null && need.plannedEnd !== null
          ? slotMinutes({
              workDate: need.workDate,
              plannedStart: need.plannedStart,
              plannedEnd: need.plannedEnd,
            }).net
          : 0;
      for (let slot = 0; slot < need.headcount; slot += 1) {
        const share = event.startsOn <= fullyPlannedUntil ? FILL_SHARE : LATE_FILL_SHARE;
        const late = event.startsOn > fullyPlannedUntil;
        const wantsPerson =
          rng.chance(share) &&
          (!late || lateFilled < lateCap) &&
          net > 0 &&
          net <= MAX_SLOT_NET_MINUTES;
        // Most budget left first (ties keep crew order), like "least earned first" in buildShifts.
        const candidates = ctx.crewStaffIds
          .filter((id) => !unavailable.has(`${id}|${need.workDate}`))
          .filter((id) => !busy.has(`${id}|${need.workDate}`))
          .filter(
            (id) => budgetMinutes(id) - (usedMinutes.get(monthKey(id, need.workDate)) ?? 0) >= net,
          )
          .sort(
            (a, b) =>
              budgetMinutes(b) -
              (usedMinutes.get(monthKey(b, need.workDate)) ?? 0) -
              (budgetMinutes(a) - (usedMinutes.get(monthKey(a, need.workDate)) ?? 0)),
          );
        const person = wantsPerson ? candidates[0] : undefined;
        if (person === undefined) {
          openSlots.push(need);
          continue;
        }
        // The first two planned slots fix the mix (bestätigt, angefragt); after that 60 / 30 of the rest.
        const status: ShiftStatus =
          planned === 0
            ? "confirmed"
            : planned === 1
              ? "requested"
              : rng.chance(2 / 3)
                ? "confirmed"
                : "requested";
        const shift = shiftFor(need, person, status);
        if (!shift) continue;
        planned += 1;
        if (event.startsOn > fullyPlannedUntil) lateFilled += 1;
        shifts.push(shift);
        busy.add(`${person}|${need.workDate}`);
        usedMinutes.set(
          monthKey(person, need.workDate),
          (usedMinutes.get(monthKey(person, need.workDate)) ?? 0) + net,
        );
      }
    }
  }

  // Exactly one declined request; its slot stays open (the person said no, nobody else is planned yet).
  const declinedSlot = openSlots.find((need) => need.plannedStart !== null);
  const decliner = declinedSlot
    ? ctx.crewStaffIds.find((id) => !busy.has(`${id}|${declinedSlot.workDate}`))
    : undefined;
  if (declinedSlot && decliner !== undefined) {
    const shift = shiftFor(declinedSlot, decliner, "declined");
    if (shift) shifts.push(shift);
  }

  return { needs, shifts, unavailability, budgets, contracts };
}
