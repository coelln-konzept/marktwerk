import "server-only";
import { can, countByDueFilter, type DueFilter, overallHealth, rankDue } from "@marktwerk/core";
import { upcomingWeekend } from "@marktwerk/core/dates/weekend";
import { dutyRole } from "@marktwerk/db/schema";
import { count } from "drizzle-orm";
import { type ModuleHide, maskHealth } from "@/lib/modules";
import type { Actor } from "../actor";
import { db } from "../db";
import * as company from "./company";
import type { DueItem } from "./due";
import { type EventRow, listEvents, listEventTypes } from "./events";
import * as finance from "./finance";
import * as hours from "./hours";
import * as permits from "./permits";
import * as tasks from "./tasks";

export type SeasonSummary = {
  year: number;
  count: number;
  /** Month numbers (1–12) of the first and last event, null without events. */
  firstMonth: number | null;
  lastMonth: number | null;
  byType: { key: string; nameDe: string; nameEn: string; n: number }[];
};

/** "Heute fällig": every module's due items in display order, plus the number behind each chip. */
export type OverviewDue = {
  items: DueItem[];
  counts: Record<DueFilter, number>;
};

export type WeekendBlocker = DueItem & { eventNames: string[] };

export type Overview = {
  season: SeasonSummary;
  /** Estimated effort against capacity and the hiring signal. Null for roles that do not plan the team. */
  workload: tasks.SeasonWorkload | null;
  /** Next season's planned events, only once the current season is (almost) over. */
  nextSeason: { year: number; count: number } | null;
  weekend: {
    saturday: string;
    sunday: string;
    rows: EventRow[];
    duties: number;
    /** Estimated minutes of open tasks per event. */
    effortMinutes: Record<string, number>;
    /**
     * Due items of the weekend's events ("Was das Wochenende aufhält"), most urgent first: open tasks of the
     * event and permits it needs, each with the weekend events it holds up.
     */
    blockers: WeekendBlocker[];
  };
  nextAfterWeekend: EventRow | null;
  due: OverviewDue;
  kpis: {
    weekendCount: number;
    weekendInPlan: number;
    weekendTracked: number;
    /** Due items (all modules) that are overdue. */
    overdue: number;
    /** Not overdue, but due by the coming Sunday. */
    dueByWeekend: number;
    openTasks: number;
    overdueTasks: number;
    /** Null for roles without `finance:read`. */
    moneyOverdue: { count: number; cents: number } | null;
    drafts: number;
  };
};

/** The season is "almost over" when at most this share of its events is still ahead. */
const SEASON_OVER_SHARE = 0.1;

/** The due items that belong to a weekend event (a task's event, or any event a permit is required for). */
function weekendBlockers(items: DueItem[], rows: EventRow[]): WeekendBlocker[] {
  const names = new Map(rows.map((r) => [r.id, r.name]));
  const out: WeekendBlocker[] = [];
  for (const item of items) {
    const ids = new Set([...(item.eventId ? [item.eventId] : []), ...(item.eventIds ?? [])]);
    const eventNames = [...ids].flatMap((id) => names.get(id) ?? []);
    if (eventNames.length > 0) out.push({ ...item, eventNames });
  }
  return out;
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
  return rankDue(feeds.flat());
}

/**
 * Everything the Übersicht shows. Each part honours the actor's permissions and field scope. `hide` leaves
 * out the modules hidden in the UI (lib/modules.ts): no money/hours items, no money KPI, no workload
 * signal, and no team/money health dimension.
 */
export async function getOverview(
  actor: Actor,
  today: string,
  hide: ModuleHide = {},
): Promise<Overview> {
  const year = Number(today.slice(0, 4));
  const { saturday, sunday } = upcomingWeekend(today);
  const canMoney = !hide.finance && can(actor.role, "finance", "read");
  const [all, types, [roles], dueItems, taskCounts, money, workload] = await Promise.all([
    listEvents(actor, {}).then((rows) =>
      rows.map((r) => ({ ...r, health: maskHealth(r.health, hide) })),
    ),
    listEventTypes(),
    db.select({ n: count() }).from(dutyRole),
    listDueItems(actor, today, hide),
    tasks.openTaskCounts(actor, today),
    canMoney ? finance.moneyOverdue(actor, today) : Promise.resolve(null),
    !hide.team && can(actor.role, "team", "read")
      ? tasks.seasonWorkload(actor, year)
      : Promise.resolve(null),
  ]);
  const active = all.filter((e) => e.status !== "cancelled");

  const inSeason = active.filter((e) => e.season === year);
  const byType = types
    .map((t) => ({
      key: t.key,
      nameDe: t.nameDe,
      nameEn: t.nameEn,
      n: inSeason.filter((e) => e.typeKey === t.key).length,
    }))
    .filter((t) => t.n > 0);
  const months = inSeason.map((e) => Number(e.startsOn.slice(5, 7)));
  const upcomingInSeason = inSeason.filter((e) => e.endsOn >= today).length;
  const nextCount = active.filter((e) => e.season === year + 1).length;
  const over = inSeason.length === 0 || upcomingInSeason / inSeason.length <= SEASON_OVER_SHARE;

  const weekendRows = active.filter((e) => e.startsOn <= sunday && e.endsOn >= saturday);
  const tracked = weekendRows.filter((e) => overallHealth(e.health) !== null);
  const weekendIds = new Set(weekendRows.map((e) => e.id));
  const effort = await tasks.openEffortByEvent(actor, [...weekendIds]);

  return {
    season: {
      year,
      count: inSeason.length,
      firstMonth: months.length ? Math.min(...months) : null,
      lastMonth: months.length ? Math.max(...months) : null,
      byType,
    },
    workload,
    nextSeason: over && nextCount > 0 ? { year: year + 1, count: nextCount } : null,
    weekend: {
      saturday,
      sunday,
      rows: weekendRows,
      duties: roles?.n ?? 0,
      effortMinutes: Object.fromEntries(effort),
      blockers: weekendBlockers(dueItems, weekendRows),
    },
    nextAfterWeekend: active.find((e) => e.startsOn > sunday) ?? null,
    due: { items: dueItems, counts: countByDueFilter(dueItems) },
    kpis: {
      weekendCount: weekendRows.length,
      weekendTracked: tracked.length,
      weekendInPlan: tracked.filter((e) => overallHealth(e.health) === "ok").length,
      overdue: dueItems.filter((i) => i.urgency === "overdue").length,
      dueByWeekend: dueItems.filter((i) => i.urgency !== "overdue" && i.dueOn <= sunday).length,
      openTasks: taskCounts.open,
      overdueTasks: taskCounts.overdue,
      moneyOverdue: money,
      drafts: all.filter((e) => e.status === "draft" && e.endsOn >= today).length,
    },
  };
}
