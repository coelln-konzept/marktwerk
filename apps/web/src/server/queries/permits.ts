import "server-only";
import {
  can,
  countMissingPermits,
  DISPLAY_STATE_SEVERITY,
  daysBetween,
  eventPermitHealth,
  type HealthLevel,
  isPermitHistory,
  isUnfiled,
  PERMIT_HORIZON_DEFAULT_DAYS,
  type PermitActionTier,
  type PermitDisplayState,
  type PermitStatus,
  permitActionTier,
  permitDisplayState,
  permitExpiryMatters,
  permitHorizonEnd,
  permitStateForEvent,
  permitUrgency,
} from "@marktwerk/core";
import {
  contact,
  event,
  eventPermit,
  eventType,
  type PermitDeliverables,
  payable,
  permit,
  permitRequirement,
  settings,
  staffMember,
  task,
  venue,
} from "@marktwerk/db/schema";
import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lte,
  ne,
  or,
  type SQL,
  sql,
} from "drizzle-orm";
import type { Actor } from "../actor";
import { db } from "../db";
import type { CalendarItem, DueItem } from "./due";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isPermitId = (value: string | undefined): value is string =>
  typeof value === "string" && UUID.test(value);

type Category = (typeof permit.category.enumValues)[number];
type PermitType = (typeof permit.permitType.enumValues)[number];
type Cadence = (typeof permitRequirement.cadence.enumValues)[number];

// ---------------------------------------------------------------------------------------------
// The logbook

/** Required events that still lie ahead and are not cancelled: the ones a permit is needed for. */
const upcomingCount = (today: string) =>
  sql<number>`(select count(*)::int from ${eventPermit} ep join ${event} e on e.id = ep.event_id
    where ep.permit_id = ${permit.id} and ep.required and e.archived_at is null and e.status <> 'cancelled' and e.ends_on >= ${today})`;
const linkedCount = sql<number>`(select count(*)::int from ${eventPermit} ep where ep.permit_id = ${permit.id})`;
/** Ids of the upcoming events a permit is required for (what the weekend table needs). */
const upcomingEventIds = (today: string) =>
  sql<
    string[]
  >`coalesce((select array_agg(e.id::text) from ${eventPermit} ep join ${event} e on e.id = ep.event_id
    where ep.permit_id = ${permit.id} and ep.required and e.archived_at is null and e.status <> 'cancelled' and e.ends_on >= ${today}), '{}'::text[])`;
const nextEventOn = (today: string) =>
  sql<
    string | null
  >`(select min(e.starts_on) from ${eventPermit} ep join ${event} e on e.id = ep.event_id
    where ep.permit_id = ${permit.id} and ep.required and e.archived_at is null and e.status <> 'cancelled' and e.ends_on >= ${today})`;
/** Last day of the latest market (not cancelled) the permit is required for; null if none. */
const latestEventEnd = sql<
  string | null
>`(select max(e.ends_on) from ${eventPermit} ep join ${event} e on e.id = ep.event_id
    where ep.permit_id = ${permit.id} and ep.required and e.archived_at is null and e.status <> 'cancelled')`;
const feeCents = sql<number>`coalesce((select sum(p.total_gross_cents)::int from ${payable} p
    where p.permit_id = ${permit.id} and p.archived_at is null), 0)`;

export type LogbookRow = {
  id: string;
  title: string;
  category: Category;
  permitType: PermitType;
  status: PermitStatus;
  state: PermitDisplayState;
  season: number | null;
  venueId: string | null;
  venueName: string | null;
  referenceNo: string | null;
  applyBy: string | null;
  expectedDecisionOn: string | null;
  validFrom: string | null;
  validUntil: string | null;
  responsibleId: string | null;
  responsibleName: string | null;
  authorityName: string | null;
  cadence: Cadence | null;
  /** Sum of the permit's payables; null when none exists yet. */
  feeCents: number | null;
  typicalFeeCents: number | null;
  stickers: number | null;
  deliverablesReceived: PermitDeliverables;
  upcomingEvents: number;
  linkedEvents: number;
  nextEventOn: string | null;
  conditions: number;
  /** By apply-by date: overdue / apply now / not due yet; null when the permit needs nothing from us. */
  tier: PermitActionTier | null;
};

