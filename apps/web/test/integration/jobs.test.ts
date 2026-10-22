import {
  escalationLog,
  event,
  eventPermit,
  notification,
  notificationPreference,
  outboundMessage,
  permit,
  staffMember,
  task,
} from "@marktwerk/db/schema";
import { dailyDigest, deadlineSweep, type MailTransport, sendQueuedEmails } from "@marktwerk/jobs";
import { and, asc, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { createActor, resetDatabase, seedCatalogue } from "../helpers/fixtures";

/** Wed 21.10.2026, 12:00 Berlin (CEST). */
const NOW = new Date("2026-10-21T10:00:00Z");
const DAY = 24 * 60 * 60 * 1000;
const daysFromNow = (days: number) => new Date(NOW.getTime() + days * DAY);

let cat: Awaited<ReturnType<typeof seedCatalogue>>;
let annaId: string;
let benId: string;
let olgaId: string;
let fieldId: string;

beforeEach(async () => {
  await resetDatabase();
  cat = await seedCatalogue();
  // Anna works in the office (staff), Ben is the manager, Olga the owner, Fritz is field crew.
  await createActor("staff");
  await createActor("manager");
  await createActor("owner");
  await createActor("field");
  annaId = cat.staff.anna.id;
  benId = cat.staff.ben.id;
  const [olga, fritz] = await db
    .insert(staffMember)
    .values([
      { displayName: "Olga Test", firstName: "Olga", lastName: "Test" },
      { displayName: "Fritz Test", firstName: "Fritz", lastName: "Test" },
    ])
    .returning();
  olgaId = olga?.id ?? "";
  fieldId = fritz?.id ?? "";
  const link = (id: string, userId: string, email: string) =>
    db.update(staffMember).set({ userId, email }).where(eq(staffMember.id, id));
  await link(annaId, "user-staff", "anna@test.local");
  await link(benId, "user-manager", "ben@test.local");
  await link(olgaId, "user-owner", "olga@test.local");
  await link(fieldId, "user-field", "fritz@test.local");
});

afterAll(async () => {
  await db.$client.end();
});

type NewTask = typeof task.$inferInsert;
const addTask = async (values: NewTask) => {
  const [row] = await db.insert(task).values(values).returning();
  if (!row) throw new Error("no task");
  return row;
};
type NewPermit = Partial<typeof permit.$inferInsert>;
const addPermit = async (values: NewPermit = {}) => {
  const [row] = await db
    .insert(permit)
    .values({
      venueId: cat.venue.id,
      category: "city",
      permitType: "water",
      title: "Wasser 2027",
      ...values,
    })
    .returning();
  if (!row) throw new Error("no permit");
  return row;
};
const notificationsOf = async (staffId: string) =>
  db
    .select()
    .from(notification)
    .where(eq(notification.recipientStaffMemberId, staffId))
    .orderBy(asc(notification.createdAt), asc(notification.id));

describe("deadline sweep: tasks", () => {
  it("reminds the assignee at the stage of the priority and does it once", async () => {
    const t = await addTask({
      title: "Plakate bestellen",
      assigneeId: annaId,
      dueAt: daysFromNow(2),
    });
    await addTask({ title: "Ohne Person", dueAt: daysFromNow(-3) });
    await addTask({ title: "Weit weg", assigneeId: annaId, dueAt: daysFromNow(20) });
    await addTask({
      title: "Erledigt",
      assigneeId: annaId,
      dueAt: daysFromNow(-3),
      status: "done",
      completedAt: NOW,
    });
    await addTask({
      title: "Beantragen",
      assigneeId: annaId,
      dueAt: daysFromNow(-3),
      source: "permit",
    });

    const first = await deadlineSweep(db, NOW);
    expect(first).toMatchObject({ created: 1, escalated: 0, emails: 0 });
    const rows = await notificationsOf(annaId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      reason: "due_soon",
      severity: "info",
      subjectType: "task",
      subjectId: t.id,
      link: `/board?detail=task:${t.id}`,
    });
    expect(rows[0]?.title).toBe("Fällig in 2 Tagen: Plakate bestellen");
    expect(rows[0]?.dedupeKey).toBe(`task:${t.id}:due-3d:${daysFromNow(2).toISOString()}`);

    // Idempotent: a second and third sweep add nothing.
    expect(await deadlineSweep(db, NOW)).toMatchObject({ created: 0, escalated: 0, emails: 0 });
    expect(await deadlineSweep(db, new Date(NOW.getTime() + 60 * 60 * 1000))).toMatchObject({
      created: 0,
    });

    // Closer to the deadline the next stage fires, once.
    const later = new Date(daysFromNow(2).getTime() - 12 * 60 * 60 * 1000);
    expect((await deadlineSweep(db, later)).created).toBe(1);
    expect((await deadlineSweep(db, later)).created).toBe(0);
    const stages = (await notificationsOf(annaId)).map((r) => r.dedupeKey?.split(":")[2]);
    expect(stages).toEqual(["due-3d", "due-1d"]);
  });

  it("re-arms the reminders when the due date moves", async () => {
    const t = await addTask({ title: "Aufgabe", assigneeId: annaId, dueAt: daysFromNow(2) });
    await deadlineSweep(db, NOW);
    await db
      .update(task)
      .set({ dueAt: daysFromNow(2.5) })
      .where(eq(task.id, t.id));
    expect((await deadlineSweep(db, NOW)).created).toBe(1);
  });

  it("an overdue high-priority task: assignee gets critical + immediate email, manager only gets the escalation", async () => {
    const t = await addTask({
      title: "Halteverbot aufstellen",
      assigneeId: annaId,
      priority: "high",
      dueAt: daysFromNow(-2),
      eventId: null,
    });
    const result = await deadlineSweep(db, NOW);
    expect(result).toMatchObject({ created: 2, escalated: 1, emails: 2 });

    const anna = await notificationsOf(annaId);
    expect(anna).toHaveLength(1);
    expect(anna[0]).toMatchObject({ reason: "overdue", severity: "critical" });

    const ben = await notificationsOf(benId);
    expect(ben).toHaveLength(1);
    expect(ben[0]).toMatchObject({
      reason: "escalated",
      severity: "critical",
      subjectType: "task",
      subjectId: t.id,
    });
    expect(ben[0]?.title).toBe("Eskaliert: Halteverbot aufstellen ist seit 2 Tagen überfällig");
    expect(ben[0]?.body).toContain("zuständig: Anna Test");
    // The owner and the field user are not told.
    expect(await notificationsOf(olgaId)).toHaveLength(0);
    expect(await notificationsOf(fieldId)).toHaveLength(0);

    const log = await db.select().from(escalationLog);
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({
      subjectType: "task",
      subjectId: t.id,
      level: 2,
      escalatedToStaffMemberId: benId,
    });

    const mails = await db
      .select()
      .from(outboundMessage)
      .orderBy(asc(outboundMessage.recipientAddress));
    expect(mails.map((m) => [m.recipientAddress, m.templateKey, m.status])).toEqual([
      ["anna@test.local", "notification.immediate", "queued"],
      ["ben@test.local", "notification.immediate", "queued"],
    ]);
    expect(mails[1]?.subject).toContain("Eskaliert: Halteverbot aufstellen");
    expect(mails[1]?.renderedText).toContain("http://localhost:3000/board?detail=task:");

    // Nothing again on the next sweeps.
    expect(await deadlineSweep(db, NOW)).toEqual({ created: 0, escalated: 0, emails: 0 });
    expect(await deadlineSweep(db, daysFromNow(0.1))).toEqual({
      created: 0,
      escalated: 0,
      emails: 0,
    });
    expect(await db.select().from(outboundMessage)).toHaveLength(2);
  });

  it("does not escalate on the day it became overdue, nor normal-priority tasks", async () => {
    await addTask({
      title: "Frisch",
      assigneeId: annaId,
      priority: "high",
      dueAt: new Date(NOW.getTime() - 3 * 60 * 60 * 1000),
    });
    await addTask({
      title: "Normal",
      assigneeId: annaId,
      priority: "normal",
      dueAt: daysFromNow(-5),
    });
    const result = await deadlineSweep(db, NOW);
    expect(result.escalated).toBe(0);
    expect(await notificationsOf(benId)).toHaveLength(0);
    // The normal task is overdue for its assignee, without an immediate email.
    expect((await notificationsOf(annaId)).map((n) => n.severity).sort()).toEqual([
      "critical",
      "warning",
    ]);
    expect(result.emails).toBe(1);
  });

  it("leaves old backlog (overdue for over 30 days) to the digest instead of flooding people", async () => {
    await addTask({
      title: "Uralt",
      assigneeId: annaId,
      priority: "high",
      dueAt: daysFromNow(-40),
    });
    await addPermit({
      status: "not_started",
      applyBy: "2026-08-01",
      responsibleStaffMemberId: annaId,
    });
    expect(await deadlineSweep(db, NOW)).toEqual({ created: 0, escalated: 0, emails: 0 });
    expect(await db.select().from(notification)).toHaveLength(0);
    await dailyDigest(db, NOW);
    const [mail] = await db
      .select()
      .from(outboundMessage)
      .where(eq(outboundMessage.recipientAddress, "anna@test.local"));
    expect(mail?.renderedText).toContain("Uralt");
    expect(mail?.renderedText).toContain("Wasser 2027");
  });

  it("falls back to the owner when there is no manager", async () => {
    await db.update(staffMember).set({ userId: null }).where(eq(staffMember.id, benId));
    await addTask({
      title: "Kritisch",
      assigneeId: annaId,
      priority: "high",
      dueAt: daysFromNow(-2),
    });
    await deadlineSweep(db, NOW);
    expect((await notificationsOf(olgaId)).map((n) => n.reason)).toEqual(["escalated"]);
  });

  it("skips tasks of cancelled events", async () => {
    const [ev] = await db
      .insert(event)
      .values({
        eventTypeId: cat.type.id,
        venueId: cat.venue.id,
        name: "Abgesagt",
        season: 2026,
        startsOn: "2026-10-25",
        endsOn: "2026-10-25",
        times: cat.times,
        status: "cancelled",
        pricePerMCents: 0,
        bookingFeeCents: 0,
      })
      .returning();
    await addTask({
      title: "Aufgabe",
      assigneeId: annaId,
      dueAt: daysFromNow(-4),
      eventId: ev?.id,
    });
    expect((await deadlineSweep(db, NOW)).created).toBe(0);
  });
});

