import "server-only";
import {
  addDays,
  type BoardColumn,
  berlinDay,
  boardColumnFor,
  type CapacityContract,
  compareCards,
  DEFAULT_WEEKLY_CAPACITY_HOURS,
  doneVisibleSince,
  fileEvidenceOf,
  type HealthLevel,
  type HiringSignal,
  hiringSignal,
  isSubtaskOverdue,
  isWaitingPastDue,
  type LoadLevel,
  loadLevel,
  loadWeekStart,
  mondayOf,
  monthlyCapacityHours,
  NOTIFY_CHANNELS,
  type NotifyChannel,
  type NotifyTiming,
  OPEN_STATUSES,
  pastEventCutoff,
  resolveRelativeDue,
  type TaskStatusKey,
  taskHealth,
  taskLink,
  weeklyCapacityHours,
  weekStarts,
} from "@marktwerk/core";
import { isOverdueWithSubtasks, isOwnWorkItem, isTopLevel, subtaskAggregates } from "@marktwerk/db";
import {
  auditLog,
  dutyRole,
  employmentContract,
  event,
  eventDuty,
  eventPreset,
  eventType,
  staffMember,
  task,
  user,
} from "@marktwerk/db/schema";
import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  ne,
  or,
  type SQL,
  sql,
} from "drizzle-orm";
import { type Actor, visibleEvents } from "../actor";
import { db } from "../db";
import { deadlineScope, notOfPastEvent, visibleTasks } from "../task-scope";
import { type DocumentRow, listLinkedDocuments } from "./documents";
import type { CalendarItem, DueItem } from "./due";

const UUID = /^[0-9a-f-]{36}$/i;
const OPEN = [...OPEN_STATUSES];

/** Not snoozed on `today`: no snooze date, or the date has come (a snoozed task is back on its date). */
const notSnoozed = (today: string): SQL =>
  or(isNull(task.snoozedUntil), lte(task.snoozedUntil, today)) as SQL;

// ---------------------------------------------------------------------------------------------
// board

/** A card, as plain data for the client (no Dates). */
export type BoardTask = {
  id: string;
  title: string;
  status: TaskStatusKey;
  category: (typeof task.category.enumValues)[number];
  priority: (typeof task.priority.enumValues)[number];
  source: (typeof task.source.enumValues)[number];
  eventId: string | null;
  eventName: string | null;
  /** Event type key (`flea`, …), for the colour marker. */
  eventTypeKey: string | null;
  /** The market colour of the event's preset (`MARKET_COLORS` key), null = fall back to the type. */
  eventColor: string | null;
  /** Kernaufgabe: a task every market needs. */
  isKey: boolean;
  /** The parent task when this is a subtask (ADR 0021; only in `BoardData.subtasks`), else null. */
  parentId: string | null;
  dueOn: string | null;
  estimateMinutes: number;
  assigneeId: string | null;
  assigneeName: string | null;
  waitingReason: string | null;
  boardColumn: BoardColumn | null;
  boardSort: number;
  /** The column the card shows in (override or derived). */
  column: BoardColumn;
  rolloverCount: number;
  /** Subtasks (ADR 0021): not deleted ones, finished ones, open overdue ones (an overdue one flags the card). */
  subtasksTotal: number;
  subtasksDone: number;
  subtasksOverdue: number;
  /** Subtasks still open: "Erledigt" on the card opens the drawer instead (done gate, R29). */
  openSubtasks: number;
  /** Day the task was finished (done tasks), `YYYY-MM-DD`. */
  completedOn: string | null;
  requiresNote: boolean;
  requiresPhoto: boolean;
  requiresAttachment: boolean;
  /** `YYYY-MM-DD` the card is snoozed until (still in the future), else null. */
  snoozedUntil: string | null;
  /** The template no longer contains this task (a template change was applied); it is still open work. */
  removedFromTemplate: boolean;
};

export type BoardScope = {
  /**
   * One event's board (shows all of its tasks); omitted = across all events (and tasks without one), where
   * tasks of past markets are left out (see `notOfPastEvent`).
   */
  eventId?: string;
  /**
   * "Zeitraum" (ux-concept §5): only tasks of markets whose first day is on or before today + this many
   * days (running markets and follow-up work of past ones qualify), the same meaning as in Bereitschaft
   * and Matrix. Tasks without an event are cut by their due date instead (undated ones stay). null = no limit.
   */
  horizonDays?: number | null;
};

/** Hard cap per query; `truncated` tells the page to say so. */
const BOARD_LIMIT = 1500;

export type BoardData = {
  /** Top-level tasks, each with its subtask progress. */
  tasks: BoardTask[];
  /**
   * One event's board (its Checkliste): the subtasks of the tasks in `tasks` (not deleted ones), shown under their
   * parent (D2-12), in their order under it (board order, then due date and creation, like `listSubtasks`). Never
   * counted on their own. Across events: empty (the parent carries the progress only).
   */
  subtasks: BoardTask[];
  truncated: boolean;
};

/** The columns of a board card (the `task` row joined with its event, type, preset and assignee). */
function boardFields(today: string) {
  const sub = subtaskAggregates(today, resolveRelativeDue(today, 0, "00:00"));
  return {
    id: task.id,
    title: task.title,
    status: task.status,
    category: task.category,
    priority: task.priority,
    source: task.source,
    eventId: task.eventId,
    eventName: event.name,
    eventTypeKey: eventType.key,
    eventColor: eventPreset.color,
    isKey: task.isKey,
    parentId: task.parentTaskId,
    dueAt: task.dueAt,
    estimateMinutes: task.estimateMinutes,
    assigneeId: task.assigneeId,
    assigneeName: staffMember.displayName,
    waitingReason: task.waitingReason,
    boardColumn: task.boardColumn,
    boardSort: task.boardSort,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    completedAt: task.completedAt,
    rolloverCount: task.rolloverCount,
    requiresNote: task.requiresNote,
    requiresPhoto: task.requiresPhoto,
    requiresAttachment: task.requiresAttachment,
    snoozedUntil: task.snoozedUntil,
    removedFromTemplate: task.removedFromTemplate,
    subtasksTotal: sub.subtasksTotal,
    subtasksDone: sub.subtasksDone,
    subtasksOverdue: sub.subtasksOverdue,
    subtasksOpen: sub.subtasksOpen,
  };
}