/**
 * The state shown in the logbook: the permit's own state, except that one which only runs out after the
 * last market it is needed for is simply "Genehmigt", and one which ran out after all its markets are over
 * is "Vergangen" (history), not an "Abgelaufen" warning.
 */
function logbookState(
  r: Pick<LogbookRow, "status" | "validUntil" | "linkedEvents" | "upcomingEvents"> & {
    lastEventEnd: string | null;
  },
  today: string,
): PermitDisplayState {
  const state = permitDisplayState(r, today);
  if (
    state === "expiring" &&
    r.validUntil !== null &&
    r.lastEventEnd !== null &&
    !permitExpiryMatters(r.validUntil, r.lastEventEnd)
  )
    return "granted";
  return isPermitHistory({
    state,
    linkedEvents: r.linkedEvents,
    upcomingEvents: r.upcomingEvents,
  })
    ? "past"
    : state;
}

/** The one focus filter: permits to act on now (= the sidebar badge, "Jetzt zu tun"). */
export const LOGBOOK_FOCUS = ["fehlt"] as const;
export type LogbookFocus = (typeof LOGBOOK_FOCUS)[number];

/**
 * "Jetzt zu tun": a permit in a missing state that at least one upcoming (not cancelled) event requires
 * and whose application is overdue or due within the company's permit horizon (`permitActionTier`,
 * product owner 2026-10-29). Later ones are "noch nicht fällig". One definition for the sidebar badge
 * and the Genehmigungen focus chip.
 */
const needsAction = (row: Pick<LogbookRow, "tier" | "upcomingEvents">) =>
  row.upcomingEvents > 0 && (row.tier === "overdue" || row.tier === "apply_now");
/** Still to be applied for, but later than the horizon: shown, not counted. */
const notDue = (row: Pick<LogbookRow, "tier" | "upcomingEvents">) =>
  row.upcomingEvents > 0 && row.tier === "not_due";

export type LogbookFilters = {
  venueId?: string;
  category?: Category;
  /**
   * null / undefined = every season; a year = that season; "upcoming" = "Kommend": the permits that
   * cover an upcoming market, whatever their season (and open ones no market uses yet).
   */
  season?: number | null | "upcoming";
  state?: PermitDisplayState;
  focus?: LogbookFocus;
  /** A permit the drawer is open for: `drawerHidden` tells when the filters hide it. */
  revealId?: string;
};

const yearStart = (y: number) => `${y}-01-01`;
const yearEnd = (y: number) => `${y}-12-31`;

/** In the season: for that year, or (multi-year / standing) valid during it. */
function inSeason(row: Pick<LogbookRow, "season" | "validFrom" | "validUntil">, season: number) {
  if (row.season !== null) return row.season === season;
  return (
    (row.validUntil === null || row.validUntil >= yearStart(season)) &&
    (row.validFrom === null || row.validFrom <= yearEnd(season))
  );
}

/** "Kommend": a permit some upcoming market needs, or an open one no market uses (yet). */
function isUpcoming(row: Pick<LogbookRow, "upcomingEvents" | "linkedEvents" | "state">) {
  if (row.upcomingEvents > 0) return true;
  return row.linkedEvents === 0 && !["past", "superseded", "not_required"].includes(row.state);
}

export type Logbook = {
  rows: LogbookRow[];
  /** Counts over the rows that pass venue / category / season (not the state filter). */
  counts: Record<PermitDisplayState, number>;
  seasons: number[];
  venues: { id: string; name: string }[];
  total: number;
  /** Permits to act on now (apply-by overdue or within the horizon), across seasons (venue and category narrowing apply). */
  needsAction: number;
  /** Permits for upcoming markets still to be applied for, but not due yet (no badge). */
  notDue: number;
  /** The permit horizon the tiers were judged with (days). */
  horizonDays: number;
  /** `filters.revealId` exists but the filters hide it: the page should show everything. */
  drawerHidden: boolean;
};

