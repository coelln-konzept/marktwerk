import "server-only";
import { can, isIsoDate, MAX_MONEY_CENTS } from "@marktwerk/core";
import { event, expense, staffMember, vehicle } from "@marktwerk/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { forbidden } from "next/navigation";
import { todayIn } from "@/lib/format";
import type { Actor } from "../actor";
import { db } from "../db";
import { audit } from "./audit";
import {
  PAYABLE_CATEGORIES,
  PAYMENT_METHODS,
  type PayableCategory,
  type PaymentMethod,
} from "./payables";

export type ExpenseError =
  | "not_found"
  | "invalid_date"
  | "invalid_amount"
  | "invalid_category"
  | "description_required"
  | "invalid_event"
  | "invalid_vehicle"
  | "invalid_staff"
  | "invalid_method"
  | "too_long"
  | "conflict";

export class ExpenseInputError extends Error {
  constructor(readonly code: ExpenseError) {
    super(code);
  }
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const UUID = /^[0-9a-f-]{36}$/i;

/** Quick entry of something that was already paid (fuel, cable ties). Amounts are cents. */
export type ExpenseInput = {
  spentOn: string;
  amountCents: number;
  category: string;
  description: string;
  merchant?: string | null;
  eventId?: string | null;
  vehicleId?: string | null;
  paidByStaffMemberId?: string | null;
  method?: string | null;
};

export type ExpenseFields = {
  spentOn: string;
  amountCents: number;
  category: PayableCategory;
  description: string;
  merchant: string | null;
  eventId: string | null;
  vehicleId: string | null;
  paidByStaffMemberId: string | null;
  method: PaymentMethod | null;
};

const blankToNull = (value: string | null | undefined) => {
  const trimmed = (value ?? "").trim();
  return trimmed === "" ? null : trimmed;
};

function idOrNull(value: string | null | undefined, code: ExpenseError) {
  const v = blankToNull(value);
  if (v === null) return null;
  if (!UUID.test(v)) throw new ExpenseInputError(code);
  return v;
}

/** Validates the quick-entry form. The date may not lie in the future (an expense is already paid). */
export function parseExpenseInput(
  input: ExpenseInput,
  defaults: { paidBy: string | null; today: string },
): ExpenseFields {
  if (!isIsoDate(input.spentOn) || input.spentOn > defaults.today)
    throw new ExpenseInputError("invalid_date");
  if (
    !Number.isSafeInteger(input.amountCents) ||
    input.amountCents <= 0 ||
    input.amountCents > MAX_MONEY_CENTS
  )
    throw new ExpenseInputError("invalid_amount");
  if (!(PAYABLE_CATEGORIES as readonly string[]).includes(input.category))
    throw new ExpenseInputError("invalid_category");
  const description = input.description.trim();
  if (description === "") throw new ExpenseInputError("description_required");
  const merchant = blankToNull(input.merchant);
  if (description.length > 200 || (merchant !== null && merchant.length > 200))
    throw new ExpenseInputError("too_long");
  const method = blankToNull(input.method);
  if (method !== null && !(PAYMENT_METHODS as readonly string[]).includes(method))
    throw new ExpenseInputError("invalid_method");
  const paidBy =
    input.paidByStaffMemberId === undefined
      ? defaults.paidBy
      : idOrNull(input.paidByStaffMemberId, "invalid_staff");
  return {
    spentOn: input.spentOn,
    amountCents: input.amountCents,
    category: input.category as PayableCategory,
    description,
    merchant,
    eventId: idOrNull(input.eventId, "invalid_event"),
    vehicleId: idOrNull(input.vehicleId, "invalid_vehicle"),
    paidByStaffMemberId: paidBy,
    method: method as PaymentMethod | null,
  };
}

async function assertTargets(tx: Tx, f: ExpenseFields) {
  if (f.eventId) {
    const [row] = await tx.select({ id: event.id }).from(event).where(eq(event.id, f.eventId));
    if (!row) throw new ExpenseInputError("invalid_event");
  }
  if (f.vehicleId) {
    const [row] = await tx
      .select({ id: vehicle.id })
      .from(vehicle)
      .where(eq(vehicle.id, f.vehicleId));
    if (!row) throw new ExpenseInputError("invalid_vehicle");
  }
  if (f.paidByStaffMemberId) {
    const [row] = await tx
      .select({ id: staffMember.id })
      .from(staffMember)
      .where(eq(staffMember.id, f.paidByStaffMemberId));
    if (!row) throw new ExpenseInputError("invalid_staff");
  }
}

/** Records an expense that is already paid. Audited as `expense.create`. */
export async function createExpense(
  actor: Actor,
  input: ExpenseInput,
  options: { today?: string } = {},
): Promise<{ id: string }> {
  if (!can(actor.role, "finance", "write")) forbidden();
  const fields = parseExpenseInput(input, {
    paidBy: actor.staffMemberId,
    today: options.today ?? todayIn(),
  });
  return db.transaction(async (tx) => {
    await assertTargets(tx, fields);
    const [created] = await tx.insert(expense).values(fields).returning({ id: expense.id });
    if (!created) throw new Error("expense insert returned no row");
    await audit(tx, actor.id, [
      { action: "expense.create", entityType: "expense", entityId: created.id, diff: { fields } },
    ]);
    return created;
  });
}

async function lockExpense(tx: Tx, id: string, archived = false) {
  if (!UUID.test(id)) throw new ExpenseInputError("not_found");
  const [row] = await tx
    .select()
    .from(expense)
    .where(and(eq(expense.id, id), archived ? undefined : isNull(expense.archivedAt)))
    .for("update");
  if (!row) throw new ExpenseInputError("not_found");
  return row;
}

/** Edits an expense; `expectedUpdatedAt` is the optimistic lock. Audited as `expense.update`. */
export async function updateExpense(
  actor: Actor,
  id: string,
  input: ExpenseInput,
  expectedUpdatedAt: string,
  options: { today?: string } = {},
): Promise<{ changed: boolean; updatedAt: string }> {
  if (!can(actor.role, "finance", "write")) forbidden();
  return db.transaction(async (tx) => {
    const current = await lockExpense(tx, id);
    if (current.updatedAt.toISOString() !== expectedUpdatedAt)
      throw new ExpenseInputError("conflict");
    const next = parseExpenseInput(input, {
      paidBy: current.paidByStaffMemberId,
      today: options.today ?? todayIn(),
    });
    await assertTargets(tx, next);
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    for (const key of Object.keys(next) as (keyof ExpenseFields)[]) {
      if (current[key] !== next[key]) changes[key] = { from: current[key], to: next[key] };
    }
    if (Object.keys(changes).length === 0)
      return { changed: false, updatedAt: current.updatedAt.toISOString() };
    const [saved] = await tx
      .update(expense)
      .set(next)
      .where(eq(expense.id, id))
      .returning({ updatedAt: expense.updatedAt });
    await audit(tx, actor.id, [
      { action: "expense.update", entityType: "expense", entityId: id, diff: { changes } },
    ]);
    return { changed: true, updatedAt: (saved?.updatedAt ?? new Date()).toISOString() };
  });
}

/** Removes an expense from the lists (soft delete, undo toast brings it back). Receipts stay attached. */
export async function archiveExpense(
  actor: Actor,
  id: string,
): Promise<{ description: string; amountCents: number }> {
  if (!can(actor.role, "finance", "write")) forbidden();
  return db.transaction(async (tx) => {
    const current = await lockExpense(tx, id);
    await tx.update(expense).set({ archivedAt: new Date() }).where(eq(expense.id, id));
    await audit(tx, actor.id, [
      {
        action: "expense.archive",
        entityType: "expense",
        entityId: id,
        diff: { description: current.description, amountCents: current.amountCents },
      },
    ]);
    return { description: current.description, amountCents: current.amountCents };
  });
}

/** Undo of `archiveExpense`. */
export async function unarchiveExpense(actor: Actor, id: string): Promise<{ description: string }> {
  if (!can(actor.role, "finance", "write")) forbidden();
  return db.transaction(async (tx) => {
    const current = await lockExpense(tx, id, true);
    if (!current.archivedAt) throw new ExpenseInputError("conflict");
    await tx.update(expense).set({ archivedAt: null }).where(eq(expense.id, id));
    await audit(tx, actor.id, [
      { action: "expense.unarchive", entityType: "expense", entityId: id, diff: null },
    ]);
    return { description: current.description };
  });
}
