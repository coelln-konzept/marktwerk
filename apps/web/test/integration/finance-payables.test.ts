import {
  auditLog,
  document,
  installment,
  notification,
  payable,
  staffMember,
} from "@marktwerk/db/schema";
import { asc, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { getPayable, listPayables } from "@/server/queries/finance";
import {
  cancelInstallment,
  cancelPayable,
  createPayable,
  markInstallmentPaid,
  type PayableError,
  type PayableInput,
  PayableInputError,
  reopenInstallments,
  undoInstallmentPayment,
  updatePayable,
} from "@/server/services/payables";
import { createActor, resetDatabase, seedCatalogue } from "../helpers/fixtures";

const TODAY = "2026-10-21";

let owner: Awaited<ReturnType<typeof createActor>>;
let manager: Awaited<ReturnType<typeof createActor>>;
let staff: Awaited<ReturnType<typeof createActor>>;
let field: Awaited<ReturnType<typeof createActor>>;

beforeEach(async () => {
  await resetDatabase();
  owner = await createActor("owner");
  manager = await createActor("manager");
  staff = await createActor("staff");
  field = await createActor("field");
});

afterAll(async () => {
  await db.$client.end();
});

const isForbidden = (error: unknown) =>
  String((error as { digest?: unknown })?.digest ?? "").includes("403");

/** The error code of a service call, or null when it succeeds. */
const code = async (promise: Promise<unknown>): Promise<PayableError | null> => {
  try {
    await promise;
  } catch (error) {
    if (error instanceof PayableInputError) return error.code;
    throw error;
  }
  return null;
};

const audits = (action: string) =>
  db.select().from(auditLog).where(eq(auditLog.action, action)).orderBy(asc(auditLog.at));

const base: PayableInput = {
  title: "Standgebühr Altstadt 2027",
  scope: "company",
  category: "location",
  totalGrossCents: 1_500_000,
  vatRateBp: 1900,
};
const threeRates = [
  { dueOn: "2026-10-01", amountCents: 500_000 },
  { dueOn: "2026-11-01", amountCents: 500_000 },
  { dueOn: "2026-12-01", amountCents: 500_000 },
];

async function make(over: Partial<PayableInput> = {}, plan = threeRates) {
  return createPayable(owner, { ...base, ...over }, plan);
}

const detail = async (id: string) => {
  const p = await getPayable(owner, id, TODAY);
  if (!p) throw new Error("payable not found");
  return p;
};

describe("creating a payable with an instalment plan", () => {
  it("stores the payable and its rates sorted by due date, and audits it", async () => {
    const { id } = await make({}, [
      { dueOn: "2026-12-01", amountCents: 500_000 },
      { dueOn: "2026-10-01", amountCents: 500_000 },
      { dueOn: "2026-11-01", amountCents: 500_000 },
    ]);
    const p = await detail(id);
    expect(p.installments.map((r) => [r.sort, r.dueOn])).toEqual([
      [1, "2026-10-01"],
      [2, "2026-11-01"],
      [3, "2026-12-01"],
    ]);
    expect(p.installments.every((r) => r.status === "open")).toBe(true);
    const [entry] = await audits("payable.create");
    expect(entry).toMatchObject({ entityType: "payable", entityId: id, actorId: owner.id });
  });

  it("requires the rates to add up to the total", async () => {
    expect(await code(make({}, [{ dueOn: "2026-10-01", amountCents: 1_000_000 }]))).toBe(
      "plan_sum_mismatch",
    );
    expect(
      await code(
        make({}, [
          { dueOn: "2026-10-01", amountCents: 1_000_000 },
          { dueOn: "2026-11-01", amountCents: 600_000 },
        ]),
      ),
    ).toBe("plan_sum_mismatch");
    expect(await db.select().from(payable)).toHaveLength(0);
  });

  it("rejects an empty plan, bad amounts and bad dates", async () => {
    expect(await code(make({}, []))).toBe("plan_empty");
    expect(
      await code(
        make({ totalGrossCents: 100 }, [
          { dueOn: "2026-10-01", amountCents: 150 },
          { dueOn: "2026-11-01", amountCents: -50 },
        ]),
      ),
    ).toBe("plan_invalid_amount");
    expect(await code(make({}, [{ dueOn: "2026-02-30", amountCents: 1_500_000 }]))).toBe(
      "invalid_date",
    );
    const many = Array.from({ length: 61 }, (_, i) => ({
      dueOn: `2027-01-${String((i % 28) + 1).padStart(2, "0")}`,
      amountCents: 1,
    }));
    expect(await code(make({ totalGrossCents: 61 }, many))).toBe("plan_too_many");
  });

  it("validates the fields: title, scope targets, amount, VAT", async () => {
    expect(await code(make({ title: "  " }))).toBe("title_required");
    expect(await code(make({ scope: "nope" }))).toBe("invalid_scope");
    expect(await code(make({ category: "nope" }))).toBe("invalid_category");
    expect(await code(make({ scope: "event" }))).toBe("invalid_event");
    expect(await code(make({ scope: "vehicle" }))).toBe("invalid_vehicle");
    expect(await code(make({ scope: "venue_season", venueId: null }))).toBe("invalid_venue");
    expect(
      await code(
        make({
          scope: "venue_season",
          venueId: "00000000-0000-4000-8000-000000000000",
          season: 27,
        }),
      ),
    ).toBe("invalid_season");
    expect(await code(make({ totalGrossCents: 0 }))).toBe("invalid_amount");
    expect(await code(make({ vatRateBp: 20_000 }))).toBe("invalid_vat");
    expect(
      await code(make({ counterpartyContactId: "00000000-0000-4000-8000-000000000000" })),
    ).toBe("invalid_contact");
  });

  it("keeps only the target the scope uses", async () => {
    const cat = await seedCatalogue();
    const { id } = await make({
      scope: "venue_season",
      venueId: cat.venue.id,
      season: 2027,
      vehicleId: "00000000-0000-4000-8000-000000000000",
    });
    const [row] = await db.select().from(payable).where(eq(payable.id, id));
    expect(row).toMatchObject({ scope: "venue_season", venueId: cat.venue.id, season: 2027 });
    expect(row?.vehicleId).toBeNull();
    expect(row?.eventId).toBeNull();
  });
});

describe("paying a rate (= the expense)", () => {
  it("marks it paid with date, amount, method, reference and payer, and audits it", async () => {
    const cat = await seedCatalogue();
    const { id } = await make();
    const [first] = (await detail(id)).installments;
    if (!first) throw new Error("no rate");
    const result = await markInstallmentPaid(
      owner,
      first.id,
      {
        paidOn: "2026-10-02",
        amountCents: 500_000,
        method: "bank_transfer",
        reference: "RE-1",
        paidByStaffMemberId: cat.staff.anna.id,
      },
      { today: TODAY },
    );
    expect(result).toMatchObject({ status: "paid", paidAmountCents: 500_000 });
    expect(result.previous).toMatchObject({ status: "open", paidAmountCents: null });
    const [row] = await db.select().from(installment).where(eq(installment.id, first.id));
    expect(row).toMatchObject({
      status: "paid",
      paidOn: "2026-10-02",
      paidAmountCents: 500_000,
      method: "bank_transfer",
      reference: "RE-1",
      paidByStaffMemberId: cat.staff.anna.id,
    });
    const [entry] = await audits("installment.pay");
    expect(entry).toMatchObject({ entityType: "installment", entityId: first.id });
    expect(entry?.diff).toMatchObject({ payableId: id, paidNowCents: 500_000, status: "paid" });
  });

  it("treats a smaller amount as a part payment that adds up with later payments", async () => {
    const { id } = await make();
    const [first] = (await detail(id)).installments;
    if (!first) throw new Error("no rate");
    const part = await markInstallmentPaid(
      owner,
      first.id,
      { paidOn: "2026-10-02", amountCents: 200_000, method: "cash" },
      { today: TODAY },
    );
    expect(part.status).toBe("partially_paid");
    let p = await detail(id);
    expect(p.installments[0]).toMatchObject({
      status: "partially_paid",
      paidAmountCents: 200_000,
      openCents: 300_000,
    });
    expect(p.status).toBe("overdue"); // the rest of a rate due 01.10. is late
    expect(p.paidCents).toBe(200_000);

    const rest = await markInstallmentPaid(
      owner,
      first.id,
      { paidOn: "2026-10-05", amountCents: 300_000 },
      { today: TODAY },
    );
    expect(rest).toMatchObject({ status: "paid", paidAmountCents: 500_000 });
    p = await detail(id);
    expect(p.installments[0]).toMatchObject({ status: "paid", openCents: 0, method: "cash" });
  });

  it("refuses more than is open, future dates, paid and cancelled rates, bad input", async () => {
    const { id } = await make();
    const [first, second] = (await detail(id)).installments;
    if (!first || !second) throw new Error("no rates");
    const pay = (rateId: string, over: Partial<Parameters<typeof markInstallmentPaid>[2]> = {}) =>
      markInstallmentPaid(
        owner,
        rateId,
        { paidOn: "2026-10-02", amountCents: 500_000, ...over },
        { today: TODAY },
      );
    expect(await code(pay(first.id, { amountCents: 500_001 }))).toBe("amount_too_high");
    expect(await code(pay(first.id, { amountCents: 0 }))).toBe("invalid_amount");
    expect(await code(pay(first.id, { paidOn: "2026-10-22" }))).toBe("invalid_paid_on");
    expect(await code(pay(first.id, { paidOn: "nope" }))).toBe("invalid_paid_on");
    expect(await code(pay(first.id, { method: "bitcoin" }))).toBe("invalid_method");
    expect(
      await code(pay(first.id, { paidByStaffMemberId: "00000000-0000-4000-8000-000000000000" })),
    ).toBe("invalid_staff");
    expect(await code(pay("not-a-uuid"))).toBe("not_found");

    expect(await code(pay(first.id))).toBeNull();
    expect(await code(pay(first.id))).toBe("already_paid");
    await cancelInstallment(owner, second.id);
    expect(await code(pay(second.id))).toBe("installment_cancelled");
  });

  it("defaults the payer to the actor's staff member and marks the reminders done", async () => {
    const cat = await seedCatalogue();
    const actor = { ...owner, staffMemberId: cat.staff.anna.id };
    const { id } = await make();
    const [first] = (await detail(id)).installments;
    if (!first) throw new Error("no rate");
    await db.insert(notification).values({
      recipientStaffMemberId: cat.staff.anna.id,
      reason: "installment_due",
      subjectType: "installment",
      subjectId: first.id,
      title: "Rate fällig",
      dedupeKey: "k1",
    });
    await markInstallmentPaid(
      actor,
      first.id,
      { paidOn: TODAY, amountCents: 500_000 },
      { today: TODAY },
    );
    const [row] = await db.select().from(installment).where(eq(installment.id, first.id));
    expect(row?.paidByStaffMemberId).toBe(cat.staff.anna.id);
    const [note] = await db.select().from(notification);
    expect(note?.state).toBe("done");
  });

  it("can be undone while nothing newer happened", async () => {
    const { id } = await make();
    const [first] = (await detail(id)).installments;
    if (!first) throw new Error("no rate");
    const paid = await markInstallmentPaid(
      owner,
      first.id,
      { paidOn: "2026-10-02", amountCents: 200_000, method: "card", reference: "R" },
      { today: TODAY },
    );
    // A newer payment makes the undo stale.
    await markInstallmentPaid(
      owner,
      first.id,
      { paidOn: "2026-10-03", amountCents: 100_000 },
      { today: TODAY },
    );
    expect(
      await code(undoInstallmentPayment(owner, first.id, paid.previous, paid.paidAmountCents)),
    ).toBe("conflict");

    const second = await markInstallmentPaid(
      owner,
      first.id,
      { paidOn: "2026-10-04", amountCents: 200_000 },
      { today: TODAY },
    );
    await undoInstallmentPayment(owner, first.id, second.previous, second.paidAmountCents);
    const [row] = await db.select().from(installment).where(eq(installment.id, first.id));
    expect(row).toMatchObject({ status: "partially_paid", paidAmountCents: 300_000 });
    expect((await audits("installment.pay_undo")).length).toBe(1);
  });
});

describe("derived payable status", () => {
  it("goes open → partially paid → overdue → paid → cancelled from the rates", async () => {
    const future = [
      { dueOn: "2026-11-01", amountCents: 100 },
      { dueOn: "2026-12-01", amountCents: 100 },
    ];
    const { id } = await make({ totalGrossCents: 200 }, future);
    expect((await detail(id)).status).toBe("open");

    const [a, b] = (await detail(id)).installments;
    if (!a || !b) throw new Error("no rates");
    await markInstallmentPaid(owner, a.id, { paidOn: TODAY, amountCents: 100 }, { today: TODAY });
    expect((await detail(id)).status).toBe("partially_paid");

    // An unpaid rate in the past makes it overdue.
    const late = await make({ title: "Alt" }, [{ dueOn: "2026-10-20", amountCents: 1_500_000 }]);
    expect((await detail(late.id)).status).toBe("overdue");

    await markInstallmentPaid(owner, b.id, { paidOn: TODAY, amountCents: 100 }, { today: TODAY });
    expect((await detail(id)).status).toBe("paid");

    const gone = await make({ title: "Weg" });
    await cancelPayable(owner, gone.id);
    expect((await detail(gone.id)).status).toBe("cancelled");
  });

  it("filters the list by status chip and counts each chip", async () => {
    await make({ title: "Offen" }, [{ dueOn: "2027-03-01", amountCents: 1_500_000 }]);
    await make({ title: "Bald" }, [{ dueOn: "2026-10-25", amountCents: 1_500_000 }]);
    await make({ title: "Spät" }, [{ dueOn: "2026-10-01", amountCents: 1_500_000 }]);
    const done = await make({ title: "Fertig" }, [{ dueOn: "2026-09-01", amountCents: 1_500_000 }]);
    const [rate] = (await detail(done.id)).installments;
    if (!rate) throw new Error("no rate");
    await markInstallmentPaid(
      owner,
      rate.id,
      { paidOn: "2026-09-01", amountCents: 1_500_000 },
      { today: TODAY },
    );

    const titles = async (view: "open" | "due" | "overdue" | "paid" | "all") =>
      (await listPayables(owner, TODAY, { view })).rows.map((r) => r.title).sort();
    expect(await titles("open")).toEqual(["Bald", "Offen", "Spät"]);
    expect(await titles("due")).toEqual(["Bald"]);
    expect(await titles("overdue")).toEqual(["Spät"]);
    expect(await titles("paid")).toEqual(["Fertig"]);
    expect(await titles("all")).toHaveLength(4);
    const list = await listPayables(owner, TODAY, {});
    expect(list.counts).toEqual({ open: 3, due: 1, overdue: 1, paid: 1, all: 4 });
    // The overdue one comes first, and the focus list has the overdue and the soon-due rate.
    expect(list.rows[0]?.title).toBe("Spät");
    expect(list.focus.map((f) => f.payable.title)).toEqual(["Spät", "Bald"]);
  });

  it("filters by scope, category, critical and search", async () => {
    const cat = await seedCatalogue();
    await make({ title: "Miete Platz", category: "location", critical: true });
    await make({ title: "Versicherung", category: "insurance" });
    await make({
      title: "Saisonmiete",
      scope: "venue_season",
      venueId: cat.venue.id,
      season: 2027,
    });
    const titles = async (filters: Parameters<typeof listPayables>[2]) =>
      (await listPayables(owner, TODAY, { ...filters, view: "all" })).rows
        .map((r) => r.title)
        .sort();
    expect(await titles({ critical: true })).toEqual(["Miete Platz"]);
    expect(await titles({ category: "insurance" })).toEqual(["Versicherung"]);
    expect(await titles({ scope: "venue_season" })).toEqual(["Saisonmiete"]);
    expect(await titles({ venueId: cat.venue.id })).toEqual(["Saisonmiete"]);
    expect(await titles({ season: 2027 })).toEqual(["Saisonmiete"]);
    expect(await titles({ q: "versicherung" })).toEqual(["Versicherung"]);
    expect(await titles({ category: "bogus" })).toHaveLength(3);
  });
});

describe("cancelling", () => {
  it("drops an open rate, refuses one with payments, and can reopen", async () => {
    const { id } = await make();
    const [a, b] = (await detail(id)).installments;
    if (!a || !b) throw new Error("no rates");
    await markInstallmentPaid(
      owner,
      a.id,
      { paidOn: TODAY, amountCents: 100_000 },
      { today: TODAY },
    );
    expect(await code(cancelInstallment(owner, a.id))).toBe("has_payments");
    await cancelInstallment(owner, b.id);
    expect(await code(cancelInstallment(owner, b.id))).toBe("installment_cancelled");
    expect((await audits("installment.cancel")).length).toBe(1);
    await reopenInstallments(owner, [b.id]);
    const [row] = await db.select().from(installment).where(eq(installment.id, b.id));
    expect(row?.status).toBe("open");
    expect(await code(reopenInstallments(owner, [b.id]))).toBe("not_cancelled");
  });

  it("cancels every unpaid rate of a payable and keeps the paid ones", async () => {
    const { id } = await make();
    const [a] = (await detail(id)).installments;
    if (!a) throw new Error("no rate");
    await markInstallmentPaid(
      owner,
      a.id,
      { paidOn: TODAY, amountCents: 500_000 },
      { today: TODAY },
    );
    const result = await cancelPayable(owner, id);
    expect(result.cancelledIds).toHaveLength(2);
    const rows = await db
      .select()
      .from(installment)
      .where(eq(installment.payableId, id))
      .orderBy(asc(installment.sort));
    expect(rows.map((r) => r.status)).toEqual(["paid", "cancelled", "cancelled"]);
    expect(await code(cancelPayable(owner, id))).toBe("nothing_to_cancel");
    expect((await audits("payable.cancel")).length).toBe(1);
  });
});

describe("editing a payable and its plan", () => {
  it("changes fields, rates, and renumbers by due date; audits the change", async () => {
    const { id } = await make();
    const p = await detail(id);
    const [a, b, c] = p.installments;
    if (!a || !b || !c) throw new Error("no rates");
    const input: PayableInput = { ...base, title: "Standgebühr (neu)", critical: true };
    // Drop the first rate, move the second, add a new early one; the sum stays 15.000 €.
    const plan = [
      { id: b.id, dueOn: "2026-12-15", amountCents: 600_000 },
      { id: c.id, dueOn: "2027-01-01", amountCents: 500_000 },
      { dueOn: "2026-11-15", amountCents: 400_000 },
    ];
    const result = await updatePayable(owner, id, input, plan, p.updatedAt);
    expect(result.changed).toBe(true);
    const after = await detail(id);
    expect(after.title).toBe("Standgebühr (neu)");
    expect(after.critical).toBe(true);
    expect(after.installments.map((r) => [r.sort, r.dueOn, r.amountCents])).toEqual([
      [1, "2026-11-15", 400_000],
      [2, "2026-12-15", 600_000],
      [3, "2027-01-01", 500_000],
    ]);
    // The dropped rate is gone (it had no documents).
    expect(await db.select().from(installment).where(eq(installment.id, a.id))).toHaveLength(0);
    const [entry] = await audits("payable.update");
    expect(entry?.diff).toMatchObject({
      changes: { title: { from: base.title, to: "Standgebühr (neu)" } },
      plan: { added: [{ dueOn: "2026-11-15" }], removed: [{ id: a.id }] },
    });
  });

  it("keeps paid rates, counts them towards the sum and refuses to touch them", async () => {
    const { id } = await make();
    const p = await detail(id);
    const [a, b, c] = p.installments;
    if (!a || !b || !c) throw new Error("no rates");
    await markInstallmentPaid(
      owner,
      a.id,
      { paidOn: TODAY, amountCents: 500_000 },
      { today: TODAY },
    );

    // The open rates have to cover the remaining 10.000 €.
    expect(
      await code(
        updatePayable(
          owner,
          id,
          base,
          [{ id: b.id, dueOn: "2026-11-01", amountCents: 500_000 }],
          p.updatedAt,
        ),
      ),
    ).toBe("plan_sum_mismatch");
    // Sending the paid rate in the plan is refused.
    expect(
      await code(
        updatePayable(
          owner,
          id,
          base,
          [
            { id: a.id, dueOn: "2026-10-01", amountCents: 500_000 },
            { id: b.id, dueOn: "2026-11-01", amountCents: 500_000 },
          ],
          p.updatedAt,
        ),
      ),
    ).toBe("installment_locked");
    // A new total with matching open rates works; the paid rate stays.
    const ok = await updatePayable(
      owner,
      id,
      { ...base, totalGrossCents: 1_700_000 },
      [
        { id: b.id, dueOn: "2026-11-01", amountCents: 600_000 },
        { id: c.id, dueOn: "2026-12-01", amountCents: 600_000 },
      ],
      p.updatedAt,
    );
    expect(ok.changed).toBe(true);
    const rows = await db
      .select()
      .from(installment)
      .where(eq(installment.payableId, id))
      .orderBy(asc(installment.sort));
    expect(rows.map((r) => [r.status, r.amountCents])).toEqual([
      ["paid", 500_000],
      ["open", 600_000],
      ["open", 600_000],
    ]);
  });

  it("detects concurrent edits and writes nothing when nothing changed", async () => {
    const { id } = await make();
    const p = await detail(id);
    const plan = p.installments.map((r) => ({
      id: r.id,
      dueOn: r.dueOn,
      amountCents: r.amountCents,
    }));
    expect((await updatePayable(owner, id, base, plan, p.updatedAt)).changed).toBe(false);
    expect((await audits("payable.update")).length).toBe(0);

    await updatePayable(owner, id, { ...base, notes: "x" }, plan, p.updatedAt);
    expect(await code(updatePayable(owner, id, { ...base, notes: "y" }, plan, p.updatedAt))).toBe(
      "conflict",
    );
  });

  it("cancels instead of deleting a dropped rate that has a document", async () => {
    const { id } = await make();
    const p = await detail(id);
    const [a, b, c] = p.installments;
    if (!a || !b || !c) throw new Error("no rates");
    await db.insert(document).values({
      kind: "receipt",
      fileName: "x.pdf",
      mimeType: "application/pdf",
      sizeBytes: 10,
      sha256: "a".repeat(64),
      storageKey: "aa/test.pdf",
      installmentId: b.id,
    });
    const plan = [
      { id: a.id, dueOn: a.dueOn, amountCents: 750_000 },
      { id: c.id, dueOn: c.dueOn, amountCents: 750_000 },
    ];
    await updatePayable(owner, id, base, plan, p.updatedAt);
    const [dropped] = await db.select().from(installment).where(eq(installment.id, b.id));
    expect(dropped?.status).toBe("cancelled");
  });
});

describe("permissions (finance:*)", () => {
  it("lets owner and manager write; staff and field are forbidden", async () => {
    for (const actor of [staff, field]) {
      let error: unknown;
      try {
        await createPayable(actor, base, threeRates);
      } catch (e) {
        error = e;
      }
      expect(isForbidden(error)).toBe(true);
    }
    const { id } = await createPayable(manager, base, threeRates);
    const [rate] = (await detail(id)).installments;
    if (!rate) throw new Error("no rate");
    for (const actor of [staff, field]) {
      for (const run of [
        () =>
          markInstallmentPaid(actor, rate.id, { paidOn: TODAY, amountCents: 1 }, { today: TODAY }),
        () => cancelInstallment(actor, rate.id),
        () => cancelPayable(actor, id),
        () => updatePayable(actor, id, base, [], "x"),
      ]) {
        let error: unknown;
        try {
          await run();
        } catch (e) {
          error = e;
        }
        expect(isForbidden(error)).toBe(true);
      }
    }
    expect((await audits("payable.create")).map((a) => a.actorId)).toEqual([manager.id]);
  });

  it("shows nothing to roles without finance:read", async () => {
    const { id } = await make();
    for (const actor of [staff, field]) {
      expect(await getPayable(actor, id, TODAY)).toBeNull();
      expect((await listPayables(actor, TODAY)).rows).toEqual([]);
    }
    expect(await getPayable(manager, id, TODAY)).not.toBeNull();
  });
});

describe("payments need a known staff member only when given", () => {
  it("accepts a payment without any payer", async () => {
    const { id } = await make();
    const [rate] = (await detail(id)).installments;
    if (!rate) throw new Error("no rate");
    await markInstallmentPaid(
      owner,
      rate.id,
      { paidOn: TODAY, amountCents: 500_000 },
      { today: TODAY },
    );
    const [row] = await db.select().from(installment).where(eq(installment.id, rate.id));
    expect(row?.paidByStaffMemberId).toBeNull();
    expect((await db.select().from(staffMember)).length).toBe(0);
  });
});