function selectBoardRows(today: string) {
  return db
    .select(boardFields(today))
    .from(task)
    .leftJoin(event, eq(event.id, task.eventId))
    .leftJoin(eventType, eq(eventType.id, event.eventTypeId))
    .leftJoin(eventPreset, eq(eventPreset.id, event.presetId))
    .leftJoin(staffMember, eq(staffMember.id, task.assigneeId));
}

type BoardRow = Awaited<ReturnType<typeof selectBoardRows>>[number];

function toBoardTask(r: BoardRow, today: string): BoardTask {
  return {
    id: r.id,
    title: r.title,
    status: r.status,
    category: r.category,
    priority: r.priority,
    source: r.source,
    eventId: r.eventId,
    eventName: r.eventName,
    eventTypeKey: r.eventTypeKey,
    eventColor: r.eventColor,
    isKey: r.isKey,
    parentId: r.parentId,
    dueOn: r.dueAt ? berlinDay(r.dueAt) : null,
    estimateMinutes: r.estimateMinutes,
    assigneeId: r.assigneeId,
    assigneeName: r.assigneeName,
    waitingReason: r.waitingReason,
    boardColumn: r.boardColumn,
    boardSort: r.boardSort,
    column: boardColumnFor(r, today),
    rolloverCount: r.rolloverCount,
    subtasksTotal: r.subtasksTotal,
    subtasksDone: r.subtasksDone,
    subtasksOverdue: r.subtasksOverdue,
    openSubtasks: r.subtasksOpen,
    completedOn: r.completedAt ? berlinDay(r.completedAt) : null,
    requiresNote: r.requiresNote,
    requiresPhoto: r.requiresPhoto,
    requiresAttachment: r.requiresAttachment,
    snoozedUntil: r.snoozedUntil && r.snoozedUntil > today ? r.snoozedUntil : null,
    removedFromTemplate: r.removedFromTemplate,
  };
}

/**
 * Cards for the board: open tasks plus finished ones of the last 14 days (Erledigt), cancelled ones never.
 * Top-level tasks only, each with its subtask progress (ADR 0021); one event's board also gets the subtasks of
 * those tasks (one more query for all of them, see `BoardData.subtasks`).
 * One event's board is its Checkliste (user test 2026-11), so there every finished task counts.
 * Within a column they are in display order (`board_sort`, then due date).
 */
export async function listBoardTasks(
  actor: Actor,
  scope: BoardScope,
  today: string,
): Promise<BoardData> {
  if (scope.eventId && !UUID.test(scope.eventId))
    return { tasks: [], subtasks: [], truncated: false };
  const since = resolveRelativeDue(doneVisibleSince(today), 0, "00:00");
  const horizonDays = scope.horizonDays ?? null;
  // Event-less tasks have no market to measure against, so their due date is cut at the horizon.
  const horizon =
    horizonDays === null ? null : resolveRelativeDue(addDays(today, horizonDays + 1), 0, "00:00");

  const rows = await selectBoardRows(today)
    .where(
      and(
        visibleTasks(actor),
        isTopLevel(),
        scope.eventId ? eq(task.eventId, scope.eventId) : notOfPastEvent(today),
        or(
          and(
            inArray(task.status, OPEN),
            horizonDays === null
              ? undefined
              : or(
                  and(isNotNull(task.eventId), lte(event.startsOn, addDays(today, horizonDays))),
                  and(
                    isNull(task.eventId),
                    horizon ? or(isNull(task.dueAt), lt(task.dueAt, horizon)) : undefined,
                  ),
                ),
          ),
          and(
            inArray(task.status, ["done", "skipped"]),
            scope.eventId
              ? undefined
              : gte(sql`coalesce(${task.completedAt}, ${task.updatedAt})`, since),
          ),
        ),
      ),
    )
    .orderBy(sql`${task.dueAt} asc nulls last`, asc(task.createdAt))
    .limit(BOARD_LIMIT + 1);

  const truncated = rows.length > BOARD_LIMIT;
  const kept = rows.slice(0, BOARD_LIMIT);
  kept.sort(compareCards);
  const tasks = kept.map((r) => toBoardTask(r, today));

  const subtasks =
    scope.eventId && tasks.length > 0
      ? (
          await selectBoardRows(today)
            .where(
              and(
                visibleTasks(actor),
                inArray(
                  task.parentTaskId,
                  tasks.map((t) => t.id),
                ),
                ne(task.status, "cancelled"),
              ),
            )
            .orderBy(
              asc(task.boardSort),
              sql`${task.dueAt} asc nulls last`,
              asc(task.createdAt),
              asc(task.id),
            )
        ).map((r) => toBoardTask(r, today))
      : [];
  return { tasks, subtasks, truncated };
}

// ---------------------------------------------------------------------------------------------
// people

export type StaffOption = {
  id: string;
  displayName: string;
  /** For the notify hint ("hat keine E-Mail-Adresse hinterlegt"). Contact data itself never goes to the client. */
  hasEmail: boolean;
  hasPhone: boolean;
};

/** Active staff, for the assignee menus. */
export async function listStaffOptions(): Promise<StaffOption[]> {
  return db
    .select({
      id: staffMember.id,
      displayName: staffMember.displayName,
      hasEmail: sql<boolean>`coalesce(btrim(${staffMember.email}) <> '', false)`,
      hasPhone: sql<boolean>`coalesce(btrim(${staffMember.phoneE164}) <> '', false)`,
    })
    .from(staffMember)
    .where(and(eq(staffMember.active, true), isNull(staffMember.archivedAt)))
    .orderBy(asc(staffMember.displayName));
}

