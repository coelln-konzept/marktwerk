import { event, eventDuty, staffMember, task, user } from "@marktwerk/db/schema";
import { eq } from "drizzle-orm";
import type { Actor } from "@/server/actor";
import { db } from "@/server/db";
import type { seedCatalogue } from "./fixtures";

type Catalogue = Awaited<ReturnType<typeof seedCatalogue>>;

/** The day all task tests pretend it is: Wednesday of KW 43. */
export const TODAY = "2026-10-21";

/** An event without going through preset generation (so template tasks never interfere). */
export async function insertEvent(
  cat: Catalogue,
  name: string,
  startsOn: string,
  dutyHolders: { roleId: string; staffId: string }[] = [],
) {
  const [row] = await db
    .insert(event)
    .values({
      eventTypeId: cat.type.id,
      venueId: cat.venue.id,
      name,
      season: Number(startsOn.slice(0, 4)),
      startsOn,
      endsOn: startsOn,
      times: cat.times,
      status: "planned",
      pricePerMCents: 1200,
      bookingFeeCents: 500,
    })
    .returning();
  if (!row) throw new Error("event failed");
  if (dutyHolders.length)
    await db.insert(eventDuty).values(
      dutyHolders.map((d) => ({
        eventId: row.id,
        dutyRoleId: d.roleId,
        staffMemberId: d.staffId,
      })),
    );
  return row;
}

/** Due instant at 09:00 Berlin on a date in October/November 2026 (CET/CEST aware enough for tests). */
export function dueOn(date: string): Date {
  const offset = date >= "2026-10-25" ? "+01:00" : "+02:00";
  return new Date(`${date}T09:00:00${offset}`);
}

export async function insertTask(values: Partial<typeof task.$inferInsert> & { title: string }) {
  const [row] = await db.insert(task).values(values).returning();
  if (!row) throw new Error("task failed");
  return row;
}

export async function getTask(id: string) {
  const [row] = await db.select().from(task).where(eq(task.id, id));
  if (!row) throw new Error("task missing");
  return row;
}

/** The actor as a person with a staff record (so "who did it" columns and self-checks work). */
export function asStaff(actor: Actor, staff: { id: string; displayName: string }): Actor {
  return {
    ...actor,
    staffMemberId: staff.id,
    displayName: staff.displayName,
    firstName: staff.displayName.split(" ")[0] ?? "",
  };
}

export async function insertStaff(
  displayName: string,
  login?: { userId: string; role: "field" | "manager" | "staff" | "owner" },
) {
  const [first = displayName, ...rest] = displayName.split(" ");
  if (login) {
    await db
      .insert(user)
      .values({
        id: login.userId,
        name: displayName,
        email: `${login.userId}@test.local`,
        emailVerified: true,
        role: login.role,
      })
      .onConflictDoNothing();
  }
  const [row] = await db
    .insert(staffMember)
    .values({
      displayName,
      firstName: first,
      lastName: rest.join(" ") || "Test",
      userId: login?.userId ?? null,
    })
    .returning();
  if (!row) throw new Error("staff failed");
  return row;
}