/** Everything the Genehmigungen page shows: permits with their derived state, filtered, plus counts. */
export async function listLogbook(
  actor: Actor,
  filters: LogbookFilters,
  today: string,
  horizonDays?: number,
): Promise<Logbook> {
  const empty: Logbook = {
    rows: [],
    counts: Object.fromEntries(
      Object.keys(DISPLAY_STATE_SEVERITY).map((k) => [k, 0]),
    ) as Logbook["counts"],
    seasons: [],
    venues: [],
    total: 0,
    needsAction: 0,
    notDue: 0,
    horizonDays: horizonDays ?? PERMIT_HORIZON_DEFAULT_DAYS,
    drawerHidden: false,
  };
  if (!can(actor.role, "permit", "read")) return empty;
  const horizon = horizonDays ?? (await getPermitHorizonDays());
  empty.horizonDays = horizon;

  const where: (SQL | undefined)[] = [isNull(permit.archivedAt), ne(permit.status, "superseded")];
  if (filters.venueId) where.push(eq(permit.venueId, filters.venueId));
  if (filters.category) where.push(eq(permit.category, filters.category));

  const raw = await db
    .select({
      id: permit.id,
      title: permit.title,
      category: permit.category,
      permitType: permit.permitType,
      status: permit.status,
      season: permit.season,
      venueId: permit.venueId,
      venueName: venue.name,
      referenceNo: permit.referenceNo,
      applyBy: permit.applyBy,
      expectedDecisionOn: permit.expectedDecisionOn,
      validFrom: permit.validFrom,
      validUntil: permit.validUntil,
      responsibleId: permit.responsibleStaffMemberId,
      responsibleName: staffMember.displayName,
      authorityName: contact.name,
      cadence: permitRequirement.cadence,
      typicalFeeCents: permitRequirement.typicalFeeCents,
      deliverablesReceived: permit.deliverablesReceived,
      conditions: sql<number>`coalesce(array_length(${permit.conditions}, 1), 0)::int`,
      feeCents,
      upcomingEvents: upcomingCount(today),
      linkedEvents: linkedCount,
      nextEventOn: nextEventOn(today),
      lastEventEnd: latestEventEnd,
    })
    .from(permit)
    .leftJoin(venue, eq(venue.id, permit.venueId))
    .leftJoin(staffMember, eq(staffMember.id, permit.responsibleStaffMemberId))
    .leftJoin(contact, eq(contact.id, permit.authorityContactId))
    .leftJoin(permitRequirement, eq(permitRequirement.id, permit.requirementId))
    .where(and(...where))
    .orderBy(asc(venue.name), asc(permit.permitType), asc(permit.season), asc(permit.applyBy));

  const all: LogbookRow[] = raw.map(({ lastEventEnd, ...r }) => {
    const state = logbookState({ ...r, lastEventEnd }, today);
    return {
      ...r,
      state,
      tier: permitActionTier({ state, applyBy: r.applyBy }, today, horizon),
      feeCents: r.feeCents > 0 ? r.feeCents : null,
      stickers: r.deliverablesReceived.stickers ?? null,
    };
  });

  const seasons = [
    ...new Set(all.map((r) => r.season).filter((s): s is number => s !== null)),
  ].sort((a, b) => b - a);
  const venues = [
    ...new Map(
      all.filter((r) => r.venueId && r.venueName).map((r) => [r.venueId, r.venueName]),
    ).entries(),
  ].map(([id, name]) => ({ id: id as string, name: name as string }));

  const scoped =
    filters.season === null || filters.season === undefined
      ? all
      : filters.season === "upcoming"
        ? all.filter(isUpcoming)
        : all.filter((r) => inSeason(r, filters.season as number));
  // A permit that only concerns events long gone is history; it stays out of the "all seasons" noise
  // only when the person narrows to a scope.
  const counts = { ...empty.counts };
  for (const r of scoped) counts[r.state] += 1;

  // Needing action depends on upcoming markets, not on the season, so this focus looks across seasons.
  const urgent = all.filter(needsAction);
  let rows = filters.focus === "fehlt" ? urgent : scoped;
  if (filters.state) rows = rows.filter((r) => r.state === filters.state);
  const drawerHidden =
    filters.revealId !== undefined &&
    all.some((r) => r.id === filters.revealId) &&
    !rows.some((r) => r.id === filters.revealId);
  return {
    rows,
    counts,
    seasons,
    venues,
    total: scoped.length,
    needsAction: urgent.length,
    notDue: all.filter(notDue).length,
    horizonDays: horizon,
    drawerHidden,
  };
}