describe("deadline sweep: permits", () => {
  async function upcomingEvent(day = "2026-12-05") {
    const [ev] = await db
      .insert(event)
      .values({
        eventTypeId: cat.type.id,
        venueId: cat.venue.id,
        name: "Flohmarkt",
        season: Number(day.slice(0, 4)),
        startsOn: day,
        endsOn: day,
        times: cat.times,
        pricePerMCents: 0,
        bookingFeeCents: 0,
      })
      .returning();
    if (!ev) throw new Error("no event");
    return ev;
  }

  it("reminds the responsible person about apply-by and escalates the overdue permit to the manager", async () => {
    const p = await addPermit({
      status: "preparing",
      applyBy: "2026-10-18",
      responsibleStaffMemberId: annaId,
    });
    const result = await deadlineSweep(db, NOW);
    expect(result).toMatchObject({ created: 2, escalated: 1, emails: 2 });
    const anna = await notificationsOf(annaId);
    expect(anna).toHaveLength(1);
    expect(anna[0]).toMatchObject({
      reason: "permit_apply_by",
      severity: "critical",
      subjectType: "permit",
      subjectId: p.id,
      link: `/logbuch?genehmigung=${p.id}`,
      title: "Antrag überfällig: Wasser 2027",
    });
    const ben = await notificationsOf(benId);
    expect(ben.map((n) => n.reason)).toEqual(["escalated"]);
    expect(ben[0]?.title).toContain("Wasser 2027 ist seit 3 Tagen überfällig");
    expect(await deadlineSweep(db, NOW)).toEqual({ created: 0, escalated: 0, emails: 0 });
  });

  it("permit without a responsible person: the manager gets the reminder", async () => {
    await addPermit({ status: "not_started", applyBy: "2026-11-08" });
    const result = await deadlineSweep(db, NOW);
    expect(result.created).toBe(1);
    expect((await notificationsOf(benId)).map((n) => [n.reason, n.severity])).toEqual([
      ["permit_apply_by", "info"],
    ]);
    expect(await notificationsOf(olgaId)).toHaveLength(0);
  });

  it("reminds about a pending decision and about expiry, only for permits that still matter", async () => {
    const ev = await upcomingEvent();
    const waiting = await addPermit({
      status: "applied",
      expectedDecisionOn: "2026-10-26",
      responsibleStaffMemberId: annaId,
      title: "Markt",
    });
    const expiring = await addPermit({
      status: "granted",
      validUntil: "2026-11-15",
      responsibleStaffMemberId: annaId,
      title: "Toiletten",
    });
    await db.insert(eventPermit).values([
      { eventId: ev.id, permitId: waiting.id },
      { eventId: ev.id, permitId: expiring.id },
    ]);
    // History: covers only a past event.
    const past = await upcomingEvent("2026-06-07");
    const old = await addPermit({
      status: "not_started",
      applyBy: "2026-05-01",
      responsibleStaffMemberId: annaId,
      title: "Alt",
    });
    await db.insert(eventPermit).values({ eventId: past.id, permitId: old.id });

    await deadlineSweep(db, NOW);
    const anna = await notificationsOf(annaId);
    expect(anna.map((n) => n.reason).sort()).toEqual(["due_soon", "permit_decision_due"]);
    expect(anna.find((n) => n.reason === "due_soon")?.title).toContain(
      "Genehmigung läuft ab (15.11.2026): Toiletten",
    );
    expect(anna.find((n) => n.reason === "permit_decision_due")?.title).toContain(
      "Entscheidung erwartet bis 26.10.2026: Markt",
    );
    expect(await notificationsOf(benId)).toHaveLength(0);
  });

  it("respects the email preference for a reason", async () => {
    await db.insert(notificationPreference).values({
      staffMemberId: benId,
      reason: "escalated",
      channel: "email",
      enabled: false,
    });
    await addTask({
      title: "Kritisch",
      assigneeId: annaId,
      priority: "high",
      dueAt: daysFromNow(-2),
    });
    const result = await deadlineSweep(db, NOW);
    // Anna's overdue mail only; Ben still sees the in-app escalation.
    expect(result.emails).toBe(1);
    expect((await notificationsOf(benId)).map((n) => n.reason)).toEqual(["escalated"]);
  });
});

