import "server-only";
import {
  CLOSED_TASK_STATUSES,
  can,
  canChangeSeasonStatus,
  expectedStartProblem,
  isDatesPlanningTask,
  isSeasonStatus,
  type SeasonEventDates,
  type SeasonStatus,
  seasonAnchors,
  seasonEnd,
  seasonStatusBlock,
} from "@marktwerk/core";
import { event, eventSeason, eventSeasonAnchor, task } from "@marktwerk/db/schema";
import {
  type EnsuredSeason,
  ensureEventSeasonTx,
  type SeasonSource,
  seasonEventDates,
  uniqueSeasonKeys,
  writeSeasonAnchors,
} from "@marktwerk/jobs/seasons";
import { and, count, eq, inArray, isNotNull, isNull, notInArray } from "drizzle-orm";
import { forbidden } from "next/navigation";
import { todayIn } from "../../lib/format";
import type { Actor } from "../actor";
import { db } from "../db";
import { audit } from "./audit";
import { planTaskShift, type ShiftedTask, shiftTasks } from "./task-schedule";
import { completeTasksAuto } from "./tasks";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const UUID = /^[0-9a-f-]{36}$/i;

export class SeasonInputError extends Error {}

/** A market's season: (preset, calendar year). */
export type SeasonKey = { presetId: string; season: number };

/** How a "Saison anlegen" toast counts (UX-009): top-level tasks as the panel lists them, subtasks apart. */
export type CreatedSeason = EnsuredSeason & {
  /** Top-level season tasks (the panel's rows). */
  topLevelTasks: number;
  subtasks: number;
  /** Top-level tasks whose due date had already passed and that are due today instead. */
  dueToday: number;
};

/** Top-level and subtask counts of a season's tasks, and how many of `clampedIds` are top-level. */
async function createdCounts(
  tx: Tx,
  seasonId: string,
  clampedIds: readonly string[],
): Promise<Pick<CreatedSeason, "topLevelTasks" | "subtasks" | "dueToday">> {
  const rows = await tx
    .select({ id: task.id, parentTaskId: task.parentTaskId })
    .from(task)
    .where(and(eq(task.seasonId, seasonId), notInArray(task.status, ["cancelled"])));
  const clamped = new Set(clampedIds);
  const top = rows.filter((r) => r.parentTaskId === null);
  return {
    topLevelTasks: top.length,
    subtasks: rows.length - top.length,
    dueToday: top.filter((r) => clamped.has(r.id)).length,
  };
}

/**
 * `ensureEventSeason(presetId, season)` (research 13 §6.2): makes sure the market has its Saison record for that
 * year. Permission check → transaction → `ensureEventSeasonTx` (the one path, @marktwerk/jobs: record, anchors,
 * season items, overdue ones due today, audit `season.create`). Idempotent: an existing record is returned
 * unchanged. `expectedStart` is the "Erwartet ab" asked for in "Saison anlegen" (UX-009); it must be a date in
 * the season's year (`invalid_date`, `outside_season`), and is left out when the season has dates already.
 */
export async function ensureEventSeason(
  actor: Actor,
  presetId: string,
  season: number,
  expectedStart?: string,
): Promise<CreatedSeason> {
  if (!can(actor.role, "event", "write")) forbidden();
  if (!UUID.test(presetId)) throw new SeasonInputError("preset_not_found");
  if (!Number.isInteger(season) || season < 1900 || season > 9999)
    throw new SeasonInputError("invalid_season");
  if (expectedStart !== undefined) {
    // Only the date itself: whether the season has dates is decided below (they win over the guess).
    const problem =
      typeof expectedStart === "string"
        ? expectedStartProblem(expectedStart, season, [])
        : "invalid_date";
    if (problem) throw new SeasonInputError(problem);
  }
  return db.transaction(async (tx) => {
    const preset = await tx.query.eventPreset.findFirst({
      where: (p, { eq }) => eq(p.id, presetId),
      columns: { id: true },
    });
    if (!preset) throw new SeasonInputError("preset_not_found");
    const ensured = await ensureEventSeasonTx(tx, actor, presetId, season, {
      today: todayIn(),
      source: "manual",
      ...(expectedStart !== undefined ? { expectedStart } : {}),
    });
    return { ...ensured, ...(await createdCounts(tx, ensured.id, ensured.clampedTaskIds)) };
  });
}

/** Audit reason of a "Termine planen" task completed by "Markt planen" (stored German, like the permit one). */
export const DATES_PLANNED_REASON = "Termine mit „Markt planen“ angelegt";

