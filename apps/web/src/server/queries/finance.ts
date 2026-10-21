import "server-only";
import {
  addDays,
  aggregateBudget,
  type BudgetRow,
  type BudgetTotals,
  can,
  derivePayableStatus,
  eventMoneyHealth,
  type HealthLevel,
  type InstallmentState,
  installmentState,
  installmentUrgency,
  nextOpenInstallment,
  openAmountCents,
  type PayableStatus,
  seasonShareCents,
} from "@marktwerk/core";
import { foldIncludes } from "@marktwerk/core/text/fold";
import {
  auditLog,
  contact,
  document,
  event,
  eventBudgetLine,
  eventIncome,
  expense,
  installment,
  payable,
  staffMember,
  user,
  vehicle,
  venue,
} from "@marktwerk/db/schema";
import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  ne,
  notExists,
  or,
  type SQL,
  sql,
} from "drizzle-orm";
import { cache } from "react";
import { formatMoney, todayIn } from "@/lib/format";
import { type Actor, visibleEvents } from "../actor";
import { db } from "../db";
import { RECEIPT_KINDS } from "../services/documents";
import { PAYABLE_CATEGORIES, PAYABLE_SCOPES } from "../services/payables";
import { isUuid } from "./venues";

/* ------------------------------------------------------------------ shared shapes (Übersicht, Kalender) */

export type DueItem = {
  kind: "task" | "permit" | "installment" | "hours" | "obligation";
  id: string;
  title: string;
  dueOn: string; // YYYY-MM-DD
  urgency: "overdue" | "today" | "soon"; // soon = within 7 days
  href: string;
  meta?: string;
  eventId?: string | null;
  assigneeName?: string | null;
};

export type CalendarItem = {
  layer: "tasks" | "permits" | "shifts" | "installments" | "obligations";
  id: string;
  date: string;
  title: string;
  href: string;
  tone?: "ok" | "warn" | "critical" | "neutral";
};

const canRead = (actor: Actor) => can(actor.role, "finance", "read");

/** Unpaid rate of a live payable. */
const unpaidRate = and(
  inArray(installment.status, ["open", "partially_paid"]),
  isNull(payable.archivedAt),
);

/** Where the detail page of a payable lives. */
export const payableHref = (id: string) => `/finanzen/posten/${id}`;

/* ------------------------------------------------------------------ Übersicht / Kalender exports */

/**
 * Rates that are overdue, due today or within the next 7 days, most urgent first. Empty for roles
 * without `finance:read`.
 */
export async function dueItems(actor: Actor, today: string): Promise<DueItem[]> {
  if (!canRead(actor)) return [];
  const rows = await db
    .select({
      id: installment.id,
      payableId: payable.id,
      title: payable.title,
      critical: payable.critical,
      sort: installment.sort,
      dueOn: installment.dueOn,
      amountCents: installment.amountCents,
      paidAmountCents: installment.paidAmountCents,
      status: installment.status,
      eventId: payable.eventId,
      counterparty: contact.name,
    })
    .from(installment)
    .innerJoin(payable, eq(payable.id, installment.payableId))
    .leftJoin(contact, eq(contact.id, payable.counterpartyContactId))
    .where(and(unpaidRate, lte(installment.dueOn, addDays(today, 7))))
    .orderBy(asc(installment.dueOn), desc(payable.critical), asc(payable.title));
  if (rows.length === 0) return [];
  const totals = await rateCounts(rows.map((r) => r.payableId));
  return rows.flatMap((r) => {
    const urgency = installmentUrgency(r.dueOn, today);
    if (urgency === null) return [];
    const open = openAmountCents(r);
    return [
      {
        kind: "installment" as const,
        id: r.id,
        title: r.title,
        dueOn: r.dueOn,
        urgency,
        href: payableHref(r.payableId),
        meta: `${r.sort}/${totals.get(r.payableId) ?? r.sort} · ${formatMoney(open, actor.locale)}`,
        eventId: r.eventId,
        assigneeName: null,
      },
    ];
  });
}

/** Unpaid rates with a due date in [from, to] for the calendar layer "Raten & Zahlungen". */
export async function calendarItems(
  actor: Actor,
  from: string,
  to: string,
): Promise<CalendarItem[]> {
  if (!canRead(actor)) return [];
  const today = todayIn();
  const rows = await db
    .select({
      id: installment.id,
      payableId: payable.id,
      title: payable.title,
      critical: payable.critical,
      dueOn: installment.dueOn,
    })
    .from(installment)
    .innerJoin(payable, eq(payable.id, installment.payableId))
    .where(and(unpaidRate, gte(installment.dueOn, from), lte(installment.dueOn, to)))
    .orderBy(asc(installment.dueOn), asc(payable.title));
  return rows.map((r) => ({
    layer: "installments" as const,
    id: r.id,
    date: r.dueOn,
    title: r.title,
    href: payableHref(r.payableId),
    tone:
      r.dueOn < today
        ? "critical"
        : r.critical || r.dueOn <= addDays(today, 7)
          ? "warn"
          : "neutral",
  }));
}

