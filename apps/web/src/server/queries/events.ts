import "server-only";
import { type HealthDimensions, type HealthLevel, teamHealth } from "@marktwerk/core";
import {
  dutyRole,
  event,
  eventDuty,
  eventPreset,
  eventType,
  staffMember,
  venue,
} from "@marktwerk/db/schema";
import { and, asc, count, eq, gte, lt, lte, ne, type SQL, sql } from "drizzle-orm";
import { cache } from "react";
import { todayIn } from "@/lib/format";
import {
  escapeLike,
  escapeRegex,
  FUZZY_THRESHOLD,
  tokenize,
  transpositions,
  typoTolerant,
} from "@/lib/search-query";
import { type Actor, visibleEvents } from "../actor";
import { db } from "../db";
import { eventMoneyHealthFor } from "./finance";
import { permitSummaryByEvent } from "./permits";
import { taskSummaryByEvent } from "./tasks";

export type EventStatusKey = (typeof event.status.enumValues)[number];

export type EventFilters = {
  season?: number;
  typeKey?: string;
  status?: EventStatusKey | "active";
  q?: string;
  /** How `q` matches (see `eventSearchMode`); plain "every word somewhere" when not given. */
  qMode?: EventSearchMode;
  venueId?: string;
  from?: string;
  to?: string;
  /** Only events whose last day is before this date (Archiv › Vergangene Veranstaltungen). */
  endedBefore?: string;
};

const dutyRoleCount = cache(async () => {
  const [row] = await db.select({ n: count() }).from(dutyRole);
  return row?.n ?? 0;
});

function where(actor: Actor, f: EventFilters, withType = true): SQL {
  const parts: (SQL | undefined)[] = [visibleEvents(actor)];
  if (f.season) parts.push(eq(event.season, f.season));
  if (withType && f.typeKey) parts.push(eq(eventType.key, f.typeKey));
  if (f.status === "active") parts.push(ne(event.status, "cancelled"));
  else if (f.status) parts.push(eq(event.status, f.status));
  if (f.from) parts.push(gte(event.endsOn, f.from));
  if (f.to) parts.push(lte(event.startsOn, f.to));
  if (f.endedBefore) parts.push(lt(event.endsOn, f.endedBefore));
  if (f.venueId) parts.push(eq(event.venueId, f.venueId));
  const tokens = f.q ? tokenize(f.q) : [];
  if (tokens.length > 0) parts.push(searchWhere(tokens, f.qMode ?? "words"));
  return and(...parts) as SQL;
}

/**
 * How a search matches events, the same rules as the command palette (`server/search-core.ts`), so
 * "Alle 26 anzeigen" there and the list here count the same Termine (UX-066):
 * - `wordStarts`: every word starts a word of name, city, Ort or date ("bonn" finds Bonn, not "Abonnent");
 * - `words`: every word appears somewhere (when nothing starts a word);
 * - `typos`: as `words`, but a word of four letters or more may also be a typo ("Nipes" finds Nippes).
 */
export type EventSearchMode = "wordStarts" | "words" | "typos";

/** Folds umlauts and accents like the palette: "koln" finds Köln. */
function fold(column: SQL): SQL {
  return sql`translate(lower(${column}), 'äöüßéèêáàâóòôíìîúùûç', 'aousseeeaaaoooiiiuuuc')`;
}

function searchWhere(tokens: string[], mode: EventSearchMode): SQL {
  const haystack = fold(
    sql`concat_ws(' ', ${event.name}, ${venue.city}, ${venue.name}, to_char(${event.startsOn}, 'DD.MM.YYYY'))`,
  );
  const has = (t: string) => sql`${haystack} like ${`%${escapeLike(t)}%`}`;
  if (mode === "wordStarts")
    return and(
      ...tokens.map((t) => sql`${haystack} ~ ${`(^|[^[:alnum:]])${escapeRegex(t)}`}`),
    ) as SQL;
  if (mode === "words") return and(...tokens.map(has)) as SQL;
  // As typed (1), two neighbouring letters swapped at a word start (0.9), else the trigram similarity.
  const close = (t: string) => {
    const swaps = transpositions(t).map(escapeRegex);
    const swapped =
      swaps.length > 0 ? sql`${haystack} ~ ${`(^|[^[:alnum:]])(${swaps.join("|")})`}` : sql`false`;
    return sql`(case when ${has(t)} then 1 when ${swapped} then 0.9
      else app.word_similarity(${t}, ${haystack}) end) >= ${FUZZY_THRESHOLD}`;
  };
  return and(...tokens.map((t) => (typoTolerant(t) ? close(t) : has(t)))) as SQL;
}

/**
 * Which `EventSearchMode` a query uses, decided over every event the actor may see (like the palette):
 * word starts when any event has them; otherwise typos when a word is long enough for one; else words.
 */
