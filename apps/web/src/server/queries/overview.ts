import "server-only";
import {
  berlinDay,
  OPEN_STATUSES,
  pastEventCutoff,
  rankDue,
  resolveRelativeDue,
} from "@marktwerk/core";
import { upcomingWeekend } from "@marktwerk/core/dates/weekend";
import {
  followingWeekend,
  holdsUpWeekend,
  type WeekendVerdict,
  weekendVerdict,
} from "@marktwerk/core/events/weekend-verdict";
import { event, task } from "@marktwerk/db/schema";
import { and, asc, eq, inArray, isNull, lt, or } from "drizzle-orm";
import { type ModuleHide, maskHealth } from "@/lib/modules";
import type { Actor } from "../actor";
import { db } from "../db";
import { deadlineScope } from "../task-scope";
import * as company from "./company";
import type { DueItem } from "./due";
import { type EventRow, listEvents } from "./events";
import * as finance from "./finance";
import * as hours from "./hours";
import * as permits from "./permits";
import * as tasks from "./tasks";

/** Rows of "Heute & überfällig" on the Übersicht; the rest is one click away in Benachrichtigungen. */
export const TODAY_CARD_ROWS = 5;

/** One market of a weekend: its verdict and what holds it up. */
export type WeekendMarket = {
  row: EventRow;
  verdict: WeekendVerdict;
  /**
   * What holds the market up, most urgent first: overdue and due-today tasks, permits whose deadline has
   * passed. Tasks dated in the future do not (`holdsUpWeekend`).
   */
  blockers: DueItem[];
};

export type WeekendBlock = {
  saturday: string;
  sunday: string;
  markets: WeekendMarket[];
};

/** "Heute & überfällig": the top of every module's overdue and due-today items in ranking order. */
export type OverviewDue = {
  /** The first `TODAY_CARD_ROWS` items by `rankDue`. */
  items: DueItem[];
  /** All overdue and due-today items. */
  total: number;
  /** Those the notification center lists (tasks and permits): the N of "Alle N in Benachrichtigungen". */
  inCenter: number;
  overdue: number;
  dueToday: number;
};

export type Overview = {
  /** "Dieses Wochenende": the coming Saturday and Sunday (the running weekend on Saturday and Sunday). */
  weekend: WeekendBlock;
  /** The weekend after that, shown as one compact row. */
  nextWeekend: WeekendBlock;
  /** First event after this weekend (for the empty state when the weekend has none). */
  nextEvent: EventRow | null;
  due: OverviewDue;
  /** Open tasks of markets that ended more than 7 days ago (in none of the lists above): the "Aufräumen" line. */
  pastMarketTasks: number;
};

/** The due items that belong to an event (a task's event, or any event a permit is required for). */
function itemsOfEvent(items: DueItem[], eventId: string): DueItem[] {
  return items.filter((i) => i.eventId === eventId || i.eventIds?.includes(eventId));
}

/** Verdict and blockers of one market. Overdue and due-today counts come from the items the card lists. */
function marketOf(row: EventRow, dueItems: DueItem[]): WeekendMarket {
  const own = itemsOfEvent(dueItems, row.id);
  const blockers = own.filter(holdsUpWeekend);
  return {
    row,
    blockers,
    verdict: weekendVerdict({
      permits: row.health.permits,
      permitsMissing: row.reasons.permitsMissing,
      tasks: row.health.tasks,
      tasksOverdue: blockers.filter((i) => i.kind === "task" && i.urgency === "overdue").length,
      tasksDueToday: blockers.filter((i) => i.kind === "task" && i.urgency === "today").length,
      tasksBlocked: row.reasons.tasksBlocked,
    }),
  };
}

