import type { HealthLevel } from "../events/health";

/**
 * Event money: plan → committed → actual, per cost category (data model, "event budget").
 *
 * - **plan**: the `event_budget_line` of the category (what the office expects to spend).
 * - **committed**: everything the event owes or has already spent: its payables (instalments that are not
 *   cancelled) plus its ad-hoc expenses (an expense is a commitment that is already settled).
 * - **actual**: what has really been paid: paid amounts of instalments plus expenses.
 *
 * So actual never exceeds committed, and `variance = plan − committed` (negative = over budget).
 */

export type BudgetInput = {
  planned: readonly { category: string; plannedCents: number }[];
  payables: readonly { category: string; committedCents: number; actualCents: number }[];
  expenses: readonly { category: string; amountCents: number }[];
};

export type BudgetRow = {
  category: string;
  plannedCents: number;
  committedCents: number;
  actualCents: number;
  /** plan − committed; null when the category has no plan line. */
  varianceCents: number | null;
};

export type BudgetTotals = Omit<BudgetRow, "category">;

/**
 * Sums plan, committed and actual per category. Only categories that have a plan or any cost show up, in
 * the order of `categoryOrder` (unknown categories last). The total's variance is null without any plan.
 */
export function aggregateBudget(
  input: BudgetInput,
  categoryOrder: readonly string[] = [],
): { rows: BudgetRow[]; totals: BudgetTotals } {
  const byCategory = new Map<
    string,
    { planned: number; committed: number; actual: number; hasPlan: boolean }
  >();
  const slot = (category: string) => {
    let entry = byCategory.get(category);
    if (!entry) {
      entry = { planned: 0, committed: 0, actual: 0, hasPlan: false };
      byCategory.set(category, entry);
    }
    return entry;
  };
  for (const line of input.planned) {
    const entry = slot(line.category);
    entry.planned += line.plannedCents;
    entry.hasPlan = true;
  }
  for (const p of input.payables) {
    const entry = slot(p.category);
    entry.committed += p.committedCents;
    entry.actual += p.actualCents;
  }
  for (const e of input.expenses) {
    const entry = slot(e.category);
    entry.committed += e.amountCents;
    entry.actual += e.amountCents;
  }

  const rank = (category: string) => {
    const at = categoryOrder.indexOf(category);
    return at === -1 ? Number.MAX_SAFE_INTEGER : at;
  };
  const rows = [...byCategory.entries()]
    // A category whose only payables were cancelled has nothing to show.
    .filter(([, e]) => e.hasPlan || e.committed > 0 || e.actual > 0)
    .map(
      ([category, e]): BudgetRow => ({
        category,
        plannedCents: e.planned,
        committedCents: e.committed,
        actualCents: e.actual,
        varianceCents: e.hasPlan ? e.planned - e.committed : null,
      }),
    )
    .sort((a, b) => rank(a.category) - rank(b.category) || a.category.localeCompare(b.category));

  const plannedCents = rows.reduce((s, r) => s + r.plannedCents, 0);
  const committedCents = rows.reduce((s, r) => s + r.committedCents, 0);
  const actualCents = rows.reduce((s, r) => s + r.actualCents, 0);
  const hasPlan = input.planned.length > 0;
  return {
    rows,
    totals: {
      plannedCents,
      committedCents,
      actualCents,
      varianceCents: hasPlan ? plannedCents - committedCents : null,
    },
  };
}

/**
 * Share of a `venue_season` payable (location fee for a whole season) that falls on one of the
 * `eventCount` events at that venue in that season: rounded to whole cents. Shown next to, never inside,
 * the event's own category totals.
 */
export function seasonShareCents(cents: number, eventCount: number): number {
  if (eventCount <= 0) return 0;
  return Math.round(cents / eventCount);
}

/**
 * Money dimension of the event health. Critical: an instalment of this event is overdue. Warn: one is due
 * within a week, or committed costs exceed the plan. Ok: money is tracked and nothing is wrong. Null: no
 * payable and no plan yet (nothing to track).
 */
export function eventMoneyHealth(input: {
  overdueCount: number;
  dueSoonCount: number;
  installmentCount: number;
  plannedCents: number;
  committedCents: number;
}): HealthLevel | null {
  if (input.overdueCount > 0) return "critical";
  if (input.dueSoonCount > 0) return "warn";
  if (input.plannedCents > 0 && input.committedCents > input.plannedCents) return "warn";
  if (input.installmentCount > 0 || input.plannedCents > 0) return "ok";
  return null;
}
