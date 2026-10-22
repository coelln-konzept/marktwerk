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
  type LoadLevel,
  loadLevel,
  loadWeekStart,
  mondayOf,
  monthlyCapacityHours,
  OPEN_STATUSES,
  resolveRelativeDue,
  type TaskStatusKey,
  taskHealth,
  taskLink,
  weeklyCapacityHours,
  weekStarts,
} from "@marktwerk/core";
import {
  auditLog,
  dutyRole,
  employmentContract,
  event,
  eventDuty,
  staffMember,
  task,
  taskCheckItem,
  taskComment,
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
  ne,
  or,
  type SQL,
  sql,
} from "drizzle-orm";
import { type Actor, visibleEvents } from "../actor";
import { db } from "../db";
import { visibleTasks } from "../task-scope";
import { type DocumentRow, listLinkedDocuments } from "./documents";
import type { CalendarItem, DueItem } from "./due";

const UUID = /^[0-9a-f-]{36}$/i;
const OPEN = [...OPEN_STATUSES];

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
  checkTotal: number;
  checkDone: number;
  /** Day the task was finished (done tasks), `YYYY-MM-DD`. */
  completedOn: string | null;
  requiresNote: boolean;
  requiresPhoto: boolean;
  requiresAttachment: boolean;
};

export type BoardScope = {
  /** One event's board; omitted = across all events (and tasks without one). */
  eventId?: string;
  /**
   * Open tasks due later than this many days from today are left out (the cross-event board would
   * otherwise hold the whole season). Tasks without a due date stay. null = no limit.
   */
  horizonDays?: number | null;
};

/** Hard cap per query; `truncated` tells the page to say so. */
const BOARD_LIMIT = 1500;

export type BoardData = { tasks: BoardTask[]; truncated: boolean };

/**
 * Cards for the board: open tasks plus finished ones of the last 14 days (Erledigt), cancelled ones never.
 * Within a column they are in display order (`board_sort`, then due date).
 */
export async function listBoardTasks(
  actor: Actor,
  scope: BoardScope,
  today: string,
): Promise<BoardData> {
  if (scope.eventId && !UUID.test(scope.eventId)) return { tasks: [], truncated: false };
  const since = resolveRelativeDue(doneVisibleSince(today), 0, "00:00");
  const horizon =
    scope.horizonDays === null || scope.horizonDays === undefined
      ? null
      : resolveRelativeDue(addDays(today, scope.horizonDays + 1), 0, "00:00");

  const checkTotal = sql<number>`(select count(*)::int from ${taskCheckItem} where ${taskCheckItem.taskId} = ${task.id})`;
  const checkDone = sql<number>`(select count(*)::int from ${taskCheckItem} where ${taskCheckItem.taskId} = ${task.id} and ${taskCheckItem.done})`;

  const rows = await db
    .select({
      id: task.id,
      title: task.title,
      status: task.status,
      category: task.category,
      priority: task.priority,
      source: task.source,
      eventId: task.eventId,
      eventName: event.name,
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
      checkTotal,
      checkDone,
    })
    .from(task)
    .leftJoin(event, eq(event.id, task.eventId))
    .leftJoin(staffMember, eq(staffMember.id, task.assigneeId))
    .where(
      and(
        visibleTasks(actor),
        scope.eventId ? eq(task.eventId, scope.eventId) : undefined,
        or(
          and(
            inArray(task.status, OPEN),
            horizon ? or(isNull(task.dueAt), lt(task.dueAt, horizon)) : undefined,
          ),
          and(
            inArray(task.status, ["done", "skipped"]),
            gte(sql`coalesce(${task.completedAt}, ${task.updatedAt})`, since),
          ),
        ),
      ),
    )
    .orderBy(sql`${task.dueAt} asc nulls last`, asc(task.createdAt))
    .limit(BOARD_LIMIT + 1);

  const truncated = rows.length > BOARD_LIMIT;
  const cards = rows.slice(0, BOARD_LIMIT).map((r): BoardTask & { sortKey: typeof r } => ({
    id: r.id,
    title: r.title,
    status: r.status,
    category: r.category,
    priority: r.priority,
    source: r.source,
    eventId: r.eventId,
    eventName: r.eventName,
    dueOn: r.dueAt ? berlinDay(r.dueAt) : null,
    estimateMinutes: r.estimateMinutes,
    assigneeId: r.assigneeId,
    assigneeName: r.assigneeName,
    waitingReason: r.waitingReason,
    boardColumn: r.boardColumn,
    boardSort: r.boardSort,
    column: boardColumnFor(r, today),
    rolloverCount: r.rolloverCount,
    checkTotal: r.checkTotal,
    checkDone: r.checkDone,
    completedOn: r.completedAt ? berlinDay(r.completedAt) : null,
    requiresNote: r.requiresNote,
    requiresPhoto: r.requiresPhoto,
    requiresAttachment: r.requiresAttachment,
    sortKey: r,
  }));
  cards.sort((a, b) => compareCards(a.sortKey, b.sortKey));
  return { tasks: cards.map(({ sortKey: _sortKey, ...card }) => card), truncated };
}

