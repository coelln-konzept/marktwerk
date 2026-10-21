import "server-only";
import {
  can,
  checkInstallmentSum,
  isIsoDate,
  MAX_MONEY_CENTS,
  openAmountCents,
} from "@marktwerk/core";
import {
  contact,
  document,
  event,
  installment,
  notification,
  obligation,
  payable,
  payableCategory,
  payableScope,
  paymentMethod,
  permit,
  staffMember,
  vehicle,
  venue,
} from "@marktwerk/db/schema";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { forbidden } from "next/navigation";
import { todayIn } from "@/lib/format";
import type { Actor } from "../actor";
import { db } from "../db";
import { audit } from "./audit";

export const PAYABLE_SCOPES = payableScope.enumValues;
export const PAYABLE_CATEGORIES = payableCategory.enumValues;
export const PAYMENT_METHODS = paymentMethod.enumValues;
export type PayableScope = (typeof PAYABLE_SCOPES)[number];
export type PayableCategory = (typeof PAYABLE_CATEGORIES)[number];
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export type PayableError =
  | "not_found"
  | "title_required"
  | "invalid_scope"
  | "invalid_category"
  | "invalid_event"
  | "invalid_venue"
  | "invalid_season"
  | "invalid_vehicle"
  | "invalid_contact"
  | "invalid_permit"
  | "invalid_obligation"
  | "invalid_amount"
  | "invalid_vat"
  | "invalid_date"
  | "too_long"
  /** The plan: no rows, too many rows, a row with a wrong amount or the sum differs from the total. */
  | "plan_empty"
  | "plan_too_many"
  | "plan_invalid_amount"
  | "plan_sum_mismatch"
  /** A rate that was already paid (or cancelled) cannot be edited through the plan. */
  | "installment_locked"
  | "invalid_paid_on"
  | "invalid_method"
  | "invalid_staff"
  | "amount_too_high"
  | "already_paid"
  | "installment_cancelled"
  | "has_payments"
  | "nothing_to_cancel"
  | "not_cancelled"
  /** Changed by someone else since the form was opened (or the undo no longer fits). */
  | "conflict";

