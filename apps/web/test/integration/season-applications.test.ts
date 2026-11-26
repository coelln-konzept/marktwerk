import { eventPermit, permit, permitRequirement, task, venue } from "@marktwerk/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Actor } from "@/server/actor";
import { db } from "@/server/db";
import { listDueItems, listOtherTasks } from "@/server/queries/overview";
import { dueItems, seasonApplications } from "@/server/queries/permits";
import { getTaskDetail } from "@/server/queries/tasks";
import { moveTask, setTaskStatus, undoTaskChange } from "@/server/services/tasks";
import { createActor, resetDatabase, seedCatalogue } from "../helpers/fixtures";
import { asStaff, insertEvent } from "../helpers/tasks";

/*
 * Season applications (Fahrplan SAI8): the season permits not filed yet show on the Übersicht as one line per Ort and
 * season ("Saison-Anträge"), their own "… beantragen" tasks leave its task lists, the task drawer names the permit
 * and its Ort, and ticking that task done files the permit (undo takes it back).
 *
 * Business "today" is Thursday 26 Nov 2026: the 2027 season has not started.
 */

const TODAY = "2026-11-26";

let cat: Awaited<ReturnType<typeof seedCatalogue>>;
let owner: Actor;
let field: Actor;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-26T10:00:00+01:00"));
  await resetDatabase();
  cat = await seedCatalogue();
  owner = await createActor("owner");
  field = asStaff(await createActor("field"), cat.staff.anna);
});

afterEach(() => {
  vi.useRealTimers();
});

afterAll(async () => {
  await db.$client.end();
});

type Cadence = (typeof permitRequirement.cadence.enumValues)[number];
type Status = (typeof permit.status.enumValues)[number];

/** A requirement of an Ort with one permit of it, linked to the given events, plus its own apply task. */
async function seasonPermit(opts: {
  title: string;
  venueId?: string;
  cadence?: Cadence;
  status?: Status;
  applyBy: string;
  season?: number | null;
  eventIds: string[];
}) {
  const venueId = opts.venueId ?? cat.venue.id;
  const [req] = await db
    .insert(permitRequirement)
    .values({
      venueId,
      category: "city",
      permitType: "water",
      title: opts.title,
      cadence: opts.cadence ?? "per_season",
      leadTimeDays: 120,
    })
    .returning();
  const [p] = await db
    .insert(permit)
    .values({
      requirementId: req?.id,
      venueId,
      season: opts.season === undefined ? 2027 : opts.season,
      category: "city",
      permitType: "water",
      title: opts.title,
      status: opts.status ?? "not_started",
      applyBy: opts.applyBy,
      responsibleStaffMemberId: cat.staff.anna.id,
    })
    .returning();
  if (!p) throw new Error("no permit");
  if (opts.eventIds.length)
    await db
      .insert(eventPermit)
      .values(opts.eventIds.map((eventId) => ({ eventId, permitId: p.id, required: true })));
  const [own] = await db
    .insert(task)
    .values({
      permitId: p.id,
      eventId: null,
      source: "permit",
      title: `${opts.title} beantragen`,
      phase: "pre",
      category: "permits",
      assigneeId: cat.staff.anna.id,
      dueAt: new Date(`${opts.applyBy}T22:59:00Z`),
    })
    .returning();
  if (!own) throw new Error("no task");
  return { permit: p, task: own };
}

async function secondVenue(name: string) {
  const [row] = await db
    .insert(venue)
    .values({ name, kind: "municipal", city: "Kerpen" })
    .returning();
  if (!row) throw new Error("no venue");
  return row;
}