/** The signed-in user as a notification recipient: their own email, and whether their staff record has a phone. */
export type NotifySelf = { id: string; email: string; hasPhone: boolean };

export async function getNotifySelf(actor: Actor): Promise<NotifySelf> {
  const [member] = actor.staffMemberId
    ? await db
        .select({ phone: staffMember.phoneE164 })
        .from(staffMember)
        .where(eq(staffMember.id, actor.staffMemberId))
    : [];
  return { id: actor.id, email: actor.email, hasPhone: !!member?.phone?.trim() };
}

export type EventOption = { id: string; name: string; startsOn: string; endsOn: string };

/**
 * Events a task can be created on: not over for more than 30 days, in date order. No cap: the dialog
 * groups them by month, so a long season stays selectable.
 */
export async function listTaskEventOptions(actor: Actor, today: string): Promise<EventOption[]> {
  return db
    .select({ id: event.id, name: event.name, startsOn: event.startsOn, endsOn: event.endsOn })
    .from(event)
    .where(
      and(
        visibleEvents(actor),
        ne(event.status, "cancelled"),
        gte(event.endsOn, addDays(today, -30)),
      ),
    )
    .orderBy(asc(event.startsOn), asc(event.name));
}

async function contractsOf(staffIds: string[]): Promise<Map<string, CapacityContract[]>> {
  const map = new Map<string, CapacityContract[]>();
  if (staffIds.length === 0) return map;
  const rows = await db
    .select({
      staffMemberId: employmentContract.staffMemberId,
      validFrom: employmentContract.validFrom,
      validUntil: employmentContract.validUntil,
      contractedHoursPerWeek: employmentContract.contractedHoursPerWeek,
    })
    .from(employmentContract)
    .where(inArray(employmentContract.staffMemberId, staffIds));
  for (const r of rows) {
    const list = map.get(r.staffMemberId) ?? [];
    list.push(r);
    map.set(r.staffMemberId, list);
  }
  return map;
}

export type RailPerson = {
  id: string;
  name: string;
  /** Duty roles the person holds at this event (event board only). */
  roles: { de: string; en: string }[];
  /** Open tasks of this board's scope. */
  openTasks: number;
  /** Estimated open hours this ISO week (all events the actor can see; overdue counts this week). */
  hoursThisWeek: number;
  capacityHours: number;
  level: LoadLevel;
};

export type PeopleRail = {
  people: RailPerson[];
  unassigned: { tasks: number; hours: number };
};

/**
 * The people rail: for an event board its duty holders and everybody with a task there; across events
 * everybody with open work in the window. Load = estimated open hours this ISO week against capacity
 * (contract hours per week, default 20 h).
 */
export async function getPeopleRail(
  actor: Actor,
  scope: { eventId?: string },
  today: string,
): Promise<PeopleRail> {
  const monday = mondayOf(today);
  const weekEnd = resolveRelativeDue(addDays(monday, 7), 0, "00:00");

  const [scopeRows, weekRows, duties] = await Promise.all([
    db
      .select({
        assigneeId: task.assigneeId,
        n: sql<number>`count(*)::int`,
        minutes: sql<number>`coalesce(sum(${task.estimateMinutes}), 0)::int`,
      })
      .from(task)
      .where(
        and(
          visibleTasks(actor),
          // Per person: their top-level tasks and the subtasks they have of somebody else's task (ADR 0021).
          isOwnWorkItem(),
          inArray(task.status, OPEN),
          scope.eventId && UUID.test(scope.eventId)
            ? eq(task.eventId, scope.eventId)
            : notOfPastEvent(today),
        ),
      )
      .groupBy(task.assigneeId),
    db
      .select({
        assigneeId: task.assigneeId,
        minutes: sql<number>`coalesce(sum(${task.estimateMinutes}), 0)::int`,
      })
      .from(task)
      .where(
        and(
          visibleTasks(actor),
          isOwnWorkItem(),
          inArray(task.status, OPEN),
          notOfPastEvent(today),
          isNotNull(task.assigneeId),
          isNotNull(task.dueAt),
          lt(task.dueAt, weekEnd),
        ),
      )
      .groupBy(task.assigneeId),
    scope.eventId && UUID.test(scope.eventId)
      ? db
          .select({
            staffMemberId: eventDuty.staffMemberId,
            de: dutyRole.nameDe,
            en: dutyRole.nameEn,
            sort: dutyRole.sort,
          })
          .from(eventDuty)
          .innerJoin(dutyRole, eq(dutyRole.id, eventDuty.dutyRoleId))
          .where(eq(eventDuty.eventId, scope.eventId))
          .orderBy(asc(dutyRole.sort))
      : Promise.resolve([]),
  ]);

  const openBy = new Map(scopeRows.map((r) => [r.assigneeId, r]));
  const weekBy = new Map(weekRows.map((r) => [r.assigneeId, r.minutes]));
  const roleBy = new Map<string, { de: string; en: string }[]>();
  for (const d of duties) {
    const list = roleBy.get(d.staffMemberId) ?? [];
    list.push({ de: d.de, en: d.en });
    roleBy.set(d.staffMemberId, list);
  }
  const ids = new Set<string>([...roleBy.keys()]);
  for (const r of scopeRows) if (r.assigneeId) ids.add(r.assigneeId);
  if (ids.size === 0) {
    const none = openBy.get(null);
    return { people: [], unassigned: { tasks: none?.n ?? 0, hours: (none?.minutes ?? 0) / 60 } };
  }

  const [staff, contracts] = await Promise.all([
    db
      .select({ id: staffMember.id, name: staffMember.displayName })
      .from(staffMember)
      .where(inArray(staffMember.id, [...ids])),
    contractsOf([...ids]),
  ]);
  const people = staff
    .map((s): RailPerson => {
      const hours = (weekBy.get(s.id) ?? 0) / 60;
      const capacity = weeklyCapacityHours(contracts.get(s.id) ?? [], monday);
      return {
        id: s.id,
        name: s.name,
        roles: roleBy.get(s.id) ?? [],
        openTasks: openBy.get(s.id)?.n ?? 0,
        hoursThisWeek: hours,
        capacityHours: capacity,
        level: loadLevel(hours, capacity),
      };
    })
    .sort((a, b) => b.hoursThisWeek - a.hoursThisWeek || a.name.localeCompare(b.name, "de"));
  const none = openBy.get(null);
  return { people, unassigned: { tasks: none?.n ?? 0, hours: (none?.minutes ?? 0) / 60 } };
}