export class PayableInputError extends Error {
  constructor(readonly code: PayableError) {
    super(code);
  }
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const UUID = /^[0-9a-f-]{36}$/i;
const MAX_TEXT = 200;
const MAX_NOTES = 4000;
const MIN_SEASON = 2000;
const MAX_SEASON = 2100;

/** What the form sends for a payable (amounts already parsed to cents on the client). */
export type PayableInput = {
  title: string;
  scope: string;
  category: string;
  counterpartyContactId?: string | null;
  eventId?: string | null;
  venueId?: string | null;
  season?: number | null;
  vehicleId?: string | null;
  permitId?: string | null;
  obligationId?: string | null;
  totalGrossCents: number;
  vatRateBp?: number | null;
  critical?: boolean;
  notes?: string | null;
};

export type PayableFields = {
  title: string;
  scope: PayableScope;
  category: PayableCategory;
  counterpartyContactId: string | null;
  eventId: string | null;
  venueId: string | null;
  season: number | null;
  vehicleId: string | null;
  permitId: string | null;
  obligationId: string | null;
  totalGrossCents: number;
  vatRateBp: number | null;
  critical: boolean;
  notes: string | null;
};

/** One row of the instalment plan. `id` is set for rates that already exist. */
export type PlanRowInput = {
  id?: string;
  dueOn: string;
  amountCents: number;
  notes?: string | null;
};

const blankToNull = (value: string | null | undefined) => {
  const trimmed = (value ?? "").trim();
  return trimmed === "" ? null : trimmed;
};

const idOrNull = (value: string | null | undefined, code: PayableError): string | null => {
  const v = blankToNull(value);
  if (v === null) return null;
  if (!UUID.test(v)) throw new PayableInputError(code);
  return v;
};

/**
 * Validates the form input and drops the fields the chosen scope doesn't use (an event payable keeps no
 * venue or season, a company payable no target at all). Pure; the referenced records are checked in the
 * transaction.
 */
export function parsePayableInput(input: PayableInput): PayableFields {
  const title = input.title.trim();
  if (title === "") throw new PayableInputError("title_required");
  if (title.length > MAX_TEXT) throw new PayableInputError("too_long");
  if (!(PAYABLE_SCOPES as readonly string[]).includes(input.scope))
    throw new PayableInputError("invalid_scope");
  if (!(PAYABLE_CATEGORIES as readonly string[]).includes(input.category))
    throw new PayableInputError("invalid_category");
  const scope = input.scope as PayableScope;
  const category = input.category as PayableCategory;
  if (
    !Number.isSafeInteger(input.totalGrossCents) ||
    input.totalGrossCents <= 0 ||
    input.totalGrossCents > MAX_MONEY_CENTS
  )
    throw new PayableInputError("invalid_amount");
  const vatRateBp = input.vatRateBp ?? null;
  if (vatRateBp !== null && (!Number.isInteger(vatRateBp) || vatRateBp < 0 || vatRateBp > 10_000))
    throw new PayableInputError("invalid_vat");
  const notes = blankToNull(input.notes);
  if (notes !== null && notes.length > MAX_NOTES) throw new PayableInputError("too_long");

  const eventId = scope === "event" ? idOrNull(input.eventId, "invalid_event") : null;
  if (scope === "event" && eventId === null) throw new PayableInputError("invalid_event");
  const vehicleId = scope === "vehicle" ? idOrNull(input.vehicleId, "invalid_vehicle") : null;
  if (scope === "vehicle" && vehicleId === null) throw new PayableInputError("invalid_vehicle");
  let venueId: string | null = null;
  let season: number | null = null;
  if (scope === "venue_season") {
    venueId = idOrNull(input.venueId, "invalid_venue");
    if (venueId === null) throw new PayableInputError("invalid_venue");
    season = input.season ?? null;
    if (
      !Number.isInteger(season) ||
      (season as number) < MIN_SEASON ||
      (season as number) > MAX_SEASON
    )
      throw new PayableInputError("invalid_season");
  }

  return {
    title,
    scope,
    category,
    counterpartyContactId: idOrNull(input.counterpartyContactId, "invalid_contact"),
    eventId,
    venueId,
    season,
    vehicleId,
    permitId: idOrNull(input.permitId, "invalid_permit"),
    obligationId: idOrNull(input.obligationId, "invalid_obligation"),
    totalGrossCents: input.totalGrossCents,
    vatRateBp,
    critical: input.critical === true,
    notes,
  };
}

/**
 * The plan as the service stores it: valid dates and amounts. The rates in `plan` have to add up to what
 * is left of the total after the rates that are fixed already (`lockedCents`: paid and part-paid ones).
 */
export function parsePlan(totalCents: number, plan: readonly PlanRowInput[], lockedCents = 0) {
  const rows = plan.map((row) => {
    if (!isIsoDate(row.dueOn)) throw new PayableInputError("invalid_date");
    if (row.id !== undefined && !UUID.test(row.id)) throw new PayableInputError("not_found");
    const notes = blankToNull(row.notes);
    if (notes !== null && notes.length > MAX_NOTES) throw new PayableInputError("too_long");
    return { id: row.id, dueOn: row.dueOn, amountCents: row.amountCents, notes };
  });
  const remaining = totalCents - lockedCents;
  // Everything is covered by paid rates already: no further rate is needed.
  if (rows.length === 0 && lockedCents > 0 && remaining === 0) return rows;
  const check = checkInstallmentSum(
    remaining,
    rows.map((r) => r.amountCents),
  );
  if (check.ok) return rows;
  if (check.error === "empty")
    throw new PayableInputError(lockedCents > 0 ? "plan_sum_mismatch" : "plan_empty");
  if (check.error === "too_many") throw new PayableInputError("plan_too_many");
  if (check.error === "invalid_amount") throw new PayableInputError("plan_invalid_amount");
  throw new PayableInputError("plan_sum_mismatch");
}

async function assertTargets(tx: Tx, f: PayableFields) {
  const exists = async (
    table: typeof event | typeof venue | typeof vehicle | typeof contact,
    id: string | null,
    code: PayableError,
  ) => {
    if (id === null) return;
    const [row] = await tx.select({ id: table.id }).from(table).where(eq(table.id, id));
    if (!row) throw new PayableInputError(code);
  };
  await exists(event, f.eventId, "invalid_event");
  await exists(venue, f.venueId, "invalid_venue");
  await exists(vehicle, f.vehicleId, "invalid_vehicle");
  await exists(contact, f.counterpartyContactId, "invalid_contact");
  if (f.permitId) {
    const [row] = await tx.select({ id: permit.id }).from(permit).where(eq(permit.id, f.permitId));
    if (!row) throw new PayableInputError("invalid_permit");
  }
  if (f.obligationId) {
    const [row] = await tx
      .select({ id: obligation.id })
      .from(obligation)
      .where(eq(obligation.id, f.obligationId));
    if (!row) throw new PayableInputError("invalid_obligation");
  }
}

/**
 * New payable with its instalment plan ("Posten anlegen"). The plan's amounts must add up to the total
 * (service check, the database cannot see across rows). Audited as `payable.create`.
 */
export async function createPayable(
  actor: Actor,
  input: PayableInput,
  plan: readonly PlanRowInput[],
): Promise<{ id: string }> {
  if (!can(actor.role, "finance", "write")) forbidden();
  const fields = parsePayableInput(input);
  const rows = parsePlan(fields.totalGrossCents, plan);
  const ordered = rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => a.row.dueOn.localeCompare(b.row.dueOn) || a.index - b.index)
    .map(({ row }) => row);

