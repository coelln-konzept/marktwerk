import { auditLog, event, eventIncome, expense } from "@marktwerk/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import {
  calendarItems,
  dueItems,
  eventMoneyHealthFor,
  getEventMoney,
  moneyOverdue,
} from "@/server/queries/finance";
import {
  addEventIncome,
  archiveEventIncome,
  EventBudgetInputError,
  setBudgetLine,
} from "@/server/services/event-budget";
import { createEventsFromPreset } from "@/server/services/events";
import { archiveExpense, createExpense } from "@/server/services/expenses";
import { cancelPayable, createPayable, markInstallmentPaid } from "@/server/services/payables";
import { createActor, resetDatabase, seedCatalogue } from "../helpers/fixtures";

const TODAY = "2026-10-21";

let cat: Awaited<ReturnType<typeof seedCatalogue>>;
let owner: Awaited<ReturnType<typeof createActor>>;
let manager: Awaited<ReturnType<typeof createActor>>;
let staff: Awaited<ReturnType<typeof createActor>>;
let field: Awaited<ReturnType<typeof createActor>>;
let first: string;
let second: string;

beforeEach(async () => {
  await resetDatabase();
  cat = await seedCatalogue();
  owner = await createActor("owner");
  manager = await createActor("manager");
  staff = await createActor("staff");
  field = await createActor("field");
  const events = await createEventsFromPreset(owner, cat.presets.flea.id, [
    "2026-11-14",
    "2026-11-28",
  ]);
  const [a, b] = events.map((e) => e.id);
  if (!a || !b) throw new Error("events");
  first = a;
  second = b;
});

afterAll(async () => {
  await db.$client.end();
});

const isForbidden = (error: unknown) =>
  String((error as { digest?: unknown })?.digest ?? "").includes("403");

const budgetCode = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (error) {
    if (error instanceof EventBudgetInputError) return error.code;
    throw error;
  }
  return null;
};

const audits = (action: string) => db.select().from(auditLog).where(eq(auditLog.action, action));

const money = async (eventId = first, today = TODAY) => {
  const m = await getEventMoney(owner, eventId, today);
  if (!m) throw new Error("no event money");
  return m;
};

/** Event costs: security 2.000 € in 2 rates (first one paid), toilets 800 €, a 12,34 € expense. */
async function seedCosts() {
  const security = await createPayable(
    owner,
    {
      title: "Sicherheitsdienst",
      scope: "event",
      eventId: first,
      category: "security",
      totalGrossCents: 200_000,
      critical: true,
    },
    [
      { dueOn: "2026-10-25", amountCents: 100_000 },
      { dueOn: "2026-12-01", amountCents: 100_000 },
    ],
  );
  const toilets = await createPayable(
    owner,
    {
      title: "Toiletten",
      scope: "event",
      eventId: first,
      category: "toilets",
      totalGrossCents: 80_000,
    },
    [{ dueOn: "2026-12-10", amountCents: 80_000 }],
  );
  await createExpense(
    owner,
    {
      spentOn: "2026-10-20",
      amountCents: 1_234,
      category: "other",
      description: "Kabelbinder",
      eventId: first,
    },
    { today: TODAY },
  );
  return { security: security.id, toilets: toilets.id };
}

describe("plan lines", () => {
  it("sets, changes and removes a plan line; unchanged writes nothing; every change is audited", async () => {
    expect(await setBudgetLine(owner, first, "security", 190_000)).toEqual({
      changed: true,
      previousCents: null,
    });
    expect(await setBudgetLine(owner, first, "security", 190_000)).toMatchObject({
      changed: false,
    });
    expect(await setBudgetLine(owner, first, "security", 200_000)).toEqual({
      changed: true,
      previousCents: 190_000,
    });
    expect((await money()).lines).toEqual([
      { category: "security", plannedCents: 200_000, notes: null },
    ]);
    expect(await setBudgetLine(owner, first, "security", null)).toEqual({
      changed: true,
      previousCents: 200_000,
    });
    expect(await setBudgetLine(owner, first, "security", null)).toMatchObject({ changed: false });
    expect((await money()).lines).toEqual([]);
    const entries = await audits("event.budget");
    expect(entries).toHaveLength(3);
    expect(entries[0]?.diff).toMatchObject({ category: "security", from: null, to: 190_000 });
  });

  it("validates category, amount and event; needs finance:write", async () => {
    expect(await budgetCode(setBudgetLine(owner, first, "bogus", 1))).toBe("invalid_category");
    expect(await budgetCode(setBudgetLine(owner, first, "security", -1))).toBe("invalid_amount");
    expect(await budgetCode(setBudgetLine(owner, first, "security", 1.5))).toBe("invalid_amount");
    expect(
      await budgetCode(setBudgetLine(owner, "00000000-0000-4000-8000-000000000000", "security", 1)),
    ).toBe("not_found");
    for (const actor of [staff, field]) {
      let error: unknown;
      try {
        await setBudgetLine(actor, first, "security", 1);
      } catch (e) {
        error = e;
      }
      expect(isForbidden(error)).toBe(true);
    }
    expect(await setBudgetLine(manager, first, "security", 5)).toMatchObject({ changed: true });
  });
});

