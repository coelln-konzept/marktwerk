import "server-only";
import { can, OPEN_STATUSES, taskLink } from "@marktwerk/core";
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
import { and, asc, inArray, isNull, type SQL, sql } from "drizzle-orm";
import { formatDateShort, formatWeek } from "@/lib/format";
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
};

/** Folds umlauts and accents so "koln" finds "Köln" and "muller" finds "Müller". */
function fold(column: SQL | unknown): SQL {
  return sql`translate(lower(${column}), 'äöüßéèêáàâóòôíìîúùûç', 'aousseeeaaaoooiiiuuuc')`;
}

function foldQuery(q: string): string {
  return q
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/ß/g, "s")
    .replace(/[%_\\]/g, (c) => `\\${c}`);
}

const LIMIT = 6;

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
): Promise<SearchHit[]> {
  const q = foldQuery(query.trim());
  if (q.length < 2) return [];
  const like = `%${q}%`;
  const hits: SearchHit[] = [];

  if (can(actor.role, "event", "read")) {
    const rows = await db
      .select({ id: event.id, name: event.name, startsOn: event.startsOn, city: venue.city })
      .from(event)
      .innerJoin(venue, sql`${venue.id} = ${event.venueId}`)
      .where(
        and(
          visibleEvents(actor),
          sql`(${fold(event.name)} like ${like} or ${fold(venue.city)} like ${like} or ${fold(venue.name)} like ${like})`,
        ),
      )
      // Upcoming first, then the most recent past ones.
      .orderBy(sql`${event.startsOn} < current_date`, sql`abs(${event.startsOn} - current_date)`)
      .limit(LIMIT);
    for (const r of rows) {
      hits.push({
        kind: "event",
        title: r.name,
        subtitle: `${r.city} · ${formatDateShort(r.startsOn, locale)} · ${formatWeek(r.startsOn, locale)}`,
        href: `/veranstaltungen/${r.id}`,
      });
    }
  }
  if (can(actor.role, "task", "read")) {
    // Same row scope as the board: field users only find tasks of their events (and their own).
    const rows = await db
      .select({
        id: task.id,
        title: task.title,
        eventId: task.eventId,
        status: task.status,
        eventName: event.name,
      })
      .from(task)
      .leftJoin(event, sql`${event.id} = ${task.eventId}`)
      .where(and(visibleTasks(actor), sql`${fold(task.title)} like ${like}`))
      // Open tasks first, then the most recently finished ones.
      .orderBy(
        sql`${inArray(task.status, [...OPEN_STATUSES])} desc`,
        asc(task.dueAt),
        asc(task.title),
      )
      .limit(LIMIT);
    for (const r of rows) {
      hits.push({
        kind: "task",
        title: r.title,
        subtitle: r.eventName ?? undefined,
        href: taskLink(r.id, r.eventId),
      });
    }
  }
  if (can(actor.role, "permit", "read")) {
    const rows = await db
      .select({ id: permit.id, title: permit.title, venueName: venue.name })
      .from(permit)
      .leftJoin(venue, sql`${venue.id} = ${permit.venueId}`)
      .where(
        and(
          isNull(permit.archivedAt),
          sql`(${fold(permit.title)} like ${like} or ${fold(venue.name)} like ${like})`,
        ),
      )
      .orderBy(asc(permit.title))
      .limit(LIMIT);
    for (const r of rows) {
      hits.push({
        kind: "permit",
        title: r.title,
        subtitle: r.venueName ?? undefined,
        href: `/logbuch?genehmigung=${r.id}`,
      });
    }
  }
  if (can(actor.role, "finance", "read") && !exclude.includes("payable")) {
    const rows = await db
      .select({ id: payable.id, title: payable.title, counterparty: contact.name })
      .from(payable)
      .leftJoin(contact, sql`${contact.id} = ${payable.counterpartyContactId}`)
      .where(
        and(
          isNull(payable.archivedAt),
          sql`(${fold(payable.title)} like ${like} or ${fold(contact.name)} like ${like})`,
        ),
      )
      .orderBy(asc(payable.title))
      .limit(LIMIT);
    for (const r of rows) {
      hits.push({
        kind: "payable",
        title: r.title,
        subtitle: r.counterparty ?? undefined,
        href: `/finanzen/posten/${r.id}`,
      });
    }
  }
  if (can(actor.role, "company", "read")) {
    const rows = await db
      .select({ id: vehicle.id, name: vehicle.name, plate: vehicle.plate })
      .from(vehicle)
      .where(
        and(
          isNull(vehicle.archivedAt),
          sql`(${fold(vehicle.name)} like ${like} or ${fold(vehicle.plate)} like ${like})`,
        ),
      )
      .orderBy(asc(vehicle.name))
      .limit(LIMIT);
    for (const r of rows) {
      hits.push({
        kind: "vehicle",
        title: r.name,
        subtitle: r.plate,
        href: `/firma/fahrzeuge/${r.id}`,
      });
    }
  }
  if (can(actor.role, "venue", "read")) {
    const rows = await db
      .select({ id: venue.id, name: venue.name, city: venue.city })
      .from(venue)
      .where(and(isNull(venue.archivedAt), sql`${fold(venue.name)} like ${like}`))
      .orderBy(asc(venue.name))
      .limit(LIMIT);
    for (const r of rows)
      hits.push({ kind: "venue", title: r.name, subtitle: r.city, href: `/orte/${r.id}` });
  }
  if (can(actor.role, "event", "read") && actor.role !== "field" && !exclude.includes("staff")) {
    const rows = await db
      .select({ id: staffMember.id, name: staffMember.displayName })
      .from(staffMember)
      .where(
        and(isNull(staffMember.archivedAt), sql`${fold(staffMember.displayName)} like ${like}`),
      )
      .orderBy(asc(staffMember.displayName))
      .limit(LIMIT);
    for (const r of rows) hits.push({ kind: "staff", title: r.name, href: `/team?person=${r.id}` });
  }
  if (can(actor.role, "contact", "read")) {
    const rows = await db
      .select({ id: contact.id, name: contact.name, city: contact.city })
      .from(contact)
      .where(
        and(
          isNull(contact.archivedAt),
          sql`(${fold(contact.name)} like ${like} or ${fold(contact.contactPerson)} like ${like})`,
        ),
      )
      .orderBy(asc(contact.name))
      .limit(LIMIT);
    for (const r of rows) {
      hits.push({
        kind: "contact",
        title: r.name,
        subtitle: r.city ?? undefined,
        href: `/kontakte?vorschau=${r.id}`,
      });
    }
  }
  if (can(actor.role, "vendor", "read")) {
    const rows = await db
      .select({ id: vendor.id, name: vendor.displayName, city: vendor.city })
      .from(vendor)
      .where(sql`${fold(vendor.displayName)} like ${like}`)
      .orderBy(asc(vendor.displayName))
      .limit(LIMIT);
    for (const r of rows) {
      hits.push({
        kind: "vendor",
        title: r.name,
        subtitle: r.city ?? undefined,
        href: `/aussteller?vorschau=${r.id}`,
      });
    }
  }
  return hits;
}