  return db.transaction(async (tx) => {
    await assertTargets(tx, fields);
    const [created] = await tx.insert(payable).values(fields).returning({ id: payable.id });
    if (!created) throw new Error("payable insert returned no row");
    await tx.insert(installment).values(
      ordered.map((row, i) => ({
        payableId: created.id,
        sort: i + 1,
        dueOn: row.dueOn,
        amountCents: row.amountCents,
        notes: row.notes,
      })),
    );
    await audit(tx, actor.id, [
      {
        action: "payable.create",
        entityType: "payable",
        entityId: created.id,
        diff: {
          fields,
          plan: ordered.map((r) => ({ dueOn: r.dueOn, amountCents: r.amountCents })),
        },
      },
    ]);
    return created;
  });
}

async function lockPayable(tx: Tx, id: string) {
  if (!UUID.test(id)) throw new PayableInputError("not_found");
  const [row] = await tx
    .select()
    .from(payable)
    .where(and(eq(payable.id, id), isNull(payable.archivedAt)))
    .for("update");
  if (!row) throw new PayableInputError("not_found");
  return row;
}

const fieldsOf = (row: typeof payable.$inferSelect): PayableFields => ({
  title: row.title,
  scope: row.scope,
  category: row.category,
  counterpartyContactId: row.counterpartyContactId,
  eventId: row.eventId,
  venueId: row.venueId,
  season: row.season,
  vehicleId: row.vehicleId,
  permitId: row.permitId,
  obligationId: row.obligationId,
  totalGrossCents: row.totalGrossCents,
  vatRateBp: row.vatRateBp,
  critical: row.critical,
  notes: row.notes,
});

/**
 * Edits a payable and its plan. `plan` lists the rates that can still change (open ones, existing
 * rows by `id`, new ones without): open rates missing from it are removed (cancelled instead if a
 * document hangs on them), paid and part-paid rates stay as they are and count towards the sum.
 * `expectedUpdatedAt` is the optimistic lock. Audited as `payable.update`; nothing changed, nothing written.
 */
