import "server-only";
import {
  type CompanyKind,
  type CompanySeverity,
  can,
  compareByNewest,
  compareCenterOrder,
  isPastMarketLeftover,
  isSupersededNotification,
  latestPerSubject,
  parseCompanyDedupeKey,
  taskLink,
} from "@marktwerk/core";
import {
  event,
  eventPermit,
  eventPreset,
  eventType,
  notification,
  permit,
  task,
} from "@marktwerk/db/schema";
import { and, desc, eq, inArray, isNull, like, ne } from "drizzle-orm";
import { todayIn } from "@/lib/format";
import type { Actor } from "../actor";
import { db } from "../db";

/*
 * Company-wide notification center (owner and manager, decision 2026-10-22). Re-exported from
 * queries/notifications.ts.
 */

export const COMPANY_STATUSES = ["open", "snoozed", "done"] as const;
export type CompanyStatus = (typeof COMPANY_STATUSES)[number];
export const COMPANY_ARTS = ["tasks", "permits"] as const;
export type CompanyArt = (typeof COMPANY_ARTS)[number];
export const COMPANY_SORTS = ["urgency", "newest"] as const;
export type CompanySort = (typeof COMPANY_SORTS)[number];

export const isCompanyStatus = (v: string | undefined): v is CompanyStatus =>
  (COMPANY_STATUSES as readonly string[]).includes(v ?? "");
export const isCompanyArt = (v: string | undefined): v is CompanyArt =>
  (COMPANY_ARTS as readonly string[]).includes(v ?? "");
export const isCompanySort = (v: string | undefined): v is CompanySort =>
  (COMPANY_SORTS as readonly string[]).includes(v ?? "");

export type CompanyMarket = {
  /** The market (preset) the Markt filter works on; null for single events without a preset. */
  presetId: string | null;
  presetName: string | null;
  /** The event's own name. */
  name: string;
  color: string | null;
  typeKey: string | null;
  eventId: string;
  /** First day of the market (ranks the "Überfällig" group like the Übersicht). */
  startsOn: string | null;
};

export type CompanyNotificationRow = {
  id: string;
  kind: CompanyKind;
  subjectType: "task" | "permit";
  subjectId: string;
  title: string;
  severity: CompanySeverity;
  /** Effective state: a resolved subject or a snoozed task counts, whatever the stored state says. */
  status: CompanyStatus;
  unread: boolean;
  /** The date the item is about (current due date, apply-by, decision, validity end). */
  dueOn: string | null;
  overdue: boolean;
  isKey: boolean;
  /** Task rows: the current task status. */
  taskStatus: string | null;
  snoozedUntil: string | null;
  /** Task rows: the task itself is snoozed ("Zurückstellen" on a task snoozes the task, decision 2026-10-29). */
  taskSnoozed: boolean;
  /** The notification itself is snoozed (permits; tasks before the task snooze applied here). */
  notificationSnoozed: boolean;
  createdAt: string;
  /** Done because the subject was resolved, not by a click. */
  resolved: boolean;
  href: string;
  market: CompanyMarket | null;
};

export type CompanyFilters = {
  status: CompanyStatus;
  art?: CompanyArt;
  /** Preset id of the market. */
  markt?: string;
  sort: CompanySort;
};

export type CompanyCenter = {
  rows: CompanyNotificationRow[];
  /** Per status for the current Art + Markt filter. */
  statusCounts: Record<CompanyStatus, number>;
  /** Per Art for the current status + Markt filter. */
  artCounts: Record<CompanyArt, number>;
  markets: { presetId: string; name: string }[];
  /** Open and unread: the number on the bell. */
  unread: number;
  today: string;
};

const DONE_HISTORY = 100;
const OPEN_TASK = ["todo", "in_progress", "waiting_external", "blocked"];

type MarketSource = {
  eventId: string | null;
  eventName: string | null;
  startsOn: string | null;
  presetId: string | null;
  presetName: string | null;
  color: string | null;
  typeKey: string | null;
};

