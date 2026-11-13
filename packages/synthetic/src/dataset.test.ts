import {
  expectedStartFromLastSeason,
  initialSeasonStatus,
  isMarketColor,
  isMarketShortCode,
  itemPermitType,
  seasonAnchors,
  validateSchedule,
} from "@marktwerk/core";
import { beforeAll, describe, expect, it } from "vitest";
import { MAX_EVENTS_PER_DAY, minijobLimitCents, REFERENCE_DATE } from "./constants";
import { generateDataset } from "./dataset";
import { CLIENT_MARKET_PRESET_KEYS } from "./dictionaries/checklist-items";
import { PRESET_BLUEPRINTS } from "./dictionaries/presets";
import { scheduleSeason } from "./generators/events";
import { DECISION_OVERDUE, linkedPermit } from "./generators/permits";
import { clientMarketByPresetKey, OVERDUE_CURRENT, OVERDUE_LEFTOVERS } from "./generators/tasks";
import { EXAMPLE_DOMAINS, FICTION_PHONE_PATTERN } from "./lib/fiction";
import { parseRRule } from "./lib/rrule";
import type {
  Dataset,
  EmploymentContract,
  Event,
  EventType,
  Payable,
  Permit,
  Task,
  TemplateItem,
} from "./types";

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

/**
 * The permit a task is linked to: its item's permit type on its event (the seed's `linkPermitTasks` rule), or for
 * a season task the season permit of that type on its Saison record (`permit.seasonId`).
 */
function permitLinks(d: Dataset): (task: Task) => Permit | undefined {
  const itemById = new Map<string, TemplateItem>(
    d.checklistTemplates.flatMap((t) => t.items.map((i) => [i.id, i] as const)),
  );
  const permitById = new Map(d.permits.map((p) => [p.id, p]));
  const byEvent = new Map<string, { permit: Permit; required: boolean }[]>();
  for (const link of d.eventPermits) {
    const permit = permitById.get(link.permitId);
    if (!permit) continue;
    byEvent.set(link.eventId, [
      ...(byEvent.get(link.eventId) ?? []),
      { permit, required: link.required },
    ]);
  }
  return (task) => {
    const type = itemById.get(task.templateItemId)?.permitType;
    if (!type) return undefined;
    if (task.seasonId !== null) {
      const own = d.permits.filter((p) => p.seasonId === task.seasonId);
      const resolved = itemPermitType(
        type,
        own.map((p) => p.permitType),
      );
      return own.find((p) => p.permitType === resolved);
    }
    return linkedPermit(byEvent.get(task.eventId ?? "") ?? [], type);
  };
}

/** The market (preset) a task belongs to, through its event or its Saison record. */
function presetOfTask(d: Dataset): (task: Task) => string | undefined {
  const byEvent = new Map(d.events.map((e) => [e.id, e.presetId]));
  const bySeason = new Map(d.eventSeasons.map((s) => [s.id, s.presetId]));
  return (task) =>
    task.seasonId !== null ? bySeason.get(task.seasonId) : byEvent.get(task.eventId ?? "");
}

