import { auditLog, event, eventDuty, nextTimeNote, user } from "@marktwerk/db/schema";
import { and, asc, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { Actor } from "@/server/actor";
import { db } from "@/server/db";
import {
  getEventNextTimeNotes,
  listNextTimeNotes,
  listOpenNextTimeNotes,
} from "@/server/queries/next-time-notes";
import { createEventsFromPreset, createManualEvent } from "@/server/services/events";
import {
  addNextTimeNote,
  deleteNextTimeNote,
  NextTimeNoteInputError,
  setNextTimeNoteDone,
} from "@/server/services/next-time-notes";
import { createActor, resetDatabase, seedCatalogue } from "../helpers/fixtures";
import { insertSeason, insertTask } from "../helpers/tasks";

/**
 * "Fürs nächste Mal" (Fahrplan R25): notes against a market, written at a date, from a task or on the market page,
 * shown on the market's next date; done with undo; audited; field users only at their dates.
 */

let cat: Awaited<ReturnType<typeof seedCatalogue>>;
let owner: Actor;
let staff: Actor;
/** Flea dates 01.11., 29.11. and 13.12.2026 (the first one is over on 13.11.). */
let dates: { id: string; startsOn: string }[];

const TODAY = "2026-11-13";

const isForbidden = (error: unknown) =>
  String((error as { digest?: unknown })?.digest ?? "").includes("403");

const codeOf = async (p: Promise<unknown>) => {
  try {
    await p;
    return null;
  } catch (error) {
    if (error instanceof NextTimeNoteInputError) return error.code;
    throw error;
  }
};

const auditOf = (noteId: string) =>
  db
    .select()
    .from(auditLog)
    .where(and(eq(auditLog.entityType, "next_time_note"), eq(auditLog.entityId, noteId)))
    .orderBy(asc(auditLog.at), asc(auditLog.id));

beforeEach(async () => {
  await resetDatabase();
  cat = await seedCatalogue();
  owner = await createActor("owner");
  staff = await createActor("staff");
  const created = await createEventsFromPreset(owner, cat.presets.flea.id, [
    "2026-11-01",
    "2026-11-29",
    "2026-12-13",
  ]);
  const rows = await db
    .select({ id: event.id, startsOn: event.startsOn })
    .from(event)
    .where(eq(event.presetId, cat.presets.flea.id))
    .orderBy(asc(event.startsOn));
  expect(rows).toHaveLength(created.length);
  dates = rows;
});

afterAll(async () => {
  await db.$client.end();
});

const date = (i: number) => {
  const d = dates[i];
  if (!d) throw new Error(`no date ${i}`);
  return { ...d, presetId: cat.presets.flea.id };
};

describe("addNextTimeNote", () => {
  it("stores the note against the date's market, trimmed, and audits it", async () => {
    const added = await addNextTimeNote(
      staff,
      { eventId: date(0).id },
      "  Strom am Stand 12 fehlt \r\n",
    );
    expect(added.presetId).toBe(cat.presets.flea.id);

    const [row] = await db.select().from(nextTimeNote).where(eq(nextTimeNote.id, added.id));
    expect(row).toMatchObject({
      presetId: cat.presets.flea.id,
      eventId: date(0).id,
      taskId: null,
      body: "Strom am Stand 12 fehlt",
      createdById: staff.id,
      doneAt: null,
    });
    const entries = await auditOf(added.id);
    expect(entries.map((e) => e.action)).toEqual(["next_time_note.create"]);
    expect(entries[0]).toMatchObject({ actorId: staff.id });
    expect(entries[0]?.diff).toMatchObject({
      presetId: cat.presets.flea.id,
      eventId: date(0).id,
      body: "Strom am Stand 12 fehlt",
    });
  });

  it("takes the date and market from a task (task drawer)", async () => {
    const first = await insertTask({ title: "Strom prüfen", eventId: date(0).id });
    const added = await addNextTimeNote(
      owner,
      { taskId: first.id },
      "Ordnungsamt will Plan 2 Wochen früher",
    );
    const [row] = await db.select().from(nextTimeNote).where(eq(nextTimeNote.id, added.id));
    expect(row).toMatchObject({
      presetId: cat.presets.flea.id,
      eventId: date(0).id,
      taskId: first.id,
    });
  });

  it("takes the market from a season task (no date)", async () => {
    const season = await insertSeason(cat, 2027);
    const seasonTask = await insertTask({ title: "Termine planen", seasonId: season.id });
    const added = await addNextTimeNote(staff, { taskId: seasonTask.id }, "Früher anfragen");
    const [row] = await db.select().from(nextTimeNote).where(eq(nextTimeNote.id, added.id));
    expect(row).toMatchObject({
      presetId: cat.presets.flea.id,
      eventId: null,
      taskId: seasonTask.id,
    });
    // A task without date and season has no market.
    const loose = await insertTask({ title: "Lose Aufgabe" });
    expect(await codeOf(addNextTimeNote(owner, { taskId: loose.id }, "Text"))).toBe("no_market");
  });

  it("writes on the market page without a date", async () => {
    const added = await addNextTimeNote(owner, { presetId: cat.presets.flea.id }, "Neue Toiletten");
    const [row] = await db.select().from(nextTimeNote).where(eq(nextTimeNote.id, added.id));
    expect(row).toMatchObject({ eventId: null, taskId: null, presetId: cat.presets.flea.id });
  });

  it("refuses empty and too long text, unknown targets and dates without a market", async () => {
    expect(await codeOf(addNextTimeNote(staff, { eventId: date(0).id }, "   "))).toBe("empty");
    expect(await codeOf(addNextTimeNote(staff, { eventId: date(0).id }, "x".repeat(501)))).toBe(
      "too_long",
    );
    expect(
      await codeOf(
        addNextTimeNote(staff, { eventId: "00000000-0000-0000-0000-000000000000" }, "Text"),
      ),
    ).toBe("not_found");
    expect(await codeOf(addNextTimeNote(staff, { eventId: "kaputt" }, "Text"))).toBe("not_found");

    const single = await createManualEvent(owner, {
      name: "Einzeltermin",
      eventTypeId: cat.type.id,
      venueId: cat.venue.id,
      durationDays: 1,
      pricePerMCents: 0,
      bookingFeeCents: 0,
      startsOn: "2026-12-20",
    });
    expect(await codeOf(addNextTimeNote(staff, { eventId: single.id }, "Text"))).toBe("no_market");
    expect(await db.select().from(nextTimeNote)).toHaveLength(0);
  });
});

describe("setNextTimeNoteDone and deleteNextTimeNote", () => {
  it("marks done, undoes it, and audits only real changes", async () => {
    const { id } = await addNextTimeNote(staff, { eventId: date(0).id }, "Kabeltrommel fehlt");
    expect(await setNextTimeNoteDone(owner, id, true)).toMatchObject({ changed: true });
    const [done] = await db.select().from(nextTimeNote).where(eq(nextTimeNote.id, id));
    expect(done?.doneAt).toBeInstanceOf(Date);
    expect(done?.doneById).toBe(owner.id);

    // Twice is a no-op.
    expect(await setNextTimeNoteDone(owner, id, true)).toMatchObject({ changed: false });
    // The undo.
    expect(await setNextTimeNoteDone(owner, id, false)).toMatchObject({ changed: true });
    const [open] = await db.select().from(nextTimeNote).where(eq(nextTimeNote.id, id));
    expect(open).toMatchObject({ doneAt: null, doneById: null });

    expect((await auditOf(id)).map((e) => e.action)).toEqual([
      "next_time_note.create",
      "next_time_note.done",
      "next_time_note.reopen",
    ]);
  });

  it("lets the author take a note back, others only as owner or manager", async () => {
    const { id } = await addNextTimeNote(owner, { eventId: date(0).id }, "Bühne früher aufbauen");
    const other = await createActor("staff", "kollegin@test.local");
    // createActor derives the id from the role; give the second staff login its own id.
    const colleague: Actor = { ...other, id: "user-staff-2" };
    await db
      .insert(user)
      .values({
        id: colleague.id,
        name: "Kollegin",
        email: "kollegin2@test.local",
        emailVerified: true,
        role: "staff",
      })
      .onConflictDoNothing();
    await expect(deleteNextTimeNote(colleague, id)).rejects.toSatisfy(isForbidden);

    const mine = await addNextTimeNote(colleague, { eventId: date(0).id }, "Mein Tippfehler");
    await deleteNextTimeNote(colleague, mine.id);
    await deleteNextTimeNote(owner, id);
    expect(await db.select().from(nextTimeNote)).toHaveLength(0);
    const [entry] = (await auditOf(mine.id)).filter((e) => e.action === "next_time_note.delete");
    expect(entry?.diff).toMatchObject({ body: "Mein Tippfehler", done: false });
  });
});

describe("queries", () => {
  it("lists open notes newest first and the done ones apart, with author and date", async () => {
    const a = await addNextTimeNote(staff, { eventId: date(0).id }, "Erste Notiz");
    const b = await addNextTimeNote(owner, { presetId: cat.presets.flea.id }, "Zweite Notiz");
    const c = await addNextTimeNote(staff, { eventId: date(0).id }, "Dritte Notiz");
    await setNextTimeNoteDone(owner, c.id, true);
    // Another market's note never shows here.
    await addNextTimeNote(owner, { presetId: cat.presets.festival.id }, "Fremder Markt");

    const list = await listNextTimeNotes(staff, cat.presets.flea.id);
    expect(list.open.map((n) => n.id)).toEqual([b.id, a.id]);
    expect(list.done.map((n) => n.id)).toEqual([c.id]);
    expect(list.doneCount).toBe(1);
    expect(list.open[1]).toMatchObject({
      body: "Erste Notiz",
      authorName: "Test staff",
      event: { id: date(0).id, startsOn: "2026-11-01", archived: false },
    });
    expect(list.open[0]).toMatchObject({ event: null, authorName: "Test owner" });
    expect(list.done[0]).toMatchObject({ doneByName: "Test owner" });

    expect((await listOpenNextTimeNotes(owner, cat.presets.flea.id)).map((n) => n.id)).toEqual([
      b.id,
      a.id,
    ]);
  });

  it("shows the notes written before it on the market's next date only", async () => {
    const before = await addNextTimeNote(staff, { eventId: date(0).id }, "Vom 1. November");
    const page = await addNextTimeNote(owner, { presetId: cat.presets.flea.id }, "Vom Markt");
    const atNext = await addNextTimeNote(staff, { eventId: date(1).id }, "Für danach");

    const next = await getEventNextTimeNotes(owner, date(1), TODAY);
    expect(next).toMatchObject({ isNextDate: true, nextDate: null });
    expect(next?.forThisDate.map((n) => n.id)).toEqual([page.id, before.id]);
    expect(next?.open.map((n) => n.id)).toEqual([atNext.id, page.id, before.id]);

    const later = await getEventNextTimeNotes(owner, date(2), TODAY);
    expect(later).toMatchObject({
      isNextDate: false,
      nextDate: { id: date(1).id, startsOn: "2026-11-29" },
    });

    // Once the 29.11. is cancelled, the 13.12. is next and also carries the note written on the 29.11.
    await db
      .update(event)
      .set({ status: "cancelled" })
      .where(eq(event.id, date(1).id));
    const after = await getEventNextTimeNotes(owner, date(2), TODAY);
    expect(after?.isNextDate).toBe(true);
    expect(after?.forThisDate.map((n) => n.id)).toEqual([atNext.id, page.id, before.id]);

    // A done note leaves the list for the date.
    await setNextTimeNoteDone(owner, before.id, true);
    const done = await getEventNextTimeNotes(owner, date(2), TODAY);
    expect(done?.forThisDate.map((n) => n.id)).toEqual([atNext.id, page.id]);
  });
});

describe("permissions and field scope", () => {
  async function fieldActor(): Promise<Actor> {
    const base = await createActor("field");
    // The field login works at the first flea date only.
    await db.delete(eventDuty).where(eq(eventDuty.staffMemberId, cat.staff.anna.id));
    await db.insert(eventDuty).values({
      eventId: date(0).id,
      dutyRoleId: cat.roles.lead.id,
      staffMemberId: cat.staff.anna.id,
    });
    return { ...base, staffMemberId: cat.staff.anna.id };
  }

  it("lets a field user write and tick notes at their date, nowhere else", async () => {
    const field = await fieldActor();
    const own = await addNextTimeNote(field, { eventId: date(0).id }, "Strom am Stand 12 fehlt");
    expect(await codeOf(addNextTimeNote(field, { eventId: date(1).id }, "Text"))).toBe("not_found");
    await expect(
      addNextTimeNote(field, { presetId: cat.presets.flea.id }, "Text"),
    ).rejects.toSatisfy(isForbidden);
    expect(await setNextTimeNoteDone(field, own.id, true)).toMatchObject({ changed: true });

    // A note of a market where the field user works at no date is invisible.
    const foreign = await addNextTimeNote(
      owner,
      { presetId: cat.presets.festival.id },
      "Fremder Markt",
    );
    expect(await codeOf(setNextTimeNoteDone(field, foreign.id, true))).toBe("not_found");
    expect((await listNextTimeNotes(field, cat.presets.festival.id)).open).toHaveLength(0);
    expect((await listNextTimeNotes(field, cat.presets.flea.id)).done).toHaveLength(1);
  });

  it("refuses everybody without a login role", async () => {
    const nobody: Actor = { ...owner, role: null as never };
    await expect(addNextTimeNote(nobody, { eventId: date(0).id }, "Text")).rejects.toSatisfy(
      isForbidden,
    );
    expect((await listNextTimeNotes(nobody, cat.presets.flea.id)).open).toEqual([]);
  });
});