// ---------------------------------------------------------------------------------------------
// people

export type StaffOption = { id: string; displayName: string };

/** Active staff, for the assignee menus. */
export async function listStaffOptions(): Promise<StaffOption[]> {
  return db
    .select({ id: staffMember.id, displayName: staffMember.displayName })
    .from(staffMember)
    .where(and(eq(staffMember.active, true), isNull(staffMember.archivedAt)))
    .orderBy(asc(staffMember.displayName));
}

export type EventOption = { id: string; name: string; startsOn: string };

/** Events a task can be created on: not over for more than 30 days. */
export async function listTaskEventOptions(actor: Actor, today: string): Promise<EventOption[]> {
  return db
    .select({ id: event.id, name: event.name, startsOn: event.startsOn })
    .from(event)
    .where(
      and(
        visibleEvents(actor),
        ne(event.status, "cancelled"),
        gte(event.endsOn, addDays(today, -30)),
      ),
    )
    .orderBy(asc(event.startsOn))
    .limit(80);
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
          inArray(task.status, OPEN),
          scope.eventId && UUID.test(scope.eventId) ? eq(task.eventId, scope.eventId) : undefined,
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
          inArray(task.status, OPEN),
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
          inArray(task.status, OPEN),
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
      .where(and(visibleTasks(actor), inArray(task.status, OPEN), isNull(task.dueAt))),
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

/** Count and health for the "Board" tab of the event header. */
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
      overdue: sql<number>`(count(*) filter (where ${task.dueAt} < ${todayStart}))::int`,
      blocked: sql<number>`(count(*) filter (where ${task.status} = 'blocked'))::int`,
      maxRollover: sql<number>`coalesce(max(${task.rolloverCount}), 0)::int`,
    })
    .from(task)
    .where(and(visibleTasks(actor), eq(task.eventId, eventId), inArray(task.status, OPEN)));
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
  const result = new Map<string, HealthLevel | null>(eventIds.map((id) => [id, null]));
  if (eventIds.length === 0) return result;
  const todayStart = resolveRelativeDue(today, 0, "00:00");
  const rows = await db
    .select({
      eventId: task.eventId,
      open: sql<number>`count(*)::int`,
      overdue: sql<number>`(count(*) filter (where ${task.dueAt} < ${todayStart}))::int`,
      blocked: sql<number>`(count(*) filter (where ${task.status} = 'blocked'))::int`,
      maxRollover: sql<number>`coalesce(max(${task.rolloverCount}), 0)::int`,
    })
    .from(task)
    .where(and(visibleTasks(actor), inArray(task.eventId, eventIds), inArray(task.status, OPEN)))
    .groupBy(task.eventId);
  for (const row of rows) if (row.eventId) result.set(row.eventId, taskHealth(row));
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
  dueOn: string | null;
  dueOverridden: boolean;
  estimateMinutes: number;
  effortFeedback: "as_planned" | "longer" | "shorter" | null;
  assigneeId: string | null;
  assigneeName: string | null;
  dutyRoleName: { de: string; en: string } | null;
  rolloverCount: number;
  requiresNote: boolean;
  requiresPhoto: boolean;
  requiresAttachment: boolean;
  completedAt: string | null;
  completedByName: string | null;
  checkItems: { id: string; title: string; done: boolean }[];
  /** Files attached to the task (photos and attachments: the evidence), newest first. */
  documents: DocumentRow[];
  hasPhoto: boolean;
  hasAttachment: boolean;
  comments: {
    id: string;
    body: string;
    at: string;
    authorName: string | null;
    mentioned: string[];
  }[];
  activity: { id: string; action: string; at: string; actorName: string | null; diff: unknown }[];
  link: string;
};

