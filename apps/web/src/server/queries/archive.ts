import "server-only";
import { can, type PermitStatus, permitDisplayState } from "@marktwerk/core";
import {
  auditLog,
  document,
  event,
  eventPreset,
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
  isNotNull,
  isNull,
  lt,
  or,
  type SQL,
  sql,
} from "drizzle-orm";
import type { PgSelect } from "drizzle-orm/pg-core";
import { isModuleHidden } from "@/lib/modules";
import type { Actor } from "../actor";
import { db } from "../db";
import { DOCUMENT_LINK_KEYS, type DocumentLinkKey, documentLinkScope } from "../services/documents";
import { canReadDocuments, canWriteDocuments } from "./documents";

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
const archivedBy = aliasedTable(staffMember, "archived_by");

/** Same folding as the Aussteller list and the command palette: "koln" finds "Köln", "muller" "Müller". */
function fold(column: unknown): SQL {
  return sql`translate(lower(${column}), 'äöüßéèêáàâóòôíìîúùûç', 'aousseeeaaaoooiiiuuuc')`;
}

function foldWord(word: string): string {
  return word
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/ß/g, "s");
}

/** The event a document belongs to: its own, or that of its task. */
const ownerEventId = sql`coalesce(${document.eventId}, ${task.eventId})`;
/** The Markt (event preset) of that event. */
const ownerPresetId = sql`coalesce(${event.presetId}, ${taskEvent.presetId})`;
/**
 * The year a document is filed under: the season of its event (so the papers of Nippes 2025 stay 2025 even
 * when uploaded in January), else the permit's season, else the year it was uploaded (Berlin time).
 */
const documentYear = sql<number>`coalesce(${event.season}, ${taskEvent.season}, ${permit.season}, extract(year from ${document.createdAt} at time zone 'Europe/Berlin')::int)`;