export async function updatePayable(
  actor: Actor,
  id: string,
  input: PayableInput,
  plan: readonly PlanRowInput[],
  expectedUpdatedAt: string,
): Promise<{ changed: boolean; updatedAt: string }> {
  if (!can(actor.role, "finance", "write")) forbidden();
  const fields = parsePayableInput(input);

  return db.transaction(async (tx) => {
    const current = await lockPayable(tx, id);
    if (current.updatedAt.toISOString() !== expectedUpdatedAt)
      throw new PayableInputError("conflict");
    const rates = await tx
      .select()
      .from(installment)
      .where(eq(installment.payableId, id))
      .orderBy(asc(installment.sort))
      .for("update");

    const locked = rates.filter((r) => r.status === "paid" || r.status === "partially_paid");
    const lockedIds = new Set(locked.map((r) => r.id));
    const openById = new Map(rates.filter((r) => r.status === "open").map((r) => [r.id, r]));
    const rows = parsePlan(
      fields.totalGrossCents,
      plan,
      locked.reduce((sum, r) => sum + r.amountCents, 0),
    );
    for (const row of rows) {
      if (row.id === undefined) continue;
      if (lockedIds.has(row.id)) throw new PayableInputError("installment_locked");
      if (!openById.has(row.id)) throw new PayableInputError("not_found");
    }
    if (new Set(rows.flatMap((r) => (r.id ? [r.id] : []))).size !== rows.filter((r) => r.id).length)
      throw new PayableInputError("not_found");
    await assertTargets(tx, fields);

    const previous = fieldsOf(current);
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    for (const key of Object.keys(fields) as (keyof PayableFields)[]) {
      if (previous[key] !== fields[key]) changes[key] = { from: previous[key], to: fields[key] };
    }

    const keptIds = new Set(rows.flatMap((r) => (r.id ? [r.id] : [])));
    const removed = [...openById.values()].filter((r) => !keptIds.has(r.id));
    const changedRates = rows.filter((r) => {
      const old = r.id ? openById.get(r.id) : undefined;
      return (
        old && (old.dueOn !== r.dueOn || old.amountCents !== r.amountCents || old.notes !== r.notes)
      );
    });
    const added = rows.filter((r) => r.id === undefined);
    const planChanged = removed.length > 0 || changedRates.length > 0 || added.length > 0;
    if (Object.keys(changes).length === 0 && !planChanged)
      return { changed: false, updatedAt: current.updatedAt.toISOString() };

    if (removed.length > 0) {
      const withDocuments = await tx
        .selectDistinct({ id: document.installmentId })
        .from(document)
        .where(
          inArray(
            document.installmentId,
            removed.map((r) => r.id),
          ),
        );
      const keep = new Set(withDocuments.map((d) => d.id));
      const toCancel = removed.filter((r) => keep.has(r.id)).map((r) => r.id);
      const toDelete = removed.filter((r) => !keep.has(r.id)).map((r) => r.id);
      if (toCancel.length > 0)
        await tx
          .update(installment)
          .set({ status: "cancelled" })
          .where(inArray(installment.id, toCancel));
      if (toDelete.length > 0)
        await tx.delete(installment).where(inArray(installment.id, toDelete));
    }
    for (const row of changedRates) {
      await tx
        .update(installment)
        .set({ dueOn: row.dueOn, amountCents: row.amountCents, notes: row.notes })
        .where(eq(installment.id, row.id as string));
    }
    if (added.length > 0) {
      await tx.insert(installment).values(
        added.map((row, i) => ({
          payableId: id,
          sort: 50_000 + i,
          dueOn: row.dueOn,
          amountCents: row.amountCents,
          notes: row.notes,
        })),
      );
    }
    if (planChanged) await renumber(tx, id);

    const [saved] = await tx
      .update(payable)
      .set({ ...fields, updatedAt: new Date() })
      .where(eq(payable.id, id))
      .returning({ updatedAt: payable.updatedAt });
    await audit(tx, actor.id, [
      {
        action: "payable.update",
        entityType: "payable",
        entityId: id,
        diff: {
          changes,
          ...(planChanged
            ? {
                plan: {
                  added: added.map((r) => ({ dueOn: r.dueOn, amountCents: r.amountCents })),
                  removed: removed.map((r) => ({
                    id: r.id,
                    dueOn: r.dueOn,
                    amountCents: r.amountCents,
                  })),
                  changed: changedRates.map((r) => ({
                    id: r.id,
                    dueOn: r.dueOn,
                    amountCents: r.amountCents,
                  })),
                },
              }
            : {}),
        },
      },
    ]);
    return { changed: true, updatedAt: (saved?.updatedAt ?? new Date()).toISOString() };
  });
}