/** KPI "Geld überfällig": unpaid rates past their due date, with the money still open on them. */
export async function moneyOverdue(
  actor: Actor,
  today: string,
): Promise<{ count: number; cents: number }> {
  if (!canRead(actor)) return { count: 0, cents: 0 };
  const [row] = await db
    .select({
      n: count(),
      cents: sql<number>`coalesce(sum(${installment.amountCents} - coalesce(${installment.paidAmountCents}, 0)), 0)::int`,
    })
    .from(installment)
    .innerJoin(payable, eq(payable.id, installment.payableId))
    .where(and(unpaidRate, lt(installment.dueOn, today)));
  return { count: row?.n ?? 0, cents: row?.cents ?? 0 };
}

/**
 * Money dimension of the event health for several events at once (Übersicht, Kalender): the same rules
 * as the Geld tab. Events without payables and plan map to null.
 */
export async function eventMoneyHealthFor(
  actor: Actor,
  eventIds: string[],
  today: string,
): Promise<Map<string, HealthLevel | null>> {
  const result = new Map<string, HealthLevel | null>(eventIds.map((id) => [id, null]));
  if (!canRead(actor) || eventIds.length === 0) return result;
  const [rates, plans, expenses] = await Promise.all([
    db
      .select({
        eventId: payable.eventId,
        status: installment.status,
        dueOn: installment.dueOn,
        amountCents: installment.amountCents,
        paidAmountCents: installment.paidAmountCents,
      })
      .from(installment)
      .innerJoin(payable, eq(payable.id, installment.payableId))
      .where(
        and(
          inArray(payable.eventId, eventIds),
          ne(installment.status, "cancelled"),
          isNull(payable.archivedAt),
        ),
      ),
    db
      .select({
        eventId: eventBudgetLine.eventId,
        planned: sql<number>`sum(${eventBudgetLine.plannedCents})::int`,
      })
      .from(eventBudgetLine)
      .where(inArray(eventBudgetLine.eventId, eventIds))
      .groupBy(eventBudgetLine.eventId),
    db
      .select({ eventId: expense.eventId, cents: sql<number>`sum(${expense.amountCents})::int` })
      .from(expense)
      .where(and(inArray(expense.eventId, eventIds), isNull(expense.archivedAt)))
      .groupBy(expense.eventId),
  ]);
  const plannedOf = new Map(plans.map((p) => [p.eventId, p.planned]));
  const spentOf = new Map(expenses.map((e) => [e.eventId, e.cents]));
  for (const id of eventIds) {
    const mine = rates.filter((r) => r.eventId === id);
    result.set(
      id,
      eventMoneyHealth({
        overdueCount: mine.filter((r) => installmentState(r, today) === "overdue").length,
        dueSoonCount: mine.filter(
          (r) => openAmountCents(r) > 0 && r.dueOn >= today && r.dueOn <= addDays(today, 7),
        ).length,
        installmentCount: mine.length,
        plannedCents: plannedOf.get(id) ?? 0,
        committedCents: mine.reduce((s, r) => s + r.amountCents, 0) + (spentOf.get(id) ?? 0),
      }),
    );
  }
  return result;
}

/* ------------------------------------------------------------------ payables list and detail */

export const STATUS_VIEWS = ["open", "due", "overdue", "paid", "all"] as const;
export type StatusView = (typeof STATUS_VIEWS)[number];

export function isStatusView(value: string | undefined): value is StatusView {
  return (STATUS_VIEWS as readonly string[]).includes(value ?? "");
}

export type PayableFilters = {
  view?: StatusView;
  scope?: string;
  category?: string;
  eventId?: string;
  venueId?: string;
  season?: number;
  critical?: boolean;
  q?: string;
};

export type InstallmentRow = {
  id: string;
  payableId: string;
  sort: number;
  /** Number of rates of the payable (cancelled ones included), for "Rate 2/3". */
  of: number;
  dueOn: string;
  amountCents: number;
  status: "open" | "partially_paid" | "paid" | "cancelled";
  state: InstallmentState;
  paidOn: string | null;
  paidAmountCents: number | null;
  openCents: number;
  method: string | null;
  reference: string | null;
  notes: string | null;
  paidByName: string | null;
  /** Paid (or part-paid) money without a receipt on the rate or on its payable. */
  receiptMissing: boolean;
  /** Receipts on this rate itself. */
  receiptCount: number;
};

export type PayableRow = {
  id: string;
  title: string;
  scope: "event" | "company" | "vehicle" | "venue_season";
  category: (typeof PAYABLE_CATEGORIES)[number];
  critical: boolean;
  totalGrossCents: number;
  vatRateBp: number | null;
  notes: string | null;
  counterpartyId: string | null;
  counterpartyName: string | null;
  eventId: string | null;
  eventName: string | null;
  venueId: string | null;
  venueName: string | null;
  season: number | null;
  vehicleId: string | null;
  vehicleName: string | null;
  permitId: string | null;
  updatedAt: string;
  status: PayableStatus;
  installments: InstallmentRow[];
  next: InstallmentRow | null;
  paidCents: number;
  openCents: number;
  receiptsMissing: number;
};

const payableColumns = {
  id: payable.id,
  title: payable.title,
  scope: payable.scope,
  category: payable.category,
  critical: payable.critical,
  totalGrossCents: payable.totalGrossCents,
  vatRateBp: payable.vatRateBp,
  notes: payable.notes,
  counterpartyId: payable.counterpartyContactId,
  counterpartyName: contact.name,
  eventId: payable.eventId,
  eventName: event.name,
  eventSeason: event.season,
  venueId: payable.venueId,
  venueName: venue.name,
  season: payable.season,
  vehicleId: payable.vehicleId,
  vehicleName: vehicle.name,
  permitId: payable.permitId,
  updatedAt: payable.updatedAt,
};

