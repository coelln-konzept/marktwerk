import { isMarketColor, validateSchedule } from "@marktwerk/core";
import { beforeAll, describe, expect, it } from "vitest";
import { MAX_EVENTS_PER_DAY, minijobLimitCents, REFERENCE_DATE } from "./constants";
import { generateDataset } from "./dataset";
import { PRESET_BLUEPRINTS } from "./dictionaries/presets";
import { scheduleSeason } from "./generators/events";
import { clientMarketByPresetKey, OVERDUE_CURRENT, OVERDUE_LEFTOVERS } from "./generators/tasks";
import { EXAMPLE_DOMAINS, FICTION_PHONE_PATTERN } from "./lib/fiction";
import { parseRRule } from "./lib/rrule";
import type { Dataset, EmploymentContract, Event, EventType, Payable, Task } from "./types";

const TIMEOUT = 120_000;
const DAY_MS = 86_400_000;
/** Season of the default reference date (the first of the two seasons). */
const SEASON = Number(REFERENCE_DATE.slice(0, 4));
const MINIJOB_LIMIT_CENTS = minijobLimitCents(SEASON);

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

/** Markets per calendar day (every day of a multi-day event counts). */
function loadPerDay(events: readonly Pick<Event, "startsOn" | "endsOn">[]): Map<string, number> {
  const load = new Map<string, number>();
  for (const event of events)
    for (const day of eventDays(event)) load.set(day, (load.get(day) ?? 0) + 1);
  return load;
}

