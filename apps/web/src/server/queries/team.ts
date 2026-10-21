import "server-only";
import { dutyRole, event, eventDuty, staffMember, user, venue } from "@marktwerk/db/schema";
import { and, asc, eq, gte, isNull, lte, ne, type SQL, sql } from "drizzle-orm";
import { type Actor, visibleEvents } from "../actor";
import { db } from "../db";

export type DutyRoleRow = {
  id: string;
  key: string;
  nameDe: string;
  nameEn: string;
  defaultStaffMemberId: string | null;
  sort: number;
};

export async function listDutyRoles(): Promise<DutyRoleRow[]> {
  return db
    .select({
      id: dutyRole.id,
      key: dutyRole.key,
      nameDe: dutyRole.nameDe,
      nameEn: dutyRole.nameEn,
      defaultStaffMemberId: dutyRole.defaultStaffMemberId,
      sort: dutyRole.sort,
    })
    .from(dutyRole)
    .orderBy(asc(dutyRole.sort));
}

/** Upcoming = not over yet (ends today or later), not cancelled, not archived, in the actor's scope. */
function upcomingEvents(actor: Actor, today: string): SQL {
  return and(visibleEvents(actor), ne(event.status, "cancelled"), gte(event.endsOn, today)) as SQL;
}

export type StaffRow = {
  id: string;
  displayName: string;
  phoneE164: string | null;
  email: string | null;
  active: boolean;
  notes: string | null;
  preferredDutyRoleIds: string[];
  /** Permission role of the back-office login; null = no login. */
  loginRole: string | null;
  upcomingCount: number;
};

/** All staff members (active first), with login role and the number of upcoming events they have a duty at. */
export async function listStaff(actor: Actor, today: string): Promise<StaffRow[]> {
  const upcoming = db
    .select({
      staffMemberId: eventDuty.staffMemberId,
      n: sql<number>`count(distinct ${eventDuty.eventId})::int`.as("n"),
    })
    .from(eventDuty)
    .innerJoin(event, eq(event.id, eventDuty.eventId))
    .where(upcomingEvents(actor, today))
    .groupBy(eventDuty.staffMemberId)
    .as("upcoming");

  const rows = await db
    .select({
      id: staffMember.id,
      displayName: staffMember.displayName,
      phoneE164: staffMember.phoneE164,
      email: staffMember.email,
      active: staffMember.active,
      notes: staffMember.notes,
      preferredDutyRoleIds: staffMember.preferredDutyRoleIds,
      loginRole: user.role,
      upcomingCount: sql<number>`coalesce(${upcoming.n}, 0)`,
    })
    .from(staffMember)
    .leftJoin(user, eq(user.id, staffMember.userId))
    .leftJoin(upcoming, eq(upcoming.staffMemberId, staffMember.id))
    .orderBy(sql`${staffMember.active} desc`, asc(staffMember.displayName));
  return rows.map((r) => ({ ...r, upcomingCount: Number(r.upcomingCount) }));
}

export type StaffEvent = {
  eventId: string;
  name: string;
  startsOn: string;
  endsOn: string;
  city: string;
  dutyRoleNameDe: string;
  dutyRoleNameEn: string;
};

/** The next events a person has a duty at (for the Vorschau). */
export async function nextEventsOf(
  actor: Actor,
  staffMemberId: string,
  today: string,
  limit = 5,
): Promise<StaffEvent[]> {
  return db
    .select({
      eventId: event.id,
      name: event.name,
      startsOn: event.startsOn,
      endsOn: event.endsOn,
      city: venue.city,
      dutyRoleNameDe: dutyRole.nameDe,
      dutyRoleNameEn: dutyRole.nameEn,
    })
    .from(eventDuty)
    .innerJoin(event, eq(event.id, eventDuty.eventId))
    .innerJoin(venue, eq(venue.id, event.venueId))
    .innerJoin(dutyRole, eq(dutyRole.id, eventDuty.dutyRoleId))
    .where(and(eq(eventDuty.staffMemberId, staffMemberId), upcomingEvents(actor, today)))
    .orderBy(asc(event.startsOn), asc(dutyRole.sort))
    .limit(limit);
}

export type AssignableStaff = {
  id: string;
  displayName: string;
  preferredDutyRoleIds: string[];
  /** Another event on overlapping days where this person already has a duty (first one by date). */
  busyAt: string | null;
};

/** Active staff for the Team tab's "Person ändern" menu, with clashes on the event's days. */
export async function listAssignableStaff(
  eventId: string,
  startsOn: string,
  endsOn: string,
): Promise<AssignableStaff[]> {
  const [people, clashes] = await Promise.all([
    db
      .select({
        id: staffMember.id,
        displayName: staffMember.displayName,
        preferredDutyRoleIds: staffMember.preferredDutyRoleIds,
      })
      .from(staffMember)
      .where(and(eq(staffMember.active, true), isNull(staffMember.archivedAt)))
      .orderBy(asc(staffMember.displayName)),
    db
      .select({ staffMemberId: eventDuty.staffMemberId, name: event.name })
      .from(eventDuty)
      .innerJoin(event, eq(event.id, eventDuty.eventId))
      .where(
        and(
          ne(event.id, eventId),
          ne(event.status, "cancelled"),
          isNull(event.archivedAt),
          lte(event.startsOn, endsOn),
          gte(event.endsOn, startsOn),
        ),
      )
      .orderBy(asc(event.startsOn)),
  ]);
  const busy = new Map<string, string>();
  for (const c of clashes) if (!busy.has(c.staffMemberId)) busy.set(c.staffMemberId, c.name);
  return people.map((p) => ({ ...p, busyAt: busy.get(p.id) ?? null }));
}
