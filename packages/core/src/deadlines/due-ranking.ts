/**
 * Ranking of the Übersicht's "Heute fällig" list, which merges the due items of every module.
 *
 * Order (decided with the product owner's wording "Überfällig · Heute · Diese Woche", kind order is our
 * default and documented here):
 *   1. urgency: overdue, then today, then soon (within 7 days);
 *   2. within an urgency group, by kind: Genehmigungen > Raten (Geld) > Aufgaben > Stunden > Pflichten
 *      (a missed permit or a late payment costs money or the event; an open task rarely does);
 *   3. then the oldest due date first, then the title (stable, alphabetical).
 */

export type RankableDueKind = "task" | "permit" | "installment" | "hours" | "obligation";
export type RankableUrgency = "overdue" | "today" | "soon";

/** Lower = more important. */
export const DUE_KIND_PRIORITY: Record<RankableDueKind, number> = {
  permit: 0,
  installment: 1,
  task: 2,
  hours: 3,
  obligation: 4,
};

const URGENCY_PRIORITY: Record<RankableUrgency, number> = { overdue: 0, today: 1, soon: 2 };

export type Rankable = {
  kind: RankableDueKind;
  urgency: RankableUrgency;
  dueOn: string;
  title: string;
};

export function compareDue(a: Rankable, b: Rankable): number {
  return (
    URGENCY_PRIORITY[a.urgency] - URGENCY_PRIORITY[b.urgency] ||
    DUE_KIND_PRIORITY[a.kind] - DUE_KIND_PRIORITY[b.kind] ||
    a.dueOn.localeCompare(b.dueOn) ||
    a.title.localeCompare(b.title, "de")
  );
}

/** A new array in display order; the input is not changed. */
export function rankDue<T extends Rankable>(items: readonly T[]): T[] {
  return [...items].sort(compareDue);
}

/** Filter chips of "Heute fällig": one per kind plus "Alle". Obligations are the chip "Firma". */
export const DUE_FILTERS = ["all", "money", "permits", "hours", "tasks", "company"] as const;
export type DueFilter = (typeof DUE_FILTERS)[number];

const FILTER_OF_KIND: Record<RankableDueKind, Exclude<DueFilter, "all">> = {
  installment: "money",
  permit: "permits",
  hours: "hours",
  task: "tasks",
  obligation: "company",
};

export function dueFilterOf(kind: RankableDueKind): Exclude<DueFilter, "all"> {
  return FILTER_OF_KIND[kind];
}

export function isDueFilter(value: string | undefined): value is DueFilter {
  return (DUE_FILTERS as readonly string[]).includes(value ?? "");
}

/** Items per chip (including "all"), for the counts on the chips. */
export function countByDueFilter(
  items: readonly Pick<Rankable, "kind">[],
): Record<DueFilter, number> {
  const counts: Record<DueFilter, number> = {
    all: items.length,
    money: 0,
    permits: 0,
    hours: 0,
    tasks: 0,
    company: 0,
  };
  for (const item of items) counts[dueFilterOf(item.kind)] += 1;
  return counts;
}