// ---------------------------------------------------------------------------------------------
// workload

export type WorkloadRow = {
  staffMemberId: string | null;
  name: string | null;
  /** Hours per week, aligned with `weeks`. */
  hours: number[];
  capacity: number[];
  levels: LoadLevel[];
};

export type Workload = { weeks: string[]; rows: WorkloadRow[]; undated: number };

/**
 * Estimated open hours per person per ISO week for the next `count` weeks (the first one is the
 * current week and also holds everything overdue). Tasks without a due date are not counted but
 * reported in `undated`. The last row is "Nicht zugewiesen".
 */
export async function getWorkload(actor: Actor, today: string, count = 8): Promise<Workload> {
  const weeks = weekStarts(today, count);
  const windowEnd = resolveRelativeDue(addDays(weeks[weeks.length - 1] as string, 7), 0, "00:00");
  const [tasks, staff, undated] = await Promise.all([
    db
      .select({
        assigneeId: task.assigneeId,
        dueAt: task.dueAt,
        minutes: task.estimateMinutes,
      })
      .from(task)
      .where(
        and(
          visibleTasks(actor),
          isOwnWorkItem(),
          inArray(task.status, OPEN),
          notOfPastEvent(today),
          isNotNull(task.dueAt),
          lt(task.dueAt, windowEnd),
        ),
      ),
    db
      .select({ id: staffMember.id, name: staffMember.displayName })
      .from(staffMember)
      .where(and(eq(staffMember.active, true), isNull(staffMember.archivedAt)))
      .orderBy(asc(staffMember.displayName)),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(task)
      .where(
        and(
          visibleTasks(actor),
          isOwnWorkItem(),
          inArray(task.status, OPEN),
          notOfPastEvent(today),
          isNull(task.dueAt),
        ),
      ),
  ]);
  const contracts = await contractsOf(staff.map((s) => s.id));

  const minutes = new Map<string | null, number[]>();
  const slot = (id: string | null) => {
    let list = minutes.get(id);
    if (!list) {
      list = new Array<number>(weeks.length).fill(0);
      minutes.set(id, list);
    }
    return list;
  };
  for (const t of tasks) {
    const week = loadWeekStart(t.dueAt ? berlinDay(t.dueAt) : null, today);
    const at = week ? weeks.indexOf(week) : -1;
    if (at >= 0) (slot(t.assigneeId)[at] as number) += t.minutes;
  }

  const rows: WorkloadRow[] = staff.map((s) => {
    const capacity = weeks.map((w) => weeklyCapacityHours(contracts.get(s.id) ?? [], w));
    const hours = slot(s.id).map((m) => m / 60);
    return {
      staffMemberId: s.id,
      name: s.name,
      hours,
      capacity,
      levels: hours.map((h, i) => loadLevel(h, capacity[i] as number)),
    };
  });
  const open = slot(null).map((m) => m / 60);
  rows.push({
    staffMemberId: null,
    name: null,
    hours: open,
    capacity: weeks.map(() => 0),
    levels: open.map(() => "ok" as const),
  });
  return { weeks, rows, undated: undated[0]?.n ?? 0 };
}

export type SeasonWorkload = HiringSignal & {
  season: number;
  /** Staff counted for capacity. */
  staffCount: number;
};

/**
 * Season strip on the Übersicht (not wired yet): estimated task hours per month of a season against
 * the team's capacity, and the hiring signal "≈ x Minijobber/Monat zusätzlich".
 *
 * - Demand: estimate of every non-cancelled task of the season's events (open and done), in the month
 *   of its due date (the event's first day if it has none).
 * - Capacity: active staff, weekly hours from the contract valid mid-month (default 20 h), scaled to
 *   the month by days ÷ 7.
 * - Assumption: one additional Minijobber covers 40 h per month (`MINIJOBBER_HOURS_PER_MONTH`).
 */
export async function seasonWorkload(actor: Actor, season: number): Promise<SeasonWorkload> {
  const monthExpr = sql<string>`to_char(coalesce((timezone('Europe/Berlin', ${task.dueAt}))::date, ${event.startsOn}), 'YYYY-MM')`;
  const [demand, bounds, staff] = await Promise.all([
    db
      .select({
        month: monthExpr,
        minutes: sql<number>`coalesce(sum(${task.estimateMinutes}), 0)::int`,
      })
      .from(task)
      .innerJoin(event, eq(event.id, task.eventId))
      .where(
        and(
          eq(event.season, season),
          ne(event.status, "cancelled"),
          ne(task.status, "cancelled"),
          visibleEvents(actor),
        ),
      )
      .groupBy(monthExpr),
    db
      .select({
        first: sql<string | null>`min(${event.startsOn})`,
        last: sql<string | null>`max(${event.endsOn})`,
      })
      .from(event)
      .where(and(eq(event.season, season), ne(event.status, "cancelled"), visibleEvents(actor))),
    db
      .select({ id: staffMember.id })
      .from(staffMember)
      .where(and(eq(staffMember.active, true), isNull(staffMember.archivedAt))),
  ]);
  const contracts = await contractsOf(staff.map((s) => s.id));

  const demandBy = new Map(demand.map((d) => [d.month, d.minutes / 60]));
  const months = new Set<string>(demandBy.keys());
  const { first, last } = bounds[0] ?? { first: null, last: null };
  if (first && last) {
    for (let m = Number(first.slice(5, 7)); m <= Number(last.slice(5, 7)); m++)
      months.add(`${first.slice(0, 4)}-${String(m).padStart(2, "0")}`);
  }
  const ordered = [...months].sort();
  const result = hiringSignal(
    ordered.map((month) => {
      const year = Number(month.slice(0, 4));
      const m = Number(month.slice(5, 7));
      const middle = `${month}-15`;
      const weekly = staff.reduce(
        (sum, s) => sum + weeklyCapacityHours(contracts.get(s.id) ?? [], middle),
        0,
      );
      return {
        month,
        demandHours: demandBy.get(month) ?? 0,
        capacityHours: monthlyCapacityHours(weekly, year, m),
      };
    }),
  );
  return { ...result, season, staffCount: staff.length };
}

