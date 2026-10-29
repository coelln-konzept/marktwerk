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
 * `waiting` is only used by tasks that wait for somebody else (status "Wartet") and are past their due date:
 * neutral, never counted as overdue ("wartet seit …").
 */
export const DUE_URGENCIES = ["overdue", "today", "soon", "upcoming", "waiting"] as const;
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
  /** Event type key (`flea`, …) for the colour marker when items are grouped by event. */
  eventTypeKey?: string | null;
  /** Market colour of the event's preset (`MARKET_COLORS` key), null = use the type marker. */
  eventColor?: string | null;
  /** Kernaufgabe: ranks first within its urgency group and gets the quiet key marker. */
  isKey?: boolean;
  /** First day of the event (`YYYY-MM-DD`); for a permit the next market that needs it. Orders "Überfällig". */
  eventStartsOn?: string | null;
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