/** The documents the actor may read at all (role grants, hidden modules, field users' row scope). */
function readableDocuments(actor: Actor): { where: (SQL | undefined)[]; writable: SQL } | null {
  const readable = DOCUMENT_LINK_KEYS.filter(
    (key) => canReadDocuments(actor, key) && !HIDDEN_LINKS[key]?.(),
  );
  if (readable.length === 0) return null;
  const where: (SQL | undefined)[] = [
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
  // Removing and restoring need the write grant of every link (the service checks it again).
  const unwritable = DOCUMENT_LINK_KEYS.filter((key) => !canWriteDocuments(actor, key));
  const writable =
    unwritable.length === 0
      ? sql`true`
      : sql`(${and(...unwritable.map((key) => isNull(document[key])))})`;
  return { where, writable };
}

/**
 * The owner records of a document, for search, filters and "Gehört zu". Keeps the caller's select type: the
 * selected columns of these tables are declared nullable where they are read.
 */
function withOwners<T extends PgSelect>(query: T): T {
  return query
    .leftJoin(task, eq(task.id, document.taskId))
    .leftJoin(event, eq(event.id, document.eventId))
    .leftJoin(taskEvent, eq(taskEvent.id, task.eventId))
    .leftJoin(eventPreset, sql`${eventPreset.id} = ${ownerPresetId}`)
    .leftJoin(permit, eq(permit.id, document.permitId))
    .leftJoin(venue, eq(venue.id, document.venueId))
    .leftJoin(vehicle, eq(vehicle.id, document.vehicleId)) as unknown as T;
}

export type ArchiveDocumentFilters = {
  q?: string;
  kind?: string;
  /** Markt (event preset) id. */
  presetId?: string;
  year?: number;
  /** The removed documents instead of the live ones (to restore them). */
  removed?: boolean;
  page: number;
  size: number;
};

/**
 * Every document the person may read, newest first, with what it belongs to (event with its dates, permit,
 * venue, task, vehicle …). `q` searches word by word, umlauts folded, in the file name, the description and
 * the names of what it belongs to (event, Markt, task, permit, Ort, vehicle and plate): "Nippes Vertrag" finds
 * the contract of the Nippes market. `kind`, `presetId` (Markt) and `year` (see `documentYear`) narrow it.
 * `removed` lists the removed documents instead, newest removal first, for "Wiederherstellen".
 * Field users get the download's rule (`readDocument`): every link of the document must be one they may read, and
 * its event or task one they can see (`documentLinkScope`). Office roles see every document of a readable kind.
 */
export async function listArchiveDocuments(
  actor: Actor,
  filters: ArchiveDocumentFilters,
): Promise<Paged<ArchiveDocument>> {
  const scope = readableDocuments(actor);
  if (!scope) return { rows: [], total: 0 };
  const where = [
    ...scope.where,
    filters.removed ? isNotNull(document.archivedAt) : isNull(document.archivedAt),
  ];
  const words = (filters.q ?? "")
    .split(/\s+/)
    .filter((w) => w !== "")
    .slice(0, 6);
  for (const word of words) {
    const pattern = like(foldWord(word));
    where.push(
      or(
        ...[
          document.fileName,
          document.caption,
          event.name,
          taskEvent.name,
          eventPreset.name,
          task.title,
          permit.title,
          venue.name,
          vehicle.name,
          vehicle.plate,
        ].map((column) => sql`${fold(column)} like ${pattern}`),
      ),
    );
  }
  if (filters.kind) where.push(sql`${document.kind}::text = ${filters.kind}`);
  if (filters.presetId) where.push(sql`${ownerPresetId} = ${filters.presetId}`);
  if (filters.year) where.push(sql`${documentYear} = ${filters.year}`);
  const condition = and(...where);

  const [rows, [totals]] = await Promise.all([
    withOwners(
      db
        .select({
          id: document.id,
          kind: document.kind,
          fileName: document.fileName,
          sizeBytes: document.sizeBytes,
          caption: document.caption,
          createdAt: document.createdAt,
          uploadedByName: staffMember.displayName,
          archivedAt: document.archivedAt,
          archivedByName: archivedBy.displayName,
          canWrite: sql<boolean>`${scope.writable}`,
          eventId: sql<string | null>`${ownerEventId}`,
          eventName: sql<string | null>`coalesce(${event.name}, ${taskEvent.name})`,
          eventStartsOn: sql<
            string | null
          >`coalesce(${event.startsOn}, ${taskEvent.startsOn})::text`,
          eventEndsOn: sql<string | null>`coalesce(${event.endsOn}, ${taskEvent.endsOn})::text`,
          presetName: eventPreset.name,
          permitId: document.permitId,
          permitTitle: permit.title,
          permitSeason: permit.season,
          venueId: document.venueId,
          venueName: venue.name,
          taskId: document.taskId,
          taskTitle: task.title,
          vehicleId: document.vehicleId,
          vehicleName: vehicle.name,
        })
        .from(document)
        .leftJoin(staffMember, eq(staffMember.id, document.uploadedByStaffMemberId))
        .leftJoin(archivedBy, eq(archivedBy.id, document.archivedByStaffMemberId))
        .$dynamic(),
    )
      .where(condition)
      .orderBy(
        ...(filters.removed ? [desc(document.archivedAt)] : []),
        desc(document.createdAt),
        desc(document.id),
      )
      .limit(filters.size)
      .offset((filters.page - 1) * filters.size),
    withOwners(db.select({ n: count() }).from(document).$dynamic()).where(condition),
  ]);
  return {
    rows: rows.map((r) => ({
      ...r,
      canWrite: r.canWrite === true,
      createdAt: r.createdAt.toISOString(),
      archivedAt: r.archivedAt?.toISOString() ?? null,
    })),
    total: totals?.n ?? 0,
  };
}

/**
 * The choices of the Markt and Jahr filters: only Märkte and years that have live documents the person may
 * read, so no choice leads to an empty list.
 */
export async function archiveDocumentFacets(
  actor: Actor,
): Promise<{ presets: { id: string; name: string }[]; years: number[] }> {
  const scope = readableDocuments(actor);
  if (!scope) return { presets: [], years: [] };
  const condition = and(...scope.where, isNull(document.archivedAt));
  const [presets, years] = await Promise.all([
    withOwners(
      db
        .selectDistinct({ presetId: eventPreset.id, presetName: eventPreset.name })
        .from(document)
        .$dynamic(),
    ).where(and(condition, isNotNull(eventPreset.id))),
    withOwners(db.selectDistinct({ year: documentYear }).from(document).$dynamic()).where(
      condition,
    ),
  ]);
  return {
    presets: presets
      .map((p) => ({ id: String(p.presetId), name: String(p.presetName) }))
      .sort((a, b) => a.name.localeCompare(b.name, "de")),
    years: years.map((y) => Number(y.year)).sort((a, b) => b - a),
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
  /** Set on removed documents (`removed: true`). */
  archivedAt: string | null;
  archivedByName: string | null;
  /** Whether the person may remove or restore it (write grant of every link). */
  canWrite: boolean;
  eventId: string | null;
  eventName: string | null;
  eventStartsOn: string | null;
  eventEndsOn: string | null;
  presetName: string | null;
  permitId: string | null;
  permitTitle: string | null;
  permitSeason: number | null;
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