// ---------------------------------------------------------------------------------------------
// event tab

export type EventTaskSummary = {
  open: number;
  overdue: number;
  blocked: number;
  maxRollover: number;
  health: ReturnType<typeof taskHealth>;
};

/**
 * Count and health for the "Board" tab of the event header: top-level tasks; a task counts as overdue when it
 * or one of its open subtasks is (ADR 0021).
 */
export async function eventTaskSummary(
  actor: Actor,
  eventId: string,
  today: string,
): Promise<EventTaskSummary> {
  const none: EventTaskSummary = { open: 0, overdue: 0, blocked: 0, maxRollover: 0, health: null };
  if (!UUID.test(eventId)) return none;
  const todayStart = resolveRelativeDue(today, 0, "00:00");
  const [row] = await db
    .select({
      open: sql<number>`count(*)::int`,
      overdue: sql<number>`(count(*) filter (where ${isOverdueWithSubtasks(today, todayStart)}))::int`,
      blocked: sql<number>`(count(*) filter (where ${task.status} = 'blocked'))::int`,
      maxRollover: sql<number>`coalesce(max(${task.rolloverCount}), 0)::int`,
    })
    .from(task)
    .where(
      and(visibleTasks(actor), isTopLevel(), eq(task.eventId, eventId), inArray(task.status, OPEN)),
    );
  if (!row) return none;
  return { ...row, health: taskHealth(row) };
}

/**
 * Task dimension of the event health for several events at once (Veranstaltungen, Kalender, Übersicht):
 * the same rule as the Board tab (`taskHealth` over the open tasks the actor may see), one query for all
 * events. Events without open tasks map to null.
 */
export async function taskHealthByEvent(
  actor: Actor,
  eventIds: string[],
  today: string,
): Promise<Map<string, HealthLevel | null>> {
  const summary = await taskSummaryByEvent(actor, eventIds, today);
  return new Map([...summary].map(([id, s]) => [id, s.health]));
}

/**
 * Open top-level tasks, overdue ones (waiting tasks are not overdue; an overdue subtask makes its parent
 * overdue), blocked ones and the health per event.
 */
export async function taskSummaryByEvent(
  actor: Actor,
  eventIds: string[],
  today: string,
): Promise<Map<string, EventTaskSummary>> {
  const none: EventTaskSummary = { open: 0, overdue: 0, blocked: 0, maxRollover: 0, health: null };
  const result = new Map<string, EventTaskSummary>(eventIds.map((id) => [id, none]));
  if (eventIds.length === 0) return result;
  const todayStart = resolveRelativeDue(today, 0, "00:00");
  const rows = await db
    .select({
      eventId: task.eventId,
      open: sql<number>`count(*)::int`,
      overdue: sql<number>`(count(*) filter (where ${isOverdueWithSubtasks(today, todayStart)}))::int`,
      blocked: sql<number>`(count(*) filter (where ${task.status} = 'blocked'))::int`,
      maxRollover: sql<number>`coalesce(max(${task.rolloverCount}), 0)::int`,
    })
    .from(task)
    .where(
      and(
        visibleTasks(actor),
        isTopLevel(),
        inArray(task.eventId, eventIds),
        inArray(task.status, OPEN),
      ),
    )
    .groupBy(task.eventId);
  for (const { eventId, ...row } of rows)
    if (eventId) result.set(eventId, { ...row, health: taskHealth(row) });
  return result;
}

/** How far an event's Checkliste is: finished (done or skipped) of all top-level tasks, cancelled ones left out. */
export type ChecklistProgress = { done: number; total: number };

/**
 * Checkliste progress of several events at once (the Übersicht's weekend box), one query for all of them;
 * the same count as the event's Zusammenfassung (`taskProgress`: top-level tasks the actor may see, without
 * cancelled ones). Events without tasks map to 0 of 0.
 */
export async function checklistProgressByEvent(
  actor: Actor,
  eventIds: string[],
): Promise<Map<string, ChecklistProgress>> {
  const result = new Map<string, ChecklistProgress>(
    eventIds.map((id) => [id, { done: 0, total: 0 }]),
  );
  if (eventIds.length === 0) return result;
  const rows = await db
    .select({
      eventId: task.eventId,
      total: sql<number>`count(*)::int`,
      done: sql<number>`(count(*) filter (where ${task.status} in ('done', 'skipped')))::int`,
    })
    .from(task)
    .where(
      and(
        visibleTasks(actor),
        isTopLevel(),
        inArray(task.eventId, eventIds),
        ne(task.status, "cancelled"),
      ),
    )
    .groupBy(task.eventId);
  for (const { eventId, done, total } of rows) if (eventId) result.set(eventId, { done, total });
  return result;
}

// ---------------------------------------------------------------------------------------------
// detail

