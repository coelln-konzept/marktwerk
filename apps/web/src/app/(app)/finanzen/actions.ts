"use server";

import { refresh } from "next/cache";
import { getActor } from "@/server/actor";
import {
  archiveExpense,
  createExpense,
  type ExpenseInput,
  ExpenseInputError,
  unarchiveExpense,
} from "@/server/services/expenses";
import {
  cancelInstallment,
  cancelPayable,
  createPayable,
  type InstallmentSnapshot,
  markInstallmentPaid,
  type PayableInput,
  PayableInputError,
  type PaymentInput,
  type PlanRowInput,
  reopenInstallments,
  undoInstallmentPayment,
  updatePayable,
} from "@/server/services/payables";
import { requirePermission } from "@/server/session";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

/** Runs a money mutation: permission first, input errors become a result code, the page is refreshed. */
async function run<T>(
  work: (actor: Awaited<ReturnType<typeof getActor>>) => Promise<T>,
  options: { refreshOnError?: string[] } = {},
): Promise<ActionResult<T>> {
  await requirePermission("finance", "write");
  const actor = await getActor();
  try {
    const data = await work(actor);
    refresh();
    return { ok: true, data };
  } catch (error) {
    if (error instanceof PayableInputError || error instanceof ExpenseInputError) {
      // The page may show an outdated state; make it current again.
      if (error.code === "conflict" || options.refreshOnError?.includes(error.code)) refresh();
      return { ok: false, error: error.code };
    }
    throw error;
  }
}

/** "Zahlung anlegen": payable with its instalment plan. */
export async function createPayableAction(input: PayableInput, plan: PlanRowInput[]) {
  return run((actor) => createPayable(actor, input, plan));
}

/** Edit form: `expectedUpdatedAt` is the version the form was opened with. */
export async function updatePayableAction(
  id: string,
  input: PayableInput,
  plan: PlanRowInput[],
  expectedUpdatedAt: string,
) {
  return run((actor) => updatePayable(actor, id, input, plan, expectedUpdatedAt), {
    refreshOnError: ["not_found", "installment_locked"],
  });
}

/** "Bezahlt": records a (part) payment on a rate. */
export async function payInstallmentAction(installmentId: string, input: PaymentInput) {
  return run((actor) => markInstallmentPaid(actor, installmentId, input), {
    refreshOnError: ["already_paid", "installment_cancelled", "amount_too_high", "not_found"],
  });
}

/** Undo toast of `payInstallmentAction`. */
export async function undoPaymentAction(
  installmentId: string,
  previous: InstallmentSnapshot,
  expectedPaidAmountCents: number,
) {
  return run((actor) =>
    undoInstallmentPayment(actor, installmentId, previous, expectedPaidAmountCents),
  );
}

/** "Rate entfällt". */
export async function cancelInstallmentAction(installmentId: string) {
  return run((actor) => cancelInstallment(actor, installmentId), {
    refreshOnError: ["has_payments", "installment_cancelled", "not_found"],
  });
}

/** Undo of a cancellation (one rate or all rates a payable cancellation closed). */
export async function reopenInstallmentsAction(installmentIds: string[]) {
  return run((actor) => reopenInstallments(actor, installmentIds), {
    refreshOnError: ["not_cancelled", "not_found"],
  });
}

/** "Posten stornieren": every rate without a payment. */
export async function cancelPayableAction(payableId: string) {
  return run((actor) => cancelPayable(actor, payableId), {
    refreshOnError: ["nothing_to_cancel", "not_found"],
  });
}

/** Quick entry of an expense that is already paid. */
export async function createExpenseAction(input: ExpenseInput) {
  return run((actor) => createExpense(actor, input));
}

export async function archiveExpenseAction(id: string) {
  return run((actor) => archiveExpense(actor, id), { refreshOnError: ["not_found"] });
}

/** Undo of `archiveExpenseAction`. */
export async function unarchiveExpenseAction(id: string) {
  return run((actor) => unarchiveExpense(actor, id));
}