/**
 * The seasons among `seasons` in which the market has no date yet (no non-cancelled, not archived event): read
 * before "Markt planen" inserts its events, so `completeDatesPlanningTx` knows which seasons it gives their first
 * dates.
 */
export async function seasonsWithoutDatesTx(
  tx: Pick<Tx, "select">,
  presetId: string,
  seasons: readonly number[],
): Promise<number[]> {
  const result: number[] = [];
  for (const season of new Set(seasons))
    if (seasonEnd(await seasonEventDates(tx, presetId, season)) === null) result.push(season);
  return result;
}

/**
 * "Markt planen" has just given these seasons their first dates (UX audit round 1 default, UX-009: "auto-complete
 * 'Termine planen' when the wizard planned the dates", whether its record existed already, e.g. made by the
 * nightly job, or was made by this run): each season's open "Termine planen" task (`isDatesPlanningTask`) and its
 * open subtasks are done, the subtasks first. A group in which a task needs a photo or attachment stays open as a
 * whole. Inside the caller's transaction, through the shared auto-completion (`completeTasksAuto`: same
 * `task.status` audit entry as a tick, undoable, `auto: true`, reason {@link DATES_PLANNED_REASON}). Seasons
 * without a record are skipped. Returns the ids completed.
 */
export async function completeDatesPlanningTx(
  tx: Tx,
  actor: Actor,
  keys: readonly SeasonKey[],
): Promise<string[]> {
  const completed: string[] = [];
  for (const key of uniqueSeasonKeys(keys)) {
    const season = await activeSeason(tx, key);
    if (!season) continue;
    const rows = await tx
      .select({
        id: task.id,
        parentTaskId: task.parentTaskId,
        templateStableKey: task.templateStableKey,
        requiresPhoto: task.requiresPhoto,
        requiresAttachment: task.requiresAttachment,
      })
      .from(task)
      .where(and(eq(task.seasonId, season.id), notInArray(task.status, [...CLOSED_TASK_STATUSES])))
      .orderBy(task.id);
    for (const parent of rows.filter((r) => r.parentTaskId === null && isDatesPlanningTask(r))) {
      const subtasks = rows.filter((r) => r.parentTaskId === parent.id);
      if ([parent, ...subtasks].some((r) => r.requiresPhoto || r.requiresAttachment)) continue;
      // Subtasks first: a task with open subtasks is never done (ADR 0021).
      const ids = [...subtasks.map((r) => r.id), parent.id];
      completed.push(...(await completeTasksAuto(tx, actor, ids, DATES_PLANNED_REASON)));
    }
  }
  return completed;
}

/**
 * Inside a caller's transaction that already checked `event:write` ("Markt planen", moving an event): the Saison
 * records of these (market, year) pairs exist afterwards.
 */
export async function ensureSeasonsTx(
  tx: Tx,
  actor: Actor,
  keys: readonly SeasonKey[],
  source: SeasonSource,
): Promise<EnsuredSeason[]> {
  const today = todayIn();
  const result: EnsuredSeason[] = [];
  for (const key of keys)
    result.push(await ensureEventSeasonTx(tx, actor, key.presetId, key.season, { today, source }));
  return result;
}

/** What changed a season's dates (written to the audit entry). */
export type SeasonDatesCause =
  | "event_create"
  | "event_move"
  | "event_update"
  | "event_status"
  | "event_delete"
  | "event_archive"
  /** `expected_start` edited on the market page (while the season has no dates). */
  | "expected_start";

/** The anchors that exist (a null `season_end` has no row), as the shift path reads them. */
const anchorMap = (anchors: Record<string, string | null>) =>
  new Map(Object.entries(anchors).filter((e): e is [string, string] => e[1] !== null));

const activeSeason = async (x: Pick<typeof db, "select">, key: SeasonKey) => {
  const [row] = await x
    .select({ id: eventSeason.id, expectedStart: eventSeason.expectedStart })
    .from(eventSeason)
    .where(
      and(
        eq(eventSeason.presetId, key.presetId),
        eq(eventSeason.season, key.season),
        isNull(eventSeason.archivedAt),
      ),
    );
  return row;
};

export type SeasonSync = { seasonId: string; shifted: ShiftedTask[] };

/**
 * Anchors move with the dates (research 13 §6.2, Fahrplan R10): after an event of these seasons was created,
 * moved, cancelled, reopened, deleted or archived, `season_start` / `season_end` are recomputed from the season's
 * events (`seasonAnchors`) and the open, not overridden season tasks follow through the one shift path
 * (`shiftTasks`, done tasks never move). Inside the caller's transaction, which checked the permission; audited as
 * `season.anchors` with the anchor diff when something changed. Seasons without a record (or archived ones) are
 * left alone; their record is made with the right anchors when it is created.
 */