export type TaskDetail = {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatusKey;
  waitingReason: string | null;
  skippedReason: string | null;
  category: BoardTask["category"];
  priority: BoardTask["priority"];
  source: BoardTask["source"];
  eventId: string | null;
  eventName: string | null;
  isKey: boolean;
  dueOn: string | null;
  dueOverridden: boolean;
  /** Hand-edited at all (carried so an undo can restore it together with `dueOverridden`). */
  customized: boolean;
  estimateMinutes: number;
  effortFeedback: "as_planned" | "longer" | "shorter" | null;
  assigneeId: string | null;
  assigneeName: string | null;
  assigneeHasEmail: boolean;
  assigneeHasPhone: boolean;
  /** "Benachrichtigung senden an": channels, when, and the custom instant (ISO). */
  notify: { channels: NotifyChannel[]; timing: NotifyTiming | null; at: string | null };
  /** Who set the notification (the recipient while Team is hidden); null name = deleted user. */
  notifyUser: { id: string; name: string } | null;
  /** The signed-in user as recipient: their own email (theirs to see) and whether they have a phone. */
  notifySelf: NotifySelf;
  dutyRoleName: { de: string; en: string } | null;
  rolloverCount: number;
  requiresNote: boolean;
  requiresPhoto: boolean;
  requiresAttachment: boolean;
  completedAt: string | null;
  completedByName: string | null;
  /** The parent when this task is a subtask (ADR 0021), else null. */
  parent: { id: string; title: string; status: TaskStatusKey } | null;
  /** Subtasks (not deleted ones), in their order. Empty for a subtask (one level). */
  subtasks: SubtaskRow[];
  /** Files attached to the task (photos and attachments: the evidence), newest first. */
  documents: DocumentRow[];
  hasPhoto: boolean;
  hasAttachment: boolean;
  /** `YYYY-MM-DD` the task is snoozed until (still in the future), else null. */
  snoozedUntil: string | null;
  /** The template no longer contains this task (a template change was applied). */
  removedFromTemplate: boolean;
  /** The optional note given when the task was marked done (from the audit entry), else null. */
  completionNote: string | null;
  activity: { id: string; action: string; at: string; actorName: string | null; diff: unknown }[];
  link: string;
};

/** One subtask as the task drawer lists it (tick, title, assignee, due). */
export type SubtaskRow = {
  id: string;
  title: string;
  status: TaskStatusKey;
  dueOn: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
  /** Open and due before today (not waiting, not snoozed). */
  overdue: boolean;
  /** For the undo of a due-date edit in the drawer (`TaskPatch.restoreFlags`). */
  dueOverridden: boolean;
  customized: boolean;
};

/** One task with its subtasks and activity (its audit entries), or null if the actor may not see it. */
export async function getTaskDetail(
  actor: Actor,
  taskId: string,
  today: string = berlinDay(new Date()),
): Promise<TaskDetail | null> {
  if (!UUID.test(taskId)) return null;
  const assignee = db
    .select({
      id: staffMember.id,
      name: staffMember.displayName,
      hasEmail: sql<boolean>`coalesce(btrim(${staffMember.email}) <> '', false)`.as("has_email"),
      hasPhone: sql<boolean>`coalesce(btrim(${staffMember.phoneE164}) <> '', false)`.as(
        "has_phone",
      ),
    })
    .from(staffMember)
    .as("assignee");
  const [row] = await db
    .select({
      t: task,
      eventName: event.name,
      assigneeName: assignee.name,
      assigneeHasEmail: assignee.hasEmail,
      assigneeHasPhone: assignee.hasPhone,
      notifyUserName: user.name,
      roleDe: dutyRole.nameDe,
      roleEn: dutyRole.nameEn,
    })
    .from(task)
    .leftJoin(event, eq(event.id, task.eventId))
    .leftJoin(assignee, eq(assignee.id, task.assigneeId))
    .leftJoin(user, eq(user.id, task.notifyUserId))
    .leftJoin(dutyRole, eq(dutyRole.id, task.dutyRoleId))
    .where(and(eq(task.id, taskId), visibleTasks(actor)));
  if (!row) return null;
  const notifySelf = await getNotifySelf(actor);
  const t = row.t;

  const [subtasks, parent, activity, completedBy, documents] = await Promise.all([
    listSubtasks(taskId, today),
    t.parentTaskId
      ? db
          .select({ id: task.id, title: task.title, status: task.status })
          .from(task)
          .where(eq(task.id, t.parentTaskId))
      : Promise.resolve([]),
    db
      .select({
        id: auditLog.id,
        action: auditLog.action,
        at: auditLog.at,
        actorName: user.name,
        diff: auditLog.diff,
      })
      .from(auditLog)
      .leftJoin(user, eq(user.id, auditLog.actorId))
      .where(and(eq(auditLog.entityType, "task"), eq(auditLog.entityId, taskId)))
      .orderBy(desc(auditLog.at), desc(auditLog.id))
      .limit(100),
    t.completedByStaffMemberId
      ? db
          .select({ name: staffMember.displayName })
          .from(staffMember)
          .where(eq(staffMember.id, t.completedByStaffMemberId))
      : Promise.resolve([]),
    listLinkedDocuments(actor, "taskId", [taskId]),
  ]);
  const files = documents.get(taskId) ?? [];
  const evidence = fileEvidenceOf(files.map((f) => f.kind));

  // The completion note sits on the audit entry that made the task done (newest first).
  const completionNote =
    t.status === "done"
      ? (activity
          .map((a) => a.diff as { note?: unknown; after?: { status?: string } } | null)
          .find((d) => d?.after?.status === "done" && typeof d.note === "string")?.note ?? null)
      : null;

  return {
    id: t.id,
    title: t.title,
    description: t.description,
    status: t.status,
    waitingReason: t.waitingReason,
    skippedReason: t.skippedReason,
    category: t.category,
    priority: t.priority,
    source: t.source,
    eventId: t.eventId,
    eventName: row.eventName,
    isKey: t.isKey,
    dueOn: t.dueAt ? berlinDay(t.dueAt) : null,
    dueOverridden: t.dueOverridden,
    customized: t.customized,
    estimateMinutes: t.estimateMinutes,
    effortFeedback: t.effortFeedback,
    assigneeId: t.assigneeId,
    assigneeName: row.assigneeName,
    assigneeHasEmail: row.assigneeHasEmail ?? false,
    assigneeHasPhone: row.assigneeHasPhone ?? false,
    notify: {
      channels: NOTIFY_CHANNELS.filter((c) => t.notifyChannels.includes(c)),
      timing: t.notifyTiming,
      at: t.notifyAt ? t.notifyAt.toISOString() : null,
    },
    notifyUser: t.notifyUserId ? { id: t.notifyUserId, name: row.notifyUserName ?? "" } : null,
    notifySelf,
    dutyRoleName: row.roleDe && row.roleEn ? { de: row.roleDe, en: row.roleEn } : null,
    rolloverCount: t.rolloverCount,
    requiresNote: t.requiresNote,
    requiresPhoto: t.requiresPhoto,
    requiresAttachment: t.requiresAttachment,
    completedAt: t.completedAt ? t.completedAt.toISOString() : null,
    completedByName: completedBy[0]?.name ?? null,
    parent: parent[0] ?? null,
    subtasks,
    documents: files,
    hasPhoto: evidence.hasPhoto,
    hasAttachment: evidence.hasAttachment,
    snoozedUntil: t.snoozedUntil && t.snoozedUntil > today ? t.snoozedUntil : null,
    removedFromTemplate: t.removedFromTemplate,
    completionNote: typeof completionNote === "string" ? completionNote : null,
    activity: activity.map((a) => ({ ...a, at: a.at.toISOString() })),
    link: taskLink(t.id, t.eventId),
  };
}