/** Numbers the rates 1..n by due date. Two passes through values nobody uses, because (payable, sort) is unique. */
async function renumber(tx: Tx, payableId: string) {
  const rates = await tx
    .select({ id: installment.id, dueOn: installment.dueOn, sort: installment.sort })
    .from(installment)
    .where(eq(installment.payableId, payableId));
  rates.sort((a, b) => a.dueOn.localeCompare(b.dueOn) || a.sort - b.sort);
  for (const [i, rate] of rates.entries()) {
    await tx
      .update(installment)
      .set({ sort: 100_000 + i })
      .where(eq(installment.id, rate.id));
  }
  for (const [i, rate] of rates.entries()) {
    await tx
      .update(installment)
      .set({ sort: i + 1 })
      .where(eq(installment.id, rate.id));
  }
}

/** The part of an instalment row that "paid" changes, kept for the undo toast. */
export type InstallmentSnapshot = {
  status: "open" | "partially_paid" | "paid";
  paidOn: string | null;
  paidAmountCents: number | null;
  paidByStaffMemberId: string | null;
  method: PaymentMethod | null;
  reference: string | null;
};

export type PaymentInput = {
  /** Date of payment, `YYYY-MM-DD`; not in the future. */
  paidOn: string;
  /** What was paid now (a part of the rate is allowed). */
  amountCents: number;
  method?: string | null;
  reference?: string | null;
  paidByStaffMemberId?: string | null;
};

async function lockInstallment(tx: Tx, id: string) {
  if (!UUID.test(id)) throw new PayableInputError("not_found");
  const [row] = await tx
    .select({
      installment,
      payableTitle: payable.title,
      payableArchivedAt: payable.archivedAt,
    })
    .from(installment)
    .innerJoin(payable, eq(payable.id, installment.payableId))
    .where(eq(installment.id, id))
    .for("update", { of: installment });
  if (!row || row.payableArchivedAt) throw new PayableInputError("not_found");
  return { ...row.installment, payableTitle: row.payableTitle };
}

const snapshotOf = (row: typeof installment.$inferSelect): InstallmentSnapshot => ({
  status: row.status === "cancelled" ? "open" : row.status,
  paidOn: row.paidOn,
  paidAmountCents: row.paidAmountCents,
  paidByStaffMemberId: row.paidByStaffMemberId,
  method: row.method,
  reference: row.reference,
});

/** Reminders for a rate that is settled or cancelled are done. */
async function settleNotifications(tx: Tx, installmentIds: string[]) {
  if (installmentIds.length === 0) return;
  await tx
    .update(notification)
    .set({ state: "done" })
    .where(
      and(
        eq(notification.subjectType, "installment"),
        inArray(notification.subjectId, installmentIds),
        inArray(notification.state, ["unread", "read", "saved"]),
      ),
    );
}

/**
 * "Bezahlt": records a payment on a rate, which *is* the expense (single entry). Paying less than what
 * is open leaves the rate `partially_paid` (later payments add up); paying more than what is open is
 * refused. `actor.staffMemberId` is the default for `paid_by`. Audited as `installment.pay`; the result
 * carries what the row looked like before, for the undo toast.
 */
