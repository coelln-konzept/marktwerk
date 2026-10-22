import { daysBetween } from "../dates/calendar";
import { permitHorizonEnd, SOON_DAYS } from "../deadlines/permit-horizon";

/*
 * Company-wide notifications (decision 2026-10-22): the notification center of the owner and managers.
 * Every important item exists once (recipient null), with one shared state. Pure rules only; the sweep
 * (packages/jobs) creates the rows and the web app lists them.
 */

/** Why an item is in the center. Stored in the dedupe key, so a due date that moves makes a new item. */
export const COMPANY_KINDS = [
  "task_overdue",
  "task_due_soon",
  "permit_apply_by",
  "permit_decision",
  "permit_expiry",
] as const;
export type CompanyKind = (typeof COMPANY_KINDS)[number];

export type CompanySubjectType = "task" | "permit";

/** Tasks due today or tomorrow are "bald fällig"; Kernaufgaben already three days ahead. */
export const COMPANY_DUE_SOON_DAYS = 1;
export const COMPANY_DUE_SOON_DAYS_KEY = 3;

/** A decision the authority still owes is listed this many days before it is expected. */
export const COMPANY_DECISION_DAYS = SOON_DAYS;

export type CompanySeverity = "info" | "warning" | "critical";

export function kindSubjectType(kind: CompanyKind): CompanySubjectType {
  return kind.startsWith("task_") ? "task" : "permit";
}

/** One notification per subject + reason + due date: `company:<subject>:<id>:<kind>:<YYYY-MM-DD>`. */
export function companyDedupeKey(kind: CompanyKind, subjectId: string, dueOn: string): string {
  return `company:${kindSubjectType(kind)}:${subjectId}:${kind}:${dueOn}`;
}

/** Inverse of `companyDedupeKey`; null for any other key (personal reminders never match). */
export function parseCompanyDedupeKey(
  key: string | null,
): { kind: CompanyKind; subjectId: string; dueOn: string } | null {
  const m = /^company:(?:task|permit):([0-9a-f-]{36}):([a-z_]+):(\d{4}-\d{2}-\d{2})$/.exec(
    key ?? "",
  );
  if (!m) return null;
  const kind = m[2] as CompanyKind;
  if (!(COMPANY_KINDS as readonly string[]).includes(kind)) return null;
  return { kind, subjectId: m[1] as string, dueOn: m[3] as string };
}

/** What a task's due date makes of it: overdue, due soon, or nothing yet (too far ahead). */
export function taskKind(
  dueOn: string,
  today: string,
  isKey: boolean,
): "task_overdue" | "task_due_soon" | null {
  const days = daysBetween(today, dueOn);
  if (days < 0) return "task_overdue";
  return days <= (isKey ? COMPANY_DUE_SOON_DAYS_KEY : COMPANY_DUE_SOON_DAYS)
    ? "task_due_soon"
    : null;
}

/** Overdue and Kernaufgaben weigh more: overdue key = critical, overdue or due-soon key = warning. */
export function taskSeverity(
  kind: "task_overdue" | "task_due_soon",
  isKey: boolean,
): CompanySeverity {
  if (kind === "task_overdue") return isKey ? "critical" : "warning";
  return isKey ? "warning" : "info";
}

/** An unfiled permit is listed from `permit_horizon_days` ahead of its apply-by date; overdue is critical. */
export function permitApplyKind(
  applyBy: string,
  today: string,
  horizonDays: number,
): { severity: CompanySeverity } | null {
  if (applyBy > permitHorizonEnd(today, horizonDays)) return null;
  const days = daysBetween(today, applyBy);
  return { severity: days < 0 ? "critical" : days <= SOON_DAYS ? "warning" : "info" };
}

/** A filed permit whose decision is due (or overdue) within the coming week. */
export function permitDecisionKind(
  expectedOn: string,
  today: string,
): { severity: CompanySeverity } | null {
  const days = daysBetween(today, expectedOn);
  if (days > COMPANY_DECISION_DAYS) return null;
  return { severity: days < 0 ? "warning" : "info" };
}

/**
 * A granted permit that is no longer valid on the first day of a market that needs it. Listed once the
 * market is within the permit horizon; critical when that market is a week away or less.
 */
export function permitExpiryKind(
  validUntil: string,
  marketStartsOn: string,
  today: string,
  horizonDays: number,
): { severity: CompanySeverity } | null {
  if (validUntil >= marketStartsOn) return null;
  if (marketStartsOn > permitHorizonEnd(today, horizonDays)) return null;
  return { severity: daysBetween(today, marketStartsOn) <= SOON_DAYS ? "critical" : "warning" };
}

export type CompanyUrgencyInput = {
  severity: CompanySeverity;
  /** The date the item is about (due, apply-by, decision, validity end). */
  dueOn: string | null;
  /** ISO instant the notification was created. */
  createdAt: string;
};

const SEVERITY_RANK: Record<CompanySeverity, number> = { critical: 0, warning: 1, info: 2 };

/**
 * "Dringlichkeit": critical first (overdue Kernaufgaben, unfiled permits past their date), then warning
 * (other overdue, Kernaufgaben due soon), then info; inside a level the earliest date first, then the
 * newest notification.
 */
export function compareByUrgency(a: CompanyUrgencyInput, b: CompanyUrgencyInput): number {
  const bySeverity = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
  if (bySeverity !== 0) return bySeverity;
  if (a.dueOn !== b.dueOn) {
    if (a.dueOn === null) return 1;
    if (b.dueOn === null) return -1;
    return a.dueOn < b.dueOn ? -1 : 1;
  }
  return compareByNewest(a, b);
}

/** "Neueste": newest notification first. */
export function compareByNewest(a: { createdAt: string }, b: { createdAt: string }): number {
  return a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0;
}

/** Groups of the list: overdue, today, this week, later (days relative to today). */
export function dueBucket(
  dueOn: string | null,
  today: string,
): "overdue" | "today" | "soon" | "later" {
  if (dueOn === null) return "later";
  const days = daysBetween(today, dueOn);
  if (days < 0) return "overdue";
  if (days === 0) return "today";
  return days <= SOON_DAYS ? "soon" : "later";
}
