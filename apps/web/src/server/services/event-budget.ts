import "server-only";
import { can, isIsoDate, MAX_MONEY_CENTS } from "@marktwerk/core";
import { event, eventBudgetLine, eventIncome } from "@marktwerk/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { forbidden } from "next/navigation";
import type { Actor } from "../actor";
import { db } from "../db";
import { audit } from "./audit";
import { PAYABLE_CATEGORIES } from "./payables";

export type EventBudgetError =
  | "not_found"
  | "invalid_category"
  | "invalid_amount"
  | "label_required"
  | "invalid_date"
  | "too_long";

export class EventBudgetInputError extends Error {
  constructor(readonly code: EventBudgetError) {
    super(code);
  }
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const UUID = /^[0-9a-f-]{36}$/i;

async function assertEvent(tx: Tx, eventId: string) {
  if (!UUID.test(eventId)) throw new EventBudgetInputError("not_found");
  const [row] = await tx.select({ id: event.id }).from(event).where(eq(event.id, eventId));
  if (!row) throw new EventBudgetInputError("not_found");
}

/**
 * Plans the cost of one category of an event ("Plan" column). `plannedCents = null` removes the line.
 * Setting the value it already has writes nothing. Audited as `event.budget`; the result has the previous
 * value for the undo toast.
 */
export async function setBudgetLine(
  actor: Actor,
  eventId: string,
  category: string,
  plannedCents: number | null,
  notes?: string | null,
): Promise<{ changed: boolean; previousCents: number | null }> {
  if (!can(actor.role, "finance", "write")) forbidden();
  if (!(PAYABLE_CATEGORIES as readonly string[]).includes(category))
    throw new EventBudgetInputError("invalid_category");
  if (
    plannedCents !== null &&
    (!Number.isSafeInteger(plannedCents) || plannedCents < 0 || plannedCents > MAX_MONEY_CENTS)
  )
    throw new EventBudgetInputError("invalid_amount");
  const note = (notes ?? "").trim() === "" ? null : (notes as string).trim();
  if (note !== null && note.length > 500) throw new EventBudgetInputError("too_long");
  const typedCategory = category as (typeof PAYABLE_CATEGORIES)[number];

  return db.transaction(async (tx) => {
    await assertEvent(tx, eventId);
    const [current] = await tx
      .select()
      .from(eventBudgetLine)
      .where(and(eq(eventBudgetLine.eventId, eventId), eq(eventBudgetLine.category, typedCategory)))
      .for("update");
    const previousCents = current?.plannedCents ?? null;
    if (previousCents === plannedCents && (notes === undefined || current?.notes === note))
      return { changed: false, previousCents };
    if (plannedCents === null) {
      if (!current) return { changed: false, previousCents };
      await tx.delete(eventBudgetLine).where(eq(eventBudgetLine.id, current.id));
    } else if (current) {
      await tx
        .update(eventBudgetLine)
        .set({ plannedCents, ...(notes === undefined ? {} : { notes: note }) })
        .where(eq(eventBudgetLine.id, current.id));
    } else {
      await tx
        .insert(eventBudgetLine)
        .values({ eventId, category: typedCategory, plannedCents, notes: note });
    }
    await audit(tx, actor.id, [
      {
        action: "event.budget",
        entityType: "event",
        entityId: eventId,
        diff: { category, from: previousCents, to: plannedCents },
      },
    ]);
    return { changed: true, previousCents };
  });
}

export type EventIncomeInput = {
  label: string;
  amountCents: number;
  /** `YYYY-MM-DD` once the money arrived, empty while it is only expected. */
  receivedOn?: string | null;
  notes?: string | null;
};

/** Income of an event that is not a stall fee (sponsoring, bar). Audited as `event.income_add`. */
export async function addEventIncome(
  actor: Actor,
  eventId: string,
  input: EventIncomeInput,
): Promise<{ id: string }> {
  if (!can(actor.role, "finance", "write")) forbidden();
  const label = input.label.trim();
  if (label === "") throw new EventBudgetInputError("label_required");
  if (label.length > 200) throw new EventBudgetInputError("too_long");
  if (
    !Number.isSafeInteger(input.amountCents) ||
    input.amountCents <= 0 ||
    input.amountCents > MAX_MONEY_CENTS
  )
    throw new EventBudgetInputError("invalid_amount");
  const receivedOn = (input.receivedOn ?? "").trim() === "" ? null : (input.receivedOn as string);
  if (receivedOn !== null && !isIsoDate(receivedOn))
    throw new EventBudgetInputError("invalid_date");
  const notes = (input.notes ?? "").trim() === "" ? null : (input.notes as string).trim();
  return db.transaction(async (tx) => {
    await assertEvent(tx, eventId);
    const [created] = await tx
      .insert(eventIncome)
      .values({ eventId, label, amountCents: input.amountCents, receivedOn, notes })
      .returning({ id: eventIncome.id });
    if (!created) throw new Error("income insert returned no row");
    await audit(tx, actor.id, [
      {
        action: "event.income_add",
        entityType: "event",
        entityId: eventId,
        diff: { incomeId: created.id, label, amountCents: input.amountCents, receivedOn },
      },
    ]);
    return created;
  });
}

/** Takes an income line off the list (soft delete; `restore` is the undo). Audited. */
export async function archiveEventIncome(
  actor: Actor,
  incomeId: string,
  restore = false,
): Promise<{ eventId: string; label: string }> {
  if (!can(actor.role, "finance", "write")) forbidden();
  if (!UUID.test(incomeId)) throw new EventBudgetInputError("not_found");
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(eventIncome)
      .where(
        and(eq(eventIncome.id, incomeId), restore ? undefined : isNull(eventIncome.archivedAt)),
      )
      .for("update");
    if (!current) throw new EventBudgetInputError("not_found");
    await tx
      .update(eventIncome)
      .set({ archivedAt: restore ? null : new Date() })
      .where(eq(eventIncome.id, incomeId));
    await audit(tx, actor.id, [
      {
        action: restore ? "event.income_restore" : "event.income_archive",
        entityType: "event",
        entityId: current.eventId,
        diff: { incomeId, label: current.label, amountCents: current.amountCents },
      },
    ]);
    return { eventId: current.eventId, label: current.label };
  });
}
