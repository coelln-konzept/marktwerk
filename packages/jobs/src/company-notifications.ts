import {
  type CompanyKind,
  type CompanySeverity,
  companyDedupeKey,
  PERMIT_HORIZON_DEFAULT_DAYS,
  permitApplyKind,
  permitDecisionKind,
  permitExpiryKind,
  taskKind,
  taskLink,
  taskSeverity,
} from "@marktwerk/core";
import {
  type Database,
  event,
  eventPermit,
  insertCompanyNotifications,
  type NewCompanyNotification,
  notification,
  permit,
  settings,
  task,
} from "@marktwerk/db";
import { and, eq, inArray, isNotNull, isNull, like, ne, or, sql } from "drizzle-orm";
import { berlinDate, notOfPastEvent, OPEN_TASK_STATUSES } from "./shared";

export type CompanySweepResult = {
  /** New company-wide notifications. */
  created: number;
  /** Open company-wide notifications whose subject is resolved (or whose date moved): now `done`. */
  resolved: number;
};

const germanDate = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;

type Wanted = NewCompanyNotification & { snoozed: boolean };

/**
 * Company-wide notifications (decision 2026-10-22), the content of the notification center of owner and
 * manager: every important item once, no recipient, one shared state, no email.
 *
 * - Tasks of current markets: overdue, or due soon (today/tomorrow, Kernaufgaben 3 days ahead).
 * - Permits: apply-by within the permit horizon, a decision due within a week, and granted permits that
 *   end before a market that needs them.
 *
 * Idempotent: the dedupe key holds subject, reason and due date. Afterwards every open company-wide
 * notification whose key is no longer wanted (task done/skipped/cancelled/archived, permit filed or granted
 * or not required any more, due date moved, market over) goes to `done`. Snoozed tasks keep their
 * notification but get no new one.
 */
export async function companySweep(
  db: Database,
  now: Date,
  today: string,
): Promise<CompanySweepResult> {
  const [row] = await db
    .select({ days: settings.permitHorizonDays })
    .from(settings)
    .where(eq(settings.id, 1));
  const horizon = row?.days ?? PERMIT_HORIZON_DEFAULT_DAYS;

  const wanted: Wanted[] = [];
  await wantTasks(db, today, wanted);
  await wantPermits(db, today, horizon, wanted);

  const created = await insertCompanyNotifications(
    db,
    wanted.filter((w) => !w.snoozed).map(({ snoozed: _snoozed, ...item }) => item),
  );

  const keys = new Set(wanted.map((w) => w.dedupeKey));
  const open = await db
    .select({ id: notification.id, dedupeKey: notification.dedupeKey })
    .from(notification)
    .where(
      and(
        isNull(notification.recipientStaffMemberId),
        ne(notification.state, "done"),
        like(notification.dedupeKey, "company:%"),
      ),
    );
  const stale = open.filter((o) => o.dedupeKey && !keys.has(o.dedupeKey)).map((o) => o.id);
  if (stale.length > 0)
    await db
      .update(notification)
      .set({ state: "done", snoozedUntil: null, readAt: now })
      .where(inArray(notification.id, stale));
  return { created, resolved: stale.length };
}