function payableBase() {
  return db
    .select(payableColumns)
    .from(payable)
    .leftJoin(contact, eq(contact.id, payable.counterpartyContactId))
    .leftJoin(event, eq(event.id, payable.eventId))
    .leftJoin(venue, eq(venue.id, payable.venueId))
    .leftJoin(vehicle, eq(vehicle.id, payable.vehicleId));
}

async function rateCounts(payableIds: string[]): Promise<Map<string, number>> {
  const rows = await db
    .select({ payableId: installment.payableId, n: count() })
    .from(installment)
    .where(inArray(installment.payableId, [...new Set(payableIds)]))
    .groupBy(installment.payableId);
  return new Map(rows.map((r) => [r.payableId, r.n]));
}

/** Receipt-kind documents on rates and payables, by record. */
async function receiptIndex(rateIds: string[], payableIds: string[]) {
  const rows =
    rateIds.length === 0 && payableIds.length === 0
      ? []
      : await db
          .select({
            installmentId: document.installmentId,
            payableId: document.payableId,
          })
          .from(document)
          .where(
            and(
              isNull(document.archivedAt),
              inArray(document.kind, [...RECEIPT_KINDS]),
              or(
                rateIds.length ? inArray(document.installmentId, rateIds) : undefined,
                payableIds.length ? inArray(document.payableId, payableIds) : undefined,
              ),
            ),
          );
  const byRate = new Map<string, number>();
  const byPayable = new Map<string, number>();
  for (const r of rows) {
    if (r.installmentId) byRate.set(r.installmentId, (byRate.get(r.installmentId) ?? 0) + 1);
    if (r.payableId) byPayable.set(r.payableId, (byPayable.get(r.payableId) ?? 0) + 1);
  }
  return { byRate, byPayable };
}

type BaseRow = Awaited<ReturnType<typeof payableBase>>[number];

/** Adds the rates, receipts and derived values to payable rows. */
async function withRates(rows: BaseRow[], today: string): Promise<PayableRow[]> {
  if (rows.length === 0) return [];
  const payableIds = rows.map((r) => r.id);
  const rates = await db
    .select({
      id: installment.id,
      payableId: installment.payableId,
      sort: installment.sort,
      dueOn: installment.dueOn,
      amountCents: installment.amountCents,
      status: installment.status,
      paidOn: installment.paidOn,
      paidAmountCents: installment.paidAmountCents,
      method: installment.method,
      reference: installment.reference,
      notes: installment.notes,
      paidByName: staffMember.displayName,
    })
    .from(installment)
    .leftJoin(staffMember, eq(staffMember.id, installment.paidByStaffMemberId))
    .where(inArray(installment.payableId, payableIds))
    .orderBy(asc(installment.payableId), asc(installment.sort));
  const receipts = await receiptIndex(
    rates.map((r) => r.id),
    payableIds,
  );
  const ratesOf = new Map<string, typeof rates>();
  for (const r of rates) {
    const list = ratesOf.get(r.payableId);
    if (list) list.push(r);
    else ratesOf.set(r.payableId, [r]);
  }

  return rows.map((row): PayableRow => {
    const mine = ratesOf.get(row.id) ?? [];
    const installments = mine.map((r): InstallmentRow => {
      const paidMoney = (r.paidAmountCents ?? 0) > 0;
      return {
        ...r,
        of: mine.length,
        state: installmentState(r, today),
        openCents: openAmountCents(r),
        receiptCount: receipts.byRate.get(r.id) ?? 0,
        receiptMissing:
          paidMoney && !receipts.byRate.has(r.id) && !receipts.byPayable.has(r.payableId),
      };
    });
    const active = installments.filter((i) => i.status !== "cancelled");
    return {
      id: row.id,
      title: row.title,
      scope: row.scope,
      category: row.category,
      critical: row.critical,
      totalGrossCents: row.totalGrossCents,
      vatRateBp: row.vatRateBp,
      notes: row.notes,
      counterpartyId: row.counterpartyId,
      counterpartyName: row.counterpartyName,
      eventId: row.eventId,
      eventName: row.eventName,
      venueId: row.venueId,
      venueName: row.venueName,
      season: row.season,
      vehicleId: row.vehicleId,
      vehicleName: row.vehicleName,
      permitId: row.permitId,
      updatedAt: row.updatedAt.toISOString(),
      status: derivePayableStatus(installments, today),
      installments,
      next: nextOpenInstallment(active),
      paidCents: active.reduce((s, i) => s + (i.paidAmountCents ?? 0), 0),
      openCents: active.reduce((s, i) => s + i.openCents, 0),
      receiptsMissing: installments.filter((i) => i.receiptMissing).length,
    };
  });
}

/** Position in the list: late and critical first, then by next due date; finished ones last. */
function listRank(p: PayableRow, today: string): [number, number, number] {
  if (p.status === "paid" || p.status === "cancelled") {
    const lastPaid = p.installments.reduce((m, i) => (i.paidOn && i.paidOn > m ? i.paidOn : m), "");
    return [3, 0, -Number(lastPaid.replaceAll("-", "") || 0)];
  }
  const due = p.next?.dueOn ?? "9999-12-31";
  if (p.status === "overdue") {
    const days = Math.max(1, daysSince(due, today));
    return [0, -(days * (p.critical ? 2 : 1)), 0];
  }
  return [p.critical ? 1 : 2, Number(due.replaceAll("-", "")), -p.openCents];
}