const marketOf = (e: MarketSource): CompanyMarket | null =>
  e.eventId && e.eventName
    ? {
        presetId: e.presetId,
        presetName: e.presetName,
        name: e.eventName,
        color: e.color,
        typeKey: e.typeKey,
        eventId: e.eventId,
        startsOn: e.startsOn,
      }
    : null;

/**
 * Every company-wide notification with the live state of its subject. Never shows an open notification
 * whose subject is resolved (task done/skipped/cancelled, permit filed/granted/not required, market over):
 * such a row is "done" here even before the sweep has marked it. A snoozed task counts as snoozed until its
 * date. A notification the sweep rotated (the subject is still open and a newer one exists, or its date
 * moved) is neither open nor done: it is left out. "Erledigt" lists one entry per subject.
 */
async function loadCompanyRows(
  now: Date,
): Promise<{ rows: CompanyNotificationRow[]; today: string }> {
  const today = todayIn("Europe/Berlin", now);
  const base = and(
    isNull(notification.recipientStaffMemberId),
    like(notification.dedupeKey, "company:%"),
  );
  const [active, finished] = await Promise.all([
    db
      .select()
      .from(notification)
      .where(and(base, ne(notification.state, "done")))
      .orderBy(desc(notification.createdAt))
      .limit(1000),
    db
      .select()
      .from(notification)
      .where(and(base, eq(notification.state, "done")))
      .orderBy(desc(notification.updatedAt))
      .limit(DONE_HISTORY),
  ]);
  const parsed = [...active, ...finished].flatMap((n) => {
    const key = parseCompanyDedupeKey(n.dedupeKey);
    return key ? [{ n, key }] : [];
  });
  const taskIds = parsed.filter((p) => p.key.kind.startsWith("task_")).map((p) => p.key.subjectId);
  const permitIds = parsed
    .filter((p) => !p.key.kind.startsWith("task_"))
    .map((p) => p.key.subjectId);

  const marketCols = {
    eventId: event.id,
    eventName: event.name,
    startsOn: event.startsOn,
    endsOn: event.endsOn,
    eventStatus: event.status,
    eventArchived: event.archivedAt,
    presetId: event.presetId,
    presetName: eventPreset.name,
    color: eventPreset.color,
    typeKey: eventType.key,
  };
  const [tasks, permits, permitEvents] = await Promise.all([
    taskIds.length === 0
      ? []
      : db
          .select({
            id: task.id,
            title: task.title,
            status: task.status,
            isKey: task.isKey,
            dueAt: task.dueAt,
            snoozedUntil: task.snoozedUntil,
            taskEventId: task.eventId,
            ...marketCols,
          })
          .from(task)
          .leftJoin(event, eq(event.id, task.eventId))
          .leftJoin(eventPreset, eq(eventPreset.id, event.presetId))
          .leftJoin(eventType, eq(eventType.id, event.eventTypeId))
          .where(inArray(task.id, taskIds)),
    permitIds.length === 0
      ? []
      : db
          .select({
            id: permit.id,
            title: permit.title,
            status: permit.status,
            applyBy: permit.applyBy,
            expectedDecisionOn: permit.expectedDecisionOn,
            validUntil: permit.validUntil,
            archivedAt: permit.archivedAt,
          })
          .from(permit)
          .where(inArray(permit.id, permitIds)),
    permitIds.length === 0
      ? []
      : db
          .select({ permitId: eventPermit.permitId, required: eventPermit.required, ...marketCols })
          .from(eventPermit)
          .innerJoin(event, eq(event.id, eventPermit.eventId))
          .leftJoin(eventPreset, eq(eventPreset.id, event.presetId))
          .leftJoin(eventType, eq(eventType.id, event.eventTypeId))
          .where(inArray(eventPermit.permitId, permitIds))
          .orderBy(event.startsOn),
  ]);
  const taskById = new Map(tasks.map((t) => [t.id, t]));
  const permitById = new Map(permits.map((p) => [p.id, p]));
  const eventsOfPermit = new Map<string, typeof permitEvents>();
  for (const e of permitEvents)
    eventsOfPermit.set(e.permitId, [...(eventsOfPermit.get(e.permitId) ?? []), e]);

  const newestOfSubject = new Map<string, number>();
  for (const { n, key } of parsed)
    newestOfSubject.set(
      key.subjectId,
      Math.max(newestOfSubject.get(key.subjectId) ?? 0, n.createdAt.getTime()),
    );

  const rows: CompanyNotificationRow[] = [];
  for (const { n, key } of parsed) {
    let title = n.title;
    let subjectActive = false;
    let keyCurrent = false;
    let dueOn: string | null = key.dueOn;
    let isLive = false;
    let isKey = false;
    let taskStatus: string | null = null;
    let subjectSnooze: string | null = null;
    let market: CompanyMarket | null = null;
    let href = n.link ?? "/benachrichtigungen";
    if (key.kind.startsWith("task_")) {
      const t = taskById.get(key.subjectId);
      if (t) {
        title = t.title;
        isKey = t.isKey;
        taskStatus = t.status;
        const currentDue = t.dueAt ? todayIn("Europe/Berlin", t.dueAt) : null;
        dueOn = currentDue ?? key.dueOn;
        const eventOk =
          !t.eventId ||
          (t.eventStatus !== "cancelled" &&
            !t.eventArchived &&
            !isPastMarketLeftover(t.endsOn, currentDue, today));
        subjectActive = OPEN_TASK.includes(t.status) && eventOk;
        keyCurrent = currentDue === key.dueOn;
        isLive = subjectActive && keyCurrent;
        subjectSnooze = t.snoozedUntil && t.snoozedUntil > today ? t.snoozedUntil : null;
        market = marketOf(t);
        href = taskLink(t.id, t.taskEventId);
      }
    } else {
      const p = permitById.get(key.subjectId);
      if (p) {
        title = p.title;
        const evs = eventsOfPermit.get(p.id) ?? [];
        const upcoming = evs.filter(
          (e) =>
            e.required &&
            e.eventStatus !== "cancelled" &&
            !e.eventArchived &&
            e.endsOn !== null &&
            e.endsOn >= today,
        );
        // Events come ordered by start, so upcoming[0] is the next market. A permit counts by its own dates
        // (apply-by within the horizon, decision, expiry), not by how far away the market is (2026-10-29).
        const relevant = evs.length === 0 || upcoming.length > 0;
        let current: string | null = null;
        if (key.kind === "permit_apply_by")
          current = p.status === "not_started" || p.status === "preparing" ? p.applyBy : null;
        else if (key.kind === "permit_decision")
          current = p.status === "applied" ? p.expectedDecisionOn : null;
        else current = p.status === "granted" ? p.validUntil : null;
        subjectActive = !p.archivedAt && relevant && current !== null;
        keyCurrent = current === key.dueOn;
        isLive = subjectActive && keyCurrent;
        market = upcoming[0] ? marketOf(upcoming[0]) : null;
        href = `/genehmigungen?genehmigung=${p.id}`;
      }
    }
    if (
      isSupersededNotification({
        subjectActive,
        keyCurrent,
        storedDone: n.state === "done",
        newerSibling: (newestOfSubject.get(key.subjectId) ?? 0) > n.createdAt.getTime(),
      })
    )
      continue;
    const own = n.snoozedUntil && n.snoozedUntil > now ? n.snoozedUntil.toISOString() : null;
    const snoozeIso = [own, subjectSnooze ? `${subjectSnooze}T00:00:00.000Z` : null]
      .filter((x): x is string => x !== null)
      .sort()
      .at(-1);
    const status: CompanyStatus =
      n.state === "done" || !isLive ? "done" : snoozeIso ? "snoozed" : "open";
    rows.push({
      id: n.id,
      kind: key.kind,
      subjectType: key.kind.startsWith("task_") ? "task" : "permit",
      subjectId: key.subjectId,
      title,
      severity: n.severity,
      status,
      unread: status === "open" && n.state === "unread",
      dueOn,
      overdue: dueOn !== null && dueOn < today,
      isKey,
      taskStatus,
      snoozedUntil:
        status === "snoozed" ? (own ?? (subjectSnooze ? `${subjectSnooze}` : null)) : null,
      taskSnoozed: key.kind.startsWith("task_") && subjectSnooze !== null,
      notificationSnoozed: own !== null,
      createdAt: n.createdAt.toISOString(),
      resolved: n.state !== "done" && !isLive,
      href,
      market,
    });
  }
  // "Erledigt" shows a subject once, however many reasons it went through.
  const doneOnce = latestPerSubject(rows.filter((r) => r.status === "done"));
  return { rows: [...rows.filter((r) => r.status !== "done"), ...doneOnce], today };
}