describe("plan → committed → actual", () => {
  it("aggregates payables and expenses of the event by category", async () => {
    const { security } = await seedCosts();
    await setBudgetLine(owner, first, "security", 190_000);
    await setBudgetLine(owner, first, "toilets", 90_000);
    await setBudgetLine(owner, first, "gema", 50_000);

    // Pay the first security rate.
    const sec = (await getEventMoney(owner, first, TODAY))?.payables.find((p) => p.id === security);
    expect(sec?.next?.openCents).toBe(100_000);
    const rate = await db.query.installment.findFirst({
      where: (i, { eq: same }) => same(i.payableId, security),
    });
    if (!rate) throw new Error("no rate");
    await markInstallmentPaid(
      owner,
      rate.id,
      { paidOn: "2026-10-20", amountCents: 100_000 },
      { today: TODAY },
    );

    const m = await money();
    expect(m.rows.map((r) => r.category)).toEqual(["security", "toilets", "gema", "other"]);
    expect(m.rows).toEqual([
      {
        category: "security",
        plannedCents: 190_000,
        committedCents: 200_000,
        actualCents: 100_000,
        varianceCents: -10_000,
      },
      {
        category: "toilets",
        plannedCents: 90_000,
        committedCents: 80_000,
        actualCents: 0,
        varianceCents: 10_000,
      },
      {
        category: "gema",
        plannedCents: 50_000,
        committedCents: 0,
        actualCents: 0,
        varianceCents: 50_000,
      },
      {
        category: "other",
        plannedCents: 0,
        committedCents: 1_234,
        actualCents: 1_234,
        varianceCents: null,
      },
    ]);
    expect(m.totals).toEqual({
      plannedCents: 330_000,
      committedCents: 281_234,
      actualCents: 101_234,
      varianceCents: 48_766,
    });
    expect(m.payables.map((p) => [p.title, p.status, p.committedCents, p.actualCents])).toEqual([
      ["Sicherheitsdienst", "partially_paid", 200_000, 100_000],
      ["Toiletten", "open", 80_000, 0],
    ]);
    expect(m.expenses.map((e) => [e.description, e.receiptCount])).toEqual([["Kabelbinder", 0]]);
    expect(m.summary).toMatchObject({
      installmentsPaid: 1,
      installmentsTotal: 3,
      missingReceipts: 2,
    });
  });

  it("does not count cancelled rates or archived expenses", async () => {
    const { toilets } = await seedCosts();
    await cancelPayable(owner, toilets);
    const [exp] = await db.select().from(expense);
    if (!exp) throw new Error("expense");
    await archiveExpense(owner, exp.id);
    const m = await money();
    expect(m.rows.map((r) => r.category)).toEqual(["security"]);
    expect(m.totals.committedCents).toBe(200_000);
    expect(m.payables.find((p) => p.title === "Toiletten")).toMatchObject({
      status: "cancelled",
      committedCents: 0,
    });
  });

  it("shows another event's costs only on that event", async () => {
    await seedCosts();
    expect((await money(second)).rows).toEqual([]);
    expect((await money(second)).payables).toEqual([]);
  });

  it("keeps season payables (venue + season) out of the totals and shows the share per event", async () => {
    const fee = await createPayable(
      owner,
      {
        title: "Standgebühr Messeplatz 2026",
        scope: "venue_season",
        venueId: cat.venue.id,
        season: 2026,
        category: "location",
        totalGrossCents: 300_000,
      },
      [
        { dueOn: "2026-09-01", amountCents: 100_000 },
        { dueOn: "2026-12-01", amountCents: 200_000 },
      ],
    );
    const rate = await db.query.installment.findFirst({
      where: (i, { eq: same }) => same(i.payableId, fee.id),
    });
    if (!rate) throw new Error("no rate");
    await markInstallmentPaid(
      owner,
      rate.id,
      { paidOn: "2026-09-01", amountCents: 100_000 },
      { today: TODAY },
    );

    const m = await money();
    expect(m.rows).toEqual([]);
    expect(m.totals.committedCents).toBe(0);
    expect(m.seasonEventCount).toBe(2);
    expect(m.seasonPayables).toHaveLength(1);
    expect(m.seasonPayables[0]).toMatchObject({
      title: "Standgebühr Messeplatz 2026",
      committedCents: 300_000,
      actualCents: 100_000,
      shareCommittedCents: 150_000,
      shareActualCents: 50_000,
    });
    expect(m.seasonShare).toEqual({ committedCents: 150_000, actualCents: 50_000 });
    // Both events at the venue show the same share.
    expect((await money(second)).seasonShare.committedCents).toBe(150_000);
  });

  it("is not available to roles without finance:read, and not for a missing event", async () => {
    expect(await getEventMoney(staff, first, TODAY)).toBeNull();
    expect(await getEventMoney(field, first, TODAY)).toBeNull();
    expect(await getEventMoney(owner, "00000000-0000-4000-8000-000000000000", TODAY)).toBeNull();
    expect(await getEventMoney(owner, "nope", TODAY)).toBeNull();
  });
});