async function wantTasks(db: Database, today: string, out: Wanted[]) {
  const rows = await db
    .select({
      id: task.id,
      title: task.title,
      status: task.status,
      isKey: task.isKey,
      dueAt: task.dueAt,
      snoozedUntil: task.snoozedUntil,
      eventId: task.eventId,
      eventName: event.name,
    })
    .from(task)
    .leftJoin(event, eq(event.id, task.eventId))
    .where(
      and(
        inArray(task.status, [...OPEN_TASK_STATUSES]),
        isNotNull(task.dueAt),
        // The permit's own item (apply-by) covers the logbook's "beantragen" task.
        ne(task.source, "permit"),
        or(isNull(task.eventId), and(isNull(event.archivedAt), ne(event.status, "cancelled"))),
        // Tasks of markets that are long over are left to the cleanup on the Übersicht.
        notOfPastEvent(today),
      ),
    );
  for (const t of rows) {
    if (!t.dueAt) continue;
    const dueOn = berlinDate(t.dueAt);
    const kind = taskKind(dueOn, today, t.isKey);
    if (!kind) continue;
    // A task that waits for somebody else is never overdue (it shows "wartet seit …", UX pass 2026-10-22).
    if (kind === "task_overdue" && t.status === "waiting_external") continue;
    out.push({
      reason: kind === "task_overdue" ? "overdue" : "due_soon",
      severity: taskSeverity(kind, t.isKey),
      subjectType: "task",
      subjectId: t.id,
      title: t.title,
      body: t.eventName ? `${t.eventName} · ${germanDate(dueOn)}` : germanDate(dueOn),
      link: taskLink(t.id, t.eventId),
      dedupeKey: companyDedupeKey(kind, t.id, dueOn),
      snoozed: t.snoozedUntil !== null && t.snoozedUntil > today,
    });
  }
}

async function wantPermits(db: Database, today: string, horizon: number, out: Wanted[]) {
  const upcoming = sql<number>`(select count(*) from ${eventPermit} ep join ${event} e on e.id = ep.event_id
    where ep.permit_id = app.permit.id and ep.required and e.archived_at is null and e.status <> 'cancelled' and e.ends_on >= ${today})`;
  const linked = sql<number>`(select count(*) from ${eventPermit} ep where ep.permit_id = app.permit.id)`;
  // First upcoming market that starts after the permit has ended.
  const uncovered = sql<
    string | null
  >`(select min(e.starts_on) from ${eventPermit} ep join ${event} e on e.id = ep.event_id
    where ep.permit_id = app.permit.id and ep.required and e.archived_at is null and e.status <> 'cancelled'
      and e.ends_on >= ${today} and e.starts_on > app.permit.valid_until)`;
  const rows = await db
    .select({
      id: permit.id,
      title: permit.title,
      status: permit.status,
      applyBy: permit.applyBy,
      expectedDecisionOn: permit.expectedDecisionOn,
      validUntil: permit.validUntil,
      uncoveredFrom: uncovered,
    })
    .from(permit)
    .where(
      and(
        isNull(permit.archivedAt),
        inArray(permit.status, ["not_started", "preparing", "applied", "granted"]),
        sql`(${linked} = 0 or ${upcoming} > 0)`,
      ),
    );
  const make = (
    p: (typeof rows)[number],
    kind: CompanyKind,
    dueOn: string,
    severity: CompanySeverity,
    reason: "permit_apply_by" | "permit_decision_due" | "due_soon",
  ): Wanted => ({
    reason,
    severity,
    subjectType: "permit",
    subjectId: p.id,
    title: p.title,
    body: germanDate(dueOn),
    link: `/genehmigungen?genehmigung=${p.id}`,
    dedupeKey: companyDedupeKey(kind, p.id, dueOn),
    snoozed: false,
  });
  for (const p of rows) {
    if ((p.status === "not_started" || p.status === "preparing") && p.applyBy) {
      const hit = permitApplyKind(p.applyBy, today, horizon);
      if (hit) out.push(make(p, "permit_apply_by", p.applyBy, hit.severity, "permit_apply_by"));
    }
    if (p.status === "applied" && p.expectedDecisionOn) {
      const hit = permitDecisionKind(p.expectedDecisionOn, today);
      if (hit)
        out.push(
          make(p, "permit_decision", p.expectedDecisionOn, hit.severity, "permit_decision_due"),
        );
    }
    if (p.status === "granted" && p.validUntil && p.uncoveredFrom) {
      const hit = permitExpiryKind(p.validUntil, p.uncoveredFrom, today, horizon);
      if (hit) out.push(make(p, "permit_expiry", p.validUntil, hit.severity, "due_soon"));
    }
  }
}
