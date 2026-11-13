import "server-only";
import {
  berlinDay,
  can,
  canEditExpectedStart,
  resolveRelativeDue,
  type SeasonStartInfo,
  type SeasonStatus,
  seasonEnd,
  seasonStartInfo,
  seasonsToKeep,
  seasonTaskList,
  suggestedSeasonStatus,
  type TaskStatusKey,
} from "@marktwerk/core";
import { isTopLevel, subtaskAggregates } from "@marktwerk/db";
import { eventSeason, staffMember, task } from "@marktwerk/db/schema";
import { seasonEventDates } from "@marktwerk/jobs/seasons";
import { and, eq, inArray, isNull, ne } from "drizzle-orm";
import type { Actor } from "../actor";
import { db } from "../db";
import { visibleTasks } from "../task-scope";

/** One season task as the Saison panel lists it. */
export type SeasonTaskItem = {
  id: string;
  title: string;
  status: TaskStatusKey;
  dueOn: string | null;
  assigneeName: string | null;
  snoozedUntil: string | null;
  isKey: boolean;
  /** Open subtasks: "Erledigt" opens the drawer instead (ADR 0021, R29). */
  openSubtasks: number;
};

/** A market's Saison record as the market page shows it (research 13 §6.3). */
export type MarketSeason = {
  id: string;
  season: number;
  status: SeasonStatus;
  expectedStart: string;
  start: SeasonStartInfo;
  /** `expected_start` is editable (no dates yet). */
  canEditExpectedStart: boolean;
  /** The status the panel suggests switching to (never applied by itself). */
  suggestedStatus: SeasonStatus | null;
  /** Null when the actor may not read tasks. Open first, then finished (`seasonTaskList`). */
  tasks: { open: SeasonTaskItem[]; finished: SeasonTaskItem[] } | null;
};

export type MarketSeasons = {
  /** The current calendar year (Berlin) and its record, null while it has none. */
  current: { season: number; record: MarketSeason | null };
  /** The next year's record, only once it exists. */
  next: MarketSeason | null;
};

/**
 * The Saison panel of the market page (`/vorlagen/<id>`, Fahrplan R12): the market's records of the current and
 * the next year (archived ones left out) with their start, status, the suggested next status and their season
 * tasks (top level, not cancelled, within the actor's row scope).
 */
export async function getMarketSeasons(
  actor: Actor,
  presetId: string,
  today: string,
  now: Date = new Date(),
): Promise<MarketSeasons> {
  const [currentYear, nextYear] = seasonsToKeep(now);
  const rows = await db
    .select({
      id: eventSeason.id,
      season: eventSeason.season,
      status: eventSeason.status,
      expectedStart: eventSeason.expectedStart,
    })
    .from(eventSeason)
    .where(
      and(
        eq(eventSeason.presetId, presetId),
        inArray(eventSeason.season, [currentYear, nextYear]),
        isNull(eventSeason.archivedAt),
      ),
    );

  const canReadTasks = can(actor.role, "task", "read");
  const taskRows =
    canReadTasks && rows.length > 0
      ? await db
          .select({
            id: task.id,
            seasonId: task.seasonId,
            title: task.title,
            status: task.status,
            dueAt: task.dueAt,
            isKey: task.isKey,
            snoozedUntil: task.snoozedUntil,
            assigneeName: staffMember.displayName,
            openSubtasks: subtaskAggregates(today, resolveRelativeDue(today, 0, "00:00"))
              .subtasksOpen,
          })
          .from(task)
          .leftJoin(staffMember, eq(staffMember.id, task.assigneeId))
          .where(
            and(
              inArray(
                task.seasonId,
                rows.map((r) => r.id),
              ),
              visibleTasks(actor),
              isTopLevel(),
              ne(task.status, "cancelled"),
            ),
          )
      : [];

  const build = async (row: (typeof rows)[number]): Promise<MarketSeason> => {
    const events = await seasonEventDates(db, presetId, row.season);
    const items: SeasonTaskItem[] = taskRows
      .filter((t) => t.seasonId === row.id)
      .map((t) => ({
        id: t.id,
        title: t.title,
        status: t.status,
        dueOn: t.dueAt ? berlinDay(t.dueAt) : null,
        assigneeName: t.assigneeName,
        snoozedUntil: t.snoozedUntil,
        isKey: t.isKey,
        openSubtasks: t.openSubtasks,
      }));
    const tasks = canReadTasks ? seasonTaskList(items) : null;
    return {
      id: row.id,
      season: row.season,
      status: row.status,
      expectedStart: row.expectedStart,
      start: seasonStartInfo(events, row.expectedStart),
      canEditExpectedStart: canEditExpectedStart(events),
      suggestedStatus: suggestedSeasonStatus({
        status: row.status,
        hasDates: seasonEnd(events) !== null,
        // No "Termine planen" marker exists yet; the dates themselves count.
        datesPlanned: false,
        seasonEnd: seasonEnd(events),
        today,
        openSeasonTasks: tasks?.open.length ?? 0,
      }),
      tasks,
    };
  };

  const current = rows.find((r) => r.season === currentYear);
  const next = rows.find((r) => r.season === nextYear);
  return {
    current: { season: currentYear, record: current ? await build(current) : null },
    next: next ? await build(next) : null,
  };
}