/**
 * The sidebar badge: permits to act on now, i.e. an application that is overdue or due within the permit
 * horizon (`permitActionTier`). Equals the "Jetzt zu tun" chip on the Genehmigungen page
 * (`Logbook.needsAction`), same definition.
 */
export async function missingPermitCount(
  actor: Actor,
  today: string,
  horizonDays?: number,
): Promise<number> {
  if (!can(actor.role, "permit", "read")) return 0;
  const horizon = horizonDays ?? (await getPermitHorizonDays());
  const raw = await db
    .select({
      status: permit.status,
      validUntil: permit.validUntil,
      applyBy: permit.applyBy,
      upcoming: upcomingCount(today),
    })
    .from(permit)
    // The join makes Drizzle qualify `permit.id` inside the correlated subquery of upcomingCount.
    .leftJoin(venue, eq(venue.id, permit.venueId))
    .where(and(isNull(permit.archivedAt), ne(permit.status, "superseded")));
  return raw.filter((r) => {
    const state = permitDisplayState(r, today);
    return needsAction({
      tier: permitActionTier({ state, applyBy: r.applyBy }, today, horizon),
      upcomingEvents: r.upcoming,
    });
  }).length;
}

// ---------------------------------------------------------------------------------------------
// One permit (drawer)

export type PermitDetail = NonNullable<Awaited<ReturnType<typeof getPermit>>>;