const FILED = new Set(["applied", "granted"]);

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
    const seasonIds = idsOf(data.eventSeasons);
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
      eventSeasons: unresolved(
        data.eventSeasons.map((s) => s.presetId),
        presetIds,
      ),
      eventSeasonAnchors: unresolved(
        data.eventSeasonAnchors.map((a) => a.seasonId),
        seasonIds,
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
          data.tasks.map((t) => t.seasonId),
          seasonIds,
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
        ...unresolved(
          data.permitRequirements.map((r) => r.eventTypeId),
          eventTypeIds,
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
          data.permits.map((p) => p.seasonId),
          seasonIds,
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

  it("gives every market its own valid Kürzel, the wall's letters where they are unique", () => {
    const codes = data.eventPresets.map((p) => p.shortCode);
    for (const code of codes) expect(isMarketShortCode(code)).toBe(true);
    expect(new Set(codes).size).toBe(codes.length);
    const byKey = new Map(data.eventPresets.map((p) => [p.key, p.shortCode]));
    expect(byKey.get("altstadt")).toBe("ALT");
    expect(byKey.get("altstadt-lifestyle")).toBe("LS");
    expect(byKey.get("stadion-p6")).toBe("P6");
    expect(byKey.get("kerpen-stadtfest")).toBe("KST");
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
  let seasonStartById = new Map<string, string>();
  beforeAll(() => {
    eventById = new Map(data.events.map((event) => [event.id, event]));
    seasonStartById = new Map(
      data.eventSeasonAnchors
        .filter((a) => a.key === "seasonStart")
        .map((a) => [a.seasonId, a.date]),
    );
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
    // current: a market that is not over, or a season that has not started yet (its work is still ahead)
    const current = overdue.filter((task) =>
      task.seasonId !== null
        ? (seasonStartById.get(task.seasonId) ?? "") >= REFERENCE_DATE
        : (eventById.get(task.eventId ?? "")?.endsOn ?? "") >= REFERENCE_DATE,
    );
    const pastCutoff = isoDay(Date.parse(`${REFERENCE_DATE}T00:00:00Z`) - 7 * DAY_MS);
    const leftovers = overdue.filter(
      (task) => task.eventId !== null && (eventById.get(task.eventId)?.endsOn ?? "") < pastCutoff,
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
        const ahead =
          task.seasonId !== null
            ? (seasonStartById.get(task.seasonId) ?? "") >= REFERENCE_DATE
            : (eventById.get(task.eventId ?? "")?.endsOn ?? "") >= REFERENCE_DATE;
        expect(ahead).toBe(true);
      }
    }
  });

  it("marks cancelled events' tasks cancelled and gives done tasks a completion time", () => {
    for (const task of data.tasks) {
      const event = eventById.get(task.eventId ?? "");
      if (event?.status === "cancelled") expect(task.status).toBe("cancelled");
      if (task.status === "done") expect(task.completedAt).not.toBeNull();
    }
  });

  it("puts future top-level tasks in todo or in progress, never done (subtasks may be done early)", () => {
    const today = `${REFERENCE_DATE}T00:00:00.000Z`;
    const permitOf = permitLinks(data);
    for (const task of data.tasks) {
      if (task.parentTaskId === null && task.dueAt >= today && task.status !== "cancelled") {
        // A task that applies for a permit is done once that permit is filed, even before it is due.
        const filed = FILED.has(permitOf(task)?.status ?? "");
        expect(filed ? ["done"] : ["todo", "in_progress", "waiting_external"]).toContain(
          task.status,
        );
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
    const eventTasks = data.tasks.filter((task) => task.eventId !== null);
    const perEvent = new Map<string, number>();
    for (const task of eventTasks)
      if (task.eventId !== null) perEvent.set(task.eventId, (perEvent.get(task.eventId) ?? 0) + 1);
    expect(perEvent.size).toBe(data.events.length);
    const average = eventTasks.length / data.events.length;
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
      expect(parent?.seasonId).toBe(task.seasonId);
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
});

/* ------------------------------------------------------- Saison records (research 13 §6) */

describe("Saison records and season tasks", () => {
  const itemById = () =>
    new Map(data.checklistTemplates.flatMap((t) => t.items.map((i) => [i.id, i] as const)));
  const seasonEvents = (presetId: string, season: number) =>
    data.events.filter((e) => e.presetId === presetId && e.season === season);

  it("has one Saison record per market and year, for both seasons", () => {
    const keys = data.eventSeasons.map((s) => `${s.presetId}|${s.season}`);
    expect(new Set(keys).size).toBe(keys.length);
    const expected = data.eventPresets.flatMap((p) => [
      `${p.id}|${SEASON}`,
      `${p.id}|${SEASON + 1}`,
    ]);
    expect(new Set(keys)).toEqual(new Set(expected));
    // every active market has both, so the nightly job (`event-seasons`) finds them and creates nothing
    for (const preset of data.eventPresets.filter((p) => p.active))
      for (const season of [SEASON, SEASON + 1]) expect(keys).toContain(`${preset.id}|${season}`);
  });

  it("follows core's rules for expected start, anchors and status", () => {
    const anchorsOf = (seasonId: string) =>
      new Map(
        data.eventSeasonAnchors.filter((a) => a.seasonId === seasonId).map((a) => [a.key, a.date]),
      );
    for (const season of data.eventSeasons) {
      const events = seasonEvents(season.presetId, season.season).map((e) => ({
        startsOn: e.startsOn,
        endsOn: e.endsOn,
        status: e.status,
      }));
      const previous = seasonEvents(season.presetId, season.season - 1).filter(
        (e) => e.status !== "cancelled",
      );
      const lastFirst =
        previous.length > 0 ? (previous.map((e) => e.startsOn).sort()[0] ?? null) : null;
      expect(season.expectedStart).toBe(expectedStartFromLastSeason(lastFirst, season.season));
      const anchors = seasonAnchors(events, season.expectedStart);
      const stored = anchorsOf(season.id);
      expect(stored.get("seasonStart")).toBe(anchors.season_start);
      expect(stored.get("seasonEnd") ?? null).toBe(anchors.season_end);
      expect(season.status).toBe(initialSeasonStatus(events, REFERENCE_DATE));
    }
    // the current season starts from 1 January (no history), the next one from this season's first date
    const current = data.eventSeasons.filter((s) => s.season === SEASON);
    for (const s of current) expect(s.expectedStart).toBe(`${SEASON}-01-01`);
    // as of the default date the current season is still running for some markets, over for others
    expect(new Set(current.map((s) => s.status))).toEqual(new Set(["closed", "dates_set"]));
    for (const s of data.eventSeasons.filter((s) => s.season === SEASON + 1))
      expect(s.status).toBe("dates_set");
  });

  it("puts season items on season anchors and their tasks on the Saison record only, none on events", () => {
    const items = itemById();
    for (const template of data.checklistTemplates)
      for (const item of template.items) {
        expect(item.scope === "season").toBe(item.stableKey.startsWith("saison_"));
        if (item.scope === "season") expect(["seasonStart", "seasonEnd"]).toContain(item.anchorKey);
        else expect(["seasonStart", "seasonEnd"]).not.toContain(item.anchorKey);
      }
    for (const task of data.tasks) {
      // exactly one owner
      expect((task.eventId === null) !== (task.seasonId === null)).toBe(true);
      expect(task.seasonId !== null).toBe(items.get(task.templateItemId)?.scope === "season");
    }
    const seasonTasks = data.tasks.filter((t) => t.seasonId !== null);
    expect(seasonTasks.length).toBeGreaterThan(0);
    // keys keep their prefix, titles lose the interim "Saison: " (the UI says "<Markt> · Saison <Jahr>")
    for (const task of seasonTasks) {
      expect(task.templateStableKey.startsWith("saison_")).toBe(true);
      expect(task.title.startsWith("Saison")).toBe(false);
    }
    const titles = new Set(seasonTasks.filter((t) => t.parentTaskId === null).map((t) => t.title));
    expect(titles).toEqual(
      new Set(["Termine planen", "Genehmigung beantragen", "Anträge stellen"]),
    );
    // two season tasks (Termine planen, Genehmigung) per Saison record, each due relative to `seasonStart`
    const topLevel = seasonTasks.filter((t) => t.parentTaskId === null);
    expect(topLevel).toHaveLength(data.eventSeasons.length * 2);
    const startOf = new Map(
      data.eventSeasonAnchors
        .filter((a) => a.key === "seasonStart")
        .map((a) => [a.seasonId, a.date]),
    );
    for (const task of topLevel) {
      expect(task.anchorKey).toBe("seasonStart");
      const start = Date.parse(`${startOf.get(task.seasonId ?? "")}T00:00:00Z`);
      expect(task.dueAt.slice(0, 10)).toBe(isoDay(start + task.offsetDays * DAY_MS));
    }
    // subtasks stay with their parent
    expect(seasonTasks.some((t) => t.parentTaskId !== null)).toBe(true);
  });

  it("assigns season tasks through the market's default duties", () => {
    const presetOf = presetOfTask(data);
    const roleKeyById = new Map(data.dutyRoles.map((r) => [r.id, r.key]));
    for (const task of data.tasks.filter((t) => t.seasonId !== null)) {
      const preset = data.eventPresets.find((p) => p.id === presetOf(task));
      const key = roleKeyById.get(task.dutyRoleId);
      expect(key).toBeDefined();
      if (preset && key) expect(task.assigneeId).toBe(preset.defaultDuties[key]);
    }
  });

  it("has the current season's work done and next season's open or in progress by due date", () => {
    const today = `${REFERENCE_DATE}T00:00:00.000Z`;
    const permitOf = permitLinks(data);
    const seasonById = new Map(data.eventSeasons.map((s) => [s.id, s]));
    const topLevel = data.tasks.filter((t) => t.seasonId !== null && t.parentTaskId === null);
    let late = 0;
    for (const task of topLevel) {
      const season = seasonById.get(task.seasonId ?? "");
      if (season?.season === SEASON) expect(task.status, task.title).toBe("done");
      if (FILED.has(permitOf(task)?.status ?? "")) expect(task.status).toBe("done");
      else if (task.dueAt >= today) expect(["todo", "in_progress"]).toContain(task.status);
      else if (task.status !== "done") {
        // one of the few overdue (or waiting) samples, only for next season (its work is still ahead)
        expect(season?.season).toBe(SEASON + 1);
        expect(["todo", "in_progress", "waiting_external"]).toContain(task.status);
        late += 1;
      }
    }
    // the samples are shared with the event tasks (OVERDUE_CURRENT overdue, up to two waiting on an authority)
    expect(late).toBeLessThanOrEqual(OVERDUE_CURRENT + 2);
    const next = topLevel.filter((t) => seasonById.get(t.seasonId ?? "")?.season === SEASON + 1);
    expect(next.some((t) => t.status === "todo")).toBe(true);
    expect(next.some((t) => t.status === "done")).toBe(true);
  });

  it("links season permits (one per market and season) to that market's Saison record", () => {
    const seasonByKey = new Map(data.eventSeasons.map((s) => [`${s.presetId}|${s.season}`, s.id]));
    const eventById = new Map(data.events.map((e) => [e.id, e]));
    const requirementById = new Map(data.permitRequirements.map((r) => [r.id, r]));
    for (const permit of data.permits) {
      const perSeason = requirementById.get(permit.requirementId)?.cadence === "per_season";
      expect(permit.seasonId !== null).toBe(perSeason);
      if (!perSeason) continue;
      const presets = new Set(
        data.eventPermits
          .filter((l) => l.permitId === permit.id)
          .map((l) => eventById.get(l.eventId)?.presetId),
      );
      expect(presets.size).toBe(1);
      const [presetId] = [...presets];
      expect(permit.seasonId).toBe(seasonByKey.get(`${presetId}|${permit.season}`));
    }
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

  it("grants current-season permits except the late examples and upcoming dates, and only granted ones have a grant date", () => {
    const eventById = new Map(data.events.map((e) => [e.id, e]));
    const lastCovered = new Map<string, string>();
    for (const link of data.eventPermits) {
      const end = eventById.get(link.eventId)?.endsOn ?? "";
      if (end > (lastCovered.get(link.permitId) ?? "")) lastCovered.set(link.permitId, end);
    }
    const current = data.permits.filter((p) => p.season === SEASON);
    // Not granted yet: the late examples (not filed), the overdue decisions, and dates still ahead.
    const notGranted = current.filter(
      (p) => p.status !== "granted" && (lastCovered.get(p.id) ?? "") < REFERENCE_DATE,
    );
    expect(notGranted).toEqual([]);
    const pending = current.filter((p) => p.status !== "granted");
    expect(pending.length).toBeLessThanOrEqual(current.length * 0.15);
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

/* ------------------------------------------- permits per market (R19, part C) */

describe("permits per market (research 13 §4)", () => {
  const presetByKey = (key: string) => data.eventPresets.find((p) => p.key === key);
  const venueOf = (presetKey: string) =>
    data.venues.find((v) => v.id === presetByKey(presetKey)?.venueId);
  /** Permits linked to the events of one market (preset), by type. */
  const permitsOf = (presetKey: string, type: Permit["permitType"]) => {
    const preset = presetByKey(presetKey);
    const eventIds = new Set(data.events.filter((e) => e.presetId === preset?.id).map((e) => e.id));
    const linked = new Set(
      data.eventPermits.filter((l) => eventIds.has(l.eventId)).map((l) => l.permitId),
    );
    return data.permits.filter((p) => linked.has(p.id) && p.permitType === type);
  };
  const seasonsOf = (presetKey: string) =>
    [
      ...new Set(
        data.events
          .filter((e) => e.presetId === presetByKey(presetKey)?.id && e.status !== "cancelled")
          .map((e) => e.season),
      ),
    ].sort();

  it("gives every municipal market a Marktgenehmigung and a Festsetzung per season, private ones a landowner OK", () => {
    for (const preset of data.eventPresets) {
      const venue = venueOf(preset.key);
      const seasons = seasonsOf(preset.key);
      const fixing = permitsOf(preset.key, "market_fixing");
      expect(fixing.map((p) => p.season).sort(), `${preset.key} Festsetzung`).toEqual(seasons);
      if (venue?.kind === "municipal") {
        const market = permitsOf(preset.key, "market_permit");
        expect(market.map((p) => p.season).sort(), `${preset.key} Marktgenehmigung`).toEqual(
          seasons,
        );
        expect(permitsOf(preset.key, "landowner_ok")).toEqual([]);
      } else {
        expect(permitsOf(preset.key, "market_permit"), preset.key).toEqual([]);
        const landowner = permitsOf(preset.key, "landowner_ok");
        expect(landowner.map((p) => p.season).sort(), `${preset.key} Eigentümer`).toEqual(seasons);
        for (const permit of landowner)
          expect(permit.authorityContactId).toBe(venue?.landownerContactId);
      }
    }
  });

  it("keeps a market's season permits to that market's dates, even where markets share a place", () => {
    const eventById = new Map(data.events.map((e) => [e.id, e]));
    const presetsByPermit = new Map<string, Set<string>>();
    for (const link of data.eventPermits) {
      const presetId = eventById.get(link.eventId)?.presetId ?? "";
      const set = presetsByPermit.get(link.permitId) ?? new Set<string>();
      presetsByPermit.set(link.permitId, set.add(presetId));
    }
    for (const permit of data.permits) {
      if (!["market_permit", "market_fixing", "landowner_ok"].includes(permit.permitType)) continue;
      expect(presetsByPermit.get(permit.id)?.size, permit.title).toBe(1);
    }
    // Rodenkirchen hosts three markets: each has its own Festsetzung per season, named after it
    const rodenkirchen = data.eventPresets.filter((p) => p.key.startsWith("rodenkirchen-"));
    expect(rodenkirchen).toHaveLength(3);
    for (const preset of rodenkirchen) {
      const own = permitsOf(preset.key, "market_fixing");
      expect(own.length).toBeGreaterThan(0);
      for (const permit of own) expect(permit.title.endsWith(`– ${preset.name}`)).toBe(true);
    }
  });

  it("follows the client's sheets: PVBT, Plakatierung, Standrohr, Schaustellerliste, Verkehr", () => {
    const hoffnungsthal = seasonsOf("hoffnungsthal");
    const events = data.events.filter(
      (e) => e.presetId === presetByKey("hoffnungsthal")?.id && e.status !== "cancelled",
    );
    // PVBT (96 h), the standpipe and the Schaustellerliste go per date, the rest per season
    expect(permitsOf("hoffnungsthal", "no_parking")).toHaveLength(events.length);
    expect(permitsOf("hoffnungsthal", "no_parking")[0]?.title).toMatch(/PVBT/);
    expect(permitsOf("hoffnungsthal", "water")).toHaveLength(events.length);
    expect(
      permitsOf("hoffnungsthal", "signage")
        .map((p) => p.season)
        .sort(),
    ).toEqual(hoffnungsthal);
    expect(permitsOf("hoffnungsthal", "traffic_order")).toHaveLength(hoffnungsthal.length);
    const schausteller = permitsOf("hoffnungsthal", "other");
    expect(schausteller).toHaveLength(events.length);
    expect(schausteller[0]?.title).toMatch(/Schaustellerliste/);
    // school toilets instead of a toilet contract
    expect(permitsOf("hoffnungsthal", "toilets")).toEqual([]);

    expect(permitsOf("riehler-guertel", "no_parking").length).toBeGreaterThan(0);
    expect(permitsOf("riehler-guertel", "signage").length).toBeGreaterThan(0);
    expect(permitsOf("riehler-guertel", "traffic_order").length).toBeGreaterThan(0);
    expect(permitsOf("altstadt", "traffic_order").length).toBeGreaterThan(0);
    expect(permitsOf("altstadt", "water").length).toBeGreaterThan(0);
    // Nippes is a square: no PVBT on its sheet
    expect(permitsOf("nippes", "no_parking")).toEqual([]);
  });

  it("keeps the Altstadt's collective application for the Marktgenehmigung and the Festsetzung", () => {
    const altstadt = venueOf("altstadt");
    for (const type of ["market_permit", "market_fixing"] as const) {
      const requirement = data.permitRequirements.find(
        (r) => r.venueId === altstadt?.id && r.permitType === type,
      );
      expect(requirement?.submissionWindowEndMd, type).toBe("11-30");
    }
  });

  it("has next season's permits mostly not decided yet, with a couple of overdue decisions", () => {
    const next = data.permits.filter((p) => p.season === SEASON + 1);
    const statuses = new Set(next.map((p) => p.status));
    for (const status of ["not_started", "preparing", "applied"] as const)
      expect(statuses.has(status), status).toBe(true);
    expect(next.filter((p) => p.status === "granted").length).toBeLessThan(next.length / 2);
    const overdue = data.permits.filter(
      (p) => p.status === "applied" && (p.expectedDecisionOn ?? "") <= REFERENCE_DATE,
    );
    expect(overdue).toHaveLength(DECISION_OVERDUE);
    for (const permit of overdue) expect(permit.notes ?? "").toMatch(/nachfragen/);
  });

  it("turns a granted Festsetzung into a payable, and only a granted one", () => {
    for (const permit of data.permits.filter((p) => p.permitType === "market_fixing")) {
      const payables = data.payables.filter((p) => p.permitId === permit.id);
      if (permit.status === "granted") {
        expect(payables, permit.title).toHaveLength(1);
        expect(payables[0]?.category).toBe("permit");
        expect(payables[0]?.counterpartyContactId).toBe(permit.authorityContactId);
        expect(payables[0]?.title).toMatch(/^Festsetzungsgebühr/);
      } else {
        expect(payables, permit.title).toEqual([]);
      }
    }
  });

  it("links the Saison Genehmigung and its Festsetzung subtask to the market's permits", () => {
    const permitOf = permitLinks(data);
    const presetOf = presetOfTask(data);
    const municipal = new Set(
      data.eventPresets
        .filter((p) => data.venues.find((v) => v.id === p.venueId)?.kind === "municipal")
        .map((p) => p.id),
    );
    const genehmigung = data.tasks.filter(
      (t) =>
        t.templateStableKey === "saison_genehmigung" &&
        t.status !== "cancelled" &&
        municipal.has(presetOf(t) ?? ""),
    );
    expect(genehmigung.length).toBeGreaterThan(0);
    for (const task of genehmigung) expect(permitOf(task)?.permitType).toBe("market_permit");
    // Private ground (Stadion, P6, Südbrücke): the same season task applies for the owner's OK (Fahrplan R30)
    const onPrivate = data.tasks.filter(
      (t) =>
        t.templateStableKey === "saison_genehmigung" &&
        t.status !== "cancelled" &&
        t.seasonId !== null &&
        !municipal.has(presetOf(t) ?? ""),
    );
    expect(onPrivate.length).toBeGreaterThan(0);
    for (const task of onPrivate) expect(permitOf(task)?.permitType).toBe("landowner_ok");
    const festsetzung = data.tasks.filter(
      (t) => t.templateStableKey === "saison_genehmigung__festsetzung" && t.status !== "cancelled",
    );
    expect(festsetzung.length).toBeGreaterThan(0);
    for (const task of festsetzung) expect(permitOf(task)?.permitType).toBe("market_fixing");
    // Hoffnungsthal: Standrohr, Plakatierung and Schaustellerliste find their permits too
    for (const key of [
      "standrohr_bestellen",
      "saison_genehmigung__plakatierung",
      "schaustellerliste",
    ]) {
      const tasks = data.tasks.filter(
        (t) =>
          t.templateStableKey === key &&
          t.status !== "cancelled" &&
          presetOf(t) === presetByKey("hoffnungsthal")?.id,
      );
      expect(tasks.length, key).toBeGreaterThan(0);
      for (const task of tasks) expect(permitOf(task), key).toBeDefined();
    }
  });

  it("closes a permit task once its permit is filed, as the app does", () => {
    const permitOf = permitLinks(data);
    for (const task of data.tasks) {
      if (task.status === "cancelled" || task.status === "skipped") continue;
      if (FILED.has(permitOf(task)?.status ?? "")) expect(task.status, task.title).toBe("done");
    }
  });

  it("keeps the two overdue invoices as examples (Südstadt toilets, Altstadt standpipe)", () => {
    const overdue = data.payables.filter((p) => p.status === "overdue").map((p) => p.title);
    expect(overdue).toHaveLength(2);
    expect(overdue.some((t) => t.startsWith("Toilettenrahmenvertrag"))).toBe(true);
    expect(overdue.some((t) => t.startsWith("Standrohr-Miete") && t.includes("Altstadt"))).toBe(
      true,
    );
  });
});

/* ----------------------------------------------- contacts and duty roles */

describe("contacts and duty roles (research 13 §4)", () => {
  it("has the partners the client's sheets name, with fictional details", () => {
    const names = data.contacts.map((c) => c.name);
    for (const pattern of [
      /^Ortsring Hoffnungsthal/,
      /^DRK/,
      /Hausmeister/,
      /^Signalbau Lindner/,
      /^Elektro Wendler/,
      /^Schilder Reuter/,
      /Rösrath.*Standrohr|Standrohr.*Rösrath/,
    ]) {
      expect(
        names.some((name) => pattern.test(name)),
        String(pattern),
      ).toBe(true);
    }
    // every firm a template item names is a contact
    const itemText = data.checklistTemplates.flatMap((t) => t.items.map((i) => i.title)).join(" ");
    for (const firm of ["Signalbau Lindner", "Elektro Wendler", "Schilder Reuter"]) {
      expect(itemText).toContain(firm);
      expect(names.some((name) => name.startsWith(firm))).toBe(true);
    }
  });

  it("has the new duty roles from the sheets, each with a default holder", () => {
    const keys = data.dutyRoles.map((r) => r.key);
    expect(keys).toEqual(expect.arrayContaining(["steward", "night_watch", "traffic", "briefing"]));
    for (const role of data.dutyRoles) expect(role.defaultStaffMemberId, role.key).not.toBeNull();
  });

  it("puts the market-day lines on their own duty roles, Nachkassieren on Kasse", () => {
    const roleKeyById = new Map(data.dutyRoles.map((r) => [r.id, r.key]));
    const expected: Record<string, string> = {
      einweisen: "briefing",
      einweisen_letzter_tag: "briefing",
      tageswache_ordner: "steward",
      tageswache_ordner_letzter_tag: "steward",
      nachtwache: "night_watch",
      verkehr_regeln: "traffic",
      verkehr_regeln_letzter_tag: "traffic",
      abflattern_verkehr: "traffic",
      verkehrssicherung: "traffic",
      verkehrssicherung_abbau: "traffic",
      nachkassieren: "cash",
      nachkassieren_letzter_tag: "cash",
    };
    const seen = new Set<string>();
    for (const task of data.tasks) {
      const want = expected[task.templateStableKey];
      if (!want) continue;
      seen.add(task.templateStableKey);
      expect(roleKeyById.get(task.dutyRoleId), task.templateStableKey).toBe(want);
    }
    expect([...seen].sort()).toEqual(Object.keys(expected).sort());
  });

  it("gives the new roles real people: field crew on the day, different Ordner per market", () => {
    const roleIdByKey = new Map(data.dutyRoles.map((r) => [r.key, r.id]));
    const staffById = new Map(data.staffMembers.map((s) => [s.id, s]));
    const eventById = new Map(data.events.map((e) => [e.id, e]));
    for (const key of ["steward", "night_watch", "traffic", "briefing"] as const) {
      const tasks = data.tasks.filter((t) => t.dutyRoleId === roleIdByKey.get(key));
      expect(tasks.length, key).toBeGreaterThan(0);
      for (const task of tasks) {
        expect(task.assigneeId, key).toBe(eventById.get(task.eventId ?? "")?.duties[key]);
        expect(staffById.has(task.assigneeId)).toBe(true);
      }
    }
    // night watch and Ordner are field crew without a login
    for (const event of data.events) {
      expect(staffById.get(event.duties.night_watch)?.permissionRole ?? null).toBeNull();
      expect(staffById.get(event.duties.steward)?.permissionRole ?? null).toBeNull();
    }
    const stewards = new Set(data.eventPresets.map((p) => p.defaultDuties.steward));
    expect(stewards.size).toBeGreaterThanOrEqual(3);
  });
});

/* ---------------------------------------------------- merging parts A and B */

describe("merging parts A and B", () => {
  it("attaches the four client sheets to part A's presets only", () => {
    expect(CLIENT_MARKET_PRESET_KEYS).toEqual({
      altstadt: ["altstadt"],
      "riehler-guertel": ["riehler-guertel"],
      nippes: ["nippes"],
      hoffnungsthal: ["hoffnungsthal"],
    });
  });

  it("lets the events generator create the teardownDay anchor itself (the last market day)", () => {
    for (const event of data.events) {
      const teardown = data.eventAnchors.filter(
        (a) => a.eventId === event.id && a.key === "teardownDay",
      );
      expect(teardown.map((a) => a.date)).toEqual([event.endsOn]);
    }
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

  it("has one Saison record per market and year, with the season tasks on it and none on events", () => {
    const keys = d.eventSeasons.map((s) => `${s.presetId}|${s.season}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toHaveLength(d.eventPresets.length * 2);
    for (const s of d.eventSeasons) expect([season, season + 1]).toContain(s.season);
    for (const task of d.tasks)
      expect(task.seasonId !== null).toBe(task.templateStableKey.startsWith("saison_"));
    // a season that is over is closed, one with dates ahead has its dates set
    const endOf = new Map(
      d.eventSeasonAnchors.filter((a) => a.key === "seasonEnd").map((a) => [a.seasonId, a.date]),
    );
    for (const s of d.eventSeasons)
      expect(s.status).toBe((endOf.get(s.id) ?? "9999") < today ? "closed" : "dates_set");
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
        expect(permit.expectedDecisionOn).not.toBeNull();
      }
      if (permit.status === "granted") expect((permit.grantedAt ?? "") <= today).toBe(true);
    }
    // the authority is late on a couple of decisions, never more
    const decisionOverdue = d.permits.filter(
      (p) => p.status === "applied" && (p.expectedDecisionOn ?? "") <= today,
    );
    expect(decisionOverdue.length).toBeLessThanOrEqual(DECISION_OVERDUE);
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
