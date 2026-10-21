import { escalationLog, installment, notification, staffMember, user } from "@marktwerk/db/schema";
import { installmentReminders, JOBS } from "@marktwerk/jobs";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { createPayable, markInstallmentPaid } from "@/server/services/payables";
import { createActor, resetDatabase } from "../helpers/fixtures";

/** 08:00 UTC = 10:00 in Berlin, so the business date is 2026-10-21. */
const NOW = new Date("2026-10-21T08:00:00Z");
const TODAY = "2026-10-21";

let owner: Awaited<ReturnType<typeof createActor>>;
/** Staff members with a login, by role. */
const people: Record<string, string> = {};

async function addPerson(
  role: "owner" | "manager" | "staff" | "field",
  name: string,
  over: Partial<typeof user.$inferInsert> = {},
) {
  const actor = await createActor(role, `${name.toLowerCase()}@test.local`);
  await db
    .update(user)
    .set({ role, ...over })
    .where(eq(user.id, actor.id));
  const [member] = await db
    .insert(staffMember)
    .values({ displayName: name, firstName: name, lastName: "Test", userId: actor.id })
    .returning();
  if (!member) throw new Error("staff");
  people[role] = member.id;
  return { actor, member };
}

beforeEach(async () => {
  await resetDatabase();
  for (const key of Object.keys(people)) delete people[key];
  ({ actor: owner } = await addPerson("owner", "Olga"));
  await addPerson("manager", "Manni");
  await addPerson("staff", "Stefan");
  await addPerson("field", "Franz");
});

afterAll(async () => {
  await db.$client.end();
});

const mk = (
  title: string,
  dueOn: string,
  over: Record<string, unknown> = {},
  amountCents = 10_000,
) =>
  createPayable(
    owner,
    { title, scope: "company", category: "other", totalGrossCents: amountCents, ...over },
    [{ dueOn, amountCents }],
  );

const notes = () => db.select().from(notification);
const byTitle = async (needle: string) => (await notes()).filter((n) => n.title.includes(needle));

