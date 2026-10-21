import {
  BACKLOG_AFTER_DAYS,
  DEFAULT_PERMIT_APPLY_REMINDER_DAYS,
  DEFAULT_PERMIT_DECISION_REMINDER_DAYS,
  DEFAULT_PERMIT_EXPIRY_REMINDER_DAYS,
  DEFAULT_TASK_REMINDER_DAYS,
  type DueState,
  daysBetween,
  dueState,
  ESCALATION_AFTER_DAYS,
  reminderDedupeKey,
  resolveRelativeDue,
} from "@marktwerk/core";
import {
  type Database,
  escalationLog,
  event,
  eventPermit,
  insertNotifications,
  type NewNotification,
  permit,
  staffMember,
  task,
} from "@marktwerk/db";
import { and, eq, inArray, isNotNull, isNull, ne, or, sql } from "drizzle-orm";
import {
  berlinDate,
  escalationRecipients,
  OPEN_TASK_STATUSES,
  queueImmediateEmails,
} from "./shared";

export type SweepResult = {
  /** New in-app notifications (reminders and escalations). */
  created: number;
  /** New escalations to the manager (also counted in `created`). */
  escalated: number;
  /** Emails queued for immediate delivery. */
  emails: number;
};

/** Clock time at which a date-only deadline ("bis 30.11.") ends. */
const DEADLINE_TIME = "23:59";

const germanDate = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;

type Staged = NewNotification & { immediate?: boolean };

/** "heute", "morgen", "in 3 Tagen" for the day count to a deadline. */
function inDays(days: number): string {
  if (days <= 0) return "heute";
  if (days === 1) return "morgen";
  return `in ${days} Tagen`;
}

function taskLink(t: { id: string; eventId: string | null }): string {
  return t.eventId
    ? `/veranstaltungen/${t.eventId}/board?detail=task:${t.id}`
    : `/board?detail=task:${t.id}`;
}

/**
 * The "nothing slips" engine. Runs every 15 minutes and must be idempotent: notifications are inserted
 * with a deterministic dedupe key (`reminderDedupeKey` from @marktwerk/core, which includes the due
 * date), so repeated sweeps never notify twice and moving a deadline re-arms its reminders.
 *
 * - Open tasks with a due date and an assignee: "fällig in n Tagen" at the stages of their priority, and
 *   "überfällig". Tasks made for a permit (`source = permit`) are left to the permit's own reminders.
 * - Permits: `permit_apply_by` (30/14/7 days, overdue) while the application is not filed,
 *   `permit_decision_due` (7 days, overdue) while it waits for the authority, and the expiry of granted
 *   permits (60/30 days) that still cover an upcoming event. Recipient is the responsible person, else the
 *   manager.
 * - Escalation (decision 2026-10-21): critical items (tasks with high priority, unfiled permits) that are
 *   still overdue one day after the deadline go to the manager only (`escalated` + `escalation_log`),
 *   with an immediate email. The assignee is not notified a second time.
 */
export async function deadlineSweep(db: Database, now: Date = new Date()): Promise<SweepResult> {
  const today = berlinDate(now);
  const managers = await escalationRecipients(db);
  const staged: Staged[] = [];

  await stageTasks(db, now, today, staged);
  await stagePermits(db, now, today, managers, staged);
  const escalated = await escalate(db, now, today, managers, staged);

  const created = await insertNotifications(db, staged);
  const emails = await queueImmediateEmails(
    db,
    staged
      .filter((s) => s.immediate)
      .map((s) => ({ recipientStaffMemberId: s.recipientStaffMemberId, dedupeKey: s.dedupeKey })),
    now,
  );
  return { created, escalated, emails };
}

// ---------------------------------------------------------------------------------------------
// Tasks

async function stageTasks(db: Database, now: Date, today: string, out: Staged[]) {
  const rows = await db
    .select({
      id: task.id,
      title: task.title,
      priority: task.priority,
      dueAt: task.dueAt,
      assigneeId: task.assigneeId,
      eventId: task.eventId,
      eventName: event.name,
    })
    .from(task)
    .leftJoin(event, eq(event.id, task.eventId))
    .where(
      and(
        inArray(task.status, [...OPEN_TASK_STATUSES]),
        isNotNull(task.dueAt),
        isNotNull(task.assigneeId),
        ne(task.source, "permit"),
        or(isNull(task.eventId), and(isNull(event.archivedAt), ne(event.status, "cancelled"))),
      ),
    );
  for (const t of rows) {
    if (!t.dueAt || !t.assigneeId) continue;
    const state = dueState(t.dueAt, now, DEFAULT_TASK_REMINDER_DAYS[t.priority]);
    if (state.kind === "none") continue;
    const dueOn = berlinDate(t.dueAt);
    if (state.kind === "overdue" && daysBetween(dueOn, today) > BACKLOG_AFTER_DAYS) continue;
    const context = t.eventName ? ` · ${t.eventName}` : "";
    const overdue = state.kind === "overdue";
    out.push({
      recipientStaffMemberId: t.assigneeId,
      reason: overdue ? "overdue" : "due_soon",
      severity: overdue ? (t.priority === "high" ? "critical" : "warning") : "info",
      subjectType: "task",
      subjectId: t.id,
      title: overdue
        ? `Überfällig: ${t.title}${context}`
        : `Fällig ${inDays(daysBetween(today, dueOn))}: ${t.title}${context}`,
      body: `Fällig am ${germanDate(dueOn)}`,
      link: taskLink(t),
      dedupeKey: reminderDedupeKey("task", t.id, state, t.dueAt),
      immediate: overdue && t.priority === "high",
    });
  }
}