describe("money health of an event", () => {
  it("is null without anything, ok with a plan, warn when rates are due soon or costs exceed the plan, critical when overdue", async () => {
    expect((await money()).summary.health).toBeNull();
    await setBudgetLine(owner, first, "security", 500_000);
    expect((await money()).summary.health).toBe("ok");

    await createPayable(
      owner,
      {
        title: "Teuer",
        scope: "event",
        eventId: first,
        category: "security",
        totalGrossCents: 600_000,
      },
      [{ dueOn: "2027-01-10", amountCents: 600_000 }],
    );
    expect((await money()).summary.health).toBe("warn"); // 6.000 € committed on a 5.000 € plan
    await setBudgetLine(owner, first, "security", 900_000);
    expect((await money()).summary.health).toBe("ok");

    const soon = await createPayable(
      owner,
      { title: "Bald", scope: "event", eventId: first, category: "other", totalGrossCents: 1_000 },
      [{ dueOn: "2026-10-25", amountCents: 1_000 }],
    );
    expect((await money()).summary).toMatchObject({ health: "warn", dueSoonCount: 1 });

    await createPayable(
      owner,
      { title: "Spät", scope: "event", eventId: first, category: "other", totalGrossCents: 1_000 },
      [{ dueOn: "2026-10-01", amountCents: 1_000 }],
    );
    expect((await money()).summary).toMatchObject({ health: "critical", overdueCount: 1 });

    // The batch version used by Übersicht and Kalender agrees.
    const health = await eventMoneyHealthFor(owner, [first, second], TODAY);
    expect(health.get(first)).toBe("critical");
    expect(health.get(second)).toBeNull();
    expect(soon.id).toBeTruthy();
    expect((await eventMoneyHealthFor(staff, [first], TODAY)).get(first)).toBeNull();
  });
});

describe("other income", () => {
  it("adds, archives and restores income lines, validates and audits", async () => {
    const { id } = await addEventIncome(owner, first, {
      label: "Sponsoring Stadtwerke",
      amountCents: 250_000,
      receivedOn: "2026-10-01",
    });
    await addEventIncome(owner, first, { label: "Bar", amountCents: 5_000 });
    let m = await money();
    expect(m.income.map((i) => [i.label, i.receivedOn])).toEqual([
      ["Sponsoring Stadtwerke", "2026-10-01"],
      ["Bar", null],
    ]);
    expect(m.incomeCents).toBe(255_000);

    await archiveEventIncome(owner, id);
    m = await money();
    expect(m.incomeCents).toBe(5_000);
    await archiveEventIncome(owner, id, true);
    expect((await money()).incomeCents).toBe(255_000);
    expect(await db.select().from(eventIncome)).toHaveLength(2);
    expect((await audits("event.income_add")).length).toBe(2);
    expect((await audits("event.income_archive")).length).toBe(1);
    expect((await audits("event.income_restore")).length).toBe(1);

    expect(await budgetCode(addEventIncome(owner, first, { label: " ", amountCents: 1 }))).toBe(
      "label_required",
    );
    expect(await budgetCode(addEventIncome(owner, first, { label: "x", amountCents: 0 }))).toBe(
      "invalid_amount",
    );
    expect(
      await budgetCode(
        addEventIncome(owner, first, { label: "x", amountCents: 1, receivedOn: "2026-13-01" }),
      ),
    ).toBe("invalid_date");
    expect(
      await budgetCode(
        addEventIncome(owner, "00000000-0000-4000-8000-000000000000", {
          label: "x",
          amountCents: 1,
        }),
      ),
    ).toBe("not_found");
    let error: unknown;
    try {
      await addEventIncome(staff, first, { label: "x", amountCents: 1 });
    } catch (e) {
      error = e;
    }
    expect(isForbidden(error)).toBe(true);
  });
});