export async function eventSearchMode(actor: Actor, q: string): Promise<EventSearchMode> {
  const tokens = tokenize(q);
  if (tokens.length === 0) return "words";
  const [hit] = await db
    .select({ id: event.id })
    .from(event)
    .innerJoin(venue, eq(venue.id, event.venueId))
    .where(and(visibleEvents(actor), searchWhere(tokens, "wordStarts")))
    .limit(1);
  if (hit) return "wordStarts";
  return tokens.some(typoTolerant) ? "typos" : "words";
}

/** How many events match the filters (no health, no rows): the list's "N abgesagt" and "Auch passend" hints. */
export async function countEvents(actor: Actor, filters: EventFilters): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(event)
    .innerJoin(eventType, eq(eventType.id, event.eventTypeId))
    .innerJoin(venue, eq(venue.id, event.venueId))
    .where(where(actor, filters));
  return row?.n ?? 0;
}

export type EventRow = Awaited<ReturnType<typeof listEvents>>[number];

/** Events list with type, venue and the health dimensions known so far. */
export async function listEvents(actor: Actor, filters: EventFilters) {
  const required = await dutyRoleCount();
  const rows = await db
    .select({
      id: event.id,
      name: event.name,
      startsOn: event.startsOn,
      endsOn: event.endsOn,
      status: event.status,
      season: event.season,
      eventTypeId: event.eventTypeId,
      typeKey: eventType.key,
      typeNameDe: eventType.nameDe,
      typeNameEn: eventType.nameEn,
      /** Market colour of the event's preset (`MARKET_COLORS` key), null = use the type marker. */
      color: eventPreset.color,
      /** The event's market; its Kürzel comes from `getMarketShortCodes`. */
      presetId: event.presetId,
      venueId: venue.id,
      venueName: venue.name,
      city: venue.city,
      /** The Zeitplan (ADR 0022); the Kalender shows its summary. */
      schedule: event.schedule,
      duties: sql<number>`(select count(*)::int from ${eventDuty} where ${eventDuty.eventId} = ${event.id})`,
    })
    .from(event)
    .innerJoin(eventType, eq(eventType.id, event.eventTypeId))
    .innerJoin(venue, eq(venue.id, event.venueId))
    .leftJoin(eventPreset, eq(eventPreset.id, event.presetId))
    .where(where(actor, filters))
    .orderBy(asc(event.startsOn), asc(event.name));
  const dims = await dimensionHealth(actor, rows, todayIn());
  return rows.map((r) => ({
    ...r,
    health: healthOf(r.status, r.duties, required, dims.get(r.id)),
    reasons: reasonsOf(r.status, dims.get(r.id)),
    /** Open and overdue tasks the actor can see (the Kalender popover's "Checkliste" counts). */
    taskCounts: dims.get(r.id)?.taskCounts ?? NO_TASKS,
  }));
}

type Dimensions = {
  permits: HealthLevel | null;
  tasks: HealthLevel | null;
  money: HealthLevel | null;
  /** What the levels are made of, for "1 Genehmigung fehlt" / "5 überfällig" instead of "Achtung". */
  counts: HealthCounts;
  /** Plain task numbers, also for finished events (the health counts drop them). */
  taskCounts: TaskCounts;
};

/** Open tasks of an event and how many of them are overdue. */
export type TaskCounts = { open: number; overdue: number };

const NO_TASKS: TaskCounts = { open: 0, overdue: 0 };

/** The numbers behind the permit and task health levels of one event. */
export type HealthCounts = {
  permitsMissing: number;
  tasksOverdue: number;
  tasksBlocked: number;
};

const NO_COUNTS: HealthCounts = { permitsMissing: 0, tasksOverdue: 0, tasksBlocked: 0 };

/** Counts of an event that is still running; finished and cancelled events carry none. */
function reasonsOf(status: EventStatusKey, dims?: Dimensions): HealthCounts {
  const past = status === "completed" || status === "closed" || status === "cancelled";
  return past || !dims ? NO_COUNTS : dims.counts;
}

/**
 * Permits, tasks and money health of many events: one query per dimension for all of them (never per
 * event). Tasks and money honour the actor's scope (no `finance:read` = no money dimension).
 */
async function dimensionHealth(
  actor: Actor,
  events: { id: string; startsOn: string; endsOn: string }[],
  today: string,
): Promise<Map<string, Dimensions>> {
  const ids = events.map((e) => e.id);
  const [permits, tasks, money] = await Promise.all([
    permitSummaryByEvent(events, today),
    taskSummaryByEvent(actor, ids, today),
    eventMoneyHealthFor(actor, ids, today),
  ]);
  return new Map(
    ids.map((id) => [
      id,
      {
        permits: permits.get(id)?.health ?? null,
        tasks: tasks.get(id)?.health ?? null,
        money: money.get(id) ?? null,
        counts: {
          permitsMissing: permits.get(id)?.missing ?? 0,
          tasksOverdue: tasks.get(id)?.overdue ?? 0,
          tasksBlocked: tasks.get(id)?.blocked ?? 0,
        },
        taskCounts: {
          open: tasks.get(id)?.open ?? 0,
          overdue: tasks.get(id)?.overdue ?? 0,
        },
      },
    ]),
  );
}