/** The subtasks of a task (not deleted ones): board order, then due date and creation. */
export async function listSubtasks(parentId: string, today: string): Promise<SubtaskRow[]> {
  if (!UUID.test(parentId)) return [];
  const rows = await db
    .select({
      id: task.id,
      title: task.title,
      status: task.status,
      dueAt: task.dueAt,
      snoozedUntil: task.snoozedUntil,
      assigneeId: task.assigneeId,
      assigneeName: staffMember.displayName,
      dueOverridden: task.dueOverridden,
      customized: task.customized,
    })
    .from(task)
    .leftJoin(staffMember, eq(staffMember.id, task.assigneeId))
    .where(and(eq(task.parentTaskId, parentId), ne(task.status, "cancelled")))
    .orderBy(
      asc(task.boardSort),
      sql`${task.dueAt} asc nulls last`,
      asc(task.createdAt),
      asc(task.id),
    );
  return rows.map((r) => {
    const dueOn = r.dueAt ? berlinDay(r.dueAt) : null;
    return {
      id: r.id,
      title: r.title,
      status: r.status,
      dueOn,
      assigneeId: r.assigneeId,
      assigneeName: r.assigneeName,
      overdue: isSubtaskOverdue({ status: r.status, dueOn, snoozedUntil: r.snoozedUntil }, today),
      dueOverridden: r.dueOverridden,
      customized: r.customized,
    };
  });
}

// ---------------------------------------------------------------------------------------------
// Übersicht + Kalender feeds (shapes in ./due)

const DUE_LIMIT = 300;

/**
 * Open and overdue tasks in the actor's Übersicht scope (KPI "Offene Aufgaben"): top-level tasks (or the actor's
 * own list); a task with an overdue subtask counts as overdue, once.
 */
export async function openTaskCounts(
  actor: Actor,
  today: string,
): Promise<{ open: number; overdue: number }> {
  const todayStart = resolveRelativeDue(today, 0, "00:00");
  const [row] = await db
    .select({
      open: sql<number>`count(*)::int`,
      overdue: sql<number>`(count(*) filter (where ${isOverdueWithSubtasks(today, todayStart)}))::int`,
    })
    .from(task)
    .where(
      and(
        deadlineScope(actor),
        inArray(task.status, OPEN),
        notSnoozed(today),
        notOfPastEvent(today),
      ),
    );
  return { open: row?.open ?? 0, overdue: row?.overdue ?? 0 };
}

export type PastEventCleanupRow = {
  id: string;
  name: string;
  startsOn: string;
  endsOn: string;
  typeKey: string;
  color: string | null;
  openTasks: number;
};

/**
 * Past markets (last day more than 7 days ago) that still have open tasks, newest first, with their open
 * task counts: the cleanup view on the Übersicht. Snoozed tasks count too; nothing hides there.
 */
export async function pastEventCleanup(
  actor: Actor,
  today: string,
): Promise<{ events: PastEventCleanupRow[]; total: number }> {
  const openTasks = sql<number>`count(${task.id})::int`;
  const events = await db
    .select({
      id: event.id,
      name: event.name,
      startsOn: event.startsOn,
      endsOn: event.endsOn,
      typeKey: eventType.key,
      color: eventPreset.color,
      openTasks,
    })
    .from(task)
    .innerJoin(event, eq(event.id, task.eventId))
    .innerJoin(eventType, eq(eventType.id, event.eventTypeId))
    .leftJoin(eventPreset, eq(eventPreset.id, event.presetId))
    .where(
      and(
        deadlineScope(actor),
        inArray(task.status, OPEN),
        lt(event.endsOn, pastEventCutoff(today)),
        // Follow-up work due today or later is not a leftover (`isPastMarketLeftover`).
        or(isNull(task.dueAt), lt(task.dueAt, resolveRelativeDue(today, 0, "00:00"))),
      ),
    )
    .groupBy(event.id, eventType.key, eventPreset.color)
    .orderBy(desc(event.endsOn), asc(event.name));
  return { events, total: events.reduce((sum, e) => sum + e.openTasks, 0) };
}