describe("Saison-Anträge: one line per Ort and season", () => {
  it("groups the open season permits by Ort and season, overdue lines first, and leaves out the rest", async () => {
    const may = await insertEvent(cat, "Mai", "2027-05-02");
    const kerpen = await secondVenue("Kerpen Innenstadt");
    await seasonPermit({ title: "Standrohr", applyBy: "2026-12-18", eventIds: [may.id] });
    await seasonPermit({ title: "Festsetzung", applyBy: "2027-01-30", eventIds: [may.id] });
    await seasonPermit({
      title: "Ausschank",
      venueId: kerpen.id,
      applyBy: "2026-11-20",
      eventIds: [may.id],
    });
    await seasonPermit({
      title: "Plakatierung",
      venueId: kerpen.id,
      status: "preparing",
      applyBy: "2027-02-01",
      eventIds: [may.id],
    });
    // Left out: filed already, a per-date permit, one whose dates are all over.
    await seasonPermit({
      title: "Erlaubnis",
      status: "applied",
      applyBy: "2026-11-01",
      eventIds: [may.id],
    });
    await seasonPermit({
      title: "Halteverbot",
      cadence: "per_event",
      applyBy: "2027-04-11",
      eventIds: [may.id],
    });
    const past = await insertEvent(cat, "Vorbei", "2026-06-07");
    await seasonPermit({ title: "Alt", season: 2026, applyBy: "2026-02-01", eventIds: [past.id] });

    const lines = await seasonApplications(owner, TODAY);
    expect(
      lines.map((l) => [
        l.venueName,
        l.season,
        l.overdue,
        l.nextApplyBy,
        l.permits.map((p) => p.title),
      ]),
    ).toEqual([
      ["Kerpen Innenstadt", 2027, 1, "2026-11-20", ["Ausschank", "Plakatierung"]],
      ["Messeplatz Test", 2027, 0, "2026-12-18", ["Standrohr", "Festsetzung"]],
    ]);
    const [kerpenLine] = lines;
    expect(kerpenLine?.permits.map((p) => [p.state, p.overdue, p.responsibleName])).toEqual([
      ["missing", true, "Anna Test"],
      ["preparing", false, "Anna Test"],
    ]);
    // Without permit:read the panel is empty.
    expect(await seasonApplications(field, TODAY)).toEqual([]);
  });

  it("takes the season of a multi-year permit from its next date", async () => {
    const may = await insertEvent(cat, "Mai", "2027-05-02");
    await seasonPermit({
      title: "Eigentümer",
      cadence: "multi_year",
      season: null,
      applyBy: "2027-01-30",
      eventIds: [may.id],
    });
    expect((await seasonApplications(owner, TODAY)).map((l) => l.season)).toEqual([2027]);
  });

  it("marks the season permit in the due feed, so Genehmigungen demnächst can leave it out", async () => {
    const may = await insertEvent(cat, "Mai", "2027-05-02");
    await seasonPermit({ title: "Standrohr", applyBy: "2026-12-18", eventIds: [may.id] });
    await seasonPermit({
      title: "Halteverbot",
      cadence: "per_event",
      applyBy: "2026-12-19",
      eventIds: [may.id],
    });
    const items = await dueItems(owner, TODAY, 60);
    expect(items.map((i) => [i.title, i.urgency, i.seasonApplication ?? false])).toEqual([
      ["Standrohr", "upcoming", true],
      ["Halteverbot", "upcoming", false],
    ]);
  });
});

