import "server-only";
import {
  can,
  formatPhone,
  OPEN_STATUSES,
  type PermitDisplayState,
  permitDisplayState,
  type TaskStatusKey,
  taskLink,
} from "@marktwerk/core";
import {
  contact,
  event,
  eventPreset,
  eventType,
  payable,
  permit,
  staffMember,
  task,
  vehicle,
  vendor,
  venue,
} from "@marktwerk/db/schema";
import { and, asc, eq, inArray, isNull, ne, or, type SQL, type SQLWrapper, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { formatDateShortYear, formatWeek, todayIn } from "@/lib/format";
import {
  escapeLike,
  escapeRegex,
  FUZZY_THRESHOLD,
  formatIsoDates,
  phoneDigits,
  tokenize,
  transpositions,
  typoTolerant,
} from "@/lib/search-query";
import type { EventStatus } from "@/lib/status";
import { type Actor, visibleEvents } from "./actor";
import { db } from "./db";
import { listContacts } from "./queries/contacts";
import type { TaskSeason } from "./queries/due";
import { countEvents } from "./queries/events";
import { seasonContext, toTaskSeason } from "./queries/season-context";
import { listVendors } from "./queries/vendors";
import { listVenues } from "./queries/venues";
import { visibleTasks } from "./task-scope";

export type SearchHit = {
  kind:
    | "event"
    | "task"
    | "permit"
    | "payable"
    | "vehicle"
    | "venue"
    | "contact"
    | "staff"
    | "vendor"
    | "action";
  title: string;
  subtitle?: string;
  /** A season task's market and season: the palette adds "<Markt> · Saison <Jahr>" to the subtitle. */
  season?: TaskSeason;
  /** A permit's season (year): the palette adds "Saison <Jahr>", so the same permit of two years differs. */
  seasonYear?: number;
  /** The record's state, shown as a badge (colour + icon + text) next to the hit. */
  status?: SearchStatus;
  href: string;
  /**
   * How well the hit matches, 0 (best) to 3 (see `scoreMatch`), 4 = only found as a typo; groups are ranked
   * by their best hit.
   */
  score?: number;
  /** Extra words that find this (action) hit, e.g. "Händler" for the Aussteller list. */
  keywords?: string[];
};

export type SearchStatus =
  | { kind: "event"; key: EventStatus }
  | { kind: "task"; key: TaskStatusKey }
  | { kind: "permit"; key: PermitDisplayState };

/**
 * One kind's group: how many records match in total (the hits are only the first few), the list page with
 * the same query (`href`), how many rows that page shows (`listed`; missing = not counted) and whether it
 * shows only current and upcoming events (`upcoming`).
 */
export type SearchGroup = { total: number; href?: string; listed?: number; upcoming?: boolean };

/** A list offered when nothing matches. */
export type SearchFallback = {
  kind: "event" | "venue" | "contact" | "vendor" | "archive";
  href: string;
};

export type SearchResult = {
  hits: SearchHit[];
  groups: Partial<Record<SearchHit["kind"], SearchGroup>>;
  /** Only when nothing matches: the lists the person may open to look further. */
  fallbacks?: SearchFallback[];
};

/**
 * SQL twin of `foldText` (`lib/search-query.ts`): umlauts and accents lose their marks, the ASCII spellings
 * fold the same way and ß/ss become one s, so "koln", "koeln" and "Köln" all find "Köln" and "strasse" finds
 * "Straße". List pages that search like the palette use this on their columns and `foldText` on the query.
 */
export function foldSql(column: SQL | unknown): SQL {
  return sql`replace(regexp_replace(translate(lower(${column}), 'äöüßéèêáàâóòôíìîúùûç', 'aousseeeaaaoooiiiuuuc'), '([aou])e', '\\1', 'g'), 'ss', 's')`;
}

const fold = foldSql;

const LIMIT = 6;

/** Words that also find the vendors ("Händler", "Beschicker" are what the old tools call Aussteller). */
const VENDOR_ALIASES = "aussteller beschicker handler haendler";

/** Longest query the list pages take from `?q=` (they cut it there, so the count does too). */
const LIST_QUERY_MAX = 100;

/**
 * Where the full list of a kind lives (these pages understand `?q=`) and how many rows that page shows for
 * the query, counted by the page's own query so "Alle N anzeigen" never promises more than the list holds.
 * `upcoming`: the list leaves out past and cancelled events by default.
 */
const LIST_PAGES: Partial<
  Record<
    SearchHit["kind"],
    { path: string; count?: (actor: Actor, q: string) => Promise<number>; upcoming?: boolean }
  >
> = {
  event: {
    path: "/veranstaltungen",
    count: (actor, q) => countEvents(actor, { status: "active", from: todayIn(), q }),
    upcoming: true,
  },
  contact: { path: "/kontakte", count: async (_, q) => (await listContacts(q)).total },
  vendor: { path: "/aussteller", count: async (_, q) => (await listVendors({ q }, 1)).total },
  venue: {
    path: "/orte",
    count: async (actor, q) => (await listVenues(actor, todayIn(), q)).length,
  },
  payable: { path: "/finanzen" },
};

/** The lists offered when nothing matches (with the permission their page asks for). */
const FALLBACK_LISTS: { kind: SearchFallback["kind"]; href: string; can: (a: Actor) => boolean }[] =
  [
    { kind: "event", href: "/veranstaltungen", can: (a) => can(a.role, "event", "read") },
    { kind: "venue", href: "/orte", can: (a) => can(a.role, "venue", "read") },
    { kind: "contact", href: "/kontakte", can: (a) => can(a.role, "contact", "read") },
    { kind: "vendor", href: "/aussteller", can: (a) => can(a.role, "vendor", "read") },
    { kind: "archive", href: "/archiv", can: (a) => can(a.role, "event", "read") },
  ];

/**
 * Where a task hit opens: an event's task in the event's Checkliste drawer (as everywhere), a task without an
 * event (season and standalone tasks) in the drawer on the Übersicht, not on the hidden global Board.
 */
function searchTaskLink(taskId: string, eventId: string | null): string {
  return eventId ? taskLink(taskId, eventId) : `/?aufgabe=${taskId}`;
}

/** Lower is better: 0 to 3 as in `scoreMatch`, 4 = only found as a typo (see `matcher`). */
const TYPO_SCORE = 4;

/**
 * The SQL of one group: every word of the query must appear (anywhere in title or secondary fields,
 * umlaut-folded); `score` ranks word-start matches above matches inside words ("bonn" in "Abonnent").
 * `phone` lets a typed phone number match the stored E.164 number as well.
 *
 * With `fuzzy`, a word of four letters or more (`typoTolerant`) may also be a typo: two neighbouring letters
 * swapped at a word start ("bnon" -> "Bonn") or a pg_trgm `word_similarity` of at least `FUZZY_THRESHOLD`
 * ("flomarkt" -> "Flohmarkt"). Rows that need a typo score 4, below every literal match, and rank by how
 * close they are.
 */
function matcher(
  tokens: string[],
  primary: SQLWrapper,
  extras: SQLWrapper[] = [],
  phone?: { column: SQLWrapper; digits: string | null },
  fuzzy = false,
) {
  const title = fold(primary);
  const haystack = fold(sql`concat_ws(' ', ${sql.join([primary, ...extras], sql`, `)})`);
  const startsWord = (text: SQL) =>
    and(...tokens.map((t) => sql`${text} ~ ${`(^|[^[:alnum:]])${escapeRegex(t)}`}`)) as SQL;
  const has = (t: string) => sql`${haystack} like ${`%${escapeLike(t)}%`}`;
  const contains = and(...tokens.map(has)) as SQL;
  const byPhone =
    phone?.digits != null
      ? sql`regexp_replace(${phone.column}, '[^0-9]', '', 'g') like ${`%${phone.digits}%`}`
      : null;
  const ranked = sql`case
    when ${title} like ${`${escapeLike(tokens.join(" "))}%`} then 0
    when ${startsWord(title)} then 1
    when ${startsWord(haystack)} then 2
    else 3 end`;
  // How close a word comes to the record: 1 as typed, 0.9 with two letters swapped, else the trigram
  // similarity. Evaluated in this order, so pg_trgm only runs for rows the cheaper checks miss.
  const closeness = (t: string) => {
    const swaps = transpositions(t).map(escapeRegex);
    const swapped =
      swaps.length > 0 ? sql`${haystack} ~ ${`(^|[^[:alnum:]])(${swaps.join("|")})`}` : sql`false`;
    return sql`case when ${has(t)} then 1 when ${swapped} then 0.9
      else app.word_similarity(${t}, ${haystack}) end`;
  };
  const typoWords = fuzzy ? tokens.filter(typoTolerant) : [];
  const typos = typoWords.length > 0;
  const words = typos
    ? (and(
        ...tokens.map((t) =>
          typoTolerant(t) ? sql`${closeness(t)} >= ${FUZZY_THRESHOLD}` : has(t),
        ),
      ) as SQL)
    : contains;
  const base = typos ? sql`case when ${contains} then ${ranked} else ${TYPO_SCORE} end` : ranked;
  const scoreExpr = byPhone
    ? sql`case when ${byPhone} then least(${base}, 2) else ${base} end`
    : base;
  return {
    where: (byPhone ? or(words, byPhone) : words) as SQL,
    score: sql`${scoreExpr}`.mapWith(Number).as("score"),
    /**
     * For `order by`: the score, then (typos only) the closest first and, among equally close ones, those
     * whose title comes closest (the other fields, e.g. an event's type, are the same for many rows).
     */
    rank: typos
      ? [
          scoreExpr,
          sql`${sql.join(typoWords.map(closeness), sql` + `)} desc`,
          sql`${sql.join(
            typoWords.map((t) => sql`app.word_similarity(${t}, ${title})`),
            sql` + `,
          )} desc`,
        ]
      : [scoreExpr],
    // All matches, those that are not just a fragment inside a word, and those found only as a typo.
    total: sql`count(*) over ()`.mapWith(Number).as("total"),
    strong: sql`count(*) filter (where ${scoreExpr} < 3) over ()`.mapWith(Number).as("strong"),
    typos: (typos ? sql`count(*) filter (where ${scoreExpr} = ${TYPO_SCORE}) over ()` : sql`0`)
      .mapWith(Number)
      .as("typos"),
  };
}

type Found = { kind: SearchHit["kind"]; total: number; weak: boolean; typos: boolean };

type Counted = { score: number; total: number; strong: number; typos: number };

/**
 * When some rows match at the start of words, matches inside words ("bonn" in "Abonnent:innen") are
 * left out of the hits and the total. A group with nothing but such fragments is `weak`: it only
 * shows when no other group has a better match (see the end of `searchAs`), and so does a group found
 * with typos (`typos`: the list pages don't allow for typos, so such a group gets no "show all" link).
 */
function settle<T extends Counted>(
  rows: T[],
): { rows: T[]; total: number; weak: boolean; typos: boolean } {
  const strong = rows[0]?.strong ?? 0;
  if (strong > 0)
    return { rows: rows.filter((r) => r.score < 3), total: strong, weak: false, typos: false };
  return {
    rows,
    total: rows[0]?.total ?? 0,
    weak: rows.length > 0,
    typos: (rows[0]?.typos ?? 0) > 0,
  };
}

/**
 * Command palette search for an actor. Every group respects the same permissions and scopes as its page.
 * Kept apart from the server action (`./search`) so tests and other server code can pass an actor.
 */
export async function searchAs(
  actor: Actor,
  locale: string,
  query: string,
  /** Hit kinds to leave out (modules hidden in the UI, see `lib/modules.ts`). */
  exclude: readonly SearchHit["kind"][] = [],
): Promise<SearchResult> {
  const trimmed = query.trim();
  const tokens = tokenize(trimmed);
  if (trimmed.length < 2 || tokens.length === 0) return { hits: [], groups: {} };
  const digits = phoneDigits(trimmed);
  // Literal matches first; only when none of them starts a word anywhere, look again allowing typos.
  const collect = async (fuzzy: boolean) => {
    const hits: SearchHit[] = [];
    const found: Found[] = [];
    const record = (kind: SearchHit["kind"], total: number, weak: boolean, typos: boolean) => {
      if (total > 0) found.push({ kind, total, weak, typos });
    };
    const match = (
      primary: SQLWrapper,
      extras?: SQLWrapper[],
      phone?: { column: SQLWrapper; digits: string | null },
    ) => matcher(tokens, primary, extras, phone, fuzzy);

    if (can(actor.role, "event", "read")) {
      // The market's name and the kind of event count too: "flohmarkt" finds the flea markets whose
      // Termine are only called after the place ("Altstadt").
      const m = match(event.name, [
        venue.city,
        venue.name,
        sql`to_char(${event.startsOn}, 'DD.MM.YYYY')`,
        eventPreset.name,
        eventType.nameDe,
        eventType.nameEn,
      ]);
      const result = await db
        .select({
          id: event.id,
          name: event.name,
          startsOn: event.startsOn,
          status: event.status,
          city: venue.city,
          score: m.score,
          total: m.total,
          strong: m.strong,
          typos: m.typos,
        })
        .from(event)
        .innerJoin(venue, sql`${venue.id} = ${event.venueId}`)
        .innerJoin(eventType, eq(eventType.id, event.eventTypeId))
        .leftJoin(eventPreset, eq(eventPreset.id, event.presetId))
        .where(and(visibleEvents(actor), m.where))
        // Best match first; then upcoming, then the most recent past ones.
        .orderBy(
          ...m.rank,
          sql`${event.startsOn} < current_date`,
          sql`abs(${event.startsOn} - current_date)`,
        )
        .limit(LIMIT);
      const { rows, total, weak, typos } = settle(result);
      record("event", total, weak, typos);
      for (const r of rows) {
        hits.push({
          kind: "event",
          title: r.name,
          // The year only when it is not the running one: 2026 and 2027 dates of one market look alike.
          subtitle: `${r.city} · ${formatDateShortYear(r.startsOn, locale)} · ${formatWeek(r.startsOn, locale)}`,
          status: { kind: "event", key: r.status },
          href: `/veranstaltungen/${r.id}`,
          score: r.score,
        });
      }
    }
    if (can(actor.role, "task", "read")) {
      // Same row scope as the board: field users only find tasks of their events (and their own).
      // With several words the event's name counts ("halteverbot bonn"); one word only looks at the title,
      // or "bonn" would list every task of every Bonn market. A season task counts its market and year instead.
      const sc = seasonContext();
      const m = match(
        task.title,
        tokens.length > 1 ? [event.name, sc.seasonName, sql`${sc.seasonYear}::text`] : [],
      );
      // Subtasks are found too (ADR 0021); their parent's title tells where they sit.
      const parentTask = alias(task, "parent_task");
      const result = await db
        .select({
          id: task.id,
          title: task.title,
          eventId: task.eventId,
          status: task.status,
          parentTitle: parentTask.title,
          eventName: event.name,
          eventStartsOn: event.startsOn,
          seasonId: sc.seasonId,
          seasonYear: sc.seasonYear,
          seasonPresetId: sc.seasonPresetId,
          seasonName: sc.seasonName,
          score: m.score,
          total: m.total,
          strong: m.strong,
          typos: m.typos,
        })
        .from(task)
        .leftJoin(event, sql`${event.id} = ${task.eventId}`)
        .leftJoin(sc, eq(sc.seasonId, task.seasonId))
        .leftJoin(parentTask, eq(parentTask.id, task.parentTaskId))
        // A deleted task (status `cancelled`) is gone from every list; "Wiederherstellen" lives in the Verlauf.
        .where(and(visibleTasks(actor), ne(task.status, "cancelled"), m.where))
        // Best match first; then open tasks, then the most recently finished ones.
        .orderBy(
          ...m.rank,
          sql`${inArray(task.status, [...OPEN_STATUSES])} desc`,
          asc(task.dueAt),
          asc(task.title),
        )
        .limit(LIMIT);
      const { rows, total, weak, typos } = settle(result);
      record("task", total, weak, typos);
      for (const r of rows) {
        const season = toTaskSeason(actor, r);
        hits.push({
          kind: "task",
          title: r.title,
          ...(season ? { season } : {}),
          // The same task title exists once per event: name and date tell them apart.
          subtitle:
            [
              r.parentTitle,
              r.eventName
                ? `${r.eventName}${r.eventStartsOn ? ` · ${formatDateShortYear(r.eventStartsOn, locale)}` : ""}`
                : null,
            ]
              .filter(Boolean)
              .join(" › ") || undefined,
          status: { kind: "task", key: r.status },
          href: searchTaskLink(r.id, r.eventId),
          score: r.score,
        });
      }
    }
    if (can(actor.role, "permit", "read")) {
      const m = match(permit.title, [venue.name, sql`${permit.season}::text`]);
      const result = await db
        .select({
          id: permit.id,
          title: permit.title,
          venueName: venue.name,
          season: permit.season,
          status: permit.status,
          validUntil: permit.validUntil,
          score: m.score,
          total: m.total,
          strong: m.strong,
          typos: m.typos,
        })
        .from(permit)
        .leftJoin(venue, sql`${venue.id} = ${permit.venueId}`)
        .where(and(isNull(permit.archivedAt), m.where))
        // Same title in several seasons: the newest season first.
        .orderBy(...m.rank, asc(permit.title), sql`${permit.season} desc nulls last`)
        .limit(LIMIT);
      const { rows, total, weak, typos } = settle(result);
      record("permit", total, weak, typos);
      const today = todayIn();
      for (const r of rows) {
        hits.push({
          kind: "permit",
          // Permit titles carry the date as written by the generator ("… – 2026-04-18").
          title: formatIsoDates(r.title, locale),
          subtitle: r.venueName ?? undefined,
          ...(r.season != null ? { seasonYear: r.season } : {}),
          status: { kind: "permit", key: permitDisplayState(r, today) },
          href: `/genehmigungen?genehmigung=${r.id}`,
          score: r.score,
        });
      }
    }
    if (can(actor.role, "finance", "read") && !exclude.includes("payable")) {
      const m = match(payable.title, [contact.name]);
      const result = await db
        .select({
          id: payable.id,
          title: payable.title,
          counterparty: contact.name,
          score: m.score,
          total: m.total,
          strong: m.strong,
          typos: m.typos,
        })
        .from(payable)
        .leftJoin(contact, sql`${contact.id} = ${payable.counterpartyContactId}`)
        .where(and(isNull(payable.archivedAt), m.where))
        .orderBy(...m.rank, asc(payable.title))
        .limit(LIMIT);
      const { rows, total, weak, typos } = settle(result);
      record("payable", total, weak, typos);
      for (const r of rows) {
        hits.push({
          kind: "payable",
          title: r.title,
          subtitle: r.counterparty ?? undefined,
          href: `/finanzen/posten/${r.id}`,
          score: r.score,
        });
      }
    }
    if (can(actor.role, "company", "read")) {
      const m = match(vehicle.name, [vehicle.plate]);
      const result = await db
        .select({
          id: vehicle.id,
          name: vehicle.name,
          plate: vehicle.plate,
          score: m.score,
          total: m.total,
          strong: m.strong,
          typos: m.typos,
        })
        .from(vehicle)
        .where(and(isNull(vehicle.archivedAt), m.where))
        .orderBy(...m.rank, asc(vehicle.name))
        .limit(LIMIT);
      const { rows, total, weak, typos } = settle(result);
      record("vehicle", total, weak, typos);
      for (const r of rows) {
        hits.push({
          kind: "vehicle",
          title: r.name,
          subtitle: r.plate,
          href: `/firma/fahrzeuge/${r.id}`,
          score: r.score,
        });
      }
    }
    if (can(actor.role, "venue", "read")) {
      const m = match(venue.name, [venue.city, venue.street]);
      const result = await db
        .select({
          id: venue.id,
          name: venue.name,
          city: venue.city,
          score: m.score,
          total: m.total,
          strong: m.strong,
          typos: m.typos,
        })
        .from(venue)
        .where(and(isNull(venue.archivedAt), m.where))
        .orderBy(...m.rank, asc(venue.name))
        .limit(LIMIT);
      const { rows, total, weak, typos } = settle(result);
      record("venue", total, weak, typos);
      for (const r of rows)
        hits.push({
          kind: "venue",
          title: r.name,
          subtitle: r.city,
          href: `/orte/${r.id}`,
          score: r.score,
        });
    }
    if (can(actor.role, "event", "read") && actor.role !== "field" && !exclude.includes("staff")) {
      const m = match(staffMember.displayName);
      const result = await db
        .select({
          id: staffMember.id,
          name: staffMember.displayName,
          score: m.score,
          total: m.total,
          strong: m.strong,
          typos: m.typos,
        })
        .from(staffMember)
        .where(and(isNull(staffMember.archivedAt), m.where))
        .orderBy(...m.rank, asc(staffMember.displayName))
        .limit(LIMIT);
      const { rows, total, weak, typos } = settle(result);
      record("staff", total, weak, typos);
      for (const r of rows)
        hits.push({ kind: "staff", title: r.name, href: `/team?person=${r.id}`, score: r.score });
    }
    if (can(actor.role, "contact", "read")) {
      // Name, contact person, city, e-mail and phone number (typed with or without country code).
      const m = match(contact.name, [contact.contactPerson, contact.city, contact.email], {
        column: contact.phoneE164,
        digits,
      });
      const result = await db
        .select({
          id: contact.id,
          name: contact.name,
          city: contact.city,
          email: contact.email,
          phone: contact.phoneE164,
          score: m.score,
          total: m.total,
          strong: m.strong,
          typos: m.typos,
        })
        .from(contact)
        .where(and(isNull(contact.archivedAt), m.where))
        .orderBy(...m.rank, asc(contact.name))
        .limit(LIMIT);
      const { rows, total, weak, typos } = settle(result);
      record("contact", total, weak, typos);
      for (const r of rows) {
        const subtitle = [r.city, r.phone ? formatPhone(r.phone) : r.email]
          .filter((part): part is string => Boolean(part))
          .join(" · ");
        hits.push({
          kind: "contact",
          title: r.name,
          subtitle: subtitle || undefined,
          href: `/kontakte?vorschau=${r.id}`,
          score: r.score,
        });
      }
    }
    if (can(actor.role, "vendor", "read")) {
      const m = match(
        vendor.displayName,
        [vendor.city, vendor.email, sql.raw(`'${VENDOR_ALIASES}'`)],
        { column: vendor.phoneE164, digits },
      );
      const result = await db
        .select({
          id: vendor.id,
          name: vendor.displayName,
          city: vendor.city,
          phone: vendor.phoneE164,
          score: m.score,
          total: m.total,
          strong: m.strong,
          typos: m.typos,
        })
        .from(vendor)
        .where(m.where)
        .orderBy(...m.rank, asc(vendor.displayName))
        .limit(LIMIT);
      const { rows, total, weak, typos } = settle(result);
      record("vendor", total, weak, typos);
      for (const r of rows) {
        const subtitle = [r.city, r.phone ? formatPhone(r.phone) : null]
          .filter((part): part is string => Boolean(part))
          .join(" · ");
        hits.push({
          kind: "vendor",
          title: r.name,
          subtitle: subtitle || undefined,
          href: `/aussteller?vorschau=${r.id}`,
          score: r.score,
        });
      }
    }
    return { hits, found };
  };
  let { hits, found } = await collect(false);
  if (!found.some((f) => !f.weak) && tokens.some(typoTolerant))
    ({ hits, found } = await collect(true));
  // Fragments inside words ("zz" in "Polizzi") only count when nothing matches better anywhere.
  const anyStrong = found.some((f) => !f.weak);
  const shown = found.filter((f) => !anyStrong || !f.weak);
  const groups: SearchResult["groups"] = {};
  const listQuery = trimmed.slice(0, LIST_QUERY_MAX);
  await Promise.all(
    shown.map(async (f) => {
      const list = f.typos ? undefined : LIST_PAGES[f.kind];
      const group: SearchGroup = { total: f.total };
      groups[f.kind] = group;
      if (!list) return;
      group.href = `${list.path}?q=${encodeURIComponent(listQuery)}`;
      if (list.upcoming) group.upcoming = true;
      // Only counted when the palette shows fewer hits than match, i.e. when it offers the link.
      if (list.count && f.total > LIMIT) group.listed = await list.count(actor, listQuery);
    }),
  );
  const visible = hits.filter((h) => groups[h.kind]);
  if (visible.length > 0) return { hits: visible, groups };
  return { hits: [], groups, fallbacks: fallbacksFor(actor) };
}

/** The lists the person may open when nothing matches. */
function fallbacksFor(actor: Actor): SearchFallback[] {
  return FALLBACK_LISTS.filter((l) => l.can(actor)).map(({ kind, href }) => ({ kind, href }));
}