export async function syncSeasonsTx(
  tx: Tx,
  actor: Actor,
  /** Seasons to recompute; events without a market (`presetId` null) are skipped. */
  keys: readonly { presetId: string | null; season: number }[],
  cause: SeasonDatesCause,
): Promise<SeasonSync[]> {
  const result: SeasonSync[] = [];
  for (const key of uniqueSeasonKeys(keys)) {
    const row = await activeSeason(tx, key);
    if (!row) continue;
    const next = seasonAnchors(
      await seasonEventDates(tx, key.presetId, key.season),
      row.expectedStart,
    );
    const anchors = await writeSeasonAnchors(tx, row.id, next);
    if (Object.keys(anchors).length === 0) continue;
    // Only the tasks on an anchor that moved: one clamped to today on an unchanged anchor stays there (UX-009).
    const shifted = await shiftTasks(
      tx,
      { seasonId: row.id },
      anchorMap(next),
      new Set(Object.keys(anchors)),
    );
    await audit(tx, actor.id, [
      {
        action: "season.anchors",
        entityType: "event_season",
        entityId: row.id,
        diff: {
          presetId: key.presetId,
          season: key.season,
          anchors,
          cause,
          ...(shifted.length > 0 ? { tasksShifted: shifted.length } : {}),
        },
      },
    ]);
    result.push({ seasonId: row.id, shifted });
  }
  return result;
}

/**
 * Preview for "Verschieben": which season tasks would get a new due date if the event had `next` as its days.
 * Same rules and shift plan as `syncSeasonsTx` (only tasks on an anchor that would move); nothing is written. A
 * season without a record has no tasks yet.
 */
export async function planSeasonShiftForMove(
  x: Pick<typeof db, "select" | "update">,
  current: {
    id: string;
    presetId: string | null;
    season: number;
    status: string;
  },
  next: { startsOn: string; endsOn: string },
): Promise<ShiftedTask[]> {
  if (!current.presetId) return [];
  const presetId = current.presetId;
  const nextSeason = Number(next.startsOn.slice(0, 4));
  const shifted: ShiftedTask[] = [];
  for (const key of uniqueSeasonKeys([
    { presetId, season: current.season },
    { presetId, season: nextSeason },
  ])) {
    const row = await activeSeason(x, key);
    if (!row) continue;
    const others = await x
      .select({
        id: event.id,
        startsOn: event.startsOn,
        endsOn: event.endsOn,
        status: event.status,
      })
      .from(event)
      .where(
        and(eq(event.presetId, presetId), eq(event.season, key.season), isNull(event.archivedAt)),
      );
    const dates: SeasonEventDates[] = others.filter((e) => e.id !== current.id);
    if (key.season === nextSeason) dates.push({ ...next, status: current.status });
    const anchors = seasonAnchors(dates, row.expectedStart);
    const stored = await x
      .select({ key: eventSeasonAnchor.key, date: eventSeasonAnchor.date })
      .from(eventSeasonAnchor)
      .where(eq(eventSeasonAnchor.seasonId, row.id));
    const old = new Map(stored.map((r) => [r.key, r.date]));
    const changed = new Set(
      Object.entries(anchors)
        .filter(([key, date]) => (old.get(key) ?? null) !== date)
        .map(([key]) => key),
    );
    shifted.push(...(await planTaskShift(x, { seasonId: row.id }, anchorMap(anchors), changed)));
  }
  return shifted;
}

/** The active season record, locked for the change. */
async function lockSeason(tx: Tx, seasonId: string) {
  if (!UUID.test(seasonId)) throw new SeasonInputError("season_not_found");
  const [row] = await tx
    .select({
      id: eventSeason.id,
      presetId: eventSeason.presetId,
      season: eventSeason.season,
      status: eventSeason.status,
      expectedStart: eventSeason.expectedStart,
    })
    .from(eventSeason)
    .where(and(eq(eventSeason.id, seasonId), isNull(eventSeason.archivedAt)))
    .for("update");
  if (!row) throw new SeasonInputError("season_not_found");
  return row;
}

/** Open top-level tasks of a season (all of them, whoever may see them): what "Abgeschlossen" waits for. */
async function openSeasonTaskCount(x: Pick<typeof db, "select">, seasonId: string) {
  const [row] = await x
    .select({ n: count() })
    .from(task)
    .where(
      and(
        eq(task.seasonId, seasonId),
        isNull(task.parentTaskId),
        notInArray(task.status, [...CLOSED_TASK_STATUSES]),
      ),
    );
  return row?.n ?? 0;
}

