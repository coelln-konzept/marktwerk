import "server-only";
import {
  addDays,
  berlinDay,
  daysBetween,
  type EventPermitInput,
  MATRIX_MAX_COLUMNS,
  type MatrixCellState,
  type MatrixColumn,
  matrixCellState,
  matrixColumnKey,
  pickCellTask,
  type Readiness,
  selectMatrixColumns,
  summarizeReadiness,
  type TaskStatusKey,
} from "@marktwerk/core";
import { event, eventPermit, eventPreset, eventType, permit, task } from "@marktwerk/db/schema";
import {
  and,
  asc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lte,
  notInArray,
  type SQL,
} from "drizzle-orm";
import { type Actor, visibleEvents } from "../actor";
import { db } from "../db";
import { visibleTasks } from "../task-scope";

/*
 * The two cross-event board views: Bereitschaftsliste (one row per upcoming market) and the
 * Kernaufgaben-Matrix (markets x key tasks). Each is a fixed number of queries (events, tasks, and for the
 * list the required permits), never one per event.
 */

/** Hard cap of markets per view. */
const EVENT_LIMIT = 60;

export type OverviewScope = {
  /** Only events whose first day is on or before `today + horizonDays`; null = all upcoming. */
  horizonDays: number | null;
};

export type OverviewEvent = {
  id: string;
  name: string;
  typeKey: string;
  /** Market colour of the preset, null = fall back to the event type. */
  color: string | null;
  startsOn: string;
  endsOn: string;
  daysUntil: number;
};

/**
 * Markets that still lie ahead or are running, in date order. "Upcoming" means the last day is not before
 * today; with a horizon, the first day must be on or before the horizon end (a running market has its
 * first day in the past and always qualifies). Cancelled, completed and closed events are left out.
 */
async function upcomingEvents(
  actor: Actor,
  scope: OverviewScope,
  today: string,
): Promise<OverviewEvent[]> {
  const where: (SQL | undefined)[] = [
    visibleEvents(actor),
    gte(event.endsOn, today),
    notInArray(event.status, ["cancelled", "completed", "closed"]),
    scope.horizonDays === null ? undefined : lte(event.startsOn, addDays(today, scope.horizonDays)),
  ];
  const rows = await db
    .select({
      id: event.id,
      name: event.name,
      typeKey: eventType.key,
      color: eventPreset.color,
      startsOn: event.startsOn,
      endsOn: event.endsOn,
    })
    .from(event)
    .innerJoin(eventType, eq(eventType.id, event.eventTypeId))
    .leftJoin(eventPreset, eq(eventPreset.id, event.presetId))
    .where(and(...where))
    .orderBy(asc(event.startsOn), asc(event.name))
    .limit(EVENT_LIMIT);
  return rows.map((r) => ({
    ...r,
    daysUntil: daysBetween(today, r.startsOn),
  }));
}

// ---------------------------------------------------------------------------------------------
// Bereitschaftsliste

export type ReadinessRow = OverviewEvent & Readiness;

export type ReadinessList = {
  rows: ReadinessRow[];
  /** Open tasks per category over all listed markets (before the category filter), for the filter chips. */
  categoryCounts: Record<string, number>;
};

/** One row per upcoming market; `category` narrows the task counts (permits are not tasks and stay). */
export async function getReadinessList(
  actor: Actor,
  scope: OverviewScope & { category?: string },
  today: string,
): Promise<ReadinessList> {
  const events = await upcomingEvents(actor, scope, today);
  if (events.length === 0) return { rows: [], categoryCounts: {} };
  const ids = events.map((e) => e.id);

  const [taskRows, permitRows] = await Promise.all([
    db
      .select({
        id: task.id,
        eventId: task.eventId,
        title: task.title,
        status: task.status,
        category: task.category,
        isKey: task.isKey,
        dueAt: task.dueAt,
        snoozedUntil: task.snoozedUntil,
      })
      .from(task)
      .where(
        and(
          visibleTasks(actor),
          inArray(task.eventId, ids),
          inArray(task.status, [
            "todo",
            "in_progress",
            "waiting_external",
            "blocked",
            "done",
            "skipped",
          ]),
        ),
      ),
    db
      .select({
        eventId: eventPermit.eventId,
        required: eventPermit.required,
        status: permit.status,
        applyBy: permit.applyBy,
        validUntil: permit.validUntil,
      })
      .from(eventPermit)
      .innerJoin(permit, eq(permit.id, eventPermit.permitId))
      .where(and(inArray(eventPermit.eventId, ids), isNull(permit.archivedAt))),
  ]);

  const tasksBy = new Map<string, ReturnType<typeof toTask>[]>();
  const categoryCounts: Record<string, number> = {};
  for (const r of taskRows) {
    if (!r.eventId) continue;
    const t = toTask(r);
    const list = tasksBy.get(r.eventId) ?? [];
    list.push(t);
    tasksBy.set(r.eventId, list);
    if (r.status !== "done" && r.status !== "skipped")
      categoryCounts[r.category] = (categoryCounts[r.category] ?? 0) + 1;
  }
  const permitsBy = new Map<string, EventPermitInput[]>();
  for (const p of permitRows) {
    const list = permitsBy.get(p.eventId) ?? [];
    list.push(p);
    permitsBy.set(p.eventId, list);
  }

  const rows = events.map((e): ReadinessRow => {
    const own = (tasksBy.get(e.id) ?? []).filter(
      (t) => scope.category === undefined || t.category === scope.category,
    );
    return {
      ...e,
      ...summarizeReadiness(own, permitsBy.get(e.id) ?? [], e.startsOn, today, e.endsOn),
    };
  });
  return { rows, categoryCounts };
}

