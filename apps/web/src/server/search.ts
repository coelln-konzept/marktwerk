"use server";

import { can } from "@marktwerk/core";
import { contact, event, staffMember, vendor, venue } from "@marktwerk/db/schema";
import { and, asc, isNull, type SQL, sql } from "drizzle-orm";
import { getLocale } from "next-intl/server";
import { formatDateShort, formatWeek } from "@/lib/format";
import { getActor, visibleEvents } from "./actor";
import { db } from "./db";

export type SearchHit = {
  kind: "event" | "venue" | "contact" | "staff" | "vendor" | "action";
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

/** Command palette search. Every group respects the same permissions and scopes as its page. */
export async function searchEverything(query: string): Promise<SearchHit[]> {
  const actor = await getActor();
  const locale = await getLocale();
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
  if (can(actor.role, "event", "read") && actor.role !== "field") {
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
        href: `/haendler?vorschau=${r.id}`,
      });
    }
  }
  return hits;
}