/** Estimated minutes of the open tasks per event (column "Aufwand" of the weekend table). */
export async function openEffortByEvent(
  actor: Actor,
  eventIds: string[],
): Promise<Map<string, number>> {
  if (eventIds.length === 0) return new Map();
  const rows = await db
    .select({
      eventId: task.eventId,
      minutes: sql<number>`coalesce(sum(${task.estimateMinutes}), 0)::int`,
    })
    .from(task)
    .where(and(visibleTasks(actor), inArray(task.eventId, eventIds), inArray(task.status, OPEN)))
    .groupBy(task.eventId);
  return new Map(rows.flatMap((r) => (r.eventId ? [[r.eventId, r.minutes] as const] : [])));
}

/**
 * Open tasks that are overdue, due today or within the next 7 days (Übersicht "Heute fällig"), plus tasks with
 * an overdue subtask (flagged as overdue through their parent, ADR 0021; an undated one shows that subtask's
 * date). Each carries its subtask progress.
 */
export async function dueItems(actor: Actor, today: string): Promise<DueItem[]> {
  const until = resolveRelativeDue(addDays(today, 8), 0, "00:00");
  const todayStart = resolveRelativeDue(today, 0, "00:00");
  const sub = subtaskAggregates(today, todayStart);
  const firstOverdueSubtask = sql<Date | null>`(select min(st."due_at") from "app"."task" st
    where st."parent_task_id" = ${task.id} and st."status" in ('todo', 'in_progress', 'blocked')
      and st."due_at" < ${todayStart} and (st."snoozed_until" is null or st."snoozed_until" <= ${today}))`;
  const rows = await db
    .select({
      id: task.id,
      title: task.title,
      dueAt: task.dueAt,
      eventId: task.eventId,
      eventName: event.name,
      eventTypeKey: eventType.key,
      eventColor: eventPreset.color,
      eventStartsOn: event.startsOn,
      isKey: task.isKey,
      status: task.status,
      assigneeName: staffMember.displayName,
      subtasksTotal: sub.subtasksTotal,
      subtasksDone: sub.subtasksDone,
      subtasksOverdue: sub.subtasksOverdue,
      subtasksOpen: sub.subtasksOpen,
      firstOverdueSubtask,
    })
    .from(task)
    .leftJoin(event, eq(event.id, task.eventId))
    .leftJoin(eventType, eq(eventType.id, event.eventTypeId))
    .leftJoin(eventPreset, eq(eventPreset.id, event.presetId))
    .leftJoin(staffMember, eq(staffMember.id, task.assigneeId))
    .where(
      and(
        deadlineScope(actor),
        inArray(task.status, OPEN),
        notSnoozed(today),
        notOfPastEvent(today),
        or(and(isNotNull(task.dueAt), lt(task.dueAt, until)), sql`${sub.subtasksOverdue} > 0`),
      ),
    )
    .orderBy(asc(task.dueAt), asc(task.title))
    .limit(DUE_LIMIT);
  return rows.map((r) => {
    const overdueSubtask = r.subtasksOverdue > 0;
    const dueOn = berlinDay((r.dueAt ?? new Date(r.firstOverdueSubtask as Date | string)) as Date);
    return {
      kind: "task" as const,
      id: r.id,
      title: r.title,
      dueOn,
      urgency: overdueSubtask
        ? ("overdue" as const)
        : isWaitingPastDue({ status: r.status, dueOn }, today)
          ? ("waiting" as const)
          : dueOn < today
            ? ("overdue" as const)
            : dueOn === today
              ? ("today" as const)
              : ("soon" as const),
      href: taskLink(r.id, r.eventId),
      meta: r.eventName ?? undefined,
      metaHref: r.eventId ? `/veranstaltungen/${r.eventId}` : undefined,
      eventId: r.eventId,
      eventTypeKey: r.eventTypeKey,
      eventColor: r.eventColor,
      eventStartsOn: r.eventStartsOn,
      isKey: r.isKey,
      assigneeName: r.assigneeName,
      ...(r.subtasksTotal > 0
        ? {
            subtasks: {
              done: r.subtasksDone,
              total: r.subtasksTotal,
              open: r.subtasksOpen,
              overdue: r.subtasksOverdue,
            },
          }
        : {}),
    };
  });
}

const CALENDAR_LIMIT = 500;

/** Tasks with a due date in [from, to] for the Kalender layer "Aufgaben" (open ones; overdue = kritisch). */
export async function calendarItems(
  actor: Actor,
  from: string,
  to: string,
  today: string = berlinDay(new Date()),
  /** "Nur meine Zuständigkeit": only the actor's own tasks, even for owners and managers. */
  mineOnly = false,
): Promise<CalendarItem[]> {
  const start = resolveRelativeDue(from, 0, "00:00");
  const end = resolveRelativeDue(addDays(to, 1), 0, "00:00");
  const sub = subtaskAggregates(today, resolveRelativeDue(today, 0, "00:00"));
  const rows = await db
    .select({
      id: task.id,
      title: task.title,
      dueAt: task.dueAt,
      eventId: task.eventId,
      status: task.status,
      subtasksOverdue: sub.subtasksOverdue,
    })
    .from(task)
    .where(
      and(
        deadlineScope(actor, mineOnly),
        inArray(task.status, OPEN),
        notSnoozed(today),
        notOfPastEvent(today),
        isNotNull(task.dueAt),
        gte(task.dueAt, start),
        lt(task.dueAt, end),
      ),
    )
    .orderBy(asc(task.dueAt), asc(task.title))
    .limit(CALENDAR_LIMIT);
  return rows.map((r) => {
    const date = berlinDay(r.dueAt as Date);
    return {
      layer: "tasks" as const,
      id: r.id,
      date,
      title: r.title,
      href: taskLink(r.id, r.eventId),
      // An overdue subtask flags its parent (ADR 0021).
      tone:
        r.subtasksOverdue > 0
          ? ("critical" as const)
          : isWaitingPastDue({ status: r.status, dueOn: date }, today)
            ? ("neutral" as const)
            : date < today
              ? ("critical" as const)
              : date === today
                ? ("warn" as const)
                : ("neutral" as const),
    };
  });
}

export { DEFAULT_WEEKLY_CAPACITY_HOURS };
