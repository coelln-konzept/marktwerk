import { addDays, daysBetween, daysInMonth, isoDate } from "../dates/calendar";

/**
 * Payables and their instalments (Raten). Money is integer cents, dates are "YYYY-MM-DD". A payable's
 * status is never stored: it is derived from its instalments (data model, "Payables, receipts, event P&L").
 */

export type InstallmentStatus = "open" | "partially_paid" | "paid" | "cancelled";

/** What the derivation needs from an instalment row. */
export type InstallmentLike = {
  status: InstallmentStatus;
  dueOn: string;
  amountCents: number;
  paidAmountCents: number | null;
};

/** Upper bound for one amount typed in the office (1.000.000 €); keeps sums inside a 32-bit integer column. */
export const MAX_MONEY_CENTS = 100_000_000;

/** Most instalments one payable may have (monthly rent for five years). */
export const MAX_INSTALLMENTS = 60;

/**
 * Splits a total into `parts` instalments. Whole cents only: every rate gets the rounded-down share and
 * the remainder lands on the last rate (10.000 ct in 3 → 3333, 3333, 3334).
 */
export function splitCents(totalCents: number, parts: number): number[] {
  if (!Number.isSafeInteger(totalCents) || totalCents < 0) throw new RangeError("invalid total");
  if (!Number.isInteger(parts) || parts < 1) throw new RangeError("invalid number of parts");
  const base = Math.floor(totalCents / parts);
  return Array.from({ length: parts }, (_, i) =>
    i === parts - 1 ? totalCents - base * (parts - 1) : base,
  );
}

/**
 * `months` after `date`, same day of the month, clamped to the month's last day (31.01. + 1 month =
 * 28.02.). Computed from the original date, so a series keeps its day: 31.01., 28.02., 31.03.
 */
export function addMonthsClamped(date: string, months: number): string {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const day = Number(date.slice(8, 10));
  const index = year * 12 + (month - 1) + months;
  const y = Math.floor(index / 12);
  const m = (index % 12) + 1;
  return isoDate(y, m, Math.min(day, daysInMonth(y, m)));
}

export type PlannedInstallment = { dueOn: string; amountCents: number };

/** A generated plan: `count` instalments, the first due on `firstDueOn`, then every `intervalMonths`. */
export function planInstallments(input: {
  totalCents: number;
  count: number;
  firstDueOn: string;
  intervalMonths: number;
}): PlannedInstallment[] {
  const { totalCents, count, firstDueOn, intervalMonths } = input;
  if (count > MAX_INSTALLMENTS) throw new RangeError("too many instalments");
  if (!Number.isInteger(intervalMonths) || intervalMonths < 1)
    throw new RangeError("invalid interval");
  return splitCents(totalCents, count).map((amountCents, i) => ({
    dueOn: addMonthsClamped(firstDueOn, i * intervalMonths),
    amountCents,
  }));
}

export type PlanError = "empty" | "too_many" | "invalid_amount" | "sum_mismatch";

/**
 * The sum of an instalment plan has to equal the payable's total (cancelled instalments are not part of
 * the plan). `differenceCents` = total − sum, so a positive value means "still missing".
 */
export function checkInstallmentSum(
  totalCents: number,
  amountsCents: readonly number[],
): { ok: true } | { ok: false; error: PlanError; differenceCents: number } {
  const sum = amountsCents.reduce((a, b) => a + b, 0);
  const differenceCents = totalCents - sum;
  if (amountsCents.length === 0) return { ok: false, error: "empty", differenceCents };
  if (amountsCents.length > MAX_INSTALLMENTS)
    return { ok: false, error: "too_many", differenceCents };
  if (amountsCents.some((a) => !Number.isSafeInteger(a) || a <= 0 || a > MAX_MONEY_CENTS))
    return { ok: false, error: "invalid_amount", differenceCents };
  if (differenceCents !== 0) return { ok: false, error: "sum_mismatch", differenceCents };
  return { ok: true };
}

/** What is still to be paid on one instalment (0 once paid or cancelled). */
export function openAmountCents(
  i: Pick<InstallmentLike, "status" | "amountCents" | "paidAmountCents">,
) {
  if (i.status === "cancelled" || i.status === "paid") return 0;
  return Math.max(0, i.amountCents - (i.paidAmountCents ?? 0));
}

export type InstallmentState = InstallmentStatus | "overdue";

/** The status an instalment is shown with: unpaid and past its due date means "overdue". */
export function installmentState(i: InstallmentLike, today: string): InstallmentState {
  if ((i.status === "open" || i.status === "partially_paid") && i.dueOn < today) return "overdue";
  return i.status;
}

export type PayableStatus = "open" | "partially_paid" | "overdue" | "paid" | "cancelled";

/**
 * Status of a payable, derived from its instalments: cancelled when none is left, paid when all are, overdue when
 * anything unpaid is past its due date, partially paid when some money has gone out, else open.
 */
export function derivePayableStatus(
  installments: readonly InstallmentLike[],
  today: string,
): PayableStatus {
  const active = installments.filter((i) => i.status !== "cancelled");
  if (active.length === 0) return "cancelled";
  if (active.every((i) => i.status === "paid")) return "paid";
  if (active.some((i) => installmentState(i, today) === "overdue")) return "overdue";
  if (active.some((i) => (i.paidAmountCents ?? 0) > 0)) return "partially_paid";
  return "open";
}

/** The first instalment that still needs money, earliest due date first. */
export function nextOpenInstallment<T extends InstallmentLike>(
  installments: readonly T[],
): T | null {
  let next: T | null = null;
  for (const i of installments) {
    if (openAmountCents(i) <= 0) continue;
    if (next === null || i.dueOn < next.dueOn) next = i;
  }
  return next;
}

/** Reminder stages for an unpaid instalment (14 days, 3 days, due day, overdue). */
export type ReminderStage = "d14" | "d3" | "due" | "overdue";

export const REMINDER_STAGES: readonly ReminderStage[] = ["d14", "d3", "due", "overdue"];

/**
 * Which reminder applies today: the *closest* stage already reached, so an instalment created 10 days
 * before its due date gets the 14-day reminder right away. Null while it is more than 14 days away.
 */
export function reminderStage(dueOn: string, today: string): ReminderStage | null {
  const days = daysBetween(today, dueOn);
  if (days < 0) return "overdue";
  if (days === 0) return "due";
  if (days <= 3) return "d3";
  if (days <= 14) return "d14";
  return null;
}

/** Deterministic key per instalment, stage and due date: moving the due date re-arms the reminders. */
export function installmentReminderKey(
  installmentId: string,
  stage: ReminderStage,
  dueOn: string,
): string {
  return `installment:${installmentId}:${stage}:${dueOn}`;
}

/** Urgency for the Übersicht: overdue · today · soon (within 7 days); null when further away. */
export function installmentUrgency(
  dueOn: string,
  today: string,
): "overdue" | "today" | "soon" | null {
  const days = daysBetween(today, dueOn);
  if (days < 0) return "overdue";
  if (days === 0) return "today";
  return days <= 7 ? "soon" : null;
}

/** Last day of the "this week" window used by the focus list ("Diese Woche fällig" = the next 7 days). */
export function weekWindowEnd(today: string): string {
  return addDays(today, 7);
}