function daysSince(date: string, today: string): number {
  return Math.round(
    (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) / 86_400_000,
  );
}

function matchesView(p: PayableRow, view: StatusView, today: string): boolean {
  switch (view) {
    case "all":
      return true;
    case "open":
      return p.status === "open" || p.status === "partially_paid" || p.status === "overdue";
    case "overdue":
      return p.status === "overdue";
    case "paid":
      return p.status === "paid";
    case "due": {
      const limit = addDays(today, 14);
      return p.installments.some((i) => i.openCents > 0 && i.dueOn >= today && i.dueOn <= limit);
    }
  }
}

export type FocusItem = { payable: PayableRow; rate: InstallmentRow };

export type PayableList = {
  rows: PayableRow[];
  /** Per status chip, within the other filters. */
  counts: Record<StatusView, number>;
  total: number;
  /** "Diese Woche fällig": rates overdue or due within 7 days, whatever the status chip says. */
  focus: FocusItem[];
};

/**
 * Payables for /finanzen with the filters applied: scope, category, event, venue (location), season
 * (of the event or the venue season), critical, search; `view` is the status chip. Counts per chip
 * respect the other filters.
 */
export async function listPayables(
  actor: Actor,
  today: string,
  filters: PayableFilters = {},
): Promise<PayableList> {
  const empty: PayableList = {
    rows: [],
    counts: { open: 0, due: 0, overdue: 0, paid: 0, all: 0 },
    total: 0,
    focus: [],
  };
  if (!canRead(actor)) return empty;
  const where: (SQL | undefined)[] = [isNull(payable.archivedAt)];
  if (filters.scope && (PAYABLE_SCOPES as readonly string[]).includes(filters.scope))
    where.push(eq(payable.scope, filters.scope as PayableRow["scope"]));
  if (filters.category && (PAYABLE_CATEGORIES as readonly string[]).includes(filters.category))
    where.push(eq(payable.category, filters.category as PayableRow["category"]));
  if (filters.eventId && isUuid(filters.eventId)) where.push(eq(payable.eventId, filters.eventId));
  if (filters.venueId && isUuid(filters.venueId))
    where.push(or(eq(payable.venueId, filters.venueId), eq(event.venueId, filters.venueId)));
  if (filters.season !== undefined)
    where.push(sql`coalesce(${payable.season}, ${event.season}) = ${filters.season}`);
  if (filters.critical) where.push(eq(payable.critical, true));

  const base = await payableBase().where(and(...where));
  const q = filters.q?.trim();
  const matching = q
    ? base.filter((r) => foldIncludes([r.title, r.counterpartyName, r.eventName, r.venueName], q))
    : base;
  const all = await withRates(matching, today);
  const counts = { open: 0, due: 0, overdue: 0, paid: 0, all: all.length } as Record<
    StatusView,
    number
  >;
  for (const view of ["open", "due", "overdue", "paid"] as const) {
    counts[view] = all.filter((p) => matchesView(p, view, today)).length;
  }
  const view = filters.view ?? "open";
  const rows = all
    .filter((p) => matchesView(p, view, today))
    .map((p) => ({ p, rank: listRank(p, today) }))
    .sort(
      (a, b) =>
        a.rank[0] - b.rank[0] ||
        a.rank[1] - b.rank[1] ||
        a.rank[2] - b.rank[2] ||
        a.p.title.localeCompare(b.p.title),
    )
    .map(({ p }) => p);
  const weekEnd = addDays(today, 7);
  const focus = all
    .flatMap((payable) =>
      payable.installments
        .filter(
          (rate) => rate.openCents > 0 && rate.status !== "cancelled" && rate.dueOn <= weekEnd,
        )
        .map((rate) => ({ payable, rate })),
    )
    .sort(
      (a, b) =>
        a.rate.dueOn.localeCompare(b.rate.dueOn) ||
        Number(b.payable.critical) - Number(a.payable.critical) ||
        b.rate.openCents - a.rate.openCents,
    );
  return { rows, counts, total: all.length, focus };
}

/** Seasons that appear on payables or events with payables, newest first (filter select). */
export async function listPayableSeasons(): Promise<number[]> {
  const rows = await db
    .selectDistinct({ season: sql<number>`coalesce(${payable.season}, ${event.season})` })
    .from(payable)
    .leftJoin(event, eq(event.id, payable.eventId))
    .where(isNull(payable.archivedAt));
  return rows
    .map((r) => r.season)
    .filter((s): s is number => typeof s === "number")
    .sort((a, b) => b - a);
}

export type DocumentRow = {
  id: string;
  kind: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  caption: string | null;
  createdAt: string;
  uploadedByName: string | null;
  installmentId: string | null;
  payableId: string | null;
  expenseId: string | null;
};

const documentColumns = {
  id: document.id,
  kind: document.kind,
  fileName: document.fileName,
  mimeType: document.mimeType,
  sizeBytes: document.sizeBytes,
  caption: document.caption,
  createdAt: document.createdAt,
  uploadedByName: staffMember.displayName,
  installmentId: document.installmentId,
  payableId: document.payableId,
  expenseId: document.expenseId,
};

