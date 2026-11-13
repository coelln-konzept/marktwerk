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

/**
 * The market and season of a season task (research 13 §6.3: `task.season_id`, no event). Lists label it
 * "<Markt> · Saison <Jahr>" (message `tasks.seasonContext`) where an event task names its event, and link to the
 * market page instead of an event page.
 */
export type TaskSeason = {
  id: string;
  /** The calendar year of the season. */
  year: number;
  presetId: string;
  /** The market's (preset's) name. */
  name: string;
  /** The market page `/vorlagen/<presetId>`; null when the actor may not open it (it needs `template:write`). */
  href: string | null;
};

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
  /**
   * Market colour of the event's preset (`MARKET_COLORS` key), null = use the type marker. For a season task the
   * colour (and `eventTypeKey` the type) of its market.
   */
  eventColor?: string | null;
  /** Season tasks: their market and season; grouped per Saison like event tasks per event. */
  season?: TaskSeason | null;
  /** Kernaufgabe: ranks first within its urgency group and gets the quiet key marker. */
  isKey?: boolean;
  /** First day of the event (`YYYY-MM-DD`); for a permit the next market that needs it. Orders "Überfällig". */
  eventStartsOn?: string | null;
  /** Permits can belong to several events (the upcoming ones they are required for). */
  eventIds?: string[];
  assigneeName?: string | null;
  /**
   * Tasks with subtasks (ADR 0021): progress, how many are still open (the tick then opens the drawer, R29) and
   * how many open ones are overdue (they flag the task).
   */
  subtasks?: { done: number; total: number; open: number; overdue: number };
  /**
   * Tasks with the status "Wartet" (somebody else has to act), whatever their urgency, and what they wait for
   * (`task.waiting_reason`). Set by the Übersicht (`getOverview`); the row says "Wartet auf <Grund>".
   */
  waiting?: { reason: string | null };
};

export const CALENDAR_LAYERS = [
  "tasks",
  "appointments",
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
  /** Tasks layer: a season task's market and season (shown after the title, "<Markt> · Saison <Jahr>"). */
  season?: TaskSeason | null;
};
