import "server-only";
import {
  addDays,
  berlinDay,
  can,
  OPEN_STATUSES,
  pastEventCutoff,
  rankDue,
  resolveRelativeDue,
} from "@marktwerk/core";
import { upcomingWeekend } from "@marktwerk/core/dates/weekend";
import { event, staffMember, task } from "@marktwerk/db/schema";
import { and, asc, eq, gte, inArray, isNull, lt, lte, or, sql } from "drizzle-orm";
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
import type { ChecklistProgress } from "./tasks";
import * as tasks from "./tasks";

/** One event of the weekend box: the event, how far its Checkliste is and how many permits it misses. */
export type WeekendMarket = {
  row: EventRow;
  /**
   * Finished of all top-level tasks, and how many open ones are overdue (an overdue subtask makes its
   * parent overdue). Null for roles that may not read tasks.
   */
  checklist: (ChecklistProgress & { overdue: number }) | null;
  /** Missing permits by the rule of "Was fehlt" (`missingPermitsByEvent`); 0 without `permit:read`. */
  permitsMissing: number;
  /**
   * The permit line of the box (UX-064): `missing` (some missing, see `permitsMissing`), `ending` (all held,
   * but one ends before the event does), `ok` (all held), `open` (no permit linked to the event yet: "noch
   * nicht geklärt", never "keine nötig"). Null without `permit:read` and for finished events.
   */
  permitStatus: WeekendPermitStatus | null;
};

export type WeekendPermitStatus = "missing" | "ending" | "ok" | "open";

/** The permit line of one event of the weekend box, from its permit health and the "Was fehlt" count. */
export function weekendPermitStatus(
  row: Pick<EventRow, "status" | "health">,
  missing: number,
): WeekendPermitStatus | null {
  if (row.status === "completed" || row.status === "closed" || row.status === "cancelled")
    return null;
  if (missing > 0) return "missing";
  const level = row.health.permits;
  if (level === null) return "open";
  return level === "ok" ? "ok" : "ending";
}

export type WeekendBlock = {
  saturday: string;
  sunday: string;
  markets: WeekendMarket[];
};

/**
 * A task of "Weitere Aufgaben" (UX-013): an open task outside every market and Saison that no other group
 * of the Übersicht shows (no due date, or due after "Nächste Tage").
 */
export type OtherTask = {
  id: string;
  title: string;
  /** `YYYY-MM-DD`; null = no due date. */
  dueOn: string | null;
  isKey: boolean;
  assigneeName: string | null;
  /** Status "Wartet": what the task waits for. */
  waiting: { reason: string | null } | null;
};

/** Most tasks "Weitere Aufgaben" loads; the group shows a few and opens the rest in place. */
export const OTHER_TASKS_MAX = 50;

/** Most events the weekend box lists as "the next events" when the weekend itself has none. */
export const NEXT_EVENTS_MAX = 4;

/**
 * Every module's due items in ranking order (`rankDue`), split for the lists of the Übersicht (decision
 * 2026-11-13: one main panel "Heute & nächste Tage" with the groups Überfällig · Heute · Nächste Tage; the
 * permits further out sit at the bottom of the page).
 */
export type OverviewDue = {
  /**
   * Überfällig and Heute: all overdue and due-today items. Pflichten count as due today from their
   * "Erinnerung ab" day on (`company.dueItems`), with their real due date.
   */
  items: DueItem[];
  /** "Nächste Tage": due in the next 7 days, then permits within the horizon and waits for others. */
  later: DueItem[];
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
  /**
   * Only while the weekend has no event: the next events after it, so the box still says what comes
   * ({@link nextEventsAfter}). Empty otherwise.
   */
  nextEvents: WeekendMarket[];
  due: OverviewDue;
  /** "Weitere Aufgaben": open tasks without a market that the due groups leave out (undated or far ahead). */
  otherTasks: OtherTask[];
  /** Open tasks of markets that ended more than 7 days ago (in none of the lists above): the "Aufräumen" line. */
  pastMarketTasks: number;
};

/**
 * The next events after `sunday` (rows sorted by first day): the first one and every other event that starts
 * by the end of the weekend it falls on (a Wednesday event brings that weekend's markets along), at most
 * {@link NEXT_EVENTS_MAX}.
 */
export function nextEventsAfter<T extends { startsOn: string }>(rows: T[], sunday: string): T[] {
  const first = rows.find((e) => e.startsOn > sunday);
  if (!first) return [];
  const until = upcomingWeekend(first.startsOn).sunday;
  return rows
    .filter((e) => e.startsOn >= first.startsOn && e.startsOn <= until)
    .slice(0, NEXT_EVENTS_MAX);
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
  // Hidden Kernaufgaben get no head start in the ranking (lib/modules.ts `keyTasks`).
  const items = hide.keyTasks ? feeds.flat().map((i) => ({ ...i, isKey: false })) : feeds.flat();
  return rankDue(items, today);
}

/**
 * Everything the Übersicht shows: what is due now and in the next days, the events of the weekend with their
 * Checkliste progress, the permits coming up. Each part honours the actor's permissions and field scope.
 * `hide` leaves out the modules hidden in the UI (lib/modules.ts): no money/hours items and no team/money
 * health dimension.
 */