/** What the shared ranking (the Übersicht's `compareDue`) needs from a row. */
const orderInput = (r: CompanyNotificationRow) => ({
  subjectType: r.subjectType,
  dueOn: r.dueOn,
  isKey: r.isKey,
  title: r.title,
  marketStartsOn: r.market?.startsOn ?? null,
  createdAt: r.createdAt,
});

/** The notification center: filters, counts per filter and the sorted rows. Owner and manager only. */
export async function listCompanyNotifications(
  actor: Actor,
  filters: CompanyFilters,
  now: Date = new Date(),
): Promise<CompanyCenter> {
  const empty: CompanyCenter = {
    rows: [],
    statusCounts: { open: 0, snoozed: 0, done: 0 },
    artCounts: { tasks: 0, permits: 0 },
    markets: [],
    unread: 0,
    today: todayIn("Europe/Berlin", now),
  };
  if (!can(actor.role, "notification", "read")) return empty;
  const { rows: all, today } = await loadCompanyRows(now);
  const artOf = (r: CompanyNotificationRow): CompanyArt =>
    r.subjectType === "task" ? "tasks" : "permits";
  const byMarket = (r: CompanyNotificationRow) =>
    !filters.markt || r.market?.presetId === filters.markt;
  const byArt = (r: CompanyNotificationRow) => !filters.art || artOf(r) === filters.art;

  const statusCounts = { open: 0, snoozed: 0, done: 0 };
  const artCounts = { tasks: 0, permits: 0 };
  for (const r of all) {
    if (byArt(r) && byMarket(r)) statusCounts[r.status] += 1;
    if (r.status === filters.status && byMarket(r)) artCounts[artOf(r)] += 1;
  }
  const marketMap = new Map<string, { presetId: string; name: string }>();
  for (const r of all)
    if (r.market?.presetId && r.market.presetName && r.status !== "done")
      marketMap.set(r.market.presetId, { presetId: r.market.presetId, name: r.market.presetName });
  const rows = all
    .filter((r) => r.status === filters.status && byArt(r) && byMarket(r))
    .sort(
      filters.sort === "newest"
        ? compareByNewest
        : (a, b) => compareCenterOrder(orderInput(a), orderInput(b), today),
    );
  return {
    rows,
    statusCounts,
    artCounts,
    markets: [...marketMap.values()].sort((a, b) => a.name.localeCompare(b.name, "de")),
    unread: all.filter((r) => r.unread).length,
    today,
  };
}

/**
 * The bell for owner and manager: the open items in the center's order. The badge, the popover header and
 * the center's "Offen" show the same number (`open`); `unread` only enables "Alle als gelesen".
 */
export async function companyBell(
  actor: Actor,
  limit = 5,
  now: Date = new Date(),
): Promise<{ unread: number; open: number; items: CompanyNotificationRow[] }> {
  if (!can(actor.role, "notification", "read")) return { unread: 0, open: 0, items: [] };
  const center = await listCompanyNotifications(actor, { status: "open", sort: "urgency" }, now);
  return { unread: center.unread, open: center.rows.length, items: center.rows.slice(0, limit) };
}