// ---------------------------------------------------------------------------------------------
// Permits

type OpenPermit = {
  id: string;
  title: string;
  status: (typeof permit.status.enumValues)[number];
  applyBy: string | null;
  expectedDecisionOn: string | null;
  validUntil: string | null;
  responsibleStaffMemberId: string | null;
  responsibleName: string | null;
};

/**
 * Permits worth reminding about: not archived, and either without events (a one-off) or covering at least
 * one upcoming event that needs them. A permit whose events are all over or cancelled is history.
 */
async function relevantPermits(db: Database, today: string): Promise<OpenPermit[]> {
  const upcoming = sql<number>`(select count(*) from ${eventPermit} ep join ${event} e on e.id = ep.event_id
    where ep.permit_id = ${permit.id} and ep.required and e.archived_at is null and e.status <> 'cancelled' and e.ends_on >= ${today})`;
  const linked = sql<number>`(select count(*) from ${eventPermit} ep where ep.permit_id = ${permit.id})`;
  return db
    .select({
      id: permit.id,
      title: permit.title,
      status: permit.status,
      applyBy: permit.applyBy,
      expectedDecisionOn: permit.expectedDecisionOn,
      validUntil: permit.validUntil,
      responsibleStaffMemberId: permit.responsibleStaffMemberId,
      responsibleName: staffMember.displayName,
    })
    .from(permit)
    .leftJoin(staffMember, eq(staffMember.id, permit.responsibleStaffMemberId))
    .where(
      and(
        isNull(permit.archivedAt),
        inArray(permit.status, ["not_started", "preparing", "applied", "granted"]),
        sql`(${linked} = 0 or ${upcoming} > 0)`,
      ),
    );
}

/** Overdue for so long that it is left to the digest. */
function isBacklog(state: DueState, dueOn: string, today: string): boolean {
  return state.kind === "overdue" && daysBetween(dueOn, today) > BACKLOG_AFTER_DAYS;
}

const endOfDay = (day: string) => resolveRelativeDue(day, 0, DEADLINE_TIME);

function severityFor(state: Exclude<DueState, { kind: "none" }>, critical: boolean) {
  if (state.kind === "overdue") return critical ? ("critical" as const) : ("warning" as const);
  return state.daysBefore <= 7 ? ("warning" as const) : ("info" as const);
}

