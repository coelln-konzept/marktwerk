import "server-only";
import { rankDue } from "@marktwerk/core";
import { upcomingWeekend } from "@marktwerk/core/dates/weekend";
import { dutyRole } from "@marktwerk/db/schema";
import { count } from "drizzle-orm";
import { type ModuleHide, maskHealth } from "@/lib/modules";
import type { Actor } from "../actor";
import { db } from "../db";
import * as company from "./company";
import type { DueItem } from "./due";
import { type EventRow, listEvents } from "./events";
import * as finance from "./finance";
import * as hours from "./hours";
import * as permits from "./permits";
import * as tasks from "./tasks";

/** "Heute fällig": every module's due items in display order. Tasks of past markets are not in it. */
export type OverviewDue = {
  items: DueItem[];
};

export type WeekendBlocker = DueItem & { eventNames: string[] };

export type Overview = {
  weekend: {
    saturday: string;
    sunday: string;
    rows: EventRow[];
    duties: number;
    /**
     * Due items of the weekend's events ("Was das Wochenende aufhält"), most urgent first: open tasks of the
     * event and permits it needs, each with the weekend events it holds up.
     */
    blockers: WeekendBlocker[];
  };
  nextAfterWeekend: EventRow | null;
  due: OverviewDue;
  /** Two numbers next to the greeting; both count the "Heute fällig" list, so current markets only. */
  kpis: {
    /** Due items (all modules) due today. */
    dueToday: number;
    /** Due items (all modules) that are overdue. */
    overdue: number;
  };
  /** Open tasks of markets that ended more than 7 days ago (in none of the lists above): the "Aufräumen" line. */
  pastMarketTasks: number;
};

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
  return rankDue(feeds.flat(), today);
}

/**
 * Everything the Übersicht shows. Each part honours the actor's permissions and field scope. `hide` leaves
 * out the modules hidden in the UI (lib/modules.ts): no money/hours items and no team/money health
 * dimension.
 */
export async function getOverview(
  actor: Actor,
  today: string,
  hide: ModuleHide = {},
): Promise<Overview> {
  const { saturday, sunday } = upcomingWeekend(today);
  const [all, [roles], dueItems, past] = await Promise.all([
    listEvents(actor, {}).then((rows) =>
      rows.map((r) => ({ ...r, health: maskHealth(r.health, hide) })),
    ),
    db.select({ n: count() }).from(dutyRole),
    listDueItems(actor, today, hide),
    tasks.pastEventCleanup(actor, today),
  ]);
  const active = all.filter((e) => e.status !== "cancelled");
  const weekendRows = active.filter((e) => e.startsOn <= sunday && e.endsOn >= saturday);

  return {
    weekend: {
      saturday,
      sunday,
      rows: weekendRows,
      duties: roles?.n ?? 0,
      blockers: weekendBlockers(dueItems, weekendRows),
    },
    nextAfterWeekend: active.find((e) => e.startsOn > sunday) ?? null,
    due: { items: dueItems },
    kpis: {
      dueToday: dueItems.filter((i) => i.urgency === "today").length,
      overdue: dueItems.filter((i) => i.urgency === "overdue").length,
    },
    pastMarketTasks: past.total,
  };
}
