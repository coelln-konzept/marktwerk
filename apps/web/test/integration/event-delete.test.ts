import {
  auditLog,
  checklist,
  document,
  event,
  eventDuty,
  eventPermit,
  expense,
  payable,
  permit,
  shift,
  task,
} from "@marktwerk/db/schema";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { Actor } from "@/server/actor";
import { db } from "@/server/db";
import { deleteEvent, getEventDeleteInfo } from "@/server/services/event-lifecycle";
import { createActor, resetDatabase, seedCatalogue } from "../helpers/fixtures";
import { insertEvent, insertTask } from "../helpers/tasks";

/** "Veranstaltung löschen": permanent, confirmed by typing the name, blocked by restricting rows. */

let cat: Awaited<ReturnType<typeof seedCatalogue>>;
let owner: Actor;
let eventId: string;
const NAME = "Flohmarkt Bilk";

const isForbidden = (error: unknown) =>
  String((error as { digest?: unknown })?.digest ?? "").includes("403");
const exists = async (id: string) =>
  (await db.select({ id: event.id }).from(event).where(eq(event.id, id))).length === 1;

beforeEach(async () => {
  await resetDatabase();
  cat = await seedCatalogue();
  owner = await createActor("owner");
  eventId = (await insertEvent(cat, NAME, "2026-11-14", [])).id;
});

afterAll(async () => {
  await db.$client.end();
});