const toDocumentRow = (r: {
  id: string;
  kind: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  caption: string | null;
  createdAt: Date;
  uploadedByName: string | null;
  installmentId: string | null;
  payableId: string | null;
  expenseId: string | null;
}): DocumentRow => ({ ...r, createdAt: r.createdAt.toISOString() });

/** Live documents hanging on the given records (any of the columns), newest first. */
export async function listDocuments(
  actor: Actor,
  link: { payableId?: string; installmentIds?: string[]; expenseIds?: string[]; eventId?: string },
): Promise<DocumentRow[]> {
  if (!canRead(actor)) return [];
  const conditions = [
    link.payableId ? eq(document.payableId, link.payableId) : undefined,
    link.installmentIds?.length ? inArray(document.installmentId, link.installmentIds) : undefined,
    link.expenseIds?.length ? inArray(document.expenseId, link.expenseIds) : undefined,
    link.eventId ? eq(document.eventId, link.eventId) : undefined,
  ].filter((c): c is SQL => c !== undefined);
  if (conditions.length === 0) return [];
  const rows = await db
    .select(documentColumns)
    .from(document)
    .leftJoin(staffMember, eq(staffMember.id, document.uploadedByStaffMemberId))
    .where(and(isNull(document.archivedAt), or(...conditions)))
    .orderBy(desc(document.createdAt));
  return rows.map(toDocumentRow);
}

export type PayableHistoryEntry = {
  id: string;
  action: string;
  at: string;
  actorName: string | null;
  diff: unknown;
};

export type PayableDetail = PayableRow & {
  /** Documents on the payable itself (invoice, contract). */
  documents: DocumentRow[];
  /** Documents on single rates, by rate id. */
  rateDocuments: Record<string, DocumentRow[]>;
  history: PayableHistoryEntry[];
};

/** One payable with rates, receipts and its change history (audit log). */
export async function getPayable(
  actor: Actor,
  id: string,
  today: string,
): Promise<PayableDetail | null> {
  if (!canRead(actor) || !isUuid(id)) return null;
  const [row] = await payableBase().where(and(eq(payable.id, id), isNull(payable.archivedAt)));
  if (!row) return null;
  const [detail] = await withRates([row], today);
  if (!detail) return null;
  const rateIds = detail.installments.map((i) => i.id);
  const [documents, history] = await Promise.all([
    listDocuments(actor, { payableId: id, installmentIds: rateIds }),
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
      .where(
        or(
          and(eq(auditLog.entityType, "payable"), eq(auditLog.entityId, id)),
          and(eq(auditLog.entityType, "installment"), sql`${auditLog.diff}->>'payableId' = ${id}`),
        ),
      )
      .orderBy(desc(auditLog.at))
      .limit(30),
  ]);
  const rateDocuments: Record<string, DocumentRow[]> = {};
  for (const d of documents) {
    if (!d.installmentId) continue;
    const list = rateDocuments[d.installmentId];
    if (list) list.push(d);
    else rateDocuments[d.installmentId] = [d];
  }
  return {
    ...detail,
    documents: documents.filter((d) => d.payableId === id),
    rateDocuments,
    history: history.map((h) => ({ ...h, at: h.at.toISOString() })),
  };
}

/* ------------------------------------------------------------------ KPIs, missing receipts */

export type FinanceKpis = {
  overdueCount: number;
  overdueCents: number;
  /** Open money due in the next 7 days (not overdue). */
  weekCount: number;
  weekCents: number;
  missingReceipts: number;
};

/** The three numbers above the payables list. */
export async function financeKpis(actor: Actor, today: string): Promise<FinanceKpis> {
  if (!canRead(actor))
    return { overdueCount: 0, overdueCents: 0, weekCount: 0, weekCents: 0, missingReceipts: 0 };
  const overdue = await moneyOverdue(actor, today);
  const [week] = await db
    .select({
      n: count(),
      cents: sql<number>`coalesce(sum(${installment.amountCents} - coalesce(${installment.paidAmountCents}, 0)), 0)::int`,
    })
    .from(installment)
    .innerJoin(payable, eq(payable.id, installment.payableId))
    .where(
      and(unpaidRate, gte(installment.dueOn, today), lte(installment.dueOn, addDays(today, 7))),
    );
  return {
    overdueCount: overdue.count,
    overdueCents: overdue.cents,
    weekCount: week?.n ?? 0,
    weekCents: week?.cents ?? 0,
    missingReceipts: (await listMissingReceipts(actor)).length,
  };
}

export type MissingReceipt = {
  kind: "installment" | "expense";
  id: string;
  payableId: string | null;
  title: string;
  counterpartyName: string | null;
  eventName: string | null;
  date: string;
  amountCents: number;
};

/**
 * Money that went out without a receipt: paid or part-paid rates (no receipt on the rate or on its payable)
 * and expenses without a receipt. Newest payment first.
 */