describe("the season permit's own task", () => {
  it("leaves the Übersicht's task lists for those who see the permits, and stays for the others", async () => {
    const may = await insertEvent(cat, "Mai", "2027-05-02");
    const soon = await seasonPermit({
      title: "Standrohr",
      applyBy: "2026-11-28",
      eventIds: [may.id],
    });
    const later = await seasonPermit({
      title: "Festsetzung",
      applyBy: "2027-01-30",
      eventIds: [may.id],
    });

    const taskIds = async (actor: Actor) =>
      (await listDueItems(actor, TODAY)).filter((i) => i.kind === "task").map((i) => i.id);
    // The permit row shows under Nächste Tage instead; the task does not.
    expect(await taskIds(owner)).toEqual([]);
    expect((await listDueItems(owner, TODAY)).map((i) => [i.kind, i.title])).toEqual([
      ["permit", "Standrohr"],
    ]);
    expect((await listOtherTasks(owner, TODAY)).map((t) => t.id)).toEqual([]);
    // A field user reads no permits: their own apply tasks stay where they were.
    expect(await taskIds(field)).toEqual([soon.task.id]);
    expect((await listOtherTasks(field, TODAY)).map((t) => t.id)).toEqual([later.task.id]);
  });

  it("names its permit and Ort in the task drawer", async () => {
    const may = await insertEvent(cat, "Mai", "2027-05-02");
    const { task: own, permit: p } = await seasonPermit({
      title: "Standrohr",
      applyBy: "2026-12-18",
      eventIds: [may.id],
    });
    const detail = await getTaskDetail(owner, own.id, TODAY);
    expect(detail?.permit).toEqual({
      id: p.id,
      title: "Standrohr",
      venueName: "Messeplatz Test",
      season: 2027,
      status: "not_started",
    });
    // No permit:read, no permit.
    expect((await getTaskDetail(field, own.id, TODAY))?.permit).toBeNull();
  });

  it("done files the permit (Beantragt, today), and undo takes it back", async () => {
    const may = await insertEvent(cat, "Mai", "2027-05-02");
    const { task: own, permit: p } = await seasonPermit({
      title: "Standrohr",
      applyBy: "2026-12-18",
      eventIds: [may.id],
    });
    const done = await setTaskStatus(owner, own.id, "done", {}, { today: TODAY });
    expect(done.permitFiled).toBe("Standrohr");
    const [filed] = await db.select().from(permit).where(eq(permit.id, p.id));
    expect(filed).toMatchObject({ status: "applied", appliedAt: TODAY });
    expect(await seasonApplications(owner, TODAY)).toEqual([]);

    await undoTaskChange(owner, done.auditId as string);
    const [back] = await db.select().from(permit).where(eq(permit.id, p.id));
    expect(back).toMatchObject({ status: "not_started", appliedAt: null });
    const [reopened] = await db.select().from(task).where(eq(task.id, own.id));
    expect(reopened?.status).toBe("todo");
  });

  it("undo leaves a permit alone that was changed since", async () => {
    const may = await insertEvent(cat, "Mai", "2027-05-02");
    const { task: own, permit: p } = await seasonPermit({
      title: "Standrohr",
      applyBy: "2026-12-18",
      eventIds: [may.id],
    });
    const done = await setTaskStatus(owner, own.id, "done", {}, { today: TODAY });
    await db.update(permit).set({ status: "granted", grantedAt: TODAY }).where(eq(permit.id, p.id));
    await undoTaskChange(owner, done.auditId as string);
    const [kept] = await db.select().from(permit).where(eq(permit.id, p.id));
    expect(kept?.status).toBe("granted");
  });

  it("a move into Erledigt files it too; a filed permit and a field user's tick leave the permit as it is", async () => {
    const may = await insertEvent(cat, "Mai", "2027-05-02");
    const moved = await seasonPermit({
      title: "Standrohr",
      applyBy: "2026-12-18",
      eventIds: [may.id],
    });
    const result = await moveTask(owner, moved.task.id, "done", { after: null }, {});
    expect(result.permitFiled).toBe("Standrohr");
    expect((await db.select().from(permit).where(eq(permit.id, moved.permit.id)))[0]?.status).toBe(
      "applied",
    );

    const prepared = await seasonPermit({
      title: "Festsetzung",
      status: "preparing",
      applyBy: "2026-12-18",
      eventIds: [may.id],
    });
    // A field user may tick their own task, but not write permits: the permit stays.
    const fieldDone = await setTaskStatus(field, prepared.task.id, "done");
    expect(fieldDone.permitFiled).toBeNull();
    expect(
      (await db.select().from(permit).where(eq(permit.id, prepared.permit.id)))[0]?.status,
    ).toBe("preparing");
  });
});
