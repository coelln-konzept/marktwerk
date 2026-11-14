import "server-only";
import {
  berlinDay,
  CLOSED_TASK_STATUSES,
  can,
  canEditExpectedStart,
  expectedStartFromLastSeason,
  resolveRelativeDue,
  SEASON_STATUSES,
  type SeasonStartInfo,
  type SeasonStatus,
  type SeasonStatusBlock,
  seasonEnd,
  seasonStart,
  seasonStartInfo,
  seasonStatusBlock,
  seasonsToKeep,
  seasonTaskList,
  suggestedSeasonStatus,
  type TaskStatusKey,
} from "@marktwerk/core";
import { isTopLevel, subtaskAggregates } from "@marktwerk/db";
import { eventSeason, staffMember, task } from "@marktwerk/db/schema";
import { seasonEventDates } from "@marktwerk/jobs/seasons";
import { and, count, eq, inArray, isNull, ne, notInArray } from "drizzle-orm";
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
  /** Why the status switch would refuse a status (UX-050), per status; null where it is possible. */
  statusBlocks: Record<SeasonStatus, SeasonStatusBlock | null>;
  /** Open top-level season tasks, whoever may see them (what "Abgeschlossen" waits for). */
  openSeasonTasks: number;
  /** Null when the actor may not read tasks. Open first, then finished (`seasonTaskList`). */
  tasks: { open: SeasonTaskItem[]; finished: SeasonTaskItem[] } | null;
};

/** A year without a record ("Saison anlegen"): what the creation asks for (UX-009). */
export type MissingSeason = {
  /** The season has dates already: their first one is the start, nothing to ask. */
  hasDates: boolean;
  /** "Erwartet ab" from last season's first date (same weekday and week), null without one. */
  suggestedStart: string | null;
};

export type MarketSeasons = {
  /** The current calendar year (Berlin) and its record, null while it has none (then `missing`). */
  current: { season: number; record: MarketSeason | null; missing: MissingSeason | null };
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
  // Unscoped: the status guard counts every open season task, not only the ones the actor sees.
  const openCounts =
    rows.length > 0
      ? await db
          .select({ seasonId: task.seasonId, n: count() })
          .from(task)
          .where(
            and(
              inArray(
                task.seasonId,
                rows.map((r) => r.id),
              ),
              isTopLevel(),
              notInArray(task.status, [...CLOSED_TASK_STATUSES]),
            ),
          )
          .groupBy(task.seasonId)
      : [];

  const build = async (row: (typeof rows)[number]): Promise<MarketSeason> => {
    const events = await seasonEventDates(db, presetId, row.season);
    const end = seasonEnd(events);
    const openSeasonTasks = openCounts.find((c) => c.seasonId === row.id)?.n ?? 0;
    const facts = { hasDates: end !== null, seasonEnd: end, today, openSeasonTasks };
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
      // Suggestion and guard count the same tasks, so a suggested status is never refused.
      suggestedStatus: suggestedSeasonStatus({ status: row.status, ...facts }),
      statusBlocks: Object.fromEntries(
        SEASON_STATUSES.map((s) => [s, seasonStatusBlock(s, facts)]),
      ) as Record<SeasonStatus, SeasonStatusBlock | null>,
      openSeasonTasks,
      tasks,
    };
  };

  const missing = async (season: number): Promise<MissingSeason> => {
    const last = await seasonEventDates(db, presetId, season - 1);
    return {
      hasDates: seasonEnd(await seasonEventDates(db, presetId, season)) !== null,
      suggestedStart:
        seasonEnd(last) === null
          ? null
          : expectedStartFromLastSeason(seasonStart(last, `${season - 1}-01-01`), season),
    };
  };

  const current = rows.find((r) => r.season === currentYear);
  const next = rows.find((r) => r.season === nextYear);
  return {
    current: {
      season: currentYear,
      record: current ? await build(current) : null,
      missing: current ? null : await missing(currentYear),
    },
    next: next ? await build(next) : null,
  };
}