describe("installment reminders", () => {
  it("is registered as a scheduled job", () => {
    expect(JOBS["installment-reminders"].cron).toBeTruthy();
    expect(typeof JOBS["installment-reminders"].run).toBe("function");
  });

  it("notifies the office at 14 days, 3 days, on the due day and when overdue", async () => {
    await mk("Vierzehn", "2026-11-04"); // 14 days
    await mk("Zehn", "2026-10-31"); // 10 days: still the 14-day stage
    await mk("Drei", "2026-10-24"); // 3 days
    await mk("Heute", "2026-10-21");
    await mk("Gestern", "2026-10-20");
    await mk("Fern", "2026-11-05"); // 15 days: nothing yet

    const result = await installmentReminders(db, NOW);
    // owner and manager have finance:read; staff and field don't.
    expect(result).toEqual({ created: 10, escalated: 0 });
    const all = await notes();
    expect(new Set(all.map((n) => n.recipientStaffMemberId))).toEqual(
      new Set([people.owner, people.manager]),
    );
    expect(all.every((n) => n.reason === "installment_due")).toBe(true);
    expect((await byTitle("Fern")).length).toBe(0);

    const severity = async (needle: string) => (await byTitle(needle))[0]?.severity;
    expect(await severity("Vierzehn")).toBe("info");
    expect(await severity("Zehn")).toBe("info");
    expect(await severity("Drei")).toBe("warning");
    expect(await severity("Heute")).toBe("warning");
    expect(await severity("Gestern")).toBe("critical");

    const gestern = (await byTitle("Gestern"))[0];
    expect(gestern).toMatchObject({
      subjectType: "installment",
      link: expect.stringMatching(/^\/finanzen\/posten\/[0-9a-f-]{36}$/),
      state: "unread",
    });
    expect(gestern?.dedupeKey).toMatch(/^installment:[0-9a-f-]{36}:overdue:2026-10-20$/);
    expect(gestern?.body).toMatch(/Rate 1\/1, fällig am 20\.10\.2026, offen 100,00\s€/);
  });

  it("is idempotent: a second sweep adds nothing", async () => {
    await mk("Drei", "2026-10-24");
    expect((await installmentReminders(db, NOW)).created).toBe(2);
    expect(await installmentReminders(db, NOW)).toEqual({ created: 0, escalated: 0 });
    expect(await installmentReminders(db, new Date("2026-10-21T20:00:00Z"))).toEqual({
      created: 0,
      escalated: 0,
    });
    expect(await notes()).toHaveLength(2);
  });

  it("sends the next stage on a later day, once per stage", async () => {
    await mk("Rate", "2026-10-24");
    await installmentReminders(db, NOW); // d3
    // The day before: still the 3-day stage, nothing new.
    expect((await installmentReminders(db, new Date("2026-10-23T08:00:00Z"))).created).toBe(0);
    // Due day, then overdue.
    expect((await installmentReminders(db, new Date("2026-10-24T08:00:00Z"))).created).toBe(2);
    expect((await installmentReminders(db, new Date("2026-10-25T08:00:00Z"))).created).toBe(2);
    expect((await installmentReminders(db, new Date("2026-10-26T08:00:00Z"))).created).toBe(0);
    const stages = (await notes()).map((n) => n.dedupeKey?.split(":")[2]);
    expect(stages.filter((s) => s === "d3")).toHaveLength(2);
    expect(stages.filter((s) => s === "due")).toHaveLength(2);
    expect(stages.filter((s) => s === "overdue")).toHaveLength(2);
  });

  it("re-arms when the due date moves", async () => {
    const { id } = await mk("Verschoben", "2026-10-24");
    await installmentReminders(db, NOW);
    await db.update(installment).set({ dueOn: "2026-10-23" }).where(eq(installment.payableId, id));
    expect((await installmentReminders(db, NOW)).created).toBe(2);
  });

  it("skips paid and cancelled rates, and reminds about what is still open of a part payment", async () => {
    const paid = await mk("Bezahlt", "2026-10-20");
    const part = await mk("Teilweise", "2026-10-20", {}, 10_000);
    const [paidRate] = await db
      .select()
      .from(installment)
      .where(eq(installment.payableId, paid.id));
    const [partRate] = await db
      .select()
      .from(installment)
      .where(eq(installment.payableId, part.id));
    if (!paidRate || !partRate) throw new Error("rates");
    await markInstallmentPaid(
      owner,
      paidRate.id,
      { paidOn: TODAY, amountCents: 10_000 },
      { today: TODAY },
    );
    await markInstallmentPaid(
      owner,
      partRate.id,
      { paidOn: TODAY, amountCents: 4_000 },
      { today: TODAY },
    );
    await db
      .update(installment)
      .set({ status: "cancelled" })
      .where(eq(installment.id, paidRate.id));

    await installmentReminders(db, NOW);
    expect(await byTitle("Bezahlt")).toHaveLength(0);
    const partly = await byTitle("Teilweise");
    expect(partly).toHaveLength(2);
    expect(partly[0]?.body).toMatch(/offen 60,00\s€/);
  });

  it("escalates a critical overdue payable to the manager only", async () => {
    await mk("Kritisch", "2026-10-15", { critical: true });
    await mk("Normal", "2026-10-15");
    const result = await installmentReminders(db, NOW);
    expect(result).toEqual({ created: 4, escalated: 1 });

    const escalated = (await notes()).filter((n) => n.reason === "escalated");
    expect(escalated).toHaveLength(1);
    expect(escalated[0]).toMatchObject({
      recipientStaffMemberId: people.manager,
      severity: "critical",
      subjectType: "installment",
    });
    expect(escalated[0]?.title).toContain("Kritisch");
    // The critical one is also "critical" severity as a normal reminder, even 1 day later.
    const [log] = await db.select().from(escalationLog);
    expect(log).toMatchObject({
      subjectType: "installment",
      level: 2,
      escalatedToStaffMemberId: people.manager,
    });

    // Nothing more on the next run.
    expect(await installmentReminders(db, NOW)).toEqual({ created: 0, escalated: 0 });
    expect(await db.select().from(escalationLog)).toHaveLength(1);
    // The critical flag raises a due-soon reminder to critical, the normal one stays at its level.
    const soon = await mk("KritischBald", "2026-10-22", { critical: true });
    await installmentReminders(db, NOW);
    expect((await byTitle("KritischBald"))[0]?.severity).toBe("critical");
    expect(soon.id).toBeTruthy();
  });

  it("does nothing when nobody with a login may see finance, and ignores banned or inactive people", async () => {
    await mk("Fällig", "2026-10-20");
    await db.update(user).set({ banned: true }).where(eq(user.role, "owner"));
    await db
      .update(staffMember)
      .set({ active: false })
      .where(eq(staffMember.id, people.manager as string));
    expect(await installmentReminders(db, NOW)).toEqual({ created: 0, escalated: 0 });
    expect(await notes()).toHaveLength(0);
  });

  it("writes English text for English users", async () => {
    await mk("Rent", "2026-10-21");
    await db.update(user).set({ locale: "en" }).where(eq(user.role, "manager"));
    await installmentReminders(db, NOW);
    const forManager = (await notes()).find((n) => n.recipientStaffMemberId === people.manager);
    const forOwner = (await notes()).find((n) => n.recipientStaffMemberId === people.owner);
    expect(forManager?.title).toBe("Instalment due today: Rent");
    expect(forOwner?.title).toBe("Rate heute fällig: Rent");
  });
});
