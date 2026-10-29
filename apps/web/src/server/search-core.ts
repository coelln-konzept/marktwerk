import "server-only";
import { can, formatPhone, OPEN_STATUSES, taskLink } from "@marktwerk/core";
import {
  contact,
  event,
  payable,
  permit,
  staffMember,
  task,
  vehicle,
  vendor,
  venue,
} from "@marktwerk/db/schema";
import { and, asc, inArray, isNull, or, type SQL, type SQLWrapper, sql } from "drizzle-orm";
import { formatDateShortYear, formatWeek } from "@/lib/format";
import { escapeLike, escapeRegex, formatIsoDates, phoneDigits, tokenize } from "@/lib/search-query";
import { type Actor, visibleEvents } from "./actor";
import { db } from "./db";
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
  href: string;
  /** How well the hit matches, 0 (best) to 3, see `scoreMatch`; groups are ranked by their best hit. */
  score?: number;
  /** Extra words that find this (action) hit, e.g. "Händler" for the Aussteller list. */
  keywords?: string[];
};

/** Per kind of record: how many records match in total (the hits are only the first few) and the list page that shows them all. */
export type SearchResult = {
  hits: SearchHit[];
  groups: Partial<Record<SearchHit["kind"], { total: number; href?: string }>>;
};

/** Folds umlauts and accents so "koln" finds "Köln" and "muller" finds "Müller". */
function fold(column: SQL | unknown): SQL {
  return sql`translate(lower(${column}), 'äöüßéèêáàâóòôíìîúùûç', 'aousseeeaaaoooiiiuuuc')`;
}

const LIMIT = 6;

/** Words that also find the vendors ("Händler", "Beschicker" are what the old tools call Aussteller). */
const VENDOR_ALIASES = "aussteller beschicker handler haendler";

/** Where the full list of a kind lives (these pages understand `?q=`). */
const LIST_PAGES: Partial<Record<SearchHit["kind"], string>> = {
  event: "/veranstaltungen",
  contact: "/kontakte",
  vendor: "/aussteller",
  venue: "/orte",
  payable: "/finanzen",
};

/**
 * The SQL of one group: every word of the query must appear (anywhere in title or secondary fields,
 * umlaut-folded); `score` ranks word-start matches above matches inside words ("bonn" in "Abonnent").
 * `phone` lets a typed phone number match the stored E.164 number as well.
 */
function matcher(
  tokens: string[],
  primary: SQLWrapper,
  extras: SQLWrapper[] = [],
  phone?: { column: SQLWrapper; digits: string | null },
) {
  const title = fold(primary);
  const haystack = fold(sql`concat_ws(' ', ${sql.join([primary, ...extras], sql`, `)})`);
  const startsWord = (text: SQL) =>
    and(...tokens.map((t) => sql`${text} ~ ${`(^|[^[:alnum:]])${escapeRegex(t)}`}`)) as SQL;
  const contains = and(...tokens.map((t) => sql`${haystack} like ${`%${escapeLike(t)}%`}`)) as SQL;
  const byPhone =
    phone?.digits != null
      ? sql`regexp_replace(${phone.column}, '[^0-9]', '', 'g') like ${`%${phone.digits}%`}`
      : null;
  const ranked = sql`case
    when ${title} like ${`${escapeLike(tokens.join(" "))}%`} then 0
    when ${startsWord(title)} then 1
    when ${startsWord(haystack)} then 2
    else 3 end`;
  const scoreExpr = byPhone
    ? sql`least(${ranked}, case when ${byPhone} then 2 else 3 end)`
    : ranked;
  return {
    where: (byPhone ? or(contains, byPhone) : contains) as SQL,
    score: sql`${scoreExpr}`.mapWith(Number).as("score"),
    /** For `order by`. */
    scoreExpr,
    // All matches, and those that are not just a fragment inside a word.
    total: sql`count(*) over ()`.mapWith(Number).as("total"),
    strong: sql`count(*) filter (where ${scoreExpr} < 3) over ()`.mapWith(Number).as("strong"),
  };
}

type Counted = { score: number; total: number; strong: number };