describe("exports for Übersicht and Kalender", () => {
  async function seedDue() {
    const mk = (title: string, dueOn: string, amountCents: number, over = {}) =>
      createPayable(
        owner,
        { title, scope: "company", category: "other", totalGrossCents: amountCents, ...over },
        [{ dueOn, amountCents }],
      );
    const late = await mk("Spät", "2026-10-15", 50_000, { critical: true });
    await mk("Heute", "2026-10-21", 10_000, { scope: "event", eventId: first });
    await mk("Bald", "2026-10-27", 20_000);
    await mk("Später", "2026-11-30", 30_000);
    const paid = await mk("Bezahlt", "2026-10-10", 40_000);
    const rate = await db.query.installment.findFirst({
      where: (i, { eq: same }) => same(i.payableId, paid.id),
    });
    if (!rate) throw new Error("rate");
    await markInstallmentPaid(
      owner,
      rate.id,
      { paidOn: "2026-10-10", amountCents: 40_000 },
      { today: TODAY },
    );
    return late.id;
  }

  it("dueItems: overdue, today and within 7 days, most urgent first", async () => {
    const lateId = await seedDue();
    const items = await dueItems(owner, TODAY);
    expect(items.map((i) => [i.title, i.urgency, i.dueOn])).toEqual([
      ["Spät", "overdue", "2026-10-15"],
      ["Heute", "today", "2026-10-21"],
      ["Bald", "soon", "2026-10-27"],
    ]);
    expect(items[0]).toMatchObject({ kind: "installment", href: `/finanzen/posten/${lateId}` });
    // The amount is formatted with a no-break space before the euro sign.
    expect(items[0]?.meta).toMatch(/^1\/1 · 500,00\s€$/);
    expect(items[1]?.eventId).toBe(first);
    expect(await dueItems(staff, TODAY)).toEqual([]);
    expect(await dueItems(field, TODAY)).toEqual([]);
    expect((await dueItems(manager, TODAY)).length).toBe(3);
  });

  it("calendarItems: unpaid rates in the range, tone by lateness", async () => {
    await seedDue();
    const items = await calendarItems(owner, "2026-10-01", "2026-11-30");
    expect(items.map((i) => [i.layer, i.title, i.date])).toEqual([
      ["installments", "Spät", "2026-10-15"],
      ["installments", "Heute", "2026-10-21"],
      ["installments", "Bald", "2026-10-27"],
      ["installments", "Später", "2026-11-30"],
    ]);
    expect(items[0]?.tone).toBe("critical");
    expect(items[0]?.href).toMatch(/^\/finanzen\/posten\//);
    expect(await calendarItems(owner, "2026-11-01", "2026-11-29")).toEqual([]);
    expect(await calendarItems(staff, "2026-10-01", "2026-11-30")).toEqual([]);
  });

  it("moneyOverdue: count and open cents of unpaid rates past their due date", async () => {
    await seedDue();
    expect(await moneyOverdue(owner, TODAY)).toEqual({ count: 1, cents: 50_000 });
    // A part payment reduces what is still open.
    const rate = await db.query.installment.findFirst({
      where: (i, { eq: same }) => same(i.dueOn, "2026-10-15"),
    });
    if (!rate) throw new Error("rate");
    await markInstallmentPaid(
      owner,
      rate.id,
      { paidOn: TODAY, amountCents: 20_000 },
      { today: TODAY },
    );
    expect(await moneyOverdue(owner, TODAY)).toEqual({ count: 1, cents: 30_000 });
    expect(await moneyOverdue(owner, "2026-10-10")).toEqual({ count: 0, cents: 0 });
    expect(await moneyOverdue(staff, TODAY)).toEqual({ count: 0, cents: 0 });
  });
});

describe("expense keeps its event", () => {
  it("is audited and archived events keep their expenses", async () => {
    await seedCosts();
    expect((await audits("expense.create")).length).toBe(1);
    await db.update(event).set({ archivedAt: new Date() }).where(eq(event.id, second));
    expect((await money()).expenses).toHaveLength(1);
  });
});
