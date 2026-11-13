import "server-only";
import { can, type PermitStatus, permitDisplayState } from "@marktwerk/core";
import {
  auditLog,
  document,
  event,
  permit,
  staffMember,
  task,
  user,
  vehicle,
  venue,
} from "@marktwerk/db/schema";
import {
  aliasedTable,
  and,
  count,
  desc,
  eq,
  ilike,
  inArray,
  isNull,
  lt,
  or,
  type SQL,
  sql,
} from "drizzle-orm";
import { isModuleHidden } from "@/lib/modules";
import type { Actor } from "../actor";
import { db } from "../db";
import { DOCUMENT_LINK_KEYS, type DocumentLinkKey, documentLinkScope } from "../services/documents";
import { canReadDocuments } from "./documents";

/*
 * The Archiv's sections beyond past events (decision 2026-11-03): every document, the company-wide activity and
 * old permits. Each list is paged in SQL (`limit`/`offset`) and returns the total for the pager.
 */

export type Paged<T> = { rows: T[]; total: number };

const like = (q: string) => `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;

// ---------------------------------------------------------------------------------------------
// Dokumente

/** Link columns of hidden modules stay out (their records have no screen to open). */
const HIDDEN_LINKS: Partial<Record<DocumentLinkKey, () => boolean>> = {
  payableId: () => isModuleHidden("finance"),
  installmentId: () => isModuleHidden("finance"),
  expenseId: () => isModuleHidden("finance"),
  employmentContractId: () => isModuleHidden("team"),
  payrollPeriodId: () => isModuleHidden("team"),
};

const taskEvent = aliasedTable(event, "task_event");

/**
 * Every live document the person may read, newest first, with what it belongs to (event, permit, venue, task,
 * vehicle …). `q` searches the file name and caption; `kind` narrows to one document kind.
 * Field users get the download's rule (`readDocument`): every link of the document must be one they may read, and
 * its event or task one they can see (`documentLinkScope`). Office roles see every document of a readable kind.
 */
export async function listArchiveDocuments(
  actor: Actor,
  filters: { q?: string; kind?: string; page: number; size: number },
): Promise<Paged<ArchiveDocument>> {
  const readable = DOCUMENT_LINK_KEYS.filter(
    (key) => canReadDocuments(actor, key) && !HIDDEN_LINKS[key]?.(),
  );
  if (readable.length === 0) return { rows: [], total: 0 };
  const where: (SQL | undefined)[] = [
    isNull(document.archivedAt),
    or(...readable.map((key) => sql`${document[key]} is not null`)),
  ];
  const scoped = readable.flatMap((key) => {
    const scope = documentLinkScope(actor, key, document[key]);
    return scope ? [or(isNull(document[key]), scope)] : [];
  });
  if (scoped.length > 0) {
    const unreadable = DOCUMENT_LINK_KEYS.filter((key) => !readable.includes(key));
    where.push(...unreadable.map((key) => isNull(document[key])), ...scoped);
  }
  if (filters.q) {
    const pattern = like(filters.q);
    where.push(or(ilike(document.fileName, pattern), ilike(document.caption, pattern)));
  }
  if (filters.kind) where.push(sql`${document.kind}::text = ${filters.kind}`);
  const condition = and(...where);

  const [rows, [totals]] = await Promise.all([
    db
      .select({
        id: document.id,
        kind: document.kind,
        fileName: document.fileName,
        sizeBytes: document.sizeBytes,
        caption: document.caption,
        createdAt: document.createdAt,
        uploadedByName: staffMember.displayName,
        eventId: sql<string | null>`coalesce(${document.eventId}, ${task.eventId})`,
        eventName: sql<string | null>`coalesce(${event.name}, ${taskEvent.name})`,
        permitId: document.permitId,
        permitTitle: permit.title,
        venueId: document.venueId,
        venueName: venue.name,
        taskId: document.taskId,
        taskTitle: task.title,
        vehicleId: document.vehicleId,
        vehicleName: vehicle.name,
      })
      .from(document)
      .leftJoin(staffMember, eq(staffMember.id, document.uploadedByStaffMemberId))
      .leftJoin(event, eq(event.id, document.eventId))
      .leftJoin(task, eq(task.id, document.taskId))
      .leftJoin(taskEvent, eq(taskEvent.id, task.eventId))
      .leftJoin(permit, eq(permit.id, document.permitId))
      .leftJoin(venue, eq(venue.id, document.venueId))
      .leftJoin(vehicle, eq(vehicle.id, document.vehicleId))
      .where(condition)
      .orderBy(desc(document.createdAt), desc(document.id))
      .limit(filters.size)
      .offset((filters.page - 1) * filters.size),
    db.select({ n: count() }).from(document).where(condition),
  ]);
  return {
    rows: rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
    total: totals?.n ?? 0,
  };
}

export type ArchiveDocument = {
  id: string;
  kind: string;
  fileName: string;
  sizeBytes: number;
  caption: string | null;
  createdAt: string;
  uploadedByName: string | null;
  eventId: string | null;
  eventName: string | null;
  permitId: string | null;
  permitTitle: string | null;
  venueId: string | null;
  venueName: string | null;
  taskId: string | null;
  taskTitle: string | null;
  vehicleId: string | null;
  vehicleName: string | null;
};

// ---------------------------------------------------------------------------------------------
// Aktivität

/** Areas to filter the activity by (the audit entry's entity type). */
export const ACTIVITY_AREAS = ["event", "task", "permit", "document", "template"] as const;
export type ActivityArea = (typeof ACTIVITY_AREAS)[number];
const AREA_TYPES: Record<ActivityArea, string[]> = {
  event: ["event"],
  task: ["task"],
  permit: ["permit", "permit_requirement"],
  document: ["document"],
  template: ["event_preset", "checklist_template", "template_version"],
};

export type ActivityEntry = {
  id: string;
  at: string;
  action: string;
  entityType: string;
  entityId: string | null;
  diff: unknown;
  actorName: string | null;
  taskTitle: string | null;
  taskEventId: string | null;
  permitTitle: string | null;
  eventName: string | null;
};

/**
 * The company-wide activity: every audit entry, newest first, with who did it and the name of what it was about
 * (task, permit, event). Owner and manager only (`audit:read`); `area` narrows to one kind of record.
 */
export async function listActivity(
  actor: Actor,
  filters: { area?: ActivityArea; page: number; size: number },
): Promise<Paged<ActivityEntry>> {
  if (!can(actor.role, "audit", "read")) return { rows: [], total: 0 };
  const condition = filters.area
    ? inArray(auditLog.entityType, AREA_TYPES[filters.area])
    : undefined;
  const [rows, [totals]] = await Promise.all([
    db
      .select({
        id: auditLog.id,
        at: auditLog.at,
        action: auditLog.action,
        entityType: auditLog.entityType,
        entityId: auditLog.entityId,
        diff: auditLog.diff,
        actorName: sql<string | null>`coalesce(${staffMember.displayName}, ${user.name})`,
        taskTitle: task.title,
        taskEventId: task.eventId,
        permitTitle: permit.title,
        eventName: event.name,
      })
      .from(auditLog)
      .leftJoin(user, eq(user.id, auditLog.actorId))
      .leftJoin(staffMember, eq(staffMember.userId, auditLog.actorId))
      .leftJoin(task, and(eq(auditLog.entityType, "task"), eq(task.id, auditLog.entityId)))
      .leftJoin(permit, and(eq(auditLog.entityType, "permit"), eq(permit.id, auditLog.entityId)))
      .leftJoin(event, and(eq(auditLog.entityType, "event"), eq(event.id, auditLog.entityId)))
      .where(condition)
      .orderBy(desc(auditLog.at), desc(auditLog.id))
      .limit(filters.size)
      .offset((filters.page - 1) * filters.size),
    db.select({ n: count() }).from(auditLog).where(condition),
  ]);
  return {
    rows: rows.map((r) => ({ ...r, at: r.at.toISOString() })),
    total: totals?.n ?? 0,
  };
}

// ---------------------------------------------------------------------------------------------
// Alte Genehmigungen

export type OldPermit = {
  id: string;
  title: string;
  permitType: string;
  status: PermitStatus;
  state: ReturnType<typeof permitDisplayState>;
  season: number | null;
  venueName: string | null;
  referenceNo: string | null;
  validUntil: string | null;
};

/**
 * Permits that are history: replaced (Ersetzt), not needed, or granted and run out (valid until before today).
 * Newest validity first; `q` searches title, venue and reference number.
 */
export async function listOldPermits(
  actor: Actor,
  today: string,
  filters: { q?: string; page: number; size: number },
): Promise<Paged<OldPermit>> {
  if (!can(actor.role, "permit", "read")) return { rows: [], total: 0 };
  const where: (SQL | undefined)[] = [
    isNull(permit.archivedAt),
    or(
      inArray(permit.status, ["superseded", "not_required"]),
      and(eq(permit.status, "granted"), lt(permit.validUntil, today)),
    ),
  ];
  if (filters.q) {
    const pattern = like(filters.q);
    where.push(
      or(
        ilike(permit.title, pattern),
        ilike(venue.name, pattern),
        ilike(permit.referenceNo, pattern),
      ),
    );
  }
  const condition = and(...where);
  const [rows, [totals]] = await Promise.all([
    db
      .select({
        id: permit.id,
        title: permit.title,
        permitType: permit.permitType,
        status: permit.status,
        season: permit.season,
        venueName: venue.name,
        referenceNo: permit.referenceNo,
        validUntil: permit.validUntil,
      })
      .from(permit)
      .leftJoin(venue, eq(venue.id, permit.venueId))
      .where(condition)
      .orderBy(sql`${permit.validUntil} desc nulls last`, desc(permit.season), desc(permit.id))
      .limit(filters.size)
      .offset((filters.page - 1) * filters.size),
    db
      .select({ n: count() })
      .from(permit)
      .leftJoin(venue, eq(venue.id, permit.venueId))
      .where(condition),
  ]);
  return {
    rows: rows.map((r) => ({
      ...r,
      status: r.status as PermitStatus,
      state: permitDisplayState(
        { status: r.status as PermitStatus, validUntil: r.validUntil },
        today,
      ),
    })),
    total: totals?.n ?? 0,
  };
}