describe("daily digest", () => {
  it("sends office users their overdue, today and this-week items, once a day", async () => {
    await addTask({ title: "Überfälliges", assigneeId: annaId, dueAt: daysFromNow(-1) });
    await addTask({
      title: "Heutiges",
      assigneeId: annaId,
      dueAt: new Date("2026-10-21T20:00:00Z"),
    });
    await addTask({ title: "Nächste Woche", assigneeId: annaId, dueAt: daysFromNow(6) });
    await addTask({ title: "Später", assigneeId: annaId, dueAt: daysFromNow(30) });
    await addTask({ title: "Fremd", assigneeId: benId, dueAt: daysFromNow(-1) });
    await addTask({
      title: "Beantragen",
      assigneeId: annaId,
      dueAt: daysFromNow(-1),
      source: "permit",
    });
    await addPermit({
      status: "not_started",
      applyBy: "2026-10-23",
      responsibleStaffMemberId: annaId,
      title: "Wasser",
    });
    // Field crew gets no digest even with items.
    await addTask({ title: "Feld", assigneeId: fieldId, dueAt: daysFromNow(-1) });

    const result = await dailyDigest(db, NOW);
    expect(result.queued).toBe(2);
    const mails = await db
      .select()
      .from(outboundMessage)
      .orderBy(asc(outboundMessage.recipientAddress));
    expect(mails.map((m) => m.recipientAddress)).toEqual(["anna@test.local", "ben@test.local"]);

    const anna = mails[0];
    expect(anna).toMatchObject({
      channel: "email",
      templateKey: "digest.daily",
      status: "queued",
      recipientStaffMemberId: annaId,
    });
    expect(anna?.subject).toBe(
      "marktwerk · 21.10.2026: 1 überfällig, 1 heute fällig, 2 diese Woche",
    );
    const text = anna?.renderedText ?? "";
    expect(text).toContain("Guten Morgen Anna,");
    expect(text).toContain("Überfälliges");
    expect(text).toContain("Heutiges");
    expect(text).toContain("Nächste Woche");
    expect(text).toContain("Genehmigung: Wasser (fällig 23.10.2026)");
    expect(text).not.toContain("Später");
    expect(text).not.toContain("Fremd");
    expect(text).not.toContain("Beantragen");
    expect(text).toContain("http://localhost:3000/logbuch?genehmigung=");

    // Ben's digest only has his own task.
    expect(mails[1]?.renderedText).toContain("Fremd");
    expect(mails[1]?.renderedText).not.toContain("Überfälliges");

    // Idempotent per day; Olga and Fritz have nothing / are not office users.
    expect((await dailyDigest(db, NOW)).queued).toBe(0);
    expect(await db.select().from(outboundMessage)).toHaveLength(2);
    // The next morning is a new digest.
    expect((await dailyDigest(db, daysFromNow(1))).queued).toBe(2);
  });

  it("sends nothing when there is nothing, and honours the opt-out", async () => {
    expect((await dailyDigest(db, NOW)).queued).toBe(0);
    await addTask({ title: "Aufgabe", assigneeId: annaId, dueAt: daysFromNow(-1) });
    await db.insert(notificationPreference).values([
      { staffMemberId: annaId, reason: "overdue", channel: "email", enabled: false },
      { staffMemberId: annaId, reason: "due_soon", channel: "email", enabled: false },
    ]);
    expect((await dailyDigest(db, NOW)).queued).toBe(0);
  });
});