/** The five module feeds, each of which checks its own permissions and field scope. */
export async function listDueItems(
  actor: Actor,
  today: string,
  hide: ModuleHide = {},
): Promise<DueItem[]> {
  const feeds = await Promise.all([
    permits.dueItems(actor, today),
    hide.finance ? [] : finance.dueItems(actor, today),
    tasks.dueItems(actor, today),
    hide.team ? [] : hours.dueItems(actor, today),
    company.dueItems(actor, today),
  ]);
  return rankDue(feeds.flat(), today);
}

/**
 * Everything the Übersicht shows ("Zwei Fragen": is the weekend on track, what is due today). Each part
 * honours the actor's permissions and field scope. `hide` leaves out the modules hidden in the UI
 * (lib/modules.ts): no money/hours items and no team/money health dimension.
 */
export async function getOverview(
  actor: Actor,
  today: string,
  hide: ModuleHide = {},
): Promise<Overview> {
  const weekend = upcomingWeekend(today);
  const following = followingWeekend(weekend.saturday);
  const [all, dueItems, past] = await Promise.all([
    listEvents(actor, {}).then((rows) =>
      rows.map((r) => ({ ...r, health: maskHealth(r.health, hide) })),
    ),
    listDueItems(actor, today, hide),
    tasks.pastEventCleanup(actor, today),
  ]);
  const active = all.filter((e) => e.status !== "cancelled");
  const block = (days: { saturday: string; sunday: string }): WeekendBlock => ({
    ...days,
    markets: active
      .filter((e) => e.startsOn <= days.sunday && e.endsOn >= days.saturday)
      .map((row) => marketOf(row, dueItems)),
  });
  const urgent = dueItems.filter((i) => i.urgency === "overdue" || i.urgency === "today");

  return {
    weekend: block(weekend),
    nextWeekend: block(following),
    nextEvent: active.find((e) => e.startsOn > weekend.sunday) ?? null,
    due: {
      items: urgent.slice(0, TODAY_CARD_ROWS),
      total: urgent.length,
      inCenter: urgent.filter((i) => i.kind === "task" || i.kind === "permit").length,
      overdue: urgent.filter((i) => i.urgency === "overdue").length,
      dueToday: urgent.filter((i) => i.urgency === "today").length,
    },
    pastMarketTasks: past.total,
  };
}

/** An open task that "Aufräumen" would skip. */
export type CleanupTask = { id: string; title: string; dueOn: string | null; isKey: boolean };

/** Most task titles listed per past market; the rest is a count. */
export const CLEANUP_TASKS_PER_MARKET = 25;

/**
 * The open tasks "Aufräumen" skips (same rule as `pastEventCleanup` and `skipPastEventTasks`), grouped by
 * market and oldest first, so the drawer can say what it will skip before anybody clicks.
 */
export async function pastEventTasks(
  actor: Actor,
  today: string,
): Promise<Map<string, CleanupTask[]>> {
  const rows = await db
    .select({
      id: task.id,
      title: task.title,
      dueAt: task.dueAt,
      isKey: task.isKey,
      eventId: task.eventId,
    })
    .from(task)
    .innerJoin(event, eq(event.id, task.eventId))
    .where(
      and(
        deadlineScope(actor),
        inArray(task.status, [...OPEN_STATUSES]),
        lt(event.endsOn, pastEventCutoff(today)),
        // Only leftovers: follow-up work due today or later stays open (`isPastMarketLeftover`).
        or(isNull(task.dueAt), lt(task.dueAt, resolveRelativeDue(today, 0, "00:00"))),
      ),
    )
    .orderBy(asc(task.dueAt), asc(task.title));
  const byEvent = new Map<string, CleanupTask[]>();
  for (const r of rows) {
    if (!r.eventId) continue;
    const list = byEvent.get(r.eventId) ?? [];
    list.push({
      id: r.id,
      title: r.title,
      dueOn: r.dueAt ? berlinDay(r.dueAt) : null,
      isKey: r.isKey,
    });
    byEvent.set(r.eventId, list);
  }
  return byEvent;
}
