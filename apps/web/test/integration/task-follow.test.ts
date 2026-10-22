import { auditLog, notification, task } from "@marktwerk/db/schema";
import { and, asc, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import {
  moveEvent,
  previewEventMove,
  previewEventSchedule,
  updateEventBasics,
} from "@/server/services/event-details";
import { setEventDuty } from "@/server/services/event-duties";
import { createEventsFromPreset } from "@/server/services/events";
import { createActor, resetDatabase, seedCatalogue } from "../helpers/fixtures";
import { flohmarktItems, seedPublishedTemplate } from "../helpers/templates";

let cat: Awaited<ReturnType<typeof seedCatalogue>>;
let owner: Awaited<ReturnType<typeof createActor>>;
let eventId: string;

// Sa 13.03.2027, one day, winter time.
beforeEach(async () => {
  await resetDatabase();
  cat = await seedCatalogue();
  owner = await createActor("owner");
  await seedPublishedTemplate(owner, flohmarktItems(cat), { presetIds: [cat.presets.flea.id] });
  const [created] = await createEventsFromPreset(owner, cat.presets.flea.id, ["2027-03-13"]);
  if (!created) throw new Error("no event");
  eventId = created.id;
});

afterAll(async () => {
  await db.$client.end();
});

const taskByKey = async (key: string) => {
  const [row] = await db
    .select()
    .from(task)
    .where(and(eq(task.eventId, eventId), eq(task.templateStableKey, key)));
  if (!row) throw new Error(`no task ${key}`);
  return row;
};

const dueOf = async (key: string) => (await taskByKey(key)).dueAt?.toISOString();

describe("anchor change → tasks follow", () => {
  it("previews how many tasks shift, without writing", async () => {
    const preview = await previewEventMove(owner, eventId, "2027-03-20");
    // Genehmigung, Plakate, Aufbau (setup_day = event day), Abrechnung: all four are open.
    expect(preview.tasksShifting).toBe(4);
    expect(await dueOf("marktgenehmigung_beantragen")).toBe("2027-01-12T08:00:00.000Z");
    expect((await previewEventMove(owner, eventId, "2027-03-13")).tasksShifting).toBe(0);
  });

  it("recomputes open tasks on a move, keeps their time of day, and audits the count", async () => {
    const result = await moveEvent(owner, eventId, "2027-03-20", "2027-03-13");
    expect(result).toMatchObject({ changed: true, tasksShifted: 4 });
    expect(await dueOf("marktgenehmigung_beantragen")).toBe("2027-01-19T08:00:00.000Z");
    // T-14 business days before Saturday 20.03.2027 → Tuesday 02.03., still 17:30 local.
    expect(await dueOf("plakate_aufhaengen")).toBe("2027-03-02T16:30:00.000Z");
    expect(await dueOf("aufbau")).toBe("2027-03-20T08:00:00.000Z");
    // T+3 business days after the Saturday → Wednesday 24.03.
    expect(await dueOf("abrechnung")).toBe("2027-03-24T08:00:00.000Z");
    const [entry] = await db.select().from(auditLog).where(eq(auditLog.action, "event.move"));
    expect(entry?.diff).toMatchObject({ tasksShifted: 4 });
  });

  it("never moves done, skipped or cancelled tasks, nor tasks with a hand-set due date", async () => {
    await db
      .update(task)
      .set({ status: "done", completedAt: new Date("2027-01-05T10:00:00Z") })
      .where(eq(task.id, (await taskByKey("marktgenehmigung_beantragen")).id));
    await db
      .update(task)
      .set({ status: "skipped" })
      .where(eq(task.id, (await taskByKey("plakate_aufhaengen")).id));
    await db
      .update(task)
      .set({ status: "cancelled" })
      .where(eq(task.id, (await taskByKey("aufbau")).id));
    const handSet = new Date("2027-03-18T11:00:00Z");
    await db
      .update(task)
      .set({ dueAt: handSet, dueOverridden: true })
      .where(eq(task.id, (await taskByKey("abrechnung")).id));

    expect((await previewEventMove(owner, eventId, "2027-03-20")).tasksShifting).toBe(0);
    const result = await moveEvent(owner, eventId, "2027-03-20", "2027-03-13");
    expect(result.tasksShifted).toBe(0);
    expect(await dueOf("marktgenehmigung_beantragen")).toBe("2027-01-12T08:00:00.000Z");
    expect(await dueOf("plakate_aufhaengen")).toBe("2027-02-23T16:30:00.000Z");
    expect(await dueOf("aufbau")).toBe("2027-03-13T08:00:00.000Z");
    expect(await dueOf("abrechnung")).toBe(handSet.toISOString());
    // No one to tell.
    expect(await db.select().from(notification)).toHaveLength(0);
  });

  it("a task that is open but customised in other ways still follows (only the hand-set date stops it)", async () => {
    await db
      .update(task)
      .set({ customized: true, title: "Umbenannt" })
      .where(eq(task.id, (await taskByKey("marktgenehmigung_beantragen")).id));
    await moveEvent(owner, eventId, "2027-03-20", "2027-03-13");
    expect(await dueOf("marktgenehmigung_beantragen")).toBe("2027-01-19T08:00:00.000Z");
  });

  it("follows a change of length for the anchors that move (setup day) and leaves the rest", async () => {
    const preview = await previewEventSchedule(owner, eventId, { durationDays: 2 });
    expect(preview.tasksShifting).toBe(1);
    const result = await updateEventBasics(owner, eventId, {
      name: "Testflohmarkt",
      durationDays: 2,
      venueId: cat.venue.id,
    });
    expect(result.tasksShifted).toBe(1);
    expect(await dueOf("aufbau")).toBe("2027-03-12T08:00:00.000Z");
    expect(await dueOf("abrechnung")).toBe("2027-03-17T08:00:00.000Z");
  });

  it("a rename alone shifts nothing", async () => {
    const result = await updateEventBasics(owner, eventId, {
      name: "Anders",
      durationDays: 1,
      venueId: cat.venue.id,
    });
    expect(result.tasksShifted).toBe(0);
    expect(await db.select().from(notification)).toHaveLength(0);
  });

  it("sends one grouped dates_shifted notification per assignee", async () => {
    await moveEvent(owner, eventId, "2027-03-20", "2027-03-13");
    const rows = await db.select().from(notification).orderBy(asc(notification.createdAt));
    // Anna: Genehmigung. Ben: Plakate. The two unassigned tasks have no one to tell.
    expect(rows).toHaveLength(2);
    const anna = rows.find((r) => r.recipientStaffMemberId === cat.staff.anna.id);
    const ben = rows.find((r) => r.recipientStaffMemberId === cat.staff.ben.id);
    expect(anna).toMatchObject({
      reason: "dates_shifted",
      subjectType: "event",
      subjectId: eventId,
      state: "unread",
      link: `/veranstaltungen/${eventId}`,
    });
    expect(anna?.title).toBe("Termine verschoben: Testflohmarkt");
    expect(anna?.body).toContain("13.03.2027");
    expect(anna?.body).toContain("20.03.2027");
    expect(anna?.body).toContain("1 deiner Aufgaben hat");
    expect(ben?.dedupeKey).toBe(anna?.dedupeKey);
    expect(anna?.dedupeKey).toMatch(/^dates_shifted:/);
  });

  it("groups several tasks of one person into one notification and skips the person who moved it", async () => {
    const { eventDuty } = await import("@marktwerk/db/schema");
    // Anna now also has the setup role, and moves the event herself.
    await db
      .update(eventDuty)
      .set({ staffMemberId: cat.staff.anna.id })
      .where(eq(eventDuty.dutyRoleId, cat.roles.setup.id));
    await db
      .update(task)
      .set({ assigneeId: cat.staff.anna.id })
      .where(eq(task.dutyRoleId, cat.roles.setup.id));
    await moveEvent(owner, eventId, "2027-03-20", "2027-03-13");
    const rows = await db.select().from(notification);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.recipientStaffMemberId).toBe(cat.staff.anna.id);
    expect(rows[0]?.body).toContain("2 deiner Aufgaben haben");

    const mover = { ...owner, staffMemberId: cat.staff.anna.id };
    await db.delete(notification);
    await moveEvent(mover, eventId, "2027-03-27", "2027-03-20");
    expect(await db.select().from(notification)).toHaveLength(0);
  });

  it("moving back (undo) announces again, and the tasks return to their dates", async () => {
    await moveEvent(owner, eventId, "2027-03-20", "2027-03-13");
    await moveEvent(owner, eventId, "2027-03-13", "2027-03-20", { undo: true });
    expect(await dueOf("marktgenehmigung_beantragen")).toBe("2027-01-12T08:00:00.000Z");
    expect(await dueOf("plakate_aufhaengen")).toBe("2027-02-23T16:30:00.000Z");
    expect(await db.select().from(notification)).toHaveLength(4);
  });

  it("only touches the tasks of the moved event", async () => {
    const [other] = await createEventsFromPreset(owner, cat.presets.flea.id, ["2027-04-10"]);
    await moveEvent(owner, eventId, "2027-03-20", "2027-03-13");
    const [otherTask] = await db
      .select()
      .from(task)
      .where(and(eq(task.eventId, other?.id ?? ""), eq(task.templateStableKey, "aufbau")));
    expect(otherTask?.dueAt?.toISOString()).toBe("2027-04-10T07:00:00.000Z");
  });
});