async function stagePermits(
  db: Database,
  now: Date,
  today: string,
  managers: { id: string }[],
  out: Staged[],
) {
  const permits = await relevantPermits(db, today);
  for (const p of permits) {
    const recipients = p.responsibleStaffMemberId
      ? [p.responsibleStaffMemberId]
      : managers.map((m) => m.id);
    const link = `/logbuch?genehmigung=${p.id}`;

    if ((p.status === "not_started" || p.status === "preparing") && p.applyBy) {
      const dueAt = endOfDay(p.applyBy);
      const state = dueState(dueAt, now, DEFAULT_PERMIT_APPLY_REMINDER_DAYS);
      if (state.kind !== "none" && !isBacklog(state, p.applyBy, today)) {
        for (const recipient of recipients) {
          out.push({
            recipientStaffMemberId: recipient,
            reason: "permit_apply_by",
            severity: severityFor(state, true),
            subjectType: "permit",
            subjectId: p.id,
            title:
              state.kind === "overdue"
                ? `Antrag überfällig: ${p.title}`
                : `Antrag stellen bis ${germanDate(p.applyBy)}: ${p.title}`,
            body: `Frist: ${germanDate(p.applyBy)}`,
            link,
            dedupeKey: reminderDedupeKey("permit", p.id, state, dueAt),
            immediate: state.kind === "overdue",
          });
        }
      }
    }

    if (p.status === "applied" && p.expectedDecisionOn) {
      const dueAt = endOfDay(p.expectedDecisionOn);
      const state = dueState(dueAt, now, DEFAULT_PERMIT_DECISION_REMINDER_DAYS);
      if (state.kind !== "none" && !isBacklog(state, p.expectedDecisionOn, today)) {
        for (const recipient of recipients) {
          out.push({
            recipientStaffMemberId: recipient,
            reason: "permit_decision_due",
            severity: "warning",
            subjectType: "permit",
            subjectId: p.id,
            title:
              state.kind === "overdue"
                ? `Entscheidung ausstehend, nachfragen: ${p.title}`
                : `Entscheidung erwartet bis ${germanDate(p.expectedDecisionOn)}: ${p.title}`,
            body: `Erwartet: ${germanDate(p.expectedDecisionOn)}`,
            link,
            dedupeKey: reminderDedupeKey("permit_decision", p.id, state, dueAt),
          });
        }
      }
    }

    if (p.status === "granted" && p.validUntil) {
      const dueAt = endOfDay(p.validUntil);
      const state = dueState(dueAt, now, DEFAULT_PERMIT_EXPIRY_REMINDER_DAYS);
      if (state.kind === "due_soon") {
        for (const recipient of recipients) {
          out.push({
            recipientStaffMemberId: recipient,
            reason: "due_soon",
            severity: "warning",
            subjectType: "permit",
            subjectId: p.id,
            title: `Genehmigung läuft ab (${germanDate(p.validUntil)}): ${p.title}`,
            body: "Erneuerung beantragen, falls sie noch gebraucht wird.",
            link,
            dedupeKey: reminderDedupeKey("permit_expiry", p.id, state, dueAt),
          });
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Escalation

async function escalate(
  db: Database,
  now: Date,
  today: string,
  managers: { id: string }[],
  out: Staged[],
): Promise<number> {
  if (managers.length === 0) return 0;
  type Target = {
    type: "task" | "permit";
    id: string;
    title: string;
    dueAt: Date;
    who: string | null;
    link: string;
  };
  const targets: Target[] = [];

  const tasks = await db
    .select({
      id: task.id,
      title: task.title,
      dueAt: task.dueAt,
      eventId: task.eventId,
      who: staffMember.displayName,
    })
    .from(task)
    .leftJoin(staffMember, eq(staffMember.id, task.assigneeId))
    .leftJoin(event, eq(event.id, task.eventId))
    .where(
      and(
        inArray(task.status, [...OPEN_TASK_STATUSES]),
        eq(task.priority, "high"),
        isNotNull(task.dueAt),
        ne(task.source, "permit"),
        or(isNull(task.eventId), and(isNull(event.archivedAt), ne(event.status, "cancelled"))),
      ),
    );
  for (const t of tasks) {
    if (t.dueAt)
      targets.push({
        type: "task",
        id: t.id,
        title: t.title,
        dueAt: t.dueAt,
        who: t.who,
        link: taskLink(t),
      });
  }
  for (const p of await relevantPermits(db, today)) {
    if ((p.status === "not_started" || p.status === "preparing") && p.applyBy)
      targets.push({
        type: "permit",
        id: p.id,
        title: p.title,
        dueAt: endOfDay(p.applyBy),
        who: p.responsibleName,
        link: `/logbuch?genehmigung=${p.id}`,
      });
  }

  let escalated = 0;
  for (const target of targets) {
    const overdueMs = now.getTime() - target.dueAt.getTime();
    if (overdueMs < ESCALATION_AFTER_DAYS * 24 * 60 * 60 * 1000) continue;
    const days = daysBetween(berlinDate(target.dueAt), today);
    if (days > BACKLOG_AFTER_DAYS) continue;
    for (const manager of managers) {
      const key = `escalation:${target.type}:${target.id}:${target.dueAt.toISOString()}`;
      // The notification's dedupe key keeps the sweep idempotent; the log only records who was told.
      const [logged] = await db
        .insert(escalationLog)
        .values({
          subjectType: target.type,
          subjectId: target.id,
          level: 2,
          escalatedToStaffMemberId: manager.id,
          reason: "overdue",
          dedupeKey: `${key}:${manager.id}`,
        })
        .onConflictDoNothing({ target: escalationLog.dedupeKey })
        .returning({ id: escalationLog.id });
      if (logged) escalated += 1;
      out.push({
        recipientStaffMemberId: manager.id,
        reason: "escalated",
        severity: "critical",
        subjectType: target.type,
        subjectId: target.id,
        title: `Eskaliert: ${target.title} ist seit ${days} ${days === 1 ? "Tag" : "Tagen"} überfällig`,
        body: `Frist war ${germanDate(berlinDate(target.dueAt))}${target.who ? `, zuständig: ${target.who}` : ", niemand zuständig"}.`,
        link: target.link,
        dedupeKey: key,
        immediate: true,
      });
    }
  }
  return escalated;
}
