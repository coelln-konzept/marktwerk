/**
 * Ranking of the Übersicht's "Heute fällig" list, which merges the due items of every module.
 *
 * Order (decided with the product owner's wording "Überfällig · Heute · Diese Woche", kind order is our
 * default and documented here):
 *   1. urgency: overdue, then today, then soon (within 7 days), then upcoming (permits only: further out
 *      than a week but inside the company's permit horizon, shown as "Genehmigungen demnächst"), then
 *      waiting (tasks that wait for somebody else past their date: neutral, never overdue);
 *   2. within an urgency group, Kernaufgaben (`isKey`, manual flag) come first;
 *   3. only in "Überfällig" (product owner, 2026-10-28): then by market, the soonest market on top. Markets
 *      that start today or later come first (earliest first), then markets that already started (latest
 *      first), then items without a market;
 *   4. then by kind: Genehmigungen > Raten (Geld) > Aufgaben > Stunden > Pflichten
 *      (a missed permit or a late payment costs money or the event; an open task rarely does);
 *   5. then the oldest due date first, then the title (stable, alphabetical).
 */

export type RankableDueKind = "task" | "permit" | "installment" | "hours" | "obligation";
export type RankableUrgency = "overdue" | "today" | "soon" | "upcoming" | "waiting";

/** Lower = more important. */
export const DUE_KIND_PRIORITY: Record<RankableDueKind, number> = {
  permit: 0,
  installment: 1,
  task: 2,
  hours: 3,
  obligation: 4,
};

const URGENCY_PRIORITY: Record<RankableUrgency, number> = {
  overdue: 0,
  today: 1,
  soon: 2,
  upcoming: 3,
  waiting: 4,
};

export type Rankable = {
  kind: RankableDueKind;
  urgency: RankableUrgency;
  dueOn: string;
  title: string;
  /** Kernaufgabe: goes first within its urgency group. */
  isKey?: boolean;
  /** First day of the item's market (for a permit: the next market that needs it); orders "Überfällig". */
  eventStartsOn?: string | null;
};

/** Market order inside "Überfällig": 0 = starts today or later, 1 = already started, 2 = no market. */
function marketBucket(startsOn: string | null | undefined, today: string): number {
  if (!startsOn) return 2;
  return startsOn >= today ? 0 : 1;
}

function compareMarket(a: Rankable, b: Rankable, today: string): number {
  const bucket = marketBucket(a.eventStartsOn, today) - marketBucket(b.eventStartsOn, today);
  if (bucket !== 0 || !a.eventStartsOn || !b.eventStartsOn) return bucket;
  return a.eventStartsOn >= today
    ? a.eventStartsOn.localeCompare(b.eventStartsOn)
    : b.eventStartsOn.localeCompare(a.eventStartsOn);
}

export function compareDue(a: Rankable, b: Rankable, today: string): number {
  return (
    URGENCY_PRIORITY[a.urgency] - URGENCY_PRIORITY[b.urgency] ||
    Number(b.isKey === true) - Number(a.isKey === true) ||
    (a.urgency === "overdue" ? compareMarket(a, b, today) : 0) ||
    DUE_KIND_PRIORITY[a.kind] - DUE_KIND_PRIORITY[b.kind] ||
    a.dueOn.localeCompare(b.dueOn) ||
    a.title.localeCompare(b.title, "de")
  );
}

/** A new array in display order; the input is not changed. `today` is the Berlin day (`YYYY-MM-DD`). */
export function rankDue<T extends Rankable>(items: readonly T[], today: string): T[] {
  return [...items].sort((a, b) => compareDue(a, b, today));
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