export async function getOverview(
  actor: Actor,
  today: string,
  hide: ModuleHide = {},
): Promise<Overview> {
  const weekend = upcomingWeekend(today);
  const [all, ranked, past, otherTasks] = await Promise.all([
    listEvents(actor, {}).then((rows) =>
      rows.map((r) => ({ ...r, health: maskHealth(r.health, hide) })),
    ),
    listDueItems(actor, today, hide),
    tasks.pastEventCleanup(actor, today),
    listOtherTasks(actor, today, hide),
  ]);
  const dueItems = await withWaiting(ranked);
  const active = all.filter((e) => e.status !== "cancelled");
  const onWeekend = active.filter(
    (e) => e.startsOn <= weekend.sunday && e.endsOn >= weekend.saturday,
  );
  const next = onWeekend.length === 0 ? nextEventsAfter(active, weekend.sunday) : [];
  const shown = [...onWeekend, ...next];
  const [progress, missing] = await Promise.all([
    can(actor.role, "task", "read")
      ? tasks.checklistProgressByEvent(
          actor,
          shown.map((e) => e.id),
        )
      : new Map<string, ChecklistProgress>(),
    permits.missingPermitsByEvent(actor, shown, today),
  ]);
  const readsPermits = can(actor.role, "permit", "read");
  const market = (row: EventRow): WeekendMarket => {
    const own = progress.get(row.id);
    const permitsMissing = missing.get(row.id) ?? 0;
    return {
      row,
      checklist: own ? { ...own, overdue: row.reasons.tasksOverdue } : null,
      permitsMissing,
      permitStatus: readsPermits ? weekendPermitStatus(row, permitsMissing) : null,
    };
  };
  const urgent = dueItems.filter((i) => i.urgency === "overdue" || i.urgency === "today");

  return {
    weekend: { ...weekend, markets: onWeekend.map(market) },
    nextEvents: next.map(market),
    due: {
      items: urgent,
      later: dueItems.filter((i) => i.urgency !== "overdue" && i.urgency !== "today"),
      total: urgent.length,
      inCenter: urgent.filter((i) => i.kind === "task" || i.kind === "permit").length,
      overdue: urgent.filter((i) => i.urgency === "overdue").length,
      dueToday: urgent.filter((i) => i.urgency === "today").length,
    },
    otherTasks,
    pastMarketTasks: past.total,
  };
}

/**
 * Marks the tasks with the status "Wartet" and what they wait for (`DueItem.waiting`), so every row of such a
 * task says so, not only the ones past their date in "Wartet auf Rückmeldung" (UX-064). One query.
 */
async function withWaiting(items: DueItem[]): Promise<DueItem[]> {
  const ids = items.filter((i) => i.kind === "task").map((i) => i.id);
  if (ids.length === 0) return items;
  const rows = await db
    .select({ id: task.id, reason: task.waitingReason })
    .from(task)
    .where(and(inArray(task.id, ids), eq(task.status, "waiting_external")));
  if (rows.length === 0) return items;
  const reasons = new Map(rows.map((r) => [r.id, r.reason?.trim() || null]));
  return items.map((i) =>
    i.kind === "task" && reasons.has(i.id)
      ? { ...i, waiting: { reason: reasons.get(i.id) ?? null } }
      : i,
  );
}

/**
 * "Weitere Aufgaben" (UX-013, default of UX audit round 1): the open tasks without a market and without a
 * Saison ("Aufgabe ohne Veranstaltung") that no due group shows: no due date, or due after the 7 days of
 * "Nächste Tage". Same scope as the due groups (`deadlineScope`: top-level tasks, field users and staff only
 * their own), snoozed ones stay out until their day. Due ones first (soonest first), then the undated ones
 * (newest first), at most {@link OTHER_TASKS_MAX}.
 */
export async function listOtherTasks(
  actor: Actor,
  today: string,
  hide: ModuleHide = {},
): Promise<OtherTask[]> {
  if (!can(actor.role, "task", "read")) return [];
  // The same boundary as `tasks.dueItems`: due before this instant = in Überfällig, Heute or Nächste Tage.
  const until = resolveRelativeDue(addDays(today, 8), 0, "00:00");
  const rows = await db
    .select({
      id: task.id,
      title: task.title,
      dueAt: task.dueAt,
      isKey: task.isKey,
      status: task.status,
      waitingReason: task.waitingReason,
      assigneeName: staffMember.displayName,
    })
    .from(task)
    .leftJoin(staffMember, eq(staffMember.id, task.assigneeId))
    .where(
      and(
        deadlineScope(actor),
        inArray(task.status, [...OPEN_STATUSES]),
        isNull(task.eventId),
        isNull(task.seasonId),
        or(isNull(task.snoozedUntil), lte(task.snoozedUntil, today)),
        or(isNull(task.dueAt), gte(task.dueAt, until)),
      ),
    )
    .orderBy(sql`${task.dueAt} asc nulls last`, sql`${task.createdAt} desc`, asc(task.title))
    .limit(OTHER_TASKS_MAX);
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    dueOn: r.dueAt ? berlinDay(r.dueAt) : null,
    isKey: hide.keyTasks ? false : r.isKey,
    assigneeName: r.assigneeName,
    waiting: r.status === "waiting_external" ? { reason: r.waitingReason?.trim() || null } : null,
  }));
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
