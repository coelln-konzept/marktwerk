import { addDays, daysBetween, mondayOf } from "../dates/calendar";
import { DEFAULT_TIME_ZONE, resolveRelativeDue } from "../dates/relative";

/*
 * Kanban rules (data model "Kanban columns (derived, overridable)", UX concept §5/§7).
 * Pure: the caller passes `today` as a business date in Europe/Berlin, so tests never depend on
 * the machine's clock or time zone.
 */

/** The four columns, left to right: Später (key `preparation`) · Diese Woche · Überfällig & heute · Erledigt. */
export const BOARD_COLUMNS = ["preparation", "this_week", "today", "done"] as const;
export type BoardColumn = (typeof BOARD_COLUMNS)[number];

export const TASK_STATUSES = [
  "todo",
  "in_progress",
  "waiting_external",
  "blocked",
  "done",
  "skipped",
  "cancelled",
] as const;
export type TaskStatusKey = (typeof TASK_STATUSES)[number];

/** Work that still has to happen (counts for workload, carry-over and the "Heute" column). */
export const OPEN_STATUSES = ["todo", "in_progress", "waiting_external", "blocked"] as const;

export function isOpenStatus(status: TaskStatusKey): boolean {
  return (OPEN_STATUSES as readonly string[]).includes(status);
}

/** Done tasks and skipped ones live in the "Erledigt" column (cancelled ones are not shown at all). */
export function isFinishedStatus(status: TaskStatusKey): boolean {
  return status === "done" || status === "skipped";
}

/** How long finished tasks stay listed in "Erledigt". */
export const DONE_VISIBLE_DAYS = 14;

/** The business date (`YYYY-MM-DD`) an instant falls on in the company's time zone. */
export function berlinDay(instant: Date, timeZone: string = DEFAULT_TIME_ZONE): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

/** Wall-clock time `HH:mm` of an instant in the company's time zone. */
export function berlinTime(instant: Date, timeZone: string = DEFAULT_TIME_ZONE): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(instant);
}

/** Default time of day for a due date that is set by hand (matches the template default). */
export const DEFAULT_DUE_TIME = "09:00";

/**
 * The instant for a due date typed in by hand. Keeps the wall-clock time the task had (so a move
 * from Tuesday to Friday stays "09:00" across a DST change), otherwise 09:00.
 */
export function dueAtForDate(dueOn: string, previous: Date | null): Date {
  const time = previous ? berlinTime(previous) : DEFAULT_DUE_TIME;
  return resolveRelativeDue(dueOn, 0, time);
}

/** Sunday of the ISO week containing `date`. */
export function endOfIsoWeek(date: string): string {
  return addDays(mondayOf(date), 6);
}

export type BoardTaskInput = {
  status: TaskStatusKey;
  /** Due instant; its Berlin calendar day is what counts. */
  dueAt: Date | null;
  /** Manual move override (`task.board_column`). */
  boardColumn: BoardColumn | null;
};

/**
 * The column a task shows in:
 * - finished (done / skipped / cancelled): Erledigt, an override never applies;
 * - a manual move wins until the due date has passed (then the task is overdue → Heute);
 * - otherwise by due date: today or overdue → Heute; later in this ISO week → Diese Woche;
 *   later than this week, or no due date yet → Später (`preparation`).
 */
export function boardColumnFor(task: BoardTaskInput, today: string): BoardColumn {
  if (!isOpenStatus(task.status)) return "done";
  const due = task.dueAt ? berlinDay(task.dueAt) : null;
  if (task.boardColumn && task.boardColumn !== "done" && (due === null || due >= today)) {
    return task.boardColumn;
  }
  return derivedColumn(due, today);
}

/** The column from the due date alone (ignores overrides and status). */
export function derivedColumn(dueOn: string | null, today: string): BoardColumn {
  if (dueOn === null) return "preparation";
  if (dueOn <= today) return "today";
  if (dueOn <= endOfIsoWeek(today)) return "this_week";
  return "preparation";
}

export type Dueness =
  | { kind: "none" }
  | { kind: "overdue"; days: number }
  | { kind: "today" }
  | { kind: "soon"; days: number }
  | { kind: "later"; days: number };

/** Due-ness for the card line (UX concept §7): Fällig in n T · Heute · Überfällig; "soon" = within 7 days. */
export function dueness(dueOn: string | null, today: string): Dueness {
  if (dueOn === null) return { kind: "none" };
  const days = daysBetween(today, dueOn);
  if (days < 0) return { kind: "overdue", days: -days };
  if (days === 0) return { kind: "today" };
  return days <= 7 ? { kind: "soon", days } : { kind: "later", days };
}

/** First day on which a finished task is still listed in "Erledigt" (14 days back). */
export function doneVisibleSince(today: string): string {
  return addDays(today, -DONE_VISIBLE_DAYS);
}

/**
 * Sort value for a card dropped between two neighbours (`board_sort` is a double). Returns null when
 * there is no room (equal or inverted neighbours, or floats too close): the caller then renumbers
 * the column and tries again.
 */
export function sortBetween(prev: number | null, next: number | null): number | null {
  const STEP = 1024;
  if (prev === null && next === null) return 0;
  if (next === null) return (prev as number) + STEP;
  if (prev === null) return next - STEP;
  if (!(next > prev)) return null;
  const mid = (prev + next) / 2;
  return mid > prev && mid < next ? mid : null;
}

type Orderable = { boardSort: number; dueAt: Date | null; createdAt: Date; id: string };

/** Ordering shared by every list of cards: manual order first, then due date, then creation. */
export function compareCards(a: Orderable, b: Orderable): number {
  if (a.boardSort !== b.boardSort) return a.boardSort - b.boardSort;
  const ad = a.dueAt?.getTime() ?? Number.POSITIVE_INFINITY;
  const bd = b.dueAt?.getTime() ?? Number.POSITIVE_INFINITY;
  if (ad !== bd) return ad < bd ? -1 : 1;
  const ac = a.createdAt.getTime();
  const bc = b.createdAt.getTime();
  if (ac !== bc) return ac < bc ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** True when a task is due after the last day of its event (follow-up work: Abbau, Abrechnung, Nachbereitung). */
export function isAfterEvent(
  dueOn: string | null,
  eventEndsOn: string | null | undefined,
): boolean {
  return Boolean(eventEndsOn && dueOn && dueOn > eventEndsOn);
}

/**
 * Cards of an open column of one event: by due date (no date last), follow-up tasks (due after the event)
 * behind all the others; the incoming order (template order) breaks ties. Does not mutate `list`.
 */
export function sortColumnByDue<T extends { dueOn: string | null }>(
  list: readonly T[],
  eventEndsOn?: string | null,
): T[] {
  return list
    .map((card, index) => ({ card, index }))
    .sort((a, b) => {
      const after =
        Number(isAfterEvent(a.card.dueOn, eventEndsOn)) -
        Number(isAfterEvent(b.card.dueOn, eventEndsOn));
      if (after !== 0) return after;
      const ad = a.card.dueOn ?? "9999-99-99";
      const bd = b.card.dueOn ?? "9999-99-99";
      if (ad !== bd) return ad < bd ? -1 : 1;
      return a.index - b.index;
    })
    .map((x) => x.card);
}