function eventDays(event: Pick<Event, "startsOn" | "endsOn">): string[] {
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

  it("has the 10 places of the markets (Köln, Kerpen, Rösrath) with zones and rows", () => {
    expect(data.venues).toHaveLength(10);
    expect(new Set(data.venues.map((venue) => venue.city))).toEqual(
      new Set(["Köln", "Kerpen", "Rösrath"]),
    );
    expect(new Set(data.venues.map((venue) => venue.kind))).toEqual(
      new Set(["municipal", "private"]),
    );
    // Places named only by their address get the name the app derives from it.
    expect(data.venues.map((venue) => venue.name)).toContain("Köln – Riehler Gürtel");
    const stadion = data.venues.find((venue) => venue.name === "RheinEnergie Stadion");
    expect(stadion?.zones.map((zone) => zone.name)).toEqual(["Vorplatz", "P6"]);
    for (const venue of data.venues) {
      expect(venue.zones.length).toBeGreaterThanOrEqual(2);
      expect(venue.zones.length).toBeLessThanOrEqual(4);
      if (venue.kind === "private") expect(venue.landownerContactId).not.toBeNull();
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

  it("has one Grundvorlage and an own published template for every market", () => {
    const masters = data.checklistTemplates.filter((t) => t.isMaster);
    expect(masters).toHaveLength(1);
    expect(masters[0]?.name).toBe("Grundvorlage");
    expect(masters[0]?.ownerPresetId).toBeNull();
    expect(data.checklistTemplates).toHaveLength(data.eventPresets.length + 1);
    for (const preset of data.eventPresets) {
      const own = data.checklistTemplates.find((t) => t.id === preset.checklistTemplateId);
      expect(own?.ownerPresetId).toBe(preset.id);
      expect(own?.eventTypeId).toBe(preset.eventTypeId);
    }
    for (const template of data.checklistTemplates) {
      expect(template.items.length).toBeGreaterThanOrEqual(15);
      expect(template.items.length).toBeLessThanOrEqual(60);
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
      checklistTemplates: [
        ...unresolved(
          data.checklistTemplates.map((t) => t.eventTypeId),
          eventTypeIds,
        ),
        ...unresolved(
          data.checklistTemplates.map((t) => t.ownerPresetId),
          presetIds,
        ),
      ],
      tasks: [
        ...unresolved(
          data.tasks.map((t) => t.parentTaskId),
          idsOf(data.tasks),
        ),
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
  it("has at most three markets on any day", () => {
    expect(Math.max(...loadPerDay(data.events).values())).toBeLessThanOrEqual(MAX_EVENTS_PER_DAY);
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
      if (event.season === SEASON) {
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

  it("gives every event four anchors with the booking cut-off on the Monday before", () => {
    expect(data.eventAnchors).toHaveLength(data.events.length * 4);
    for (const event of data.events) {
      const anchors = data.eventAnchors.filter((a) => a.eventId === event.id);
      const eventDay = anchors.find((a) => a.key === "eventDay");
      const setupDay = anchors.find((a) => a.key === "setupDay");
      const teardownDay = anchors.find((a) => a.key === "teardownDay");
      const cutoff = anchors.find((a) => a.key === "bookingCutoff");
      expect(eventDay?.date).toBe(event.startsOn);
      expect(teardownDay?.date).toBe(event.endsOn);
      expect(setupDay?.date).toBe(
        event.startsOn === event.endsOn ? event.startsOn : daysAfter(event.startsOn, -1),
      );
      expect(cutoff).toBeDefined();
      if (cutoff) {
        expect(new Date(`${cutoff.date}T00:00:00Z`).getUTCDay()).toBe(1);
        expect(cutoff.date < event.startsOn).toBe(true);
      }
    }
  });
});

/* ------------------------------------------------- markets and wall calendar */

/** The 2027 dates read from the office's wall calendar (research 13 §2.2): [first day, last day]. */
const WALL_CALENDAR_2027: Record<string, [string, string][]> = {
  nippes: [
    "01-17",
    "02-21",
    "03-21",
    "04-25",
    "05-23",
    "06-20",
    "07-18",
    "08-22",
    "09-19",
    "10-17",
    "11-28",
  ].map((d) => [d, d]),
  "riehler-guertel": ["04-11", "05-09", "06-13", "07-11", "08-08", "09-05", "10-03", "11-07"].map(
    (d) => [d, d],
  ),
  suedbruecke: ["03-07", "04-11", "05-09", "06-06", "07-04", "08-08", "09-12", "10-10"].map((d) => [
    d,
    d,
  ]),
  altstadt: [
    ["03-27", "03-29"],
    ["05-15", "05-17"],
    ["06-26", "06-27"],
    ["07-24", "07-25"],
    ["08-28", "08-29"],
    ["09-25", "09-26"],
    ["10-30", "10-31"],
  ],
  stadion: ["03-14", "04-18", "05-30"].map((d) => [d, d]),
  "stadion-p6": ["04-04", "05-06", "06-13", "07-18"].map((d) => [d, d]),
  suedstadt: ["04-18", "05-27", "06-20"].map((d) => [d, d]),
  rudolfplatz: [
    ["03-05", "03-07"],
    ["09-17", "09-19"],
  ],
  "kerpen-weintage": [["07-22", "07-25"]],
  "rodenkirchen-hauptstrasse": [["05-15", "05-16"]],
  hoffnungsthal: [["09-12", "09-12"]],
};

describe("markets and the wall calendar", () => {
  it("has the 16 Coelln Konzept series plus Hoffnungsthal, with the keys other parts rely on", () => {
    expect(data.eventPresets).toHaveLength(17);
    const keys = data.eventPresets.map((p) => p.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const key of ["altstadt", "riehler-guertel", "nippes", "hoffnungsthal"])
      expect(keys).toContain(key);
    // Shared places: Stadion (Vorplatz + P6), Altstadt (+ Lifestyle), Rodenkirchen (3), Kerpen (4).
    const perVenue = new Map<string, number>();
    for (const preset of data.eventPresets)
      perVenue.set(preset.venueId, (perVenue.get(preset.venueId) ?? 0) + 1);
    expect([...perVenue.values()].sort()).toEqual([1, 1, 1, 1, 1, 1, 2, 2, 3, 4]);
  });

  it("gives every market a colour, its type's rules (changed where it differs) and a valid Zeitplan", () => {
    const typeById = new Map(data.eventTypes.map((t) => [t.id, t]));
    for (const preset of data.eventPresets) {
      expect(isMarketColor(preset.color)).toBe(true);
      if (preset.rrule !== null) expect(() => parseRRule(preset.rrule ?? "")).not.toThrow();
      const type = typeById.get(preset.eventTypeId);
      expect(Object.keys(preset.rules).sort()).toEqual(Object.keys(type?.rules ?? {}).sort());
      expect(validateSchedule(preset.schedule, preset.durationDays)).toEqual([]);
      expect(preset.schedule.some((r) => r.audience === "vendors" && r.kind === "setup")).toBe(
        true,
      );
      expect(preset.schedule.some((r) => r.audience === "vendors" && r.kind === "teardown")).toBe(
        true,
      );
    }
    const lifestyle = data.eventPresets.find((p) => p.key === "altstadt-lifestyle");
    expect(lifestyle?.rules.newGoodsMaxShare).toBe(0.6);
    // Multi-day Altstadt: some vendors leave early on the last morning, the team builds up the day before.
    const altstadt = data.eventPresets.find((p) => p.key === "altstadt");
    expect(
      altstadt?.schedule.filter((r) => r.audience === "vendors" && r.kind === "teardown"),
    ).toHaveLength(2);
    expect(altstadt?.schedule.some((r) => r.day === "before")).toBe(true);
  });

  it("copies the market's Zeitplan into its events (an hour later in winter on single days)", () => {
    const presetById = new Map(data.eventPresets.map((p) => [p.id, p]));
    for (const event of data.events) {
      const preset = presetById.get(event.presetId);
      const days = eventDays(event).length;
      expect(validateSchedule(event.schedule, days)).toEqual([]);
      const winter = days === 1 && ["01", "02", "11", "12"].includes(event.startsOn.slice(5, 7));
      if (!winter) expect(event.schedule).toEqual(preset?.schedule);
      else expect(event.schedule).not.toEqual(preset?.schedule);
    }
  });

  it("reproduces every 2027 date of the wall calendar", () => {
    const placed = scheduleSeason(PRESET_BLUEPRINTS, 2027);
    for (const [key, dates] of Object.entries(WALL_CALENDAR_2027)) {
      const actual = placed
        .filter((date) => date.presetKey === key)
        .map((date) => [date.startsOn.slice(5), date.endsOn.slice(5)]);
      expect(actual, key).toEqual(dates);
    }
    // The dataset's next season is that 2027.
    const nippes = data.eventPresets.find((p) => p.key === "nippes");
    expect(
      data.events
        .filter((e) => e.presetId === nippes?.id && e.season === 2027)
        .map((e) => e.startsOn.slice(5)),
    ).toEqual(WALL_CALENDAR_2027.nippes?.map(([start]) => start));
  });

  it.each([2026, 2027, 2028, 2029, 2030])("plans a realistic season %i", (year) => {
    const placed = scheduleSeason(PRESET_BLUEPRINTS, year);
    // Every rule's date finds a place, 60–70 events, January to November.
    const wanted = PRESET_BLUEPRINTS.reduce((sum, p) => sum + p.dates.length, 0);
    expect(placed).toHaveLength(wanted);
    expect(placed.length).toBeGreaterThanOrEqual(60);
    expect(placed.length).toBeLessThanOrEqual(70);
    for (const date of placed) {
      expect(date.endsOn.slice(0, 4)).toBe(String(year));
      expect(date.endsOn.slice(5, 7) <= "11").toBe(true);
    }
    // 1–3 markets per day, most dates start on a Sunday, Thursdays only on holidays or Do–So.
    expect(Math.max(...loadPerDay(placed).values())).toBeLessThanOrEqual(MAX_EVENTS_PER_DAY);
    const weekdays = placed.map((date) => new Date(`${date.startsOn}T00:00:00Z`).getUTCDay());
    expect(weekdays.filter((day) => day === 0).length / placed.length).toBeGreaterThan(0.75);
    expect(weekdays.every((day) => [0, 4, 5, 6].includes(day))).toBe(true);
    // The same market and the same place never twice on one day.
    const venueOf = new Map(PRESET_BLUEPRINTS.map((p) => [p.key, p.venueKey]));
    const seen = new Set<string>();
    for (const date of placed)
      for (const day of eventDays(date)) {
        const key = `${venueOf.get(date.presetKey)}|${day}`;
        expect(seen.has(key), key).toBe(false);
        seen.add(key);
      }
  });

  it("keeps markets off Whit Sunday, Volkstrauertag and Totensonntag unless the holiday is the point", () => {
    // 2026: Whit Sunday 24 May, Volkstrauertag 15 Nov, Totensonntag 22 Nov; 2027: 16 May, 14 Nov, 21 Nov.
    const blocked = ["2026-05-24", "2026-11-15", "2026-11-22", "2027-11-14", "2027-11-21"];
    const holidayMarkets = new Set(["altstadt", "rodenkirchen-hauptstrasse"]);
    for (const year of [2026, 2027])
      for (const date of scheduleSeason(PRESET_BLUEPRINTS, year))
        if (!holidayMarkets.has(date.presetKey))
          for (const day of eventDays(date)) expect(blocked, date.presetKey).not.toContain(day);
  });
});

/* ------------------------------------------------------------------ tasks */

describe("tasks", () => {
  let eventById = new Map<string, Event>();
  beforeAll(() => {
    eventById = new Map(data.events.map((event) => [event.id, event]));
  });
  const open = (task: Task): boolean => !["done", "skipped", "cancelled"].includes(task.status);

  it("leaves open only the few overdue tasks: OVERDUE_CURRENT on current markets, OVERDUE_LEFTOVERS on the last past one", () => {
    const today = `${REFERENCE_DATE}T00:00:00.000Z`;
    // Lists count top-level tasks; an overdue subtask shows on its parent (ADR 0021).
    const overdue = data.tasks.filter(
      (task) =>
        task.parentTaskId === null &&
        task.dueAt < today &&
        open(task) &&
        task.status !== "waiting_external",
    );
    const current = overdue.filter(
      (task) => (eventById.get(task.eventId)?.endsOn ?? "") >= REFERENCE_DATE,
    );
    const pastCutoff = isoDay(Date.parse(`${REFERENCE_DATE}T00:00:00Z`) - 7 * DAY_MS);
    const leftovers = overdue.filter(
      (task) => (eventById.get(task.eventId)?.endsOn ?? "") < pastCutoff,
    );
    expect(current).toHaveLength(OVERDUE_CURRENT);
    expect(leftovers).toHaveLength(OVERDUE_LEFTOVERS);
    expect(overdue).toHaveLength(OVERDUE_CURRENT + OVERDUE_LEFTOVERS);
    // all leftovers belong to one market; nothing is carried over for long
    expect(new Set(leftovers.map((task) => task.eventId)).size).toBe(1);
    for (const task of overdue) {
      expect(task.category).not.toBe("permits");
      expect(task.rolloverCount).toBeGreaterThanOrEqual(1);
      expect(task.rolloverCount).toBeLessThanOrEqual(5);
      expect(task.completedAt).toBeNull();
    }
  });

  it("lets past permit tasks wait on an authority only while their market is still ahead", () => {
    const today = `${REFERENCE_DATE}T00:00:00.000Z`;
    for (const task of data.tasks) {
      if (task.dueAt < today && task.status === "waiting_external") {
        expect(task.category).toBe("permits");
        expect((eventById.get(task.eventId)?.endsOn ?? "") >= REFERENCE_DATE).toBe(true);
      }
    }
  });

  it("marks cancelled events' tasks cancelled and gives done tasks a completion time", () => {
    for (const task of data.tasks) {
      const event = eventById.get(task.eventId);
      if (event?.status === "cancelled") expect(task.status).toBe("cancelled");
      if (task.status === "done") expect(task.completedAt).not.toBeNull();
    }
  });

  it("puts future top-level tasks in todo or in progress, never done (subtasks may be done early)", () => {
    const today = `${REFERENCE_DATE}T00:00:00.000Z`;
    for (const task of data.tasks) {
      if (task.parentTaskId === null && task.dueAt >= today && task.status !== "cancelled") {
        expect(["todo", "in_progress", "waiting_external"]).toContain(task.status);
      }
      if (task.completedAt !== null) expect(task.completedAt < today).toBe(true);
    }
  });

  it("flags a small, fixed set of template items as Kernaufgaben and copies the flag to the tasks", () => {
    const keyKeys = new Set(
      data.checklistTemplates.flatMap((t) =>
        t.items.filter((i) => i.isKey).map((i) => i.stableKey),
      ),
    );
    expect([...keyKeys].sort()).toEqual(
      ["bringto_einladen", "saison_genehmigung", "saison_termine_planen", "schichtplan"].sort(),
    );
    for (const task of data.tasks) expect(task.isKey).toBe(keyKeys.has(task.templateStableKey));
    expect(data.tasks.some((task) => task.isKey)).toBe(true);
  });

  it("has about 15–25 tasks per event on average, subtasks included", () => {
    const perEvent = new Map<string, number>();
    for (const task of data.tasks)
      perEvent.set(task.eventId, (perEvent.get(task.eventId) ?? 0) + 1);
    expect(perEvent.size).toBe(data.events.length);
    const average = data.tasks.length / data.events.length;
    expect(average).toBeGreaterThanOrEqual(15);
    expect(average).toBeLessThanOrEqual(25);
    expect(Math.min(...perEvent.values())).toBeGreaterThanOrEqual(10);
    expect(Math.max(...perEvent.values())).toBeLessThanOrEqual(60);
    expect(data.tasks.filter((task) => task.parentTaskId !== null).length).toBeGreaterThan(
      data.events.length * 3,
    );
  });
});

/* ------------------------------------------------- templates and subtasks */

describe("templates and subtasks (ADR 0021)", () => {
  const open = (task: Task): boolean => !["done", "skipped", "cancelled"].includes(task.status);
  const itemsOf = (presetKey: string) => {
    const preset = data.eventPresets.find((p) => p.key === presetKey);
    return data.checklistTemplates.find((t) => t.id === preset?.checklistTemplateId)?.items ?? [];
  };

  it("nests child items one level deep, right below a parent of the same template", () => {
    for (const template of data.checklistTemplates) {
      const byKey = new Map(template.items.map((i) => [i.stableKey, i]));
      expect(byKey.size).toBe(template.items.length);
      for (const item of template.items) {
        if (item.parentKey === null) {
          expect(item.dutyRoleKey).not.toBeNull();
          expect(item.ownDue).toBe(false);
          continue;
        }
        const parent = byKey.get(item.parentKey);
        expect(parent, `${template.name}: ${item.stableKey}`).toBeDefined();
        expect(parent?.parentKey).toBeNull();
        expect(item.sort).toBeGreaterThan(parent?.sort ?? Number.POSITIVE_INFINITY);
        expect(item.phase).toBe(parent?.phase);
        expect(item.scope).toBe(parent?.scope);
        if (!item.ownDue) {
          expect(item.anchorKey).toBe(parent?.anchorKey);
          expect(item.offsetDays).toBe(parent?.offsetDays);
          expect(item.dueTime).toBe(parent?.dueTime);
        }
      }
      expect(template.items.map((i) => i.sort)).toEqual(template.items.map((_, n) => n + 1));
    }
  });

  it("builds the Grundvorlage from the core of the client's sheets", () => {
    const master = data.checklistTemplates.find((t) => t.isMaster);
    expect(master?.items.filter((i) => i.parentKey === null).map((i) => i.stableKey)).toEqual([
      "saison_termine_planen",
      "saison_genehmigung",
      "schichtplan",
      "einzeichnen",
      "bringto_einladen",
      "einweisen",
      "tageswache_ordner",
      "nachkassieren",
      "flyer_verteilen",
      "reinigung",
      "nachbereitung",
    ]);
    expect(master?.items.find((i) => i.stableKey === "saison_genehmigung")?.permitType).toBe(
      "market_permit",
    );
    expect(
      master?.items.find((i) => i.stableKey === "saison_genehmigung__festsetzung")?.permitType,
    ).toBe("market_fixing");
  });

  it("gives the four client markets their own sheets and marks assumptions on every other market", () => {
    const clients = clientMarketByPresetKey(data.eventPresets.map((p) => p.key));
    const presetKeyOf = (market: string) =>
      [...clients].find(([, client]) => client === market)?.[0] ?? "";
    const clientKeys = [...clients.keys()];
    expect(clientKeys).toHaveLength(4);
    const altstadt = itemsOf(presetKeyOf("altstadt"));
    expect(altstadt.map((i) => i.stableKey)).toEqual(
      expect.arrayContaining(["nachtwache", "leihstaende_abbauen", "reinigung"]),
    );
    expect(altstadt.find((i) => i.stableKey === "saison_genehmigung")?.offsetDays).toBe(-210);
    expect(altstadt.find((i) => i.stableKey === "reinigung")?.anchorKey).toBe("teardownDay");
    expect(itemsOf(presetKeyOf("nippes")).find((i) => i.stableKey === "einzeichnen")?.phase).toBe(
      "live",
    );
    expect(itemsOf(presetKeyOf("riehler-guertel")).map((i) => i.stableKey)).toContain(
      "pvbt_werbung_aufhaengen",
    );
    expect(itemsOf(presetKeyOf("hoffnungsthal")).map((i) => i.stableKey)).toEqual(
      expect.arrayContaining(["drk_anfragen", "druckwerbung", "pvbt_aufstellen"]),
    );
    const masterKeys = new Set(
      data.checklistTemplates.find((t) => t.isMaster)?.items.map((i) => i.stableKey),
    );
    for (const template of data.checklistTemplates) {
      if (template.isMaster) continue;
      const preset = data.eventPresets.find((p) => p.id === template.ownerPresetId);
      const client = clientKeys.includes(preset?.key ?? "");
      expect(template.source).toBe(client ? "client_checklist" : "master_copy");
      const added = template.items.filter(
        (i) => i.parentKey === null && !masterKeys.has(i.stableKey),
      );
      expect(added.length).toBeGreaterThan(0);
      for (const item of added) {
        if (client) expect(item.description ?? "").not.toMatch(/^Annahme/);
        else expect(item.description).toBe("Annahme – vom Team noch nicht bestätigt");
      }
    }
  });

  it("puts market-day lines in the live phase, on a market day", () => {
    for (const template of data.checklistTemplates) {
      for (const item of template.items.filter((i) => i.phase === "live")) {
        expect(item.offsetDays).toBe(0);
        expect(["eventDay", "teardownDay"]).toContain(item.anchorKey);
      }
    }
  });

  it("makes subtasks only under top-level tasks of the same event, from the parent item's children", () => {
    const byId = new Map(data.tasks.map((t) => [t.id, t]));
    const itemById = new Map(
      data.checklistTemplates.flatMap((t) => t.items.map((i) => [i.id, i] as const)),
    );
    for (const task of data.tasks) {
      const item = itemById.get(task.templateItemId);
      if (task.parentTaskId === null) {
        expect(item?.parentKey).toBeNull();
        continue;
      }
      const parent = byId.get(task.parentTaskId);
      expect(parent?.parentTaskId).toBeNull();
      expect(parent?.eventId).toBe(task.eventId);
      expect(item?.parentKey).toBe(parent?.templateStableKey);
      if (item && !item.ownDue) expect(task.dueAt).toBe(parent?.dueAt);
      if (item?.dutyRoleKey === null) expect(task.dutyRoleId).toBe(parent?.dutyRoleId);
    }
    // every parent gets all its children
    const childCount = new Map<string, number>();
    for (const task of data.tasks)
      if (task.parentTaskId)
        childCount.set(task.parentTaskId, (childCount.get(task.parentTaskId) ?? 0) + 1);
    for (const task of data.tasks) {
      if (task.parentTaskId !== null) continue;
      const item = itemById.get(task.templateItemId);
      const template = data.checklistTemplates.find((t) => t.items.some((i) => i.id === item?.id));
      const expected = template?.items.filter((i) => i.parentKey === item?.stableKey).length ?? 0;
      expect(childCount.get(task.id) ?? 0).toBe(expected);
    }
  });

  it("never has a done task with open subtasks, and open parents have some subtasks done", () => {
    const children = new Map<string, Task[]>();
    for (const task of data.tasks)
      if (task.parentTaskId)
        children.set(task.parentTaskId, [...(children.get(task.parentTaskId) ?? []), task]);
    let openParentsWithDone = 0;
    for (const task of data.tasks) {
      const subs = children.get(task.id) ?? [];
      if (subs.length === 0) continue;
      if (task.status === "done") {
        expect(subs.filter(open)).toEqual([]);
        for (const sub of subs)
          expect((sub.completedAt ?? "") <= (task.completedAt ?? "")).toBe(true);
      }
      if (task.status === "cancelled") for (const sub of subs) expect(sub.status).toBe("cancelled");
      if (open(task) && subs.some((sub) => sub.status === "done")) openParentsWithDone += 1;
    }
    expect(openParentsWithDone).toBeGreaterThan(0);
  });

  it("creates the interim season tasks only on the first event of each series per season", () => {
    const seasonTasks = data.tasks.filter((t) => t.templateStableKey.startsWith("saison_"));
    for (const task of seasonTasks) {
      expect(task.title.startsWith("Saison: ") || task.parentTaskId !== null).toBe(true);
    }
    const carrierIds = new Set(seasonTasks.map((t) => t.eventId));
    const firstBySeries = new Map<string, Event>();
    for (const event of data.events) {
      if (event.status === "cancelled") continue;
      const key = `${event.presetId}|${event.season}`;
      const first = firstBySeries.get(key);
      if (!first || event.startsOn < first.startsOn) firstBySeries.set(key, event);
    }
    expect(carrierIds).toEqual(new Set([...firstBySeries.values()].map((e) => e.id)));
    // two season tasks (Termine planen, Genehmigung) per series and season
    expect(seasonTasks.filter((t) => t.parentTaskId === null)).toHaveLength(firstBySeries.size * 2);
  });
});

/* ----------------------------------------------------------------- permits */

describe("permits", () => {
  it("gives Köln Altstadt a submission window with an expected January decision", () => {
    const altstadt = data.venues.find((venue) => venue.name.startsWith("Köln Altstadt"));
    const requirement = data.permitRequirements.find(
      (r) => r.venueId === altstadt?.id && r.permitType === "market_permit",
    );
    expect(requirement?.submissionWindowStartMd).toBe("10-01");
    expect(requirement?.expectedDecisionMd).toBe("01-15");
    const nextPermit = data.permits.find(
      (p) => p.requirementId === requirement?.id && p.season === SEASON + 1,
    );
    expect(nextPermit?.status).toBe("applied");
    expect(nextPermit?.expectedDecisionOn).toBe(`${SEASON + 1}-01-15`);
  });

  it("grants current-season permits except the deliberately late ones, and only granted ones have a grant date", () => {
    const current = data.permits.filter((p) => p.season === SEASON);
    const notGranted = current.filter((p) => p.status !== "granted");
    expect(notGranted.length).toBeLessThanOrEqual(2);
    for (const permit of data.permits) {
      if (permit.status === "granted") expect(permit.grantedAt).not.toBeNull();
      else expect(permit.grantedAt).toBeNull();
    }
  });

  it("links external permits only where the ground is not public", () => {
    const publicVenues = new Set(
      data.venues.filter((v) => v.kind === "municipal").map((v) => v.id),
    );
    const landowner = data.permitRequirements.filter((r) => r.permitType === "landowner_ok");
    expect(landowner.length).toBeGreaterThan(0);
    for (const requirement of landowner) expect(publicVenues.has(requirement.venueId)).toBe(false);
  });

  it("records 100 stickers on granted signage permits", () => {
    const signage = data.permits.filter(
      (p) => p.permitType === "signage" && p.status === "granted",
    );
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
    expect(overdue.length).toBeGreaterThanOrEqual(1);
    expect(overdue.length).toBeLessThanOrEqual(2);
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

  it("has shifts only on past events of the current season, and some recent shifts without actual times", () => {
    const eventById = new Map(data.events.map((e) => [e.id, e]));
    for (const shift of data.shifts) {
      const event = eventById.get(shift.eventId);
      expect(event?.season).toBe(SEASON);
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

  it("books only completed, closed or confirmed current-season flea and antique events", () => {
    const typeKey = new Map(data.eventTypes.map((t) => [t.id, t.key]));
    for (const event of data.events) {
      const bookable =
        event.season === SEASON &&
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

/* ------------------------------------------------- across reference dates */

/** The data must look like a well-run company's normal day on any reference date, not only the default. */
const REFERENCE_DATES = ["2026-10-21", "2026-11-10", "2027-01-05", "2027-03-15", "2027-07-01"];

function daysAfter(date: string, days: number): string {
  return isoDay(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS);
}

describe.each(REFERENCE_DATES)("as of %s", (today) => {
  let d: Dataset;
  beforeAll(() => {
    d = generateDataset({ referenceDate: today });
  }, TIMEOUT);
  const season = Number(today.slice(0, 4));

  it("derives the two seasons from the date and sets statuses from it", () => {
    expect(new Set(d.events.map((e) => e.season))).toEqual(new Set([season, season + 1]));
    for (const event of d.events) {
      if (event.status === "cancelled") {
        expect(event.endsOn < today).toBe(true);
      } else if (event.endsOn < today) {
        expect(["completed", "closed"]).toContain(event.status);
      } else {
        expect(event.status).toBe(event.season === season ? "confirmed" : "planned");
      }
    }
  });

  it(
    "keeps the day cap and is deterministic",
    () => {
      expect(Math.max(...loadPerDay(d.events).values())).toBeLessThanOrEqual(MAX_EVENTS_PER_DAY);
      expect(JSON.stringify(generateDataset({ referenceDate: today }))).toBe(JSON.stringify(d));
    },
    TIMEOUT,
  );

  it("has only a handful of overdue open tasks", () => {
    const overdue = d.tasks.filter(
      (t) =>
        t.parentTaskId === null &&
        t.dueAt < `${today}T00:00:00.000Z` &&
        !["done", "skipped", "cancelled"].includes(t.status),
    );
    expect(overdue.length).toBeLessThanOrEqual(8);
    const notWaiting = overdue.filter((t) => t.status !== "waiting_external");
    expect(notWaiting.length).toBeLessThanOrEqual(6);
  });

  it("files permits on time: at most two are really late, and past events are covered", () => {
    const late = d.permits.filter((p) => p.status === "not_started" && p.applyBy < today);
    expect(late.length).toBeLessThanOrEqual(2);
    const unfiledPastDue = d.permits.filter(
      (p) => (p.status === "not_started" || p.status === "preparing") && p.applyBy < today,
    );
    expect(unfiledPastDue.length).toBeLessThanOrEqual(2);

    // permits of events that already happened are granted
    const eventById = new Map(d.events.map((e) => [e.id, e]));
    const permitById = new Map(d.permits.map((p) => [p.id, p]));
    for (const link of d.eventPermits) {
      const event = eventById.get(link.eventId);
      const permit = permitById.get(link.permitId);
      if (event && permit && event.endsOn < today && event.status !== "cancelled" && link.required)
        expect(permit.status, `${permit.title} for ${event.startsOn}`).toBe("granted");
    }

    // dates agree with statuses
    for (const permit of d.permits) {
      if (permit.status === "applied") {
        expect(permit.appliedAt).not.toBeNull();
        expect((permit.appliedAt ?? "") < today).toBe(true);
        expect((permit.expectedDecisionOn ?? "") > today).toBe(true);
      }
      if (permit.status === "granted") expect((permit.grantedAt ?? "") <= today).toBe(true);
    }
  });

  it("spreads expected decisions instead of piling them on one day", () => {
    const perDay = new Map<string, number>();
    for (const permit of d.permits) {
      if (permit.status !== "applied" || permit.expectedDecisionOn === null) continue;
      perDay.set(permit.expectedDecisionOn, (perDay.get(permit.expectedDecisionOn) ?? 0) + 1);
    }
    expect(Math.max(0, ...perDay.values())).toBeLessThanOrEqual(10);
  });

  it("has a few overdue instalments and obligations, most past instalments paid", () => {
    const pastDue = d.installments.filter((i) => i.dueOn < today);
    const overdue = pastDue.filter((i) => i.status !== "paid");
    expect(overdue.length).toBeGreaterThanOrEqual(1);
    expect(overdue.length).toBeLessThanOrEqual(2);
    // early in the year there are only a few past instalments, so the share only means something later
    if (pastDue.length >= 20) expect(overdue.length / pastDue.length).toBeLessThan(0.1);
    for (const i of d.installments) if (i.dueOn > today) expect(i.status).toBe("open");
    expect(d.obligations.filter((o) => o.nextDueOn < today).length).toBeLessThanOrEqual(2);
    const soon = daysAfter(today, 14);
    expect(
      d.installments.some((i) => i.status === "open" && i.dueOn >= today && i.dueOn <= soon),
    ).toBe(true);
  });

  it("keeps every date inside the seasons around the reference date", () => {
    const years = new Set([season, season + 1]);
    for (const e of d.events) expect(years.has(Number(e.startsOn.slice(0, 4)))).toBe(true);
    for (const i of d.installments) {
      expect(Number(i.dueOn.slice(0, 4))).toBeGreaterThanOrEqual(season - 1);
      expect(Number(i.dueOn.slice(0, 4))).toBeLessThanOrEqual(season + 1);
    }
  });
});