export async function getPermit(actor: Actor, id: string, today: string) {
  if (!can(actor.role, "permit", "read") || !isPermitId(id)) return null;
  const [row] = await db
    .select({
      permit,
      venueName: venue.name,
      responsibleName: staffMember.displayName,
      authorityName: contact.name,
      authorityId: contact.id,
      authorityPhone: contact.phoneE164,
      authorityEmail: contact.email,
      requirementId: permitRequirement.id,
      cadence: permitRequirement.cadence,
      typicalFeeCents: permitRequirement.typicalFeeCents,
      leadTimeDays: permitRequirement.leadTimeDays,
    })
    .from(permit)
    .leftJoin(venue, eq(venue.id, permit.venueId))
    .leftJoin(staffMember, eq(staffMember.id, permit.responsibleStaffMemberId))
    .leftJoin(contact, eq(contact.id, permit.authorityContactId))
    .leftJoin(permitRequirement, eq(permitRequirement.id, permit.requirementId))
    .where(eq(permit.id, id));
  if (!row) return null;

  const [events, tasks, fees, replaces] = await Promise.all([
    db
      .select({
        id: event.id,
        name: event.name,
        startsOn: event.startsOn,
        endsOn: event.endsOn,
        status: event.status,
        required: eventPermit.required,
      })
      .from(eventPermit)
      .innerJoin(event, eq(event.id, eventPermit.eventId))
      .where(and(eq(eventPermit.permitId, id), isNull(event.archivedAt)))
      .orderBy(asc(event.startsOn)),
    db
      .select({
        id: task.id,
        title: task.title,
        status: task.status,
        source: task.source,
        dueAt: task.dueAt,
        eventId: task.eventId,
        eventName: event.name,
        eventStartsOn: event.startsOn,
        assigneeName: staffMember.displayName,
      })
      .from(task)
      .leftJoin(staffMember, eq(staffMember.id, task.assigneeId))
      .leftJoin(event, eq(event.id, task.eventId))
      .where(eq(task.permitId, id))
      .orderBy(asc(task.dueAt), asc(task.title)),
    db
      .select({ id: payable.id, title: payable.title, totalGrossCents: payable.totalGrossCents })
      .from(payable)
      .where(and(eq(payable.permitId, id), isNull(payable.archivedAt))),
    row.permit.supersedesId
      ? db
          .select({ id: permit.id, title: permit.title, season: permit.season })
          .from(permit)
          .where(eq(permit.id, row.permit.supersedesId))
      : Promise.resolve([]),
  ]);
  const venueEvents =
    row.permit.venueId && can(actor.role, "event", "read")
      ? await db
          .select({ id: event.id, name: event.name, startsOn: event.startsOn })
          .from(event)
          .where(
            and(
              eq(event.venueId, row.permit.venueId),
              isNull(event.archivedAt),
              ne(event.status, "cancelled"),
              gte(event.endsOn, today),
              sql`not exists (select 1 from ${eventPermit} ep where ep.permit_id = ${id} and ep.event_id = ${event.id})`,
            ),
          )
          .orderBy(asc(event.startsOn))
          .limit(40)
      : [];

  return {
    ...row.permit,
    state: logbookState(
      {
        status: row.permit.status,
        validUntil: row.permit.validUntil,
        linkedEvents: events.length,
        upcomingEvents: events.filter(
          (e) => e.required && e.status !== "cancelled" && e.endsOn >= today,
        ).length,
        lastEventEnd:
          events
            .filter((e) => e.required && e.status !== "cancelled")
            .map((e) => e.endsOn)
            .sort()
            .at(-1) ?? null,
      },
      today,
    ),
    venueName: row.venueName,
    responsibleName: row.responsibleName,
    authority: row.authorityId
      ? {
          id: row.authorityId,
          name: row.authorityName ?? "",
          phone: row.authorityPhone,
          email: row.authorityEmail,
        }
      : null,
    requirement: row.requirementId
      ? {
          id: row.requirementId,
          cadence: row.cadence as Cadence,
          typicalFeeCents: row.typicalFeeCents,
          leadTimeDays: row.leadTimeDays as number,
        }
      : null,
    updatedAtIso: row.permit.updatedAt.toISOString(),
    events,
    tasks: tasks.map((t) => ({ ...t, dueAt: t.dueAt?.toISOString() ?? null })),
    fees,
    feeCents: fees.reduce((sum, f) => sum + f.totalGrossCents, 0),
    supersedes: replaces[0] ?? null,
    linkableEvents: venueEvents,
  };
}

// ---------------------------------------------------------------------------------------------
// The Genehmigungen tab of an event

export type EventPermitRow = {
  permitId: string;
  title: string;
  category: Category;
  permitType: PermitType;
  status: PermitStatus;
  state: PermitDisplayState;
  required: boolean;
  applyBy: string | null;
  validFrom: string | null;
  validUntil: string | null;
  expectedDecisionOn: string | null;
  referenceNo: string | null;
  responsibleName: string | null;
  authorityName: string | null;
  /** How many events the permit covers (so "gilt für 9 Veranstaltungen" can be shown). */
  coversEvents: number;
  stickers: number | null;
};

export type EventPermits = {
  rows: EventPermitRow[];
  /** Required permits that are in hand / required in total. */
  held: number;
  required: number;
  health: HealthLevel | null;
};

/** Held counts for the tab label ("4/5") and the health shape. Includes only permits the event needs. */
export function summarizeEventPermits(
  rows: EventPermitRow[],
  startsOn: string,
  today: string,
  endsOn: string = startsOn,
  horizonDays: number = PERMIT_HORIZON_DEFAULT_DAYS,
): Pick<EventPermits, "held" | "required" | "health"> {
  const needed = rows.filter((r) => r.required && r.status !== "not_required");
  return {
    held: needed.filter((r) => r.state === "granted" || r.state === "expiring").length,
    required: needed.length,
    health: eventPermitHealth(
      rows.map((r) => ({
        status: r.status,
        applyBy: r.applyBy,
        validUntil: r.validUntil,
        required: r.required,
        expectedDecisionOn: r.expectedDecisionOn,
      })),
      startsOn,
      today,
      endsOn,
      horizonDays,
    ),
  };
}

