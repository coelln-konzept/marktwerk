import "server-only";
import { notification } from "@marktwerk/db/schema";
import {
  and,
  count,
  desc,
  eq,
  gt,
  inArray,
  isNull,
  lte,
  ne,
  notInArray,
  or,
  type SQL,
} from "drizzle-orm";
import type { ModuleHide } from "@/lib/modules";
import {
  hiddenReasons,
  NOTIFICATION_GROUPS,
  NOTIFICATION_REASON_GROUPS,
  type NotificationGroup,
} from "@/lib/notification-reasons";
import type { Actor } from "../actor";
import { db } from "../db";

type Reason = (typeof notification.reason.enumValues)[number];

export type NotificationRow = {
  id: string;
  reason: Reason;
  severity: (typeof notification.severity.enumValues)[number];
  state: (typeof notification.state.enumValues)[number];
  title: string;
  body: string | null;
  link: string | null;
  createdAt: string;
  snoozedUntil: string | null;
};

/** Not snoozed (or the snooze is over): what the person should see now. */
const awake = (now: Date) =>
  or(isNull(notification.snoozedUntil), lte(notification.snoozedUntil, now)) as SQL;

const mine = (actor: Actor) =>
  actor.staffMemberId ? eq(notification.recipientStaffMemberId, actor.staffMemberId) : undefined;

/** Leaves out the reasons of modules hidden in the UI (lib/modules.ts). */
const shown = (hide: ModuleHide): SQL | undefined => {
  const reasons = hiddenReasons(hide);
  return reasons.length > 0 ? notInArray(notification.reason, reasons as Reason[]) : undefined;
};

const columns = {
  id: notification.id,
  reason: notification.reason,
  severity: notification.severity,
  state: notification.state,
  title: notification.title,
  body: notification.body,
  link: notification.link,
  createdAt: notification.createdAt,
  snoozedUntil: notification.snoozedUntil,
};

const toRow = (r: { createdAt: Date; snoozedUntil: Date | null }) => ({
  createdAt: r.createdAt.toISOString(),
  snoozedUntil: r.snoozedUntil?.toISOString() ?? null,
});

/** Unread, not snoozed: the number on the bell and in the sidebar. */
export async function unreadCount(
  actor: Actor,
  now: Date = new Date(),
  hide: ModuleHide = {},
): Promise<number> {
  const who = mine(actor);
  if (!who) return 0;
  const [row] = await db
    .select({ n: count() })
    .from(notification)
    .where(and(who, shown(hide), eq(notification.state, "unread"), awake(now)));
  return row?.n ?? 0;
}

/** The latest open notifications for the bell popover (not done, not snoozed). */
export async function latestNotifications(
  actor: Actor,
  limit = 8,
  now: Date = new Date(),
  hide: ModuleHide = {},
): Promise<NotificationRow[]> {
  const who = mine(actor);
  if (!who) return [];
  const rows = await db
    .select(columns)
    .from(notification)
    .where(and(who, shown(hide), ne(notification.state, "done"), awake(now)))
    .orderBy(desc(notification.createdAt), desc(notification.id))
    .limit(limit);
  return rows.map((r) => ({ ...r, ...toRow(r) }));
}

export const NOTIFICATION_VIEWS = ["open", "saved", "done", "all"] as const;
export type NotificationView = (typeof NOTIFICATION_VIEWS)[number];

export function isNotificationView(value: string | undefined): value is NotificationView {
  return (NOTIFICATION_VIEWS as readonly string[]).includes(value ?? "");
}

export type NotificationPage = {
  rows: NotificationRow[];
  /** Per reason group, for the same view (so the chips show what a click would give). */
  groupCounts: Record<NotificationGroup, number>;
  total: number;
  unread: number;
  snoozed: number;
  hasMore: boolean;
};

export const NOTIFICATION_PAGE_SIZE = 50;

/**
 * Notification centre: `open` = unread, read and saved-or-not that are not done; `saved`; `done`; `all`.
 * Snoozed ones are hidden everywhere except in the count of "später".
 */
export async function listNotifications(
  actor: Actor,
  options: { view: NotificationView; group?: NotificationGroup; limit?: number },
  now: Date = new Date(),
  hide: ModuleHide = {},
): Promise<NotificationPage> {
  const who = mine(actor);
  const empty: NotificationPage = {
    rows: [],
    groupCounts: Object.fromEntries(NOTIFICATION_GROUPS.map((g) => [g, 0])) as Record<
      NotificationGroup,
      number
    >,
    total: 0,
    unread: 0,
    snoozed: 0,
    hasMore: false,
  };
  if (!who) return empty;
  const limit = options.limit ?? NOTIFICATION_PAGE_SIZE;
  const viewFilter: SQL | undefined =
    options.view === "open"
      ? ne(notification.state, "done")
      : options.view === "saved"
        ? eq(notification.state, "saved")
        : options.view === "done"
          ? eq(notification.state, "done")
          : undefined;
  const base = and(who, shown(hide), viewFilter, awake(now)) as SQL;
  const reasons = options.group ? NOTIFICATION_REASON_GROUPS[options.group] : null;

  const [rows, byReason, [unread], [snoozed]] = await Promise.all([
    db
      .select(columns)
      .from(notification)
      .where(
        and(base, reasons ? inArray(notification.reason, [...reasons] as Reason[]) : undefined),
      )
      .orderBy(desc(notification.createdAt), desc(notification.id))
      .limit(limit + 1),
    db
      .select({ reason: notification.reason, n: count() })
      .from(notification)
      .where(base)
      .groupBy(notification.reason),
    db
      .select({ n: count() })
      .from(notification)
      .where(and(who, shown(hide), eq(notification.state, "unread"), awake(now))),
    db
      .select({ n: count() })
      .from(notification)
      .where(
        and(who, shown(hide), ne(notification.state, "done"), gt(notification.snoozedUntil, now)),
      ),
  ]);

  const groupCounts = { ...empty.groupCounts };
  for (const { reason, n } of byReason) {
    const group = NOTIFICATION_GROUPS.find((g) => NOTIFICATION_REASON_GROUPS[g].includes(reason));
    if (group) groupCounts[group] += n;
  }
  const page = rows.slice(0, limit).map((r) => ({ ...r, ...toRow(r) }));
  return {
    rows: page,
    groupCounts,
    total: Object.values(groupCounts).reduce((a, b) => a + b, 0),
    unread: unread?.n ?? 0,
    snoozed: snoozed?.n ?? 0,
    hasMore: rows.length > limit,
  };
}
export * from "./notifications-company";
