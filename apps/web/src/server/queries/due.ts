/**
 * Shapes every module feeds into the Übersicht ("Heute fällig") and the Kalender (layers). Each module
 * exports `dueItems(actor, today)` and `calendarItems(actor, from, to)` from its own query file and
 * returns these types; `overview.ts` and `kalender.ts` merge them. Pure types and constants only, so this
 * file can be imported from client components too.
 */

export const DUE_KINDS = ["task", "permit", "installment", "hours", "obligation"] as const;
export type DueKind = (typeof DUE_KINDS)[number];

/**
 * `upcoming` is only used by permits: further out than a week but inside the company's permit horizon.
 * The Übersicht shows it as its own group "Genehmigungen demnächst" after "Diese Woche".
 */
export const DUE_URGENCIES = ["overdue", "today", "soon", "upcoming"] as const;
export type DueUrgency = (typeof DUE_URGENCIES)[number];

export type DueItem = {
  kind: DueKind;
  id: string;
  title: string;
  /** `YYYY-MM-DD` */
  dueOn: string;
  /** `soon` = within the next 7 days; `upcoming` = permits beyond that (see DUE_URGENCIES). */
  urgency: DueUrgency;
  href: string;
  meta?: string;
  /** Where the meta text links to (e.g. the task's event board). */
  metaHref?: string;
  eventId?: string | null;
  /** Permits can belong to several events (the upcoming ones they are required for). */
  eventIds?: string[];
  assigneeName?: string | null;
};

export const CALENDAR_LAYERS = [
  "tasks",
  "permits",
  "shifts",
  "installments",
  "obligations",
] as const;
export type CalendarLayer = (typeof CALENDAR_LAYERS)[number];

export type CalendarItem = {
  layer: CalendarLayer;
  id: string;
  /** `YYYY-MM-DD` */
  date: string;
  title: string;
  href: string;
  tone?: "ok" | "warn" | "critical" | "neutral";
};