export async function listEventPermits(
  actor: Actor,
  event_: { id: string; startsOn: string; endsOn: string },
  today: string,
): Promise<EventPermits> {
  if (!can(actor.role, "permit", "read")) return { rows: [], held: 0, required: 0, health: null };
  const horizonDays = await getPermitHorizonDays();
  const rows = await db
    .select({
      permitId: permit.id,
      title: permit.title,
      category: permit.category,
      permitType: permit.permitType,
      status: permit.status,
      required: eventPermit.required,
      applyBy: permit.applyBy,
      validFrom: permit.validFrom,
      validUntil: permit.validUntil,
      expectedDecisionOn: permit.expectedDecisionOn,
      referenceNo: permit.referenceNo,
      responsibleName: staffMember.displayName,
      authorityName: contact.name,
      deliverables: permit.deliverablesReceived,
      coversEvents: sql<number>`(select count(*)::int from ${eventPermit} ep where ep.permit_id = ${permit.id})`,
    })
    .from(eventPermit)
    .innerJoin(permit, eq(permit.id, eventPermit.permitId))
    .leftJoin(staffMember, eq(staffMember.id, permit.responsibleStaffMemberId))
    .leftJoin(contact, eq(contact.id, permit.authorityContactId))
    .where(and(eq(eventPermit.eventId, event_.id), isNull(permit.archivedAt)))
    .orderBy(asc(permit.category), asc(permit.permitType), asc(permit.title));
  const mapped: EventPermitRow[] = rows.map(({ deliverables, ...r }) => ({
    ...r,
    // Judged for this event: a permit valid through the market's last day is fine for it.
    state: permitStateForEvent(r, event_, today),
    stickers: deliverables.stickers ?? null,
  }));
  return {
    rows: mapped,
    ...summarizeEventPermits(mapped, event_.startsOn, today, event_.endsOn, horizonDays),
  };
}

export type EventPermitSummary = {
  /** null = nothing tracked. */
  health: HealthLevel | null;
  /** Required permits not held for the event ("1 Genehmigung fehlt"). */
  missing: number;
};

/** Permit health of several events at once (calendar, lists); null = nothing tracked. */
export async function permitHealthByEvent(
  events: { id: string; startsOn: string; endsOn?: string }[],
  today: string,
): Promise<Map<string, HealthLevel | null>> {
  const summary = await permitSummaryByEvent(
    events.map((e) => ({ ...e, endsOn: e.endsOn ?? e.startsOn })),
    today,
  );
  return new Map([...summary].map(([id, s]) => [id, s.health]));
}

/** Permit health and the number of missing permits of several events at once (reasons in lists). */
export async function permitSummaryByEvent(
  events: { id: string; startsOn: string; endsOn: string }[],
  today: string,
): Promise<Map<string, EventPermitSummary>> {
  const result = new Map<string, EventPermitSummary>();
  if (events.length === 0) return result;
  const horizonDays = await getPermitHorizonDays();
  const rows = await db
    .select({
      eventId: eventPermit.eventId,
      required: eventPermit.required,
      status: permit.status,
      applyBy: permit.applyBy,
      expectedDecisionOn: permit.expectedDecisionOn,
      validUntil: permit.validUntil,
    })
    .from(eventPermit)
    .innerJoin(permit, eq(permit.id, eventPermit.permitId))
    .where(
      and(
        inArray(
          eventPermit.eventId,
          events.map((e) => e.id),
        ),
        isNull(permit.archivedAt),
      ),
    );
  for (const e of events) {
    const own = rows.filter((r) => r.eventId === e.id);
    result.set(e.id, {
      health:
        own.length === 0 ? null : eventPermitHealth(own, e.startsOn, today, e.endsOn, horizonDays),
      missing: countMissingPermits(own, e.startsOn, today, e.endsOn, horizonDays),
    });
  }
  return result;
}

// ---------------------------------------------------------------------------------------------
// Venue page: requirements

export type RequirementRow = Awaited<ReturnType<typeof listVenueRequirements>>[number];