export async function listMissingReceipts(actor: Actor): Promise<MissingReceipt[]> {
  if (!canRead(actor)) return [];
  const receiptKinds = [...RECEIPT_KINDS];
  const [rates, expenses] = await Promise.all([
    db
      .select({
        id: installment.id,
        payableId: payable.id,
        title: payable.title,
        counterpartyName: contact.name,
        eventName: event.name,
        date: installment.paidOn,
        amountCents: installment.paidAmountCents,
      })
      .from(installment)
      .innerJoin(payable, eq(payable.id, installment.payableId))
      .leftJoin(contact, eq(contact.id, payable.counterpartyContactId))
      .leftJoin(event, eq(event.id, payable.eventId))
      .where(
        and(
          inArray(installment.status, ["paid", "partially_paid"]),
          isNotNull(installment.paidOn),
          isNull(payable.archivedAt),
          notExists(
            db
              .select({ one: sql`1` })
              .from(document)
              .where(
                and(
                  isNull(document.archivedAt),
                  inArray(document.kind, receiptKinds),
                  or(
                    eq(document.installmentId, installment.id),
                    eq(document.payableId, payable.id),
                  ),
                ),
              ),
          ),
        ),
      ),
    db
      .select({
        id: expense.id,
        title: expense.description,
        counterpartyName: expense.merchant,
        eventName: event.name,
        date: expense.spentOn,
        amountCents: expense.amountCents,
      })
      .from(expense)
      .leftJoin(event, eq(event.id, expense.eventId))
      .where(
        and(
          isNull(expense.archivedAt),
          notExists(
            db
              .select({ one: sql`1` })
              .from(document)
              .where(
                and(
                  isNull(document.archivedAt),
                  inArray(document.kind, receiptKinds),
                  eq(document.expenseId, expense.id),
                ),
              ),
          ),
        ),
      ),
  ]);
  return [
    ...rates.map((r) => ({
      kind: "installment" as const,
      id: r.id,
      payableId: r.payableId,
      title: r.title,
      counterpartyName: r.counterpartyName,
      eventName: r.eventName,
      date: r.date as string,
      amountCents: r.amountCents ?? 0,
    })),
    ...expenses.map((e) => ({
      kind: "expense" as const,
      id: e.id,
      payableId: null,
      title: e.title,
      counterpartyName: e.counterpartyName,
      eventName: e.eventName,
      date: e.date,
      amountCents: e.amountCents,
    })),
  ].sort((a, b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title));
}

/* ------------------------------------------------------------------ expenses */

export type ExpenseRow = {
  id: string;
  spentOn: string;
  amountCents: number;
  category: (typeof PAYABLE_CATEGORIES)[number];
  description: string;
  merchant: string | null;
  eventId: string | null;
  eventName: string | null;
  vehicleId: string | null;
  vehicleName: string | null;
  paidByName: string | null;
  method: string | null;
  updatedAt: string;
  receiptCount: number;
  documents: DocumentRow[];
};

export type ExpenseFilters = { category?: string; eventId?: string; month?: string };

/** Ad-hoc expenses, newest first, with their receipts. */
export async function listExpenses(
  actor: Actor,
  filters: ExpenseFilters = {},
  limit = 200,
): Promise<ExpenseRow[]> {
  if (!canRead(actor)) return [];
  const where: (SQL | undefined)[] = [isNull(expense.archivedAt)];
  if (filters.category && (PAYABLE_CATEGORIES as readonly string[]).includes(filters.category))
    where.push(eq(expense.category, filters.category as ExpenseRow["category"]));
  if (filters.eventId && isUuid(filters.eventId)) where.push(eq(expense.eventId, filters.eventId));
  if (filters.month && /^\d{4}-\d{2}$/.test(filters.month))
    where.push(sql`to_char(${expense.spentOn}, 'YYYY-MM') = ${filters.month}`);
  const rows = await db
    .select({
      id: expense.id,
      spentOn: expense.spentOn,
      amountCents: expense.amountCents,
      category: expense.category,
      description: expense.description,
      merchant: expense.merchant,
      eventId: expense.eventId,
      eventName: event.name,
      vehicleId: expense.vehicleId,
      vehicleName: vehicle.name,
      paidByName: staffMember.displayName,
      method: expense.method,
      updatedAt: expense.updatedAt,
    })
    .from(expense)
    .leftJoin(event, eq(event.id, expense.eventId))
    .leftJoin(vehicle, eq(vehicle.id, expense.vehicleId))
    .leftJoin(staffMember, eq(staffMember.id, expense.paidByStaffMemberId))
    .where(and(...where))
    .orderBy(desc(expense.spentOn), desc(expense.createdAt))
    .limit(limit);
  const docs = rows.length ? await listDocuments(actor, { expenseIds: rows.map((r) => r.id) }) : [];
  return rows.map((r) => {
    const mine = docs.filter((d) => d.expenseId === r.id);
    return {
      ...r,
      updatedAt: r.updatedAt.toISOString(),
      documents: mine,
      receiptCount: mine.filter((d) => (RECEIPT_KINDS as readonly string[]).includes(d.kind))
        .length,
    };
  });
}

/* ------------------------------------------------------------------ pickers */

export type FinanceOptions = {
  events: { id: string; name: string; startsOn: string; season: number }[];
  venues: { id: string; name: string; city: string }[];
  vehicles: { id: string; name: string; plate: string }[];
  staff: { id: string; name: string }[];
  contacts: { id: string; name: string }[];
};

