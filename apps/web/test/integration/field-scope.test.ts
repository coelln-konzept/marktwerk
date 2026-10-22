import { auditLog, event, eventDuty, user } from "@marktwerk/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { type Actor, visibleEvents } from "@/server/actor";
import { db } from "@/server/db";
import { listEventHistory } from "@/server/queries/event-detail";
import { getEvent, listEvents, listSeasons } from "@/server/queries/events";
import { getOverview } from "@/server/queries/overview";
import { changeEventStatus, updateEventNotes } from "@/server/services/event-lifecycle";
import { createEventsFromPreset } from "@/server/services/events";
import { changeUserRole, linkStaffMember } from "@/server/services/users";
import { createActor, resetDatabase, seedCatalogue } from "../helpers/fixtures";

/**
 * Field-user check (HANDOFF §7.5): a Platzteam login only sees events where its staff member has a
 * duty, can read nothing else through the queries, and cannot write.
 */

let cat: Awaited<ReturnType<typeof seedCatalogue>>;
let owner: Actor;
let field: Actor;
/** Events: two with duties for Anna (field) and Ben, one festival without any duty. */
let mine: string[];
let others: string[];

const isForbidden = (error: unknown) =>
  String((error as { digest?: unknown })?.digest ?? "").includes("403");

beforeEach(async () => {
  await resetDatabase();
  cat = await seedCatalogue();
  owner = await createActor("owner");

  // The field login is linked to the staff member Anna (ADR 0012).
  const base = await createActor("field");
  await db.update(user).set({ role: "field" }).where(eq(user.id, base.id));
  field = {
    ...base,
    staffMemberId: cat.staff.anna.id,
    firstName: "Anna",
    displayName: "Anna Test",
  };

  const flea = await createEventsFromPreset(owner, cat.presets.flea.id, [
    "2026-11-14",
    "2026-11-28",
  ]);
  const festival = await createEventsFromPreset(owner, cat.presets.festival.id, ["2026-12-04"]);
  mine = flea.map((e) => e.id);
  others = festival.map((e) => e.id);

  // A third flea event where only Ben has a duty.
  const [benOnly] = await createEventsFromPreset(owner, cat.presets.flea.id, ["2026-12-12"]);
  if (!benOnly) throw new Error("fixture failed");
  await db
    .delete(eventDuty)
    .where(eq(eventDuty.eventId, benOnly.id))
    .then(() =>
      db.insert(eventDuty).values({
        eventId: benOnly.id,
        dutyRoleId: cat.roles.lead.id,
        staffMemberId: cat.staff.ben.id,
      }),
    );
  others.push(benOnly.id);
});

afterAll(async () => {
  await db.$client.end();
});

const ids = (rows: { id: string }[]) => rows.map((r) => r.id).sort();

describe("what a field user sees", () => {
  it("visibleEvents keeps only events with a duty of the linked staff member", async () => {
    const rows = await db.select({ id: event.id }).from(event).where(visibleEvents(field));
    expect(ids(rows)).toEqual([...mine].sort());
  });

  it("other roles see every event", async () => {
    const rows = await db.select({ id: event.id }).from(event).where(visibleEvents(owner));
    expect(rows).toHaveLength(mine.length + others.length);
  });

  it("a field login without a linked staff member sees nothing", async () => {
    const unlinked: Actor = { ...field, staffMemberId: null };
    expect(await db.select({ id: event.id }).from(event).where(visibleEvents(unlinked))).toEqual(
      [],
    );
    expect(await listEvents(unlinked, {})).toEqual([]);
  });

  it("archived events disappear even when the field user has a duty", async () => {
    await db
      .update(event)
      .set({ archivedAt: new Date() })
      .where(eq(event.id, mine[0] as string));
    const rows = await db.select({ id: event.id }).from(event).where(visibleEvents(field));
    expect(ids(rows)).toEqual([mine[1]]);
  });

  it("listEvents, listSeasons and the Übersicht are scoped", async () => {
    expect(ids(await listEvents(field, {}))).toEqual([...mine].sort());
    expect(ids(await listEvents(field, { season: 2026, q: "festival" }))).toEqual([]);
    expect(await listSeasons(field)).toEqual([2026]);
    const overview = await getOverview(field, "2026-11-01");
    expect(overview.weekend.rows.every((r) => mine.includes(r.id))).toBe(true);
  });

  it("getEvent returns the own events and null for everybody else's", async () => {
    for (const id of mine) expect((await getEvent(field, id))?.id).toBe(id);
    for (const id of others) expect(await getEvent(field, id)).toBeNull();
    // The owner can read all of them.
    for (const id of [...mine, ...others]) expect((await getEvent(owner, id))?.id).toBe(id);
  });

  it("the history (audit log) of a foreign event stays empty", async () => {
    const foreign = others[0] as string;
    expect((await listEventHistory(owner, foreign)).length).toBeGreaterThan(0);
    expect(await listEventHistory(field, foreign)).toEqual([]);
    expect((await listEventHistory(field, mine[0] as string)).length).toBeGreaterThan(0);
  });

  it("a duty on the event is what counts: removing it hides the event", async () => {
    await db.delete(eventDuty).where(eq(eventDuty.eventId, mine[0] as string));
    expect(await getEvent(field, mine[0] as string)).toBeNull();
  });
});

describe("what a field user may not do", () => {
  const dbState = async () => ({
    status: (await db.select().from(event).orderBy(event.startsOn)).map((e) => [
      e.id,
      e.status,
      e.notes,
    ]),
    events: (await db.select().from(event)).length,
    audit: (await db.select().from(auditLog)).length,
  });

  it("cannot change the status or notes, not even of their own events", async () => {
    const snapshot = await dbState();
    for (const id of [...mine, ...others]) {
      expect(isForbidden(await changeEventStatus(field, id, "planned").catch((e) => e))).toBe(true);
      expect(isForbidden(await updateEventNotes(field, id, "hallo").catch((e) => e))).toBe(true);
    }
    expect(await dbState()).toEqual(snapshot);
  });

  it("cannot create events", async () => {
    const snapshot = await dbState();
    expect(
      isForbidden(
        await createEventsFromPreset(field, cat.presets.flea.id, ["2027-01-09"]).catch((e) => e),
      ),
    ).toBe(true);
    expect(await dbState()).toEqual(snapshot);
  });

  it("cannot manage users or their own role", async () => {
    expect(isForbidden(await changeUserRole(field, field.id, "owner").catch((e) => e))).toBe(true);
    expect(
      isForbidden(await linkStaffMember(field, field.id, cat.staff.ben.id).catch((e) => e)),
    ).toBe(true);
    expect((await db.select().from(user).where(eq(user.id, field.id)))[0]?.role).toBe("field");
  });
});