/**
 * The four health dimensions of one event. Finished and cancelled events carry no permits/tasks/team
 * signal any more; the money dimension stays for finished ones (rates can still be open) and goes for
 * cancelled ones.
 */
function healthOf(
  status: EventStatusKey,
  duties: number,
  required: number,
  dims: Dimensions = {
    permits: null,
    tasks: null,
    money: null,
    counts: NO_COUNTS,
    taskCounts: NO_TASKS,
  },
): HealthDimensions {
  const past = status === "completed" || status === "closed" || status === "cancelled";
  return {
    permits: past ? null : dims.permits,
    tasks: past ? null : dims.tasks,
    team: past ? null : teamHealth(duties, required),
    money: status === "cancelled" ? null : dims.money,
  };
}

export async function listEventTypes() {
  return db
    .select({
      id: eventType.id,
      key: eventType.key,
      nameDe: eventType.nameDe,
      nameEn: eventType.nameEn,
    })
    .from(eventType)
    .orderBy(asc(eventType.sort));
}

/** Seasons that have events, newest first. */
export async function listSeasons(actor: Actor): Promise<number[]> {
  const rows = await db
    .selectDistinct({ season: event.season })
    .from(event)
    .where(visibleEvents(actor))
    .orderBy(sql`${event.season} desc`);
  return rows.map((r) => r.season);
}

/** One event with everything the header and the Überblick tab need. Null if not visible. */
export const getEvent = cache(async (actor: Actor, id: string) => {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  // Not `db.query.event.findFirst`: the relational API aliases the table as "event", and the
  // `exists (…)` of visibleEvents() for field users references "app"."event", which then fails to resolve.
  const [found] = await db
    .select()
    .from(event)
    .where(and(eq(event.id, id), visibleEvents(actor)))
    .limit(1);
  if (!found) return null;
  const [type, place, anchors, duties, preset, required] = await Promise.all([
    db.query.eventType.findFirst({ where: (t, { eq }) => eq(t.id, found.eventTypeId) }),
    db.query.venue.findFirst({ where: (v, { eq }) => eq(v.id, found.venueId) }),
    db.query.eventAnchor.findMany({
      where: (a, { eq }) => eq(a.eventId, id),
      orderBy: (a, { asc }) => asc(a.date),
    }),
    db
      .select({
        roleId: dutyRole.id,
        roleKey: dutyRole.key,
        roleDe: dutyRole.nameDe,
        roleEn: dutyRole.nameEn,
        staffMemberId: staffMember.id,
        staffName: staffMember.displayName,
      })
      .from(dutyRole)
      .leftJoin(eventDuty, and(eq(eventDuty.dutyRoleId, dutyRole.id), eq(eventDuty.eventId, id)))
      .leftJoin(staffMember, eq(staffMember.id, eventDuty.staffMemberId))
      .orderBy(asc(dutyRole.sort)),
    found.presetId
      ? db.query.eventPreset.findFirst({ where: (p, { eq }) => eq(p.id, found.presetId as string) })
      : null,
    dutyRoleCount(),
  ]);
  if (!type || !place) return null;
  const assigned = duties.filter((d) => d.staffMemberId).length;
  const dimensions = (
    await dimensionHealth(
      actor,
      [{ id, startsOn: found.startsOn, endsOn: found.endsOn }],
      todayIn(),
    )
  ).get(id);
  return {
    ...found,
    type,
    venue: place,
    anchors,
    duties,
    preset: preset ?? null,
    health: healthOf(found.status, assigned, required, dimensions),
    reasons: reasonsOf(found.status, dimensions),
  };
});

export type EventDetail = NonNullable<Awaited<ReturnType<typeof getEvent>>>;

/**
 * What "Als Vorlage speichern" (Archiv) copies from a past event into the new-market form: name, type, venue,
 * length, Zeitplan and prices. Null when the event is gone or not visible to the person.
 */
export async function getPresetSource(actor: Actor, id: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return null;
  const [row] = await db
    .select({
      id: event.id,
      name: event.name,
      eventTypeId: event.eventTypeId,
      venueId: event.venueId,
      startsOn: event.startsOn,
      endsOn: event.endsOn,
      schedule: event.schedule,
      pricePerMCents: event.pricePerMCents,
      bookingFeeCents: event.bookingFeeCents,
    })
    .from(event)
    .where(and(eq(event.id, id), visibleEvents(actor)));
  return row ?? null;
}

export type PresetSource = NonNullable<Awaited<ReturnType<typeof getPresetSource>>>;

/**
 * How many rows `listEvents` returns for these filters, without loading them: the command palette says how
 * many events its "anzeigen" link really opens on the list page.
 */
export async function countEvents(actor: Actor, filters: EventFilters): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(event)
    .innerJoin(eventType, eq(eventType.id, event.eventTypeId))
    .innerJoin(venue, eq(venue.id, event.venueId))
    .where(where(actor, filters));
  return row?.n ?? 0;
}