/** Everything the payable, expense and filter forms pick from. */
export async function listFinanceOptions(includeEventId?: string | null): Promise<FinanceOptions> {
  const [events, venues, vehicles, staff, contacts] = await Promise.all([
    db
      .select({ id: event.id, name: event.name, startsOn: event.startsOn, season: event.season })
      .from(event)
      .where(
        and(
          isNull(event.archivedAt),
          includeEventId && isUuid(includeEventId)
            ? or(
                eq(event.id, includeEventId),
                gte(event.startsOn, sql`(current_date - interval '120 days')::date`),
              )
            : gte(event.startsOn, sql`(current_date - interval '120 days')::date`),
        ),
      )
      .orderBy(asc(event.startsOn))
      .limit(400),
    db
      .select({ id: venue.id, name: venue.name, city: venue.city })
      .from(venue)
      .where(isNull(venue.archivedAt))
      .orderBy(asc(venue.city), asc(venue.name)),
    db
      .select({ id: vehicle.id, name: vehicle.name, plate: vehicle.plate })
      .from(vehicle)
      .where(isNull(vehicle.archivedAt))
      .orderBy(asc(vehicle.name)),
    db
      .select({ id: staffMember.id, name: staffMember.displayName })
      .from(staffMember)
      .where(and(eq(staffMember.active, true), isNull(staffMember.archivedAt)))
      .orderBy(asc(staffMember.displayName)),
    db
      .select({ id: contact.id, name: contact.name })
      .from(contact)
      .where(isNull(contact.archivedAt))
      .orderBy(asc(contact.name)),
  ]);
  return { events, venues, vehicles, staff, contacts };
}

/* ------------------------------------------------------------------ event money */

export type EventMoneyPayable = {
  id: string;
  title: string;
  category: (typeof PAYABLE_CATEGORIES)[number];
  critical: boolean;
  counterpartyName: string | null;
  status: PayableStatus;
  committedCents: number;
  actualCents: number;
  next: { id: string; dueOn: string; openCents: number } | null;
};

export type SeasonPayable = EventMoneyPayable & {
  venueId: string;
  season: number;
  /** Share of this event: the payable divided by the events at the venue in that season. */
  shareCommittedCents: number;
  shareActualCents: number;
};

export type EventMoney = {
  event: { id: string; name: string; venueId: string; venueName: string; season: number };
  rows: BudgetRow[];
  totals: BudgetTotals;
  /** Plan lines as stored, for the editable plan column. */
  lines: { category: string; plannedCents: number; notes: string | null }[];
  payables: EventMoneyPayable[];
  expenses: {
    id: string;
    spentOn: string;
    amountCents: number;
    category: (typeof PAYABLE_CATEGORIES)[number];
    description: string;
    merchant: string | null;
    receiptCount: number;
  }[];
  income: {
    id: string;
    label: string;
    amountCents: number;
    receivedOn: string | null;
    notes: string | null;
  }[];
  incomeCents: number;
  seasonPayables: SeasonPayable[];
  seasonEventCount: number;
  seasonShare: { committedCents: number; actualCents: number };
  summary: {
    installmentsPaid: number;
    installmentsTotal: number;
    overdueCount: number;
    dueSoonCount: number;
    missingReceipts: number;
    health: HealthLevel | null;
  };
};

type RateLike = {
  payableId: string;
  id: string;
  dueOn: string;
  status: "open" | "partially_paid" | "paid" | "cancelled";
  amountCents: number;
  paidAmountCents: number | null;
};

function payableMoney(
  rows: {
    id: string;
    title: string;
    category: EventMoneyPayable["category"];
    critical: boolean;
    counterpartyName: string | null;
  }[],
  rates: RateLike[],
  today: string,
): EventMoneyPayable[] {
  return rows.map((row) => {
    const mine = rates.filter((r) => r.payableId === row.id);
    const active = mine.filter((r) => r.status !== "cancelled");
    const next = nextOpenInstallment(active);
    return {
      ...row,
      status: derivePayableStatus(mine, today),
      committedCents: active.reduce((s, r) => s + r.amountCents, 0),
      actualCents: active.reduce((s, r) => s + (r.paidAmountCents ?? 0), 0),
      next: next ? { id: next.id, dueOn: next.dueOn, openCents: openAmountCents(next) } : null,
    };
  });
}