export async function listVenueRequirements(venueId: string) {
  if (!isPermitId(venueId)) return [];
  return db
    .select({
      id: permitRequirement.id,
      category: permitRequirement.category,
      permitType: permitRequirement.permitType,
      title: permitRequirement.title,
      eventTypeId: permitRequirement.eventTypeId,
      eventTypeNameDe: eventType.nameDe,
      eventTypeNameEn: eventType.nameEn,
      authorityContactId: permitRequirement.authorityContactId,
      authorityName: contact.name,
      cadence: permitRequirement.cadence,
      leadTimeDays: permitRequirement.leadTimeDays,
      submissionWindowStartMd: permitRequirement.submissionWindowStartMd,
      submissionWindowEndMd: permitRequirement.submissionWindowEndMd,
      expectedDecisionMd: permitRequirement.expectedDecisionMd,
      typicalFeeCents: permitRequirement.typicalFeeCents,
      deliverables: permitRequirement.deliverables,
      notes: permitRequirement.notes,
      updatedAt: permitRequirement.updatedAt,
    })
    .from(permitRequirement)
    .leftJoin(eventType, eq(eventType.id, permitRequirement.eventTypeId))
    .leftJoin(contact, eq(contact.id, permitRequirement.authorityContactId))
    .where(and(eq(permitRequirement.venueId, venueId), isNull(permitRequirement.archivedAt)))
    .orderBy(
      asc(permitRequirement.category),
      asc(permitRequirement.permitType),
      asc(permitRequirement.title),
    );
}

export async function getRequirement(id: string) {
  if (!isPermitId(id)) return null;
  const [row] = await db
    .select({ requirement: permitRequirement, venueName: venue.name })
    .from(permitRequirement)
    .innerJoin(venue, eq(venue.id, permitRequirement.venueId))
    .where(and(eq(permitRequirement.id, id), isNull(permitRequirement.archivedAt)));
  return row ?? null;
}

/** Active staff for the "zuständig" picker. */
export async function listStaffOptions() {
  return db
    .select({ id: staffMember.id, name: staffMember.displayName })
    .from(staffMember)
    .where(and(eq(staffMember.active, true), isNull(staffMember.archivedAt)))
    .orderBy(asc(staffMember.displayName));
}

// ---------------------------------------------------------------------------------------------
// Übersicht and Kalender feeds

/** Company setting: how many days ahead permits show up in the Übersicht (default 30). */
export async function getPermitHorizonDays(): Promise<number> {
  const [row] = await db
    .select({ days: settings.permitHorizonDays })
    .from(settings)
    .where(eq(settings.id, 1));
  return row?.days ?? PERMIT_HORIZON_DEFAULT_DAYS;
}

/**
 * Permits to act on: unfiled ones by their apply-by date, applied ones by the expected decision. They
 * appear up to the company's permit horizon ahead (`settings.permit_horizon_days`, default 30 days, not
 * the 7 days of tasks); beyond a week they are "upcoming" (own group "Genehmigungen demnächst").
 */