/**
 * When some rows match at the start of words, matches inside words ("bonn" in "Abonnent:innen") are
 * left out of the hits and the total. A group with nothing but such fragments is `weak`: it only
 * shows when no other group has a better match (see the end of `searchAs`).
 */
function settle<T extends Counted>(rows: T[]): { rows: T[]; total: number; weak: boolean } {
  const strong = rows[0]?.strong ?? 0;
  if (strong > 0) return { rows: rows.filter((r) => r.score < 3), total: strong, weak: false };
  return { rows, total: rows[0]?.total ?? 0, weak: rows.length > 0 };
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
  const hits: SearchHit[] = [];
  const found: { kind: SearchHit["kind"]; total: number; weak: boolean }[] = [];
  const record = (kind: SearchHit["kind"], total: number, weak: boolean) => {
    if (total > 0) found.push({ kind, total, weak });
  };

  if (can(actor.role, "event", "read")) {
    const m = matcher(tokens, event.name, [
      venue.city,
      venue.name,
      sql`to_char(${event.startsOn}, 'DD.MM.YYYY')`,
    ]);
    const result = await db
      .select({
        id: event.id,
        name: event.name,
        startsOn: event.startsOn,
        city: venue.city,
        score: m.score,
        total: m.total,
        strong: m.strong,
      })
      .from(event)
      .innerJoin(venue, sql`${venue.id} = ${event.venueId}`)
      .where(and(visibleEvents(actor), m.where))
      // Best match first; then upcoming, then the most recent past ones.
      .orderBy(
        m.scoreExpr,
        sql`${event.startsOn} < current_date`,
        sql`abs(${event.startsOn} - current_date)`,
      )
      .limit(LIMIT);
    const { rows, total, weak } = settle(result);
    record("event", total, weak);
    for (const r of rows) {
      hits.push({
        kind: "event",
        title: r.name,
        // The year only when it is not the running one: 2026 and 2027 dates of one market look alike.
        subtitle: `${r.city} · ${formatDateShortYear(r.startsOn, locale)} · ${formatWeek(r.startsOn, locale)}`,
        href: `/veranstaltungen/${r.id}`,
        score: r.score,
      });
    }
  }
  if (can(actor.role, "task", "read")) {
    // Same row scope as the board: field users only find tasks of their events (and their own).
    // With several words the event's name counts ("halteverbot bonn"); one word only looks at the title,
    // or "bonn" would list every task of every Bonn market.
    const m = matcher(tokens, task.title, tokens.length > 1 ? [event.name] : []);
    const result = await db
      .select({
        id: task.id,
        title: task.title,
        eventId: task.eventId,
        status: task.status,
        eventName: event.name,
        eventStartsOn: event.startsOn,
        score: m.score,
        total: m.total,
        strong: m.strong,
      })
      .from(task)
      .leftJoin(event, sql`${event.id} = ${task.eventId}`)
      .where(and(visibleTasks(actor), m.where))
      // Best match first; then open tasks, then the most recently finished ones.
      .orderBy(
        m.scoreExpr,
        sql`${inArray(task.status, [...OPEN_STATUSES])} desc`,
        asc(task.dueAt),
        asc(task.title),
      )
      .limit(LIMIT);
    const { rows, total, weak } = settle(result);
    record("task", total, weak);
    for (const r of rows) {
      hits.push({
        kind: "task",
        title: r.title,
        // The same task title exists once per event: name and date tell them apart.
        subtitle: r.eventName
          ? `${r.eventName}${r.eventStartsOn ? ` · ${formatDateShortYear(r.eventStartsOn, locale)}` : ""}`
          : undefined,
        href: taskLink(r.id, r.eventId),
        score: r.score,
      });
    }
  }
  if (can(actor.role, "permit", "read")) {
    const m = matcher(tokens, permit.title, [venue.name, sql`${permit.season}::text`]);
    const result = await db
      .select({
        id: permit.id,
        title: permit.title,
        venueName: venue.name,
        score: m.score,
        total: m.total,
        strong: m.strong,
      })
      .from(permit)
      .leftJoin(venue, sql`${venue.id} = ${permit.venueId}`)
      .where(and(isNull(permit.archivedAt), m.where))
      .orderBy(m.scoreExpr, asc(permit.title))
      .limit(LIMIT);
    const { rows, total, weak } = settle(result);
    record("permit", total, weak);
    for (const r of rows) {
      hits.push({
        kind: "permit",
        // Permit titles carry the date as written by the generator ("… – 2026-04-18").
        title: formatIsoDates(r.title, locale),
        subtitle: r.venueName ?? undefined,
        href: `/genehmigungen?genehmigung=${r.id}`,
        score: r.score,
      });
    }
  }
  if (can(actor.role, "finance", "read") && !exclude.includes("payable")) {
    const m = matcher(tokens, payable.title, [contact.name]);
    const result = await db
      .select({
        id: payable.id,
        title: payable.title,
        counterparty: contact.name,
        score: m.score,
        total: m.total,
        strong: m.strong,
      })
      .from(payable)
      .leftJoin(contact, sql`${contact.id} = ${payable.counterpartyContactId}`)
      .where(and(isNull(payable.archivedAt), m.where))
      .orderBy(m.scoreExpr, asc(payable.title))
      .limit(LIMIT);
    const { rows, total, weak } = settle(result);
    record("payable", total, weak);
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
    const m = matcher(tokens, vehicle.name, [vehicle.plate]);
    const result = await db
      .select({
        id: vehicle.id,
        name: vehicle.name,
        plate: vehicle.plate,
        score: m.score,
        total: m.total,
        strong: m.strong,
      })
      .from(vehicle)
      .where(and(isNull(vehicle.archivedAt), m.where))
      .orderBy(m.scoreExpr, asc(vehicle.name))
      .limit(LIMIT);
    const { rows, total, weak } = settle(result);
    record("vehicle", total, weak);
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
    const m = matcher(tokens, venue.name, [venue.city, venue.street]);
    const result = await db
      .select({
        id: venue.id,
        name: venue.name,
        city: venue.city,
        score: m.score,
        total: m.total,
        strong: m.strong,
      })
      .from(venue)
      .where(and(isNull(venue.archivedAt), m.where))
      .orderBy(m.scoreExpr, asc(venue.name))
      .limit(LIMIT);
    const { rows, total, weak } = settle(result);
    record("venue", total, weak);
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
    const m = matcher(tokens, staffMember.displayName);
    const result = await db
      .select({
        id: staffMember.id,
        name: staffMember.displayName,
        score: m.score,
        total: m.total,
        strong: m.strong,
      })
      .from(staffMember)
      .where(and(isNull(staffMember.archivedAt), m.where))
      .orderBy(m.scoreExpr, asc(staffMember.displayName))
      .limit(LIMIT);
    const { rows, total, weak } = settle(result);
    record("staff", total, weak);
    for (const r of rows)
      hits.push({ kind: "staff", title: r.name, href: `/team?person=${r.id}`, score: r.score });
  }
  if (can(actor.role, "contact", "read")) {
    // Name, contact person, city, e-mail and phone number (typed with or without country code).
    const m = matcher(tokens, contact.name, [contact.contactPerson, contact.city, contact.email], {
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
      })
      .from(contact)
      .where(and(isNull(contact.archivedAt), m.where))
      .orderBy(m.scoreExpr, asc(contact.name))
      .limit(LIMIT);
    const { rows, total, weak } = settle(result);
    record("contact", total, weak);
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
    const m = matcher(
      tokens,
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
      })
      .from(vendor)
      .where(m.where)
      .orderBy(m.scoreExpr, asc(vendor.displayName))
      .limit(LIMIT);
    const { rows, total, weak } = settle(result);
    record("vendor", total, weak);
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
  // Fragments inside words ("zz" in "Polizzi") only count when nothing matches better anywhere.
  const anyStrong = found.some((f) => !f.weak);
  const shown = found.filter((f) => !anyStrong || !f.weak);
  const groups: SearchResult["groups"] = {};
  for (const f of shown) {
    const path = LIST_PAGES[f.kind];
    groups[f.kind] = {
      total: f.total,
      href: path ? `${path}?q=${encodeURIComponent(trimmed)}` : undefined,
    };
  }
  return { hits: hits.filter((h) => groups[h.kind]), groups };
}