/**
 * Manual status switch on the market page (research 13 §6.2: planning → dates_set → closed, undo toast; nothing
 * changes it automatically). A status that contradicts the season's dates or tasks is refused with its reason
 * (`seasonStatusBlock`: `no_dates`, `not_over`, `open_tasks`; UX-050); the undo is the same call back.
 * `expectedFrom` is the status the page showed: a different one is a `conflict` (someone else changed it).
 * Permission → transaction → audit `season.status` {from, to}.
 */
export async function setSeasonStatus(
  actor: Actor,
  seasonId: string,
  to: string,
  expectedFrom?: string,
): Promise<{ from: SeasonStatus; to: SeasonStatus }> {
  if (!can(actor.role, "event", "write")) forbidden();
  if (!isSeasonStatus(to)) throw new SeasonInputError("invalid_status");
  return db.transaction(async (tx) => {
    const row = await lockSeason(tx, seasonId);
    if (expectedFrom !== undefined && row.status !== expectedFrom)
      throw new SeasonInputError("conflict");
    if (!canChangeSeasonStatus(row.status, to)) throw new SeasonInputError("invalid_transition");
    const events = await seasonEventDates(tx, row.presetId, row.season);
    const end = seasonEnd(events);
    const block = seasonStatusBlock(to, {
      hasDates: end !== null,
      seasonEnd: end,
      today: todayIn(),
      openSeasonTasks: to === "closed" ? await openSeasonTaskCount(tx, row.id) : 0,
    });
    if (block) throw new SeasonInputError(block);
    await tx
      .update(eventSeason)
      .set({ status: to, updatedAt: new Date() })
      .where(eq(eventSeason.id, row.id));
    await audit(tx, actor.id, [
      {
        action: "season.status",
        entityType: "event_season",
        entityId: row.id,
        diff: { presetId: row.presetId, season: row.season, from: row.status, to },
      },
    ]);
    return { from: row.status, to };
  });
}

/**
 * "Erwartet ab" on the market page (decision 2026-11-13): the first date expected while the season has no dates.
 * Refused once it has dates (`has_dates`), outside the season's year (`outside_season`) and for a malformed date
 * (`invalid_date`); `expectedFrom` guards against a stale page (`conflict`). The anchor `season_start` follows and
 * open, not overridden season tasks move with it through the one shift path (`syncSeasonsTx`, audited as
 * `season.anchors`). Audit `season.expected_start` {from, to}. The undo is the same call back.
 */
export async function setSeasonExpectedStart(
  actor: Actor,
  seasonId: string,
  date: string,
  expectedFrom?: string,
): Promise<{
  from: string;
  to: string;
  changed: boolean;
  /** Top-level tasks that moved (the panel's rows); `subtasksShifted` counts the subtasks apart (UX-009). */
  tasksShifted: number;
  subtasksShifted: number;
}> {
  if (!can(actor.role, "event", "write")) forbidden();
  return db.transaction(async (tx) => {
    const row = await lockSeason(tx, seasonId);
    if (expectedFrom !== undefined && row.expectedStart !== expectedFrom)
      throw new SeasonInputError("conflict");
    const problem = expectedStartProblem(
      date,
      row.season,
      await seasonEventDates(tx, row.presetId, row.season),
    );
    if (problem) throw new SeasonInputError(problem);
    if (row.expectedStart === date)
      return { from: date, to: date, changed: false, tasksShifted: 0, subtasksShifted: 0 };
    await tx
      .update(eventSeason)
      .set({ expectedStart: date, updatedAt: new Date() })
      .where(eq(eventSeason.id, row.id));
    await audit(tx, actor.id, [
      {
        action: "season.expected_start",
        entityType: "event_season",
        entityId: row.id,
        diff: { presetId: row.presetId, season: row.season, from: row.expectedStart, to: date },
      },
    ]);
    const [sync] = await syncSeasonsTx(
      tx,
      actor,
      [{ presetId: row.presetId, season: row.season }],
      "expected_start",
    );
    const shiftedIds = sync?.shifted.map((s) => s.id) ?? [];
    const subtasksShifted =
      shiftedIds.length === 0
        ? 0
        : ((
            await tx
              .select({ n: count() })
              .from(task)
              .where(and(inArray(task.id, shiftedIds), isNotNull(task.parentTaskId)))
          )[0]?.n ?? 0);
    return {
      from: row.expectedStart,
      to: date,
      changed: true,
      tasksShifted: shiftedIds.length - subtasksShifted,
      subtasksShifted,
    };
  });
}
