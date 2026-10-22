import { beforeAll, describe, expect, it } from "vitest";
import { MAX_EVENTS_PER_WEEKEND, REFERENCE_DATE } from "./constants";
import { generateDataset } from "./dataset";
import { EXAMPLE_DOMAINS, FICTION_PHONE_PATTERN } from "./lib/fiction";
import type { Dataset, EmploymentContract, Event, EventType, Payable, Task } from "./types";

const TIMEOUT = 120_000;
const DAY_MS = 86_400_000;
const MINIJOB_LIMIT_CENTS = 60300;

let data: Dataset;

beforeAll(() => {
  data = generateDataset();
}, TIMEOUT);

/* ---------------------------------------------------------------- helpers */

function idsOf(rows: readonly { id: string }[]): Set<string> {
  return new Set(rows.map((row) => row.id));
}

function unresolved(values: readonly (string | null | undefined)[], valid: Set<string>): string[] {
  return values.filter((value): value is string => typeof value === "string" && !valid.has(value));
}

function minutesOf(time: string): number {
  const [hours = 0, minutes = 0] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function isoDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Saturday keys of every weekend an event touches (Sat or Sun). */
function weekendKeys(startsOn: string, endsOn: string): string[] {
  const keys = new Set<string>();
  for (
    let t = Date.parse(`${startsOn}T00:00:00Z`);
    t <= Date.parse(`${endsOn}T00:00:00Z`);
    t += DAY_MS
  ) {
    const day = new Date(t).getUTCDay();
    if (day === 6) keys.add(isoDay(t));
    if (day === 0) keys.add(isoDay(t - DAY_MS));
  }
  return [...keys];
}

function eventDays(event: Event): string[] {
  const days: string[] = [];
  for (
    let t = Date.parse(`${event.startsOn}T00:00:00Z`);
    t <= Date.parse(`${event.endsOn}T00:00:00Z`);
    t += DAY_MS
  ) {
    days.push(isoDay(t));
  }
  return days;
}

/* ------------------------------------------------------------ determinism */

describe("determinism", () => {
  it(
    "two runs with the same seed produce deep-equal datasets",
    () => {
      const again = generateDataset();
      expect(again).toEqual(data);
      expect(JSON.stringify(again)).toBe(JSON.stringify(data));
    },
    TIMEOUT,
  );

  it(
    "a different seed changes the output",
    () => {
      const other = generateDataset({ seed: 1 });
      expect(JSON.stringify(other.staffMembers)).not.toBe(JSON.stringify(data.staffMembers));
    },
    TIMEOUT,
  );

  it("every id is unique across the whole dataset", () => {
    const all: string[] = [data.settings.id];
    for (const [key, value] of Object.entries(data)) {
      if (key === "settings" || !Array.isArray(value)) continue;
      for (const row of value as { id: string }[]) all.push(row.id);
    }
    expect(new Set(all).size).toBe(all.length);
  });
});

/* -------------------------------------------------------- catalogue basics */

describe("catalogue", () => {
  it("has exactly the four event types in scope", () => {
    const keys = data.eventTypes.map((type: EventType) => type.key).sort();
    expect(keys).toEqual(["antique", "city_festival", "flea", "food_wine"]);
  });

  it("has 12 venues in the Rhineland with zones and rows", () => {
    expect(data.venues).toHaveLength(12);
    for (const venue of data.venues) {
      expect(venue.zones.length).toBeGreaterThanOrEqual(2);
      expect(venue.zones.length).toBeLessThanOrEqual(5);
      expect(venue.capacityCm).toBe(
        venue.zones.reduce((sum, zone) => sum + zone.rows.reduce((s, r) => s + r.lengthCm, 0), 0),
      );
    }
  });

  it("has 14 staff members with logins only for owner, manager and office staff", () => {
    expect(data.staffMembers).toHaveLength(14);
    const withLogin = data.staffMembers.filter((member) => member.permissionRole !== null);
    expect(withLogin.map((member) => member.permissionRole).sort()).toEqual([
      "manager",
      "owner",
      "staff",
      "staff",
    ]);
  });

  it("uses German checklist templates with 25–40 items each", () => {
    expect(data.checklistTemplates).toHaveLength(4);
    for (const template of data.checklistTemplates) {
      expect(template.items.length).toBeGreaterThanOrEqual(25);
      expect(template.items.length).toBeLessThanOrEqual(40);
      expect(template.version).toBe(1);
      expect(template.status).toBe("published");
    }
  });

  it("keeps minijob hourly rates between 1390 and 1600 cents", () => {
    const minijobs = data.employmentContracts.filter(
      (contract: EmploymentContract) => contract.type === "minijob",
    );
    expect(minijobs.length).toBeGreaterThan(0);
    for (const contract of minijobs) {
      expect(contract.hourlyRateCents).toBeGreaterThanOrEqual(1390);
      expect(contract.hourlyRateCents).toBeLessThanOrEqual(1600);
    }
  });
});

/* ------------------------------------------------------ referential integrity */

describe("referential integrity", () => {
  it("resolves every foreign key", () => {
    const eventTypeIds = idsOf(data.eventTypes);
    const venueIds = idsOf(data.venues);
    const contactIds = idsOf(data.contacts);
    const staffIds = idsOf(data.staffMembers);
    const dutyRoleIds = idsOf(data.dutyRoles);
    const presetIds = idsOf(data.eventPresets);
    const eventIds = idsOf(data.events);
    const templateIds = idsOf(data.checklistTemplates);
    const templateItemIds = new Set(
      data.checklistTemplates.flatMap((t) => t.items.map((i) => i.id)),
    );
    const requirementIds = idsOf(data.permitRequirements);
    const permitIds = idsOf(data.permits);
    const payableIds = idsOf(data.payables);
    const vehicleIds = idsOf(data.vehicles);
    const requestIds = idsOf(data.bookingRequests);
    const vendorIds = idsOf(data.vendors);
    const rowIds = new Map<string, string>();
    for (const venue of data.venues)
      for (const zone of venue.zones) for (const row of zone.rows) rowIds.set(row.id, venue.id);

    const problems: Record<string, string[]> = {
      eventPresets: [
        ...unresolved(
          data.eventPresets.map((p) => p.eventTypeId),
          eventTypeIds,
        ),
        ...unresolved(
          data.eventPresets.map((p) => p.venueId),
          venueIds,
        ),
        ...unresolved(
          data.eventPresets.map((p) => p.checklistTemplateId),
          templateIds,
        ),
        ...unresolved(
          data.eventPresets.flatMap((p) => Object.values(p.defaultDuties)),
          staffIds,
        ),
      ],
      venues: unresolved(
        data.venues.map((v) => v.landownerContactId),
        contactIds,
      ),
      dutyRoles: unresolved(
        data.dutyRoles.map((r) => r.defaultStaffMemberId),
        staffIds,
      ),
      staffMembers: unresolved(
        data.staffMembers.flatMap((s) => s.preferredDutyRoleIds),
        dutyRoleIds,
      ),
      employmentContracts: unresolved(
        data.employmentContracts.map((c) => c.staffMemberId),
        staffIds,
      ),
      events: [
        ...unresolved(
          data.events.map((e) => e.presetId),
          presetIds,
        ),
        ...unresolved(
          data.events.map((e) => e.eventTypeId),
          eventTypeIds,
        ),
        ...unresolved(
          data.events.map((e) => e.venueId),
          venueIds,
        ),
        ...unresolved(
          data.events.flatMap((e) => Object.values(e.duties)),
          staffIds,
        ),
      ],
      eventAnchors: unresolved(
        data.eventAnchors.map((a) => a.eventId),
        eventIds,
      ),
      checklistTemplates: unresolved(
        data.checklistTemplates.map((t) => t.eventTypeId),
        eventTypeIds,
      ),
      tasks: [
        ...unresolved(
          data.tasks.map((t) => t.eventId),
          eventIds,
        ),
        ...unresolved(
          data.tasks.map((t) => t.templateItemId),
          templateItemIds,
        ),
        ...unresolved(
          data.tasks.map((t) => t.dutyRoleId),
          dutyRoleIds,
        ),
        ...unresolved(
          data.tasks.map((t) => t.assigneeId),
          staffIds,
        ),
        ...unresolved(
          data.tasks.map((t) => t.completedById),
          staffIds,
        ),
      ],
      permitRequirements: [
        ...unresolved(
          data.permitRequirements.map((r) => r.venueId),
          venueIds,
        ),
        ...unresolved(
          data.permitRequirements.map((r) => r.authorityContactId),
          contactIds,
        ),
      ],
      permits: [
        ...unresolved(
          data.permits.map((p) => p.requirementId),
          requirementIds,
        ),
        ...unresolved(
          data.permits.map((p) => p.venueId),
          venueIds,
        ),
        ...unresolved(
          data.permits.map((p) => p.authorityContactId),
          contactIds,
        ),
        ...unresolved(
          data.permits.map((p) => p.responsibleStaffMemberId),
          staffIds,
        ),
      ],
      eventPermits: [
        ...unresolved(
          data.eventPermits.map((ep) => ep.eventId),
          eventIds,
        ),
        ...unresolved(
          data.eventPermits.map((ep) => ep.permitId),
          permitIds,
        ),
      ],
      payables: [
        ...unresolved(
          data.payables.map((p) => p.eventId),
          eventIds,
        ),
        ...unresolved(
          data.payables.map((p) => p.venueId),
          venueIds,
        ),
        ...unresolved(
          data.payables.map((p) => p.vehicleId),
          vehicleIds,
        ),
        ...unresolved(
          data.payables.map((p) => p.permitId),
          permitIds,
        ),
        ...unresolved(
          data.payables.map((p) => p.counterpartyContactId),
          contactIds,
        ),
      ],
      installments: unresolved(
        data.installments.map((i) => i.payableId),
        payableIds,
      ),
      obligations: [
        ...unresolved(
          data.obligations.map((o) => o.vehicleId),
          vehicleIds,
        ),
        ...unresolved(
          data.obligations.map((o) => o.venueId),
          venueIds,
        ),
        ...unresolved(
          data.obligations.map((o) => o.responsibleStaffMemberId),
          staffIds,
        ),
      ],
      shifts: [
        ...unresolved(
          data.shifts.map((s) => s.eventId),
          eventIds,
        ),
        ...unresolved(
          data.shifts.map((s) => s.staffMemberId),
          staffIds,
        ),
        ...unresolved(
          data.shifts.map((s) => s.dutyRoleId),
          dutyRoleIds,
        ),
        ...unresolved(
          data.shifts.map((s) => s.recordedById),
          staffIds,
        ),
      ],
      bookingRequests: [
        ...unresolved(
          data.bookingRequests.map((r) => r.eventId),
          eventIds,
        ),
        ...unresolved(
          data.bookingRequests.map((r) => r.vendorId),
          vendorIds,
        ),
      ],
      bookingDates: [
        ...unresolved(
          data.bookingDates.map((d) => d.bookingRequestId),
          requestIds,
        ),
        ...unresolved(
          data.bookingDates.map((d) => d.eventId),
          eventIds,
        ),
        ...unresolved(
          data.bookingDates.map((d) => d.vendorId),
          vendorIds,
        ),
        ...unresolved(
          data.bookingDates.map((d) => d.rowId),
          new Set(rowIds.keys()),
        ),
      ],
    };
    for (const [entity, bad] of Object.entries(problems)) {
      expect(bad, `dangling references in ${entity}`).toEqual([]);
    }

    // Booking dates must sit on a row of their own event's venue.
    const eventVenue = new Map(data.events.map((e) => [e.id, e.venueId]));
    const misplaced = data.bookingDates.filter(
      (d) => d.rowId !== null && rowIds.get(d.rowId) !== eventVenue.get(d.eventId),
    );
    expect(misplaced).toEqual([]);
  });
});

/* -------------------------------------------------------------- scheduling */

describe("events and scheduling", () => {
  it("has at most four events touching any weekend", () => {
    const counts = new Map<string, number>();
    for (const event of data.events) {
      for (const saturday of weekendKeys(event.startsOn, event.endsOn)) {
        counts.set(saturday, (counts.get(saturday) ?? 0) + 1);
      }
    }
    const worst = Math.max(...counts.values());
    expect(worst).toBeLessThanOrEqual(MAX_EVENTS_PER_WEEKEND);
  });

  it("never double-books a venue on the same day", () => {
    const seen = new Map<string, string>();
    const clashes: string[] = [];
    for (const event of data.events) {
      for (const day of eventDays(event)) {
        const key = `${event.venueId}|${day}`;
        const other = seen.get(key);
        if (other !== undefined) clashes.push(`${event.id} and ${other} on ${day}`);
        seen.set(key, event.id);
      }
    }
    expect(clashes).toEqual([]);
  });

  it("assigns statuses from the reference date", () => {
    for (const event of data.events) {
      if (event.season === 2026) {
        expect(["completed", "closed", "confirmed", "cancelled"]).toContain(event.status);
      } else {
        expect(event.status).toBe("planned");
        expect(event.bookingOpen).toBe(false);
      }
      if (event.endsOn < REFERENCE_DATE && event.status !== "cancelled") {
        expect(["completed", "closed"]).toContain(event.status);
      }
    }
    const cancelled = data.events.filter((e) => e.status === "cancelled");
    expect(cancelled.length).toBeGreaterThanOrEqual(1);
    expect(cancelled.length).toBeLessThanOrEqual(2);
    for (const event of cancelled) expect(event.cancelledReason).not.toBeNull();
  });

  it("gives every event three anchors with the booking cut-off on the Monday before", () => {
    expect(data.eventAnchors).toHaveLength(data.events.length * 3);
    for (const event of data.events) {
      const anchors = data.eventAnchors.filter((a) => a.eventId === event.id);
      const eventDay = anchors.find((a) => a.key === "eventDay");
      const cutoff = anchors.find((a) => a.key === "bookingCutoff");
      expect(eventDay?.date).toBe(event.startsOn);
      expect(cutoff).toBeDefined();
      if (cutoff) {
        expect(new Date(`${cutoff.date}T00:00:00Z`).getUTCDay()).toBe(1);
        expect(cutoff.date < event.startsOn).toBe(true);
      }
    }
  });
});

/* ------------------------------------------------------------------ tasks */

describe("tasks", () => {
  let eventById = new Map<string, Event>();
  beforeAll(() => {
    eventById = new Map(data.events.map((event) => [event.id, event]));
  });
  const open = (task: Task): boolean => !["done", "skipped", "cancelled"].includes(task.status);

  it("leaves no normal open tasks on old completed events, only the overdue sample", () => {
    const cutoff = isoDay(Date.parse(`${REFERENCE_DATE}T00:00:00Z`) - 30 * DAY_MS);
    const oldTasks = data.tasks.filter((task) => {
      const event = eventById.get(task.eventId);
      return event !== undefined && event.status !== "cancelled" && event.endsOn < cutoff;
    });
    expect(oldTasks.length).toBeGreaterThan(0);
    const stray = oldTasks.filter((task) => open(task) && task.rolloverCount === 0);
    expect(stray).toEqual([]);
  });

  it("keeps about 5 % of past tasks overdue (rolled over 1–5 times); other open ones wait on an authority", () => {
    const past = data.tasks.filter(
      (task) => task.dueAt < `${REFERENCE_DATE}T00:00:00.000Z` && task.status !== "cancelled",
    );
    const overdue = past.filter((task) => task.rolloverCount > 0);
    const share = overdue.length / past.length;
    expect(share).toBeGreaterThan(0.02);
    expect(share).toBeLessThan(0.1);
    for (const task of overdue) {
      expect(open(task)).toBe(true);
      expect(task.rolloverCount).toBeLessThanOrEqual(5);
    }
    const otherOpen = past.filter((task) => open(task) && task.rolloverCount === 0);
    expect(otherOpen.every((task) => task.status === "waiting_external")).toBe(true);
  });

  it("marks cancelled events' tasks cancelled and gives done tasks a completion time", () => {
    for (const task of data.tasks) {
      const event = eventById.get(task.eventId);
      if (event?.status === "cancelled") expect(task.status).toBe("cancelled");
      if (task.status === "done") expect(task.completedAt).not.toBeNull();
    }
  });

  it("puts future tasks in todo or in progress, never done", () => {
    for (const task of data.tasks) {
      if (task.dueAt >= `${REFERENCE_DATE}T00:00:00.000Z` && task.status !== "cancelled") {
        expect(["todo", "in_progress", "waiting_external"]).toContain(task.status);
      }
    }
  });
});

/* ----------------------------------------------------------------- permits */

describe("permits", () => {
  it("gives Köln Altstadt a submission window with an expected January decision", () => {
    const altstadt = data.venues.find((venue) => venue.name === "Köln Altstadt – Heumarkt");
    const requirement = data.permitRequirements.find(
      (r) => r.venueId === altstadt?.id && r.permitType === "market_permit",
    );
    expect(requirement?.submissionWindowStartMd).toBe("10-01");
    expect(requirement?.expectedDecisionMd).toBe("01-15");
    const permit2027 = data.permits.find(
      (p) => p.requirementId === requirement?.id && p.season === 2027,
    );
    expect(permit2027?.status).toBe("applied");
    expect(permit2027?.expectedDecisionOn).toBe("2027-01-15");
  });

  it("grants 2026 permits and never grants a 2027 permit that has not been applied for", () => {
    expect(data.permits.filter((p) => p.season === 2026).every((p) => p.status === "granted")).toBe(
      true,
    );
    for (const permit of data.permits.filter((p) => p.season === 2027)) {
      expect(["applied", "preparing", "not_started"]).toContain(permit.status);
    }
  });

  it("links external permits only where the ground is not public", () => {
    const publicVenues = new Set(
      data.venues.filter((v) => v.kind === "outdoor_public").map((v) => v.id),
    );
    const landowner = data.permitRequirements.filter((r) => r.permitType === "landowner_ok");
    expect(landowner.length).toBeGreaterThan(0);
    for (const requirement of landowner) expect(publicVenues.has(requirement.venueId)).toBe(false);
  });

  it("records 100 stickers on signage permits in 2026", () => {
    const signage = data.permits.filter((p) => p.permitType === "signage" && p.season === 2026);
    expect(signage.length).toBeGreaterThan(0);
    for (const permit of signage) expect(permit.deliverablesReceived.stickers).toBe(100);
  });
});

/* ------------------------------------------------------------------ money */

describe("money", () => {
  it("makes instalments sum exactly to every payable's total", () => {
    for (const payable of data.payables as Payable[]) {
      const rows = data.installments.filter((i) => i.payableId === payable.id);
      expect(rows.length, `instalments for ${payable.title}`).toBeGreaterThan(0);
      const sum = rows.reduce((total, row) => total + row.amountCents, 0);
      expect(sum, payable.title).toBe(payable.totalGrossCents);
    }
  });

  it("has a few overdue instalments and some due in the next 14 days", () => {
    const overdue = data.installments.filter(
      (i) => i.status !== "paid" && i.dueOn < REFERENCE_DATE,
    );
    expect(overdue.length).toBeGreaterThanOrEqual(2);
    expect(overdue.length).toBeLessThanOrEqual(3);
    const soonEnd = isoDay(Date.parse(`${REFERENCE_DATE}T00:00:00Z`) + 14 * DAY_MS);
    const dueSoon = data.installments.filter(
      (i) => i.status === "open" && i.dueOn >= REFERENCE_DATE && i.dueOn <= soonEnd,
    );
    expect(dueSoon.length).toBeGreaterThanOrEqual(1);
  });

  it("has one overdue UVV inspection", () => {
    const overdue = data.obligations.filter((o) => o.nextDueOn < REFERENCE_DATE);
    expect(overdue.map((o) => o.title)).toHaveLength(1);
    expect(overdue[0]?.title).toContain("UVV");
  });

  it("uses the legal parameters for the Minijob limit and minimum wage", () => {
    const limit2026 = data.legalParameters.find(
      (p) => p.key === "minijob_limit_cents_per_month" && p.validFrom === "2026-01-01",
    );
    const wage2026 = data.legalParameters.find(
      (p) => p.key === "minimum_wage_cents_per_hour" && p.validFrom === "2026-01-01",
    );
    expect(limit2026?.value).toBe(MINIJOB_LIMIT_CENTS);
    expect(wage2026?.value).toBe(1390);
  });
});

/* ----------------------------------------------------------------- shifts */

describe("shifts and Minijob earnings", () => {
  it("keeps every Minijob person under twice the monthly limit in every month", () => {
    const contractByStaff = new Map(data.employmentContracts.map((c) => [c.staffMemberId, c]));
    const earnings = new Map<string, number>();
    for (const shift of data.shifts) {
      const contract = contractByStaff.get(shift.staffMemberId);
      if (contract?.type !== "minijob" || contract.hourlyRateCents === null) continue;
      const start = minutesOf(shift.actualStart ?? shift.plannedStart);
      const end = minutesOf(shift.actualEnd ?? shift.plannedEnd);
      const netMinutes = end - start - shift.breakMinutes;
      const key = `${shift.staffMemberId}|${shift.workDate.slice(0, 7)}`;
      earnings.set(
        key,
        (earnings.get(key) ?? 0) + Math.round((netMinutes / 60) * contract.hourlyRateCents),
      );
    }
    const values = [...earnings.values()];
    expect(values.length).toBeGreaterThan(0);
    expect(Math.max(...values)).toBeLessThanOrEqual(2 * MINIJOB_LIMIT_CENTS);
    expect(values.filter((v) => v > MINIJOB_LIMIT_CENTS).length).toBeLessThanOrEqual(2);
  });

  it("has shifts only on past 2026 events, and some recent shifts without actual times", () => {
    const eventById = new Map(data.events.map((e) => [e.id, e]));
    for (const shift of data.shifts) {
      const event = eventById.get(shift.eventId);
      expect(event?.season).toBe(2026);
      expect(event !== undefined && event.endsOn < REFERENCE_DATE).toBe(true);
    }
    const recent = data.shifts.filter(
      (s) => s.workDate >= isoDay(Date.parse(`${REFERENCE_DATE}T00:00:00Z`) - 7 * DAY_MS),
    );
    expect(recent.some((s) => s.actualStart === null)).toBe(true);
  });
});

/* ------------------------------------------------------------ bookings */

describe("bookings", () => {
  let eventById = new Map<string, Event>();
  beforeAll(() => {
    eventById = new Map(data.events.map((e) => [e.id, e]));
  });

  it("books only completed, closed or confirmed 2026 flea and antique events", () => {
    const typeKey = new Map(data.eventTypes.map((t) => [t.id, t.key]));
    for (const event of data.events) {
      const bookable =
        event.season === 2026 &&
        ["completed", "closed", "confirmed"].includes(event.status) &&
        ["flea", "antique"].includes(typeKey.get(event.eventTypeId) ?? "");
      const requests = data.bookingRequests.filter((r) => r.eventId === event.id);
      if (!bookable)
        expect(requests, `requests for ${event.name} ${event.startsOn}`).toHaveLength(0);
      if (bookable) {
        expect(requests.length).toBeGreaterThanOrEqual(40);
        expect(requests.length).toBeLessThanOrEqual(150);
      }
    }
  });

  it("grants a car only if the car fits the stall and a slot is free", () => {
    const requestById = new Map(data.bookingRequests.map((r) => [r.id, r]));
    const vendorById = new Map(data.vendors.map((v) => [v.id, v]));
    const granted = data.bookingDates.filter((d) => d.carGranted);
    expect(granted.length).toBeGreaterThan(0);
    for (const date of granted) {
      expect(date.carLengthCm).not.toBeNull();
      expect(date.carLengthCm ?? Infinity).toBeLessThanOrEqual(date.lengthCm);
      expect(date.carRequested).toBe(true);
      expect(requestById.get(date.bookingRequestId)?.carRequested).toBe(true);
      expect(vendorById.get(date.vendorId)?.hasCar).toBe(true);
    }
  });

  it("has no overlapping placements in the same row or within one event", () => {
    const groups = new Map<
      string,
      { startCm: number; endCm: number; lengthCm: number; id: string }[]
    >();
    for (const date of data.bookingDates) {
      expect(date.placementStatus).toBe("assigned");
      expect(date.rowId).not.toBeNull();
      expect(date.startCm).not.toBeNull();
      expect(date.endCm).not.toBeNull();
      const key = `${date.eventId}|${date.rowId}`;
      const list = groups.get(key) ?? [];
      list.push({
        startCm: date.startCm ?? 0,
        endCm: date.endCm ?? 0,
        lengthCm: date.lengthCm,
        id: date.id,
      });
      groups.set(key, list);
    }
    const rowLength = new Map<string, number>();
    for (const venue of data.venues)
      for (const zone of venue.zones)
        for (const row of zone.rows) rowLength.set(row.id, row.lengthCm);
    for (const [key, list] of groups) {
      const sorted = [...list].sort((a, b) => a.startCm - b.startCm);
      for (let i = 0; i < sorted.length; i += 1) {
        const current = sorted[i];
        if (!current) continue;
        expect(current.endCm - current.startCm, key).toBe(current.lengthCm);
        if (i > 0) expect(sorted[i - 1]?.endCm ?? 0, key).toBeLessThanOrEqual(current.startCm);
      }
      const rowId = key.split("|")[1] ?? "";
      const last = sorted[sorted.length - 1];
      if (last) expect(last.endCm, key).toBeLessThanOrEqual(rowLength.get(rowId) ?? 0);
    }
  });

  it("prices bookings as metres times price per metre plus the booking fee", () => {
    for (const date of data.bookingDates) {
      expect(date.priceCents).toBe(
        Math.round((date.lengthCm * date.pricePerMCents) / 100) + date.bookingFeeCents,
      );
      expect(Number.isInteger(date.priceCents)).toBe(true);
    }
  });

  it("only marks attendance for events that have already taken place", () => {
    for (const date of data.bookingDates) {
      const event = eventById.get(date.eventId);
      if (date.attendance !== null)
        expect(event !== undefined && event.startsOn < REFERENCE_DATE).toBe(true);
    }
  });
});

/* ----------------------------------------------------------------- privacy */

describe("privacy and wording", () => {
  const json = (): string => JSON.stringify(data);

  it("uses only example.com, example.org and example.net email addresses", () => {
    const emails = json().match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[a-z]{2,}/g) ?? [];
    expect(emails.length).toBeGreaterThan(0);
    const bad = emails.filter(
      (email) => !EXAMPLE_DOMAINS.some((domain) => email.endsWith(`@${domain}`)),
    );
    expect(bad).toEqual([]);
  });

  it("uses only phone numbers from the German fiction ranges", () => {
    const phones = [
      ...data.contacts.map((c) => c.phoneE164),
      ...data.staffMembers.map((s) => s.phoneE164),
      ...data.vendors.map((v) => v.phoneE164),
      data.settings.phoneE164,
    ].filter((phone): phone is string => phone !== null);
    expect(phones.length).toBeGreaterThan(0);
    expect(phones.filter((phone) => !FICTION_PHONE_PATTERN.test(phone))).toEqual([]);
    // Anything that looks like an international number anywhere in the dataset must also be fiction.
    const loose = json().match(/\+\d[\d ]{6,}\d/g) ?? [];
    expect(loose.filter((text) => !FICTION_PHONE_PATTERN.test(text.replaceAll(" ", "")))).toEqual(
      [],
    );
  });

  it("does not use the words customer or Kunde", () => {
    expect(/customer|kunde/i.test(json())).toBe(false);
  });

  it("names the fictional company", () => {
    expect(data.settings.companyName).toBe("Demo Märkte GmbH");
    expect(data.settings.timeZone).toBe("Europe/Berlin");
    expect(data.settings.bundesland).toBe("NW");
  });
});
