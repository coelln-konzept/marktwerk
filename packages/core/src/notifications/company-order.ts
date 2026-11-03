import { daysBetween } from "../dates/calendar";
import { compareDue, type Rankable, type RankableUrgency } from "../deadlines/due-ranking";
import { SOON_DAYS } from "../deadlines/permit-horizon";
import { type CompanySubjectType, compareByNewest } from "./company";

/*
 * Order and bookkeeping of the notification center. The center ranks like the Übersicht's "Heute &
 * überfällig" (`compareDue`): overdue · today · next 7 days · later, Kernaufgaben first, in "Überfällig"
 * the soonest market first. The group labels use the same 7-day horizon as the Übersicht.
 */

export type CenterOrderInput = {
  subjectType: CompanySubjectType;
  /** The date the item is about (due, apply-by, decision, validity end). */
  dueOn: string | null;
  isKey: boolean;
  title: string;
  /** First day of the item's market (for a permit: its next market). */
  marketStartsOn: string | null;
  /** ISO instant the notification was created. */
  createdAt: string;
};

/** Urgency as the Übersicht names it; "later" items (further out than a week) are its "upcoming". */
export function centerUrgency(dueOn: string | null, today: string): RankableUrgency {
  if (dueOn === null) return "upcoming";
  const days = daysBetween(today, dueOn);
  if (days < 0) return "overdue";
  if (days === 0) return "today";
  return days <= SOON_DAYS ? "soon" : "upcoming";
}

const toRankable = (item: CenterOrderInput): Rankable => ({
  kind: item.subjectType,
  urgency: "overdue",
  dueOn: item.dueOn ?? "9999-12-31",
  title: item.title,
  isKey: item.isKey,
  eventStartsOn: item.marketStartsOn,
});

/** "Dringlichkeit" for the center: the Übersicht's ranking, then the newest notification. */
export function compareCenterOrder(a: CenterOrderInput, b: CenterOrderInput, today: string) {
  return (
    compareDue(
      { ...toRankable(a), urgency: centerUrgency(a.dueOn, today) },
      { ...toRankable(b), urgency: centerUrgency(b.dueOn, today) },
      today,
    ) || compareByNewest(a, b)
  );
}

/**
 * A notification that only described an earlier state of a subject that still needs attention: the sweep
 * rotated it (a task went from "bald fällig" to "überfällig", a due date moved) and wrote a newer one.
 * It is not "erledigt" and must not be listed or counted anywhere.
 */
export function isSupersededNotification(input: {
  /** The subject still needs attention (open task on a current market, permit with a date for this reason). */
  subjectActive: boolean;
  /** The date in the notification's key is still the subject's current date. */
  keyCurrent: boolean;
  /** The sweep or a person closed the notification (stored state `done`). */
  storedDone: boolean;
  /** The same subject has a newer notification. */
  newerSibling: boolean;
}): boolean {
  if (!input.subjectActive) return false;
  return !input.keyCurrent || (input.storedDone && input.newerSibling);
}

/** One entry per subject, the newest notification (a task that went through two reasons is done once). */
export function latestPerSubject<T extends { subjectId: string; createdAt: string }>(
  rows: readonly T[],
): T[] {
  const newest = new Map<string, T>();
  for (const row of rows) {
    const seen = newest.get(row.subjectId);
    if (!seen || row.createdAt > seen.createdAt) newest.set(row.subjectId, row);
  }
  return rows.filter((row) => newest.get(row.subjectId) === row);
}