export async function dueItems(
  actor: Actor,
  today: string,
  horizonDays?: number,
): Promise<DueItem[]> {
  if (!can(actor.role, "permit", "read")) return [];
  const days = horizonDays ?? (await getPermitHorizonDays());
  const horizon = permitHorizonEnd(today, days);
  const rows = await db
    .select({
      id: permit.id,
      title: permit.title,
      status: permit.status,
      applyBy: permit.applyBy,
      expectedDecisionOn: permit.expectedDecisionOn,
      venueName: venue.name,
      responsibleName: staffMember.displayName,
      upcoming: upcomingCount(today),
      linked: linkedCount,
      eventIds: upcomingEventIds(today),
      nextEventOn: nextEventOn(today),
    })
    .from(permit)
    .leftJoin(venue, eq(venue.id, permit.venueId))
    .leftJoin(staffMember, eq(staffMember.id, permit.responsibleStaffMemberId))
    .where(
      and(
        isNull(permit.archivedAt),
        inArray(permit.status, ["not_started", "preparing", "applied"]),
        or(
          and(
            inArray(permit.status, ["not_started", "preparing"]),
            isNotNull(permit.applyBy),
            lte(permit.applyBy, horizon),
          ),
          and(
            eq(permit.status, "applied"),
            isNotNull(permit.expectedDecisionOn),
            lte(permit.expectedDecisionOn, horizon),
          ),
        ),
      ),
    );
  const items: DueItem[] = [];
  for (const r of rows) {
    if (r.linked > 0 && r.upcoming === 0) continue;
    const unfiled = isUnfiled(r.status);
    const dueOn = unfiled ? r.applyBy : r.expectedDecisionOn;
    if (!dueOn) continue;
    const urgency = permitUrgency(dueOn, today, days);
    if (!urgency) continue;
    items.push({
      kind: "permit",
      id: r.id,
      title: r.title,
      dueOn,
      urgency,
      href: `/genehmigungen?genehmigung=${r.id}`,
      meta: [unfiled ? "Antrag" : "Entscheidung erwartet", r.venueName].filter(Boolean).join(" · "),
      assigneeName: r.responsibleName,
      eventIds: r.eventIds ?? [],
      eventStartsOn: r.nextEventOn,
    });
  }
  return items.sort((a, b) => a.dueOn.localeCompare(b.dueOn) || a.title.localeCompare(b.title));
}

/** Application deadlines, expected decisions and expiries in [from, to] for the calendar's permit layer. */
export async function calendarItems(
  actor: Actor,
  from: string,
  to: string,
  today: string = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin" }).format(
    new Date(),
  ),
): Promise<CalendarItem[]> {
  if (!can(actor.role, "permit", "read")) return [];
  const rows = await db
    .select({
      id: permit.id,
      title: permit.title,
      status: permit.status,
      applyBy: permit.applyBy,
      expectedDecisionOn: permit.expectedDecisionOn,
      validUntil: permit.validUntil,
      venueName: venue.name,
      lastEventEnd: latestEventEnd,
    })
    .from(permit)
    .leftJoin(venue, eq(venue.id, permit.venueId))
    .where(
      and(
        isNull(permit.archivedAt),
        or(
          and(
            inArray(permit.status, ["not_started", "preparing"]),
            gte(permit.applyBy, from),
            lte(permit.applyBy, to),
          ),
          and(
            eq(permit.status, "applied"),
            gte(permit.expectedDecisionOn, from),
            lte(permit.expectedDecisionOn, to),
          ),
          and(
            eq(permit.status, "granted"),
            gte(permit.validUntil, from),
            lte(permit.validUntil, to),
          ),
        ),
      ),
    )
    .orderBy(desc(permit.applyBy));
  const items: CalendarItem[] = [];
  for (const r of rows) {
    const where = r.venueName ? ` · ${r.venueName}` : "";
    const href = `/genehmigungen?genehmigung=${r.id}`;
    if (isUnfiled(r.status) && r.applyBy && r.applyBy >= from && r.applyBy <= to) {
      const days = daysBetween(today, r.applyBy);
      items.push({
        layer: "permits",
        id: `${r.id}:apply`,
        date: r.applyBy,
        title: `Antrag: ${r.title}${where}`,
        href,
        tone: days < 0 ? "critical" : days <= 7 ? "warn" : "neutral",
      });
    }
    if (r.status === "applied" && r.expectedDecisionOn) {
      items.push({
        layer: "permits",
        id: `${r.id}:decision`,
        date: r.expectedDecisionOn,
        title: `Entscheidung erwartet: ${r.title}${where}`,
        href,
        tone: "neutral",
      });
    }
    // "Läuft ab" only when the permit runs out before the last market it is needed for is over.
    if (
      r.status === "granted" &&
      r.validUntil &&
      permitExpiryMatters(r.validUntil, r.lastEventEnd)
    ) {
      items.push({
        layer: "permits",
        id: `${r.id}:expires`,
        date: r.validUntil,
        title: `Läuft ab: ${r.title}${where}`,
        href,
        tone: "warn",
      });
    }
  }
  return items.sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
}