describe("deleteEvent", () => {
  it("removes the event with its tasks, checklists, duties and permit links; the permit stays", async () => {
    const [list] = await db.insert(checklist).values({ eventId, name: "Checkliste" }).returning();
    await insertTask({ title: "A", eventId, checklistId: list?.id });
    await insertTask({ title: "B", eventId });
    const other = await insertEvent(cat, "Anderer", "2026-11-15");
    const kept = await insertTask({ title: "Bleibt", eventId: other.id });
    await db.insert(eventDuty).values({
      eventId,
      dutyRoleId: cat.roles.lead.id,
      staffMemberId: cat.staff.anna.id,
    });
    const [p] = await db
      .insert(permit)
      .values({
        venueId: cat.venue.id,
        season: 2026,
        category: "city",
        permitType: "market_permit",
        title: "Marktgenehmigung",
      })
      .returning();
    await db.insert(eventPermit).values({ eventId, permitId: p?.id as string });

    await expect(deleteEvent(owner, eventId, NAME)).resolves.toEqual({ name: NAME });

    expect(await exists(eventId)).toBe(false);
    expect(await db.select().from(task).where(eq(task.eventId, eventId))).toHaveLength(0);
    expect(await db.select().from(checklist).where(eq(checklist.eventId, eventId))).toHaveLength(0);
    expect(await db.select().from(eventDuty).where(eq(eventDuty.eventId, eventId))).toHaveLength(0);
    expect(await db.select().from(eventPermit)).toHaveLength(0);
    expect(await db.select().from(permit)).toHaveLength(1);
    expect(await exists(other.id)).toBe(true);
    expect(await db.select().from(task).where(eq(task.id, kept.id))).toHaveLength(1);
  });

  it("writes the audit entry first, with a snapshot and the cascaded counts", async () => {
    await insertTask({ title: "A", eventId });
    await insertTask({ title: "B", eventId });
    await deleteEvent(owner, eventId, `  ${NAME}  `);
    const [row] = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.action, "event.delete"), eq(auditLog.entityId, eventId)));
    expect(row).toMatchObject({ actorId: owner.id, entityType: "event" });
    expect(row?.diff).toMatchObject({
      name: NAME,
      startsOn: "2026-11-14",
      status: "planned",
      cascaded: { tasks: 2, checklists: 0, duties: 0, permitLinks: 0 },
    });
  });

  it("rejects a wrong name (case-sensitive) and deletes nothing", async () => {
    for (const typed of ["", "flohmarkt bilk", "Flohmarkt", `${NAME}x`])
      await expect(deleteEvent(owner, eventId, typed)).rejects.toMatchObject({
        code: "name_mismatch",
      });
    expect(await exists(eventId)).toBe(true);
    expect(
      await db.select().from(auditLog).where(eq(auditLog.action, "event.delete")),
    ).toHaveLength(0);
  });

  it("says not_found for an unknown event", async () => {
    await expect(
      deleteEvent(owner, "00000000-0000-4000-8000-000000000000", NAME),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("is blocked by payables, expenses, shifts and documents (archived ones too), with counts", async () => {
    await db.insert(payable).values({
      title: "Standmiete",
      scope: "event",
      eventId,
      category: "other",
      totalGrossCents: 1000,
      archivedAt: new Date(),
    });
    await db
      .insert(expense)
      .values({ spentOn: "2026-11-01", amountCents: 500, description: "Nägel", eventId });
    await db.insert(shift).values([
      { eventId, staffMemberId: cat.staff.anna.id, workDate: "2026-11-14" },
      { eventId, staffMemberId: cat.staff.ben.id, workDate: "2026-11-14" },
    ]);
    const file = (n: number, link: Partial<typeof document.$inferInsert>) => ({
      kind: "other" as const,
      fileName: `f${n}.pdf`,
      mimeType: "application/pdf",
      sizeBytes: 1,
      sha256: String(n).repeat(64),
      storageKey: `k/${n}.pdf`,
      ...link,
    });
    await db.insert(document).values(file(1, { eventId }));

    const expected = { payables: 1, expenses: 1, shifts: 2, documents: 1 };
    await expect(deleteEvent(owner, eventId, NAME)).rejects.toMatchObject({
      code: "blocked",
      detail: expected,
    });
    expect((await getEventDeleteInfo(owner, eventId)).blockers).toEqual(expected);
    expect(await exists(eventId)).toBe(true);
    expect(
      await db.select().from(auditLog).where(eq(auditLog.action, "event.delete")),
    ).toHaveLength(0);
  });

  it("counts a document attached to one of the event's tasks as a blocker", async () => {
    const t = await insertTask({ title: "Mit Beleg", eventId });
    await db.insert(document).values({
      kind: "other",
      fileName: "t.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1,
      sha256: "b".repeat(64),
      storageKey: "k/t.pdf",
      taskId: t.id,
    });
    await expect(deleteEvent(owner, eventId, NAME)).rejects.toMatchObject({
      code: "blocked",
      detail: { documents: 1 },
    });
    expect(await exists(eventId)).toBe(true);
  });

  it("reports no blockers for a clean event, with its dates and nothing to lose", async () => {
    expect(await getEventDeleteInfo(owner, eventId)).toEqual({
      name: NAME,
      startsOn: "2026-11-14",
      endsOn: "2026-11-14",
      blockers: { payables: 0, expenses: 0, shifts: 0, documents: 0 },
      losses: { tasks: 0, permitLinks: 0, duties: 0, checklists: 0, notes: false },
    });
  });

  it("names what the deletion takes with it (UX-061): tasks incl. subtasks, links, duties, notes", async () => {
    const [list] = await db.insert(checklist).values({ eventId, name: "Checkliste" }).returning();
    const parent = await insertTask({ title: "A", eventId, checklistId: list?.id });
    await insertTask({ title: "A.1", eventId, parentTaskId: parent.id });
    await insertTask({ title: "B", eventId, status: "skipped" });
    await db.insert(eventDuty).values({
      eventId,
      dutyRoleId: cat.roles.lead.id,
      staffMemberId: cat.staff.anna.id,
    });
    const [p] = await db
      .insert(permit)
      .values({
        venueId: cat.venue.id,
        season: 2026,
        category: "city",
        permitType: "market_permit",
        title: "Marktgenehmigung",
      })
      .returning();
    await db.insert(eventPermit).values({ eventId, permitId: p?.id as string });
    await db.update(event).set({ notes: "Schlüssel bei Herrn K." }).where(eq(event.id, eventId));

    expect((await getEventDeleteInfo(owner, eventId)).losses).toEqual({
      tasks: 3,
      permitLinks: 1,
      duties: 1,
      checklists: 1,
      notes: true,
    });
  });

  it.each(["staff", "field"] as const)("is forbidden for the %s role", async (role) => {
    const actor = await createActor(role);
    expect(isForbidden(await deleteEvent(actor, eventId, NAME).catch((e) => e))).toBe(true);
    expect(isForbidden(await getEventDeleteInfo(actor, eventId).catch((e) => e))).toBe(true);
    expect(await exists(eventId)).toBe(true);
  });

  it("lets a manager delete", async () => {
    const manager = await createActor("manager");
    await deleteEvent(manager, eventId, NAME);
    expect(await exists(eventId)).toBe(false);
  });
});