describe("duty reassignment → tasks follow", () => {
  it("moves the open tasks of the role to the new person and reports how many", async () => {
    const result = await setEventDuty(owner, eventId, cat.roles.lead.id, cat.staff.ben.id);
    expect(result).toEqual({
      changed: true,
      from: cat.staff.anna.id,
      to: cat.staff.ben.id,
      tasks: 1,
    });
    expect((await taskByKey("marktgenehmigung_beantragen")).assigneeId).toBe(cat.staff.ben.id);
    // Another role's task is not touched.
    expect((await taskByKey("plakate_aufhaengen")).assigneeId).toBe(cat.staff.ben.id);
    const [entry] = await db.select().from(auditLog).where(eq(auditLog.action, "event.duty"));
    expect(entry?.diff).toMatchObject({ tasks: 1, to: cat.staff.ben.id });
  });

  it("leaves tasks somebody assigned by hand, and done / skipped / cancelled ones", async () => {
    const permit = await taskByKey("marktgenehmigung_beantragen");
    await db.update(task).set({ assigneeOverridden: true }).where(eq(task.id, permit.id));
    const result = await setEventDuty(owner, eventId, cat.roles.lead.id, cat.staff.ben.id);
    expect(result.tasks).toBe(0);
    expect((await taskByKey("marktgenehmigung_beantragen")).assigneeId).toBe(cat.staff.anna.id);

    await db
      .update(task)
      .set({ assigneeOverridden: false, status: "done", completedAt: new Date() })
      .where(eq(task.id, permit.id));
    expect((await setEventDuty(owner, eventId, cat.roles.lead.id, cat.staff.anna.id)).tasks).toBe(
      0,
    );
    expect((await taskByKey("marktgenehmigung_beantragen")).assigneeId).toBe(cat.staff.anna.id);

    for (const status of ["skipped", "cancelled"] as const) {
      await db.update(task).set({ status }).where(eq(task.id, permit.id));
      expect((await setEventDuty(owner, eventId, cat.roles.lead.id, cat.staff.ben.id)).tasks).toBe(
        0,
      );
      await setEventDuty(owner, eventId, cat.roles.lead.id, cat.staff.anna.id);
    }
    expect((await taskByKey("marktgenehmigung_beantragen")).assigneeId).toBe(cat.staff.anna.id);
  });

  it("unassigning a role unassigns its open tasks; assigning again fills them", async () => {
    expect((await setEventDuty(owner, eventId, cat.roles.setup.id, null)).tasks).toBe(1);
    expect((await taskByKey("plakate_aufhaengen")).assigneeId).toBeNull();
    const filled = await setEventDuty(owner, eventId, cat.roles.setup.id, cat.staff.anna.id);
    expect(filled).toMatchObject({ changed: true, tasks: 1 });
    expect((await taskByKey("plakate_aufhaengen")).assigneeId).toBe(cat.staff.anna.id);
  });

  it("the undo path (expected) moves the tasks back", async () => {
    await setEventDuty(owner, eventId, cat.roles.lead.id, cat.staff.ben.id);
    const undone = await setEventDuty(
      owner,
      eventId,
      cat.roles.lead.id,
      cat.staff.anna.id,
      cat.staff.ben.id,
    );
    expect(undone.tasks).toBe(1);
    expect((await taskByKey("marktgenehmigung_beantragen")).assigneeId).toBe(cat.staff.anna.id);
  });

  it("changes nothing at other events and reports 0 when the person stays", async () => {
    const [other] = await createEventsFromPreset(owner, cat.presets.flea.id, ["2027-04-10"]);
    await setEventDuty(owner, eventId, cat.roles.lead.id, cat.staff.ben.id);
    const [otherTask] = await db
      .select()
      .from(task)
      .where(
        and(
          eq(task.eventId, other?.id ?? ""),
          eq(task.templateStableKey, "marktgenehmigung_beantragen"),
        ),
      );
    expect(otherTask?.assigneeId).toBe(cat.staff.anna.id);
    expect((await setEventDuty(owner, eventId, cat.roles.lead.id, cat.staff.ben.id)).tasks).toBe(0);
  });
});