/** One task with check items, comments and activity (its audit entries), or null if the actor may not see it. */
export async function getTaskDetail(actor: Actor, taskId: string): Promise<TaskDetail | null> {
  if (!UUID.test(taskId)) return null;
  const assignee = db
    .select({ id: staffMember.id, name: staffMember.displayName })
    .from(staffMember)
    .as("assignee");
  const [row] = await db
    .select({
      t: task,
      eventName: event.name,
      assigneeName: assignee.name,
      roleDe: dutyRole.nameDe,
      roleEn: dutyRole.nameEn,
    })
    .from(task)
    .leftJoin(event, eq(event.id, task.eventId))
    .leftJoin(assignee, eq(assignee.id, task.assigneeId))
    .leftJoin(dutyRole, eq(dutyRole.id, task.dutyRoleId))
    .where(and(eq(task.id, taskId), visibleTasks(actor)));
  if (!row) return null;
  const t = row.t;

  const [items, comments, activity, completedBy, documents] = await Promise.all([
    db
      .select({ id: taskCheckItem.id, title: taskCheckItem.title, done: taskCheckItem.done })
      .from(taskCheckItem)
      .where(eq(taskCheckItem.taskId, taskId))
      .orderBy(asc(taskCheckItem.sort), asc(taskCheckItem.createdAt)),
    db
      .select({
        id: taskComment.id,
        body: taskComment.body,
        at: taskComment.createdAt,
        authorStaff: staffMember.displayName,
        authorUser: user.name,
        mentioned: taskComment.mentionedStaffMemberIds,
      })
      .from(taskComment)
      .leftJoin(staffMember, eq(staffMember.id, taskComment.authorStaffMemberId))
      .leftJoin(user, eq(user.id, taskComment.authorUserId))
      .where(and(eq(taskComment.taskId, taskId), isNull(taskComment.archivedAt)))
      .orderBy(asc(taskComment.createdAt)),
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

  // names for @mentions in comments
  const mentionIds = [...new Set(comments.flatMap((c) => c.mentioned))];
  const names = mentionIds.length
    ? new Map(
        (
          await db
            .select({ id: staffMember.id, name: staffMember.displayName })
            .from(staffMember)
            .where(inArray(staffMember.id, mentionIds))
        ).map((s) => [s.id, s.name]),
      )
    : new Map<string, string>();

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
    dueOn: t.dueAt ? berlinDay(t.dueAt) : null,
    dueOverridden: t.dueOverridden,
    estimateMinutes: t.estimateMinutes,
    effortFeedback: t.effortFeedback,
    assigneeId: t.assigneeId,
    assigneeName: row.assigneeName,
    dutyRoleName: row.roleDe && row.roleEn ? { de: row.roleDe, en: row.roleEn } : null,
    rolloverCount: t.rolloverCount,
    requiresNote: t.requiresNote,
    requiresPhoto: t.requiresPhoto,
    requiresAttachment: t.requiresAttachment,
    completedAt: t.completedAt ? t.completedAt.toISOString() : null,
    completedByName: completedBy[0]?.name ?? null,
    checkItems: items,
    documents: files,
    hasPhoto: evidence.hasPhoto,
    hasAttachment: evidence.hasAttachment,
    comments: comments.map((c) => ({
      id: c.id,
      body: c.body,
      at: c.at.toISOString(),
      authorName: c.authorStaff ?? c.authorUser,
      mentioned: c.mentioned.map((id) => names.get(id)).filter((n): n is string => !!n),
    })),
    activity: activity.map((a) => ({ ...a, at: a.at.toISOString() })),
    link: taskLink(t.id, t.eventId),
  };
}

// ---------------------------------------------------------------------------------------------
// Übersicht + Kalender feeds (shapes in ./due)

/**
 * Whose tasks the Übersicht and the Kalender show: owners and managers see all visible tasks, everybody
 * else their own (the Kalender narrows further with "Nur meine Zuständigkeit").
 */
function deadlineScope(actor: Actor, mineOnly = false): SQL {
  if (!mineOnly && (actor.role === "owner" || actor.role === "manager")) return visibleTasks(actor);
  if (!actor.staffMemberId) return sql`false`;
  return and(visibleTasks(actor), eq(task.assigneeId, actor.staffMemberId)) as SQL;
}

const DUE_LIMIT = 300;

/** Open and overdue tasks in the actor's Übersicht scope (KPI "Offene Aufgaben"). */
export async function openTaskCounts(
  actor: Actor,
  today: string,
): Promise<{ open: number; overdue: number }> {
  const todayStart = resolveRelativeDue(today, 0, "00:00");
  const [row] = await db
    .select({
      open: sql<number>`count(*)::int`,
      overdue: sql<number>`(count(*) filter (where ${task.dueAt} < ${todayStart}))::int`,
    })
    .from(task)
    .where(and(deadlineScope(actor), inArray(task.status, OPEN)));
  return { open: row?.open ?? 0, overdue: row?.overdue ?? 0 };
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

/** Open tasks that are overdue, due today or within the next 7 days (Übersicht "Heute fällig"). */
export async function dueItems(actor: Actor, today: string): Promise<DueItem[]> {
  const until = resolveRelativeDue(addDays(today, 8), 0, "00:00");
  const rows = await db
    .select({
      id: task.id,
      title: task.title,
      dueAt: task.dueAt,
      eventId: task.eventId,
      eventName: event.name,
      assigneeName: staffMember.displayName,
    })
    .from(task)
    .leftJoin(event, eq(event.id, task.eventId))
    .leftJoin(staffMember, eq(staffMember.id, task.assigneeId))
    .where(
      and(
        deadlineScope(actor),
        inArray(task.status, OPEN),
        isNotNull(task.dueAt),
        lt(task.dueAt, until),
      ),
    )
    .orderBy(asc(task.dueAt), asc(task.title))
    .limit(DUE_LIMIT);
  return rows.map((r) => {
    const dueOn = berlinDay(r.dueAt as Date);
    return {
      kind: "task" as const,
      id: r.id,
      title: r.title,
      dueOn,
      urgency:
        dueOn < today
          ? ("overdue" as const)
          : dueOn === today
            ? ("today" as const)
            : ("soon" as const),
      href: taskLink(r.id, r.eventId),
      meta: r.eventName ?? undefined,
      metaHref: r.eventId ? `/veranstaltungen/${r.eventId}/board` : undefined,
      eventId: r.eventId,
      assigneeName: r.assigneeName,
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
  const rows = await db
    .select({ id: task.id, title: task.title, dueAt: task.dueAt, eventId: task.eventId })
    .from(task)
    .where(
      and(
        deadlineScope(actor, mineOnly),
        inArray(task.status, OPEN),
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
      tone:
        date < today
          ? ("critical" as const)
          : date === today
            ? ("warn" as const)
            : ("neutral" as const),
    };
  });
}

export { DEFAULT_WEEKLY_CAPACITY_HOURS };