describe("sending queued emails", () => {
  function fake(behaviour: (to: string, n: number) => void = () => {}) {
    const sent: { to: string; subject: string; text: string }[] = [];
    let calls = 0;
    const transport: MailTransport = {
      name: "fake",
      async send(message) {
        calls += 1;
        behaviour(message.to, calls);
        sent.push(message);
        return { externalId: `id-${calls}` };
      },
    };
    return { transport, sent };
  }
  const queue = async (patch: Partial<typeof outboundMessage.$inferInsert> = {}) => {
    const [row] = await db
      .insert(outboundMessage)
      .values({
        channel: "email",
        recipientStaffMemberId: annaId,
        recipientAddress: "anna@test.local",
        templateKey: "digest.daily",
        subject: "Betreff",
        renderedText: "Text",
        sendAfter: new Date(NOW.getTime() - 1000),
        ...patch,
      })
      .returning();
    if (!row) throw new Error("no message");
    return row;
  };

  it("delivers due messages once and marks them sent", async () => {
    const a = await queue();
    await queue({ sendAfter: daysFromNow(1) });
    await queue({ channel: "in_app" });
    const { transport, sent } = fake();
    expect(await sendQueuedEmails(db, transport, NOW)).toEqual({ sent: 1, failed: 0, retrying: 0 });
    expect(sent).toEqual([{ to: "anna@test.local", subject: "Betreff", text: "Text" }]);
    const [row] = await db.select().from(outboundMessage).where(eq(outboundMessage.id, a.id));
    expect(row).toMatchObject({ status: "sent", externalId: "id-1", attempts: 1, error: null });
    expect(row?.sentAt).toBeInstanceOf(Date);
    expect(await sendQueuedEmails(db, transport, NOW)).toEqual({ sent: 0, failed: 0, retrying: 0 });
    expect(sent).toHaveLength(1);
  });

  it("retries a failure later and gives up after five attempts", async () => {
    const m = await queue();
    const { transport } = fake(() => {
      throw new Error("connection refused");
    });
    expect(await sendQueuedEmails(db, transport, NOW)).toEqual({ sent: 0, failed: 0, retrying: 1 });
    let [row] = await db.select().from(outboundMessage).where(eq(outboundMessage.id, m.id));
    expect(row).toMatchObject({ status: "queued", attempts: 1, error: "connection refused" });
    expect(row?.sendAfter.toISOString()).toBe(
      new Date(NOW.getTime() + 10 * 60 * 1000).toISOString(),
    );
    // Not before the delay is over.
    expect((await sendQueuedEmails(db, transport, NOW)).retrying).toBe(0);

    let clock = NOW;
    for (let attempt = 2; attempt <= 5; attempt++) {
      clock = new Date(clock.getTime() + 24 * 60 * 60 * 1000);
      await sendQueuedEmails(db, transport, clock);
    }
    [row] = await db.select().from(outboundMessage).where(eq(outboundMessage.id, m.id));
    expect(row).toMatchObject({ status: "failed", attempts: 5, error: "connection refused" });
    clock = new Date(clock.getTime() + 24 * 60 * 60 * 1000);
    expect(await sendQueuedEmails(db, transport, clock)).toEqual({
      sent: 0,
      failed: 0,
      retrying: 0,
    });
  });

  it("fails a message without an address right away", async () => {
    const m = await queue({ recipientAddress: null });
    const { transport, sent } = fake();
    expect((await sendQueuedEmails(db, transport, NOW)).failed).toBe(1);
    expect(sent).toHaveLength(0);
    const [row] = await db
      .select()
      .from(outboundMessage)
      .where(and(eq(outboundMessage.id, m.id)));
    expect(row).toMatchObject({ status: "failed", error: "no recipient address" });
  });
});