function toTask(r: {
  id: string;
  title: string;
  status: TaskStatusKey;
  category: string;
  isKey: boolean;
  dueAt: Date | null;
  snoozedUntil: string | null;
}) {
  return {
    id: r.id,
    title: r.title,
    status: r.status,
    category: r.category,
    isKey: r.isKey,
    dueOn: r.dueAt ? berlinDay(r.dueAt) : null,
    snoozedUntil: r.snoozedUntil,
  };
}

// ---------------------------------------------------------------------------------------------
// Kernaufgaben-Matrix

export type MatrixCell = { taskId: string; state: MatrixCellState; dueOn: string | null };

export type KeyTaskMatrix = {
  events: OverviewEvent[];
  columns: MatrixColumn[];
  /** `cells[eventId][columnKey]`; a missing entry means the market has no such task. */
  cells: Record<string, Record<string, MatrixCell>>;
  /** More key-task columns exist than are shown. */
  truncatedColumns: boolean;
};

/** Markets x key tasks. Columns are matched by the template item's stable key (title as fallback). */
export async function getKeyTaskMatrix(
  actor: Actor,
  scope: OverviewScope,
  today: string,
): Promise<KeyTaskMatrix> {
  const events = await upcomingEvents(actor, scope, today);
  if (events.length === 0) return { events, columns: [], cells: {}, truncatedColumns: false };
  const startsOn = new Map(events.map((e) => [e.id, e.startsOn]));

  const rows = await db
    .select({
      id: task.id,
      eventId: task.eventId,
      title: task.title,
      status: task.status,
      category: task.category,
      isKey: task.isKey,
      dueAt: task.dueAt,
      snoozedUntil: task.snoozedUntil,
      templateStableKey: task.templateStableKey,
    })
    .from(task)
    .where(
      and(
        visibleTasks(actor),
        inArray(
          task.eventId,
          events.map((e) => e.id),
        ),
        eq(task.isKey, true),
        isNotNull(task.eventId),
        notInArray(task.status, ["cancelled"]),
      ),
    );

  const keyTasks = rows.map((r) => ({
    ...toTask(r),
    eventId: r.eventId as string,
    templateStableKey: r.templateStableKey,
  }));
  const columns = selectMatrixColumns(
    keyTasks.map((t) => ({
      eventId: t.eventId,
      templateStableKey: t.templateStableKey,
      title: t.title,
      dueOn: t.dueOn,
      eventStartsOn: startsOn.get(t.eventId) as string,
    })),
    MATRIX_MAX_COLUMNS,
  );
  const shown = new Set(columns.map((c) => c.key));
  const allKeys = new Set(keyTasks.map((t) => matrixColumnKey(t)));

  const grouped = new Map<string, typeof keyTasks>();
  for (const t of keyTasks) {
    const col = matrixColumnKey(t);
    if (!shown.has(col)) continue;
    const id = `${t.eventId}|${col}`;
    grouped.set(id, [...(grouped.get(id) ?? []), t]);
  }
  const cells: KeyTaskMatrix["cells"] = {};
  for (const list of grouped.values()) {
    const picked = pickCellTask(list, today);
    if (!picked) continue;
    const own = cells[picked.eventId] ?? {};
    cells[picked.eventId] = own;
    own[matrixColumnKey(picked)] = {
      taskId: picked.id,
      state: matrixCellState(picked, today),
      dueOn: picked.dueOn,
    };
  }
  return { events, columns, cells, truncatedColumns: allKeys.size > columns.length };
}