export async function markInstallmentPaid(
  actor: Actor,
  installmentId: string,
  input: PaymentInput,
  options: { today?: string } = {},
): Promise<{
  payableId: string;
  payableTitle: string;
  status: "partially_paid" | "paid";
  paidAmountCents: number;
  previous: InstallmentSnapshot;
}> {
  if (!can(actor.role, "finance", "write")) forbidden();
  const today = options.today ?? todayIn();
  if (!isIsoDate(input.paidOn)) throw new PayableInputError("invalid_paid_on");
  if (input.paidOn > today) throw new PayableInputError("invalid_paid_on");
  if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0)
    throw new PayableInputError("invalid_amount");
  const method = blankToNull(input.method);
  if (method !== null && !(PAYMENT_METHODS as readonly string[]).includes(method))
    throw new PayableInputError("invalid_method");
  const reference = blankToNull(input.reference);
  if (reference !== null && reference.length > MAX_TEXT) throw new PayableInputError("too_long");
  const paidBy =
    input.paidByStaffMemberId === undefined ? actor.staffMemberId : input.paidByStaffMemberId;
  if (paidBy !== null && !UUID.test(paidBy)) throw new PayableInputError("invalid_staff");

  return db.transaction(async (tx) => {
    const current = await lockInstallment(tx, installmentId);
    if (current.status === "cancelled") throw new PayableInputError("installment_cancelled");
    if (current.status === "paid") throw new PayableInputError("already_paid");
    if (paidBy !== null) {
      const [person] = await tx
        .select({ id: staffMember.id })
        .from(staffMember)
        .where(eq(staffMember.id, paidBy));
      if (!person) throw new PayableInputError("invalid_staff");
    }
    const open = openAmountCents(current);
    if (input.amountCents > open) throw new PayableInputError("amount_too_high");

    const paidAmountCents = (current.paidAmountCents ?? 0) + input.amountCents;
    const status =
      paidAmountCents >= current.amountCents ? ("paid" as const) : ("partially_paid" as const);
    const previous = snapshotOf(current);
    await tx
      .update(installment)
      .set({
        status,
        paidOn: input.paidOn,
        paidAmountCents,
        paidByStaffMemberId: paidBy,
        method: (method as PaymentMethod | null) ?? current.method,
        reference: reference ?? current.reference,
      })
      .where(eq(installment.id, installmentId));
    if (status === "paid") await settleNotifications(tx, [installmentId]);
    await audit(tx, actor.id, [
      {
        action: "installment.pay",
        entityType: "installment",
        entityId: installmentId,
        diff: {
          payableId: current.payableId,
          payable: current.payableTitle,
          sort: current.sort,
          dueOn: current.dueOn,
          amountCents: current.amountCents,
          paidNowCents: input.amountCents,
          paidOn: input.paidOn,
          paidAmountCents,
          status,
          method,
          reference,
          paidByStaffMemberId: paidBy,
        },
      },
    ]);
    return {
      payableId: current.payableId,
      payableTitle: current.payableTitle,
      status,
      paidAmountCents,
      previous,
    };
  });
}

/**
 * Undo toast of `markInstallmentPaid`: puts the rate back to `previous`, but only while it still has
 * the amount the payment left (`expectedPaidAmountCents`), so a newer payment is never overwritten.
 */
export async function undoInstallmentPayment(
  actor: Actor,
  installmentId: string,
  previous: InstallmentSnapshot,
  expectedPaidAmountCents: number,
): Promise<{ payableId: string }> {
  if (!can(actor.role, "finance", "write")) forbidden();
  return db.transaction(async (tx) => {
    const current = await lockInstallment(tx, installmentId);
    if (current.status === "cancelled" || current.paidAmountCents !== expectedPaidAmountCents)
      throw new PayableInputError("conflict");
    await tx
      .update(installment)
      .set({
        status: previous.status,
        paidOn: previous.paidOn,
        paidAmountCents: previous.paidAmountCents,
        paidByStaffMemberId: previous.paidByStaffMemberId,
        method: previous.method,
        reference: previous.reference,
      })
      .where(eq(installment.id, installmentId));
    await audit(tx, actor.id, [
      {
        action: "installment.pay_undo",
        entityType: "installment",
        entityId: installmentId,
        diff: { payableId: current.payableId, from: snapshotOf(current), to: previous },
      },
    ]);
    return { payableId: current.payableId };
  });
}