async function loadEventMoney(
  actor: Actor,
  eventId: string,
  today: string,
): Promise<EventMoney | null> {
  if (!canRead(actor) || !isUuid(eventId)) return null;
  const [ev] = await db
    .select({
      id: event.id,
      name: event.name,
      venueId: event.venueId,
      venueName: venue.name,
      season: event.season,
    })
    .from(event)
    .innerJoin(venue, eq(venue.id, event.venueId))
    .where(and(eq(event.id, eventId), visibleEvents(actor)));
  if (!ev) return null;

  const payableColumnsLite = {
    id: payable.id,
    title: payable.title,
    category: payable.category,
    critical: payable.critical,
    counterpartyName: contact.name,
  };
  const [lines, income, own, seasonOwn, expenses, seasonEvents] = await Promise.all([
    db.select().from(eventBudgetLine).where(eq(eventBudgetLine.eventId, eventId)),
    db
      .select()
      .from(eventIncome)
      .where(and(eq(eventIncome.eventId, eventId), isNull(eventIncome.archivedAt)))
      .orderBy(asc(eventIncome.receivedOn), asc(eventIncome.label)),
    db
      .select(payableColumnsLite)
      .from(payable)
      .leftJoin(contact, eq(contact.id, payable.counterpartyContactId))
      .where(and(eq(payable.eventId, eventId), isNull(payable.archivedAt)))
      .orderBy(asc(payable.title)),
    db
      .select({ ...payableColumnsLite, venueId: payable.venueId, season: payable.season })
      .from(payable)
      .leftJoin(contact, eq(contact.id, payable.counterpartyContactId))
      .where(
        and(
          eq(payable.scope, "venue_season"),
          eq(payable.venueId, ev.venueId),
          eq(payable.season, ev.season),
          isNull(payable.archivedAt),
        ),
      )
      .orderBy(asc(payable.title)),
    db
      .select({
        id: expense.id,
        spentOn: expense.spentOn,
        amountCents: expense.amountCents,
        category: expense.category,
        description: expense.description,
        merchant: expense.merchant,
      })
      .from(expense)
      .where(and(eq(expense.eventId, eventId), isNull(expense.archivedAt)))
      .orderBy(desc(expense.spentOn)),
    db
      .select({ n: count() })
      .from(event)
      .where(
        and(
          eq(event.venueId, ev.venueId),
          eq(event.season, ev.season),
          isNull(event.archivedAt),
          ne(event.status, "cancelled"),
        ),
      ),
  ]);

  const payableIds = [...own.map((p) => p.id), ...seasonOwn.map((p) => p.id)];
  const rates: RateLike[] = payableIds.length
    ? await db
        .select({
          id: installment.id,
          payableId: installment.payableId,
          dueOn: installment.dueOn,
          status: installment.status,
          amountCents: installment.amountCents,
          paidAmountCents: installment.paidAmountCents,
        })
        .from(installment)
        .where(inArray(installment.payableId, payableIds))
    : [];

  const payables = payableMoney(own, rates, today);
  const seasonEventCount = Math.max(1, seasonEvents[0]?.n ?? 1);
  const seasonPayables: SeasonPayable[] = payableMoney(seasonOwn, rates, today).map((p, i) => ({
    ...p,
    venueId: seasonOwn[i]?.venueId as string,
    season: seasonOwn[i]?.season as number,
    shareCommittedCents: seasonShareCents(p.committedCents, seasonEventCount),
    shareActualCents: seasonShareCents(p.actualCents, seasonEventCount),
  }));

  const expenseDocs = expenses.length
    ? await db
        .select({ expenseId: document.expenseId })
        .from(document)
        .where(
          and(
            isNull(document.archivedAt),
            inArray(document.kind, [...RECEIPT_KINDS]),
            inArray(
              document.expenseId,
              expenses.map((e) => e.id),
            ),
          ),
        )
    : [];
  const receiptsOf = new Map<string, number>();
  for (const d of expenseDocs) {
    if (d.expenseId) receiptsOf.set(d.expenseId, (receiptsOf.get(d.expenseId) ?? 0) + 1);
  }

  const budget = aggregateBudget(
    {
      planned: lines.map((l) => ({ category: l.category, plannedCents: l.plannedCents })),
      payables,
      expenses,
    },
    PAYABLE_CATEGORIES,
  );

  const ownRates = rates.filter(
    (r) => own.some((p) => p.id === r.payableId) && r.status !== "cancelled",
  );
  const overdueCount = ownRates.filter((r) => installmentState(r, today) === "overdue").length;
  const dueSoonCount = ownRates.filter(
    (r) => openAmountCents(r) > 0 && r.dueOn >= today && r.dueOn <= addDays(today, 7),
  ).length;
  const [missing] = await Promise.all([listMissingReceipts(actor)]);
  const ownPayableIds = new Set(own.map((p) => p.id));
  const missingReceipts =
    missing.filter((m) => m.kind === "installment" && m.payableId && ownPayableIds.has(m.payableId))
      .length +
    missing.filter((m) => m.kind === "expense" && expenses.some((e) => e.id === m.id)).length;

  return {
    event: {
      id: ev.id,
      name: ev.name,
      venueId: ev.venueId,
      venueName: ev.venueName,
      season: ev.season,
    },
    rows: budget.rows,
    totals: budget.totals,
    lines: lines.map((l) => ({
      category: l.category,
      plannedCents: l.plannedCents,
      notes: l.notes,
    })),
    payables,
    expenses: expenses.map((e) => ({ ...e, receiptCount: receiptsOf.get(e.id) ?? 0 })),
    income: income.map((i) => ({
      id: i.id,
      label: i.label,
      amountCents: i.amountCents,
      receivedOn: i.receivedOn,
      notes: i.notes,
    })),
    incomeCents: income.reduce((s, i) => s + i.amountCents, 0),
    seasonPayables,
    seasonEventCount,
    seasonShare: {
      committedCents: seasonPayables.reduce((s, p) => s + p.shareCommittedCents, 0),
      actualCents: seasonPayables.reduce((s, p) => s + p.shareActualCents, 0),
    },
    summary: {
      installmentsPaid: ownRates.filter((r) => r.status === "paid").length,
      installmentsTotal: ownRates.length,
      overdueCount,
      dueSoonCount,
      missingReceipts,
      health: eventMoneyHealth({
        overdueCount,
        dueSoonCount,
        installmentCount: ownRates.length,
        plannedCents: budget.totals.plannedCents,
        committedCents: budget.totals.committedCents,
      }),
    },
  };
}

/** The Geld tab of one event: plan → committed → actual per category, payables, income, health. Cached per request. */
export const getEventMoney = cache(loadEventMoney);