/** Cancels one open rate ("Rate entfällt"). A rate with payments cannot be cancelled. */
export async function cancelInstallment(
  actor: Actor,
  installmentId: string,
): Promise<{ payableId: string; payableTitle: string }> {
  if (!can(actor.role, "finance", "write")) forbidden();
  return db.transaction(async (tx) => {
    const current = await lockInstallment(tx, installmentId);
    if (current.status === "cancelled") throw new PayableInputError("installment_cancelled");
    if (current.status !== "open") throw new PayableInputError("has_payments");
    await tx
      .update(installment)
      .set({ status: "cancelled" })
      .where(eq(installment.id, installmentId));
    await settleNotifications(tx, [installmentId]);
    await audit(tx, actor.id, [
      {
        action: "installment.cancel",
        entityType: "installment",
        entityId: installmentId,
        diff: {
          payableId: current.payableId,
          payable: current.payableTitle,
          sort: current.sort,
          dueOn: current.dueOn,
          amountCents: current.amountCents,
        },
      },
    ]);
    return { payableId: current.payableId, payableTitle: current.payableTitle };
  });
}

/** Undo of a cancellation (single rate or all rates a payable cancellation closed). */
export async function reopenInstallments(
  actor: Actor,
  installmentIds: string[],
): Promise<{ payableIds: string[] }> {
  if (!can(actor.role, "finance", "write")) forbidden();
  return db.transaction(async (tx) => {
    const payableIds = new Set<string>();
    for (const installmentId of installmentIds) {
      const current = await lockInstallment(tx, installmentId);
      if (current.status !== "cancelled") throw new PayableInputError("not_cancelled");
      await tx.update(installment).set({ status: "open" }).where(eq(installment.id, installmentId));
      payableIds.add(current.payableId);
      await audit(tx, actor.id, [
        {
          action: "installment.reopen",
          entityType: "installment",
          entityId: installmentId,
          diff: {
            payableId: current.payableId,
            dueOn: current.dueOn,
            amountCents: current.amountCents,
          },
        },
      ]);
    }
    return { payableIds: [...payableIds] };
  });
}

/**
 * Cancels a payable: every rate without a payment is cancelled (paid rates stay, they are history). With
 * nothing paid the derived status becomes "cancelled". Audited as `payable.cancel`.
 */
export async function cancelPayable(
  actor: Actor,
  payableId: string,
): Promise<{ title: string; cancelledIds: string[] }> {
  if (!can(actor.role, "finance", "write")) forbidden();
  return db.transaction(async (tx) => {
    const current = await lockPayable(tx, payableId);
    const open = await tx
      .select({ id: installment.id })
      .from(installment)
      .where(and(eq(installment.payableId, payableId), eq(installment.status, "open")))
      .orderBy(asc(installment.sort))
      .for("update");
    if (open.length === 0) throw new PayableInputError("nothing_to_cancel");
    const ids = open.map((r) => r.id);
    await tx.update(installment).set({ status: "cancelled" }).where(inArray(installment.id, ids));
    await tx.update(payable).set({ updatedAt: sql`now()` }).where(eq(payable.id, payableId));
    await settleNotifications(tx, ids);
    await audit(tx, actor.id, [
      {
        action: "payable.cancel",
        entityType: "payable",
        entityId: payableId,
        diff: { title: current.title, cancelledInstallmentIds: ids },
      },
    ]);
    return { title: current.title, cancelledIds: ids };
  });
}
