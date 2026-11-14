import "server-only";
import { can, type PermitStatus, permitDisplayState } from "@marktwerk/core";
import {
  appointment,
  auditLog,
  checklist,
  checklistTemplate,
  contact,
  document,
  event,
  eventPreset,
  eventSeason,
  expense,
  installment,
  locationAgreement,
  nextTimeNote,
  notification,
  obligation,
  payable,
  permit,
  permitRequirement,
  staffMember,
  task,
  templateVersion,
  user,
  vehicle,
  vehicleIssue,
  venue,
  venueRow,
  zone,
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

/**
 * Umlauts and accents lose their marks and ß becomes s, the SQL twin of `foldWord`: "koln" finds "Köln",
 * "muller" "Müller", "cafe" "Café". `translate()` maps character by character, so both strings have 20.
 */
function fold(column: unknown): SQL {
  return sql`translate(lower(${column}), 'äöüßéèêáàâóòôíìîúùûç', 'aouseeeaaaoooiiiuuuc')`;
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
 * The choices of the Markt and Jahr filters: only Märkte and years that have documents the person may read in
 * the list shown (live ones, or the removed ones with `removed`), so no choice leads to an empty list.
 */
export async function archiveDocumentFacets(
  actor: Actor,
  { removed = false }: { removed?: boolean } = {},
): Promise<{ presets: { id: string; name: string }[]; years: number[] }> {
  const scope = readableDocuments(actor);
  if (!scope) return { presets: [], years: [] };
  const condition = and(
    ...scope.where,
    removed ? isNotNull(document.archivedAt) : isNull(document.archivedAt),
  );
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
export const ACTIVITY_AREAS = [
  "event",
  "task",
  "permit",
  "document",
  "template",
  "venue",
  "contact",
  "company",
  "appointment",
] as const;
export type ActivityArea = (typeof ACTIVITY_AREAS)[number];
const AREA_TYPES: Record<ActivityArea, string[]> = {
  event: ["event", "checklist"],
  task: ["task"],
  permit: ["permit", "permit_requirement"],
  document: ["document"],
  // A Saison and a "Notiz fürs nächste Mal" belong to a Markt (their page is /vorlagen/<id>).
  template: [
    "event_preset",
    "event_season",
    "next_time_note",
    "checklist_template",
    "template_version",
  ],
  venue: ["venue", "zone", "row", "location_agreement"],
  contact: ["contact"],
  company: ["vehicle", "vehicle_issue", "obligation"],
  appointment: ["appointment"],
};

/** What an entry was about: a name and, when there is a page for it, a link. */
export type ActivityTarget = { label: string; href?: string };

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
  /** The record's current name, else a name the entry itself carries (file name, title); null when neither. */
  target: ActivityTarget | null;
};

type Named = { id: string; label: string | null; href?: string };

/**
 * Per entity type: the names (and pages) of the given records, in one query each. Only the types on the page
 * are asked for. Records of hidden modules get a name but no link.
 */
const TARGETS: Record<string, (ids: string[]) => Promise<Named[]>> = {
  contact: async (ids) =>
    (
      await db
        .select({ id: contact.id, label: contact.name })
        .from(contact)
        .where(inArray(contact.id, ids))
    ).map((r) => ({ ...r, href: `/kontakte?vorschau=${r.id}` })),
  venue: async (ids) =>
    (
      await db.select({ id: venue.id, label: venue.name }).from(venue).where(inArray(venue.id, ids))
    ).map((r) => ({ ...r, href: `/orte/${r.id}` })),
  zone: async (ids) =>
    (
      await db
        .select({ id: zone.id, zone: zone.name, venue: venue.name, venueId: zone.venueId })
        .from(zone)
        .innerJoin(venue, eq(venue.id, zone.venueId))
        .where(inArray(zone.id, ids))
    ).map((r) => ({ id: r.id, label: `${r.venue} · ${r.zone}`, href: `/orte/${r.venueId}` })),
  row: async (ids) =>
    (
      await db
        .select({ id: venueRow.id, row: venueRow.label, venue: venue.name, venueId: zone.venueId })
        .from(venueRow)
        .innerJoin(zone, eq(zone.id, venueRow.zoneId))
        .innerJoin(venue, eq(venue.id, zone.venueId))
        .where(inArray(venueRow.id, ids))
    ).map((r) => ({ id: r.id, label: `${r.venue} · ${r.row}`, href: `/orte/${r.venueId}` })),
  location_agreement: async (ids) =>
    (
      await db
        .select({ id: locationAgreement.id, label: venue.name, venueId: locationAgreement.venueId })
        .from(locationAgreement)
        .innerJoin(venue, eq(venue.id, locationAgreement.venueId))
        .where(inArray(locationAgreement.id, ids))
    ).map((r) => ({ id: r.id, label: r.label, href: `/orte/${r.venueId}` })),
  permit_requirement: async (ids) =>
    (
      await db
        .select({
          id: permitRequirement.id,
          label: permitRequirement.title,
          venueId: permitRequirement.venueId,
        })
        .from(permitRequirement)
        .where(inArray(permitRequirement.id, ids))
    ).map((r) => ({
      id: r.id,
      label: r.label,
      href: `/orte/${r.venueId}/genehmigungen/${r.id}`,
    })),
  vehicle: async (ids) =>
    (
      await db
        .select({ id: vehicle.id, label: vehicle.name })
        .from(vehicle)
        .where(inArray(vehicle.id, ids))
    ).map((r) => ({ ...r, href: `/firma/fahrzeuge/${r.id}` })),
  vehicle_issue: async (ids) =>
    (
      await db
        .select({ id: vehicleIssue.id, title: vehicleIssue.title, vehicle: vehicle.name })
        .from(vehicleIssue)
        .innerJoin(vehicle, eq(vehicle.id, vehicleIssue.vehicleId))
        .where(inArray(vehicleIssue.id, ids))
    ).map((r) => ({ id: r.id, label: `${r.vehicle}: ${r.title}`, href: "/firma/maengel" })),
  obligation: async (ids) =>
    (
      await db
        .select({ id: obligation.id, label: obligation.title })
        .from(obligation)
        .where(inArray(obligation.id, ids))
    ).map((r) => ({ ...r, href: `/firma/pflichten/${r.id}` })),
  appointment: async (ids) =>
    (
      await db
        .select({ id: appointment.id, label: appointment.title })
        .from(appointment)
        .where(inArray(appointment.id, ids))
    ).map((r) => ({ ...r, href: `/kalender?vorschau=besprechung:${r.id}` })),
  event_preset: async (ids) =>
    (
      await db
        .select({ id: eventPreset.id, label: eventPreset.name })
        .from(eventPreset)
        .where(inArray(eventPreset.id, ids))
    ).map((r) => ({ ...r, href: `/vorlagen/${r.id}` })),
  event_season: async (ids) =>
    (
      await db
        .select({
          id: eventSeason.id,
          name: eventPreset.name,
          season: eventSeason.season,
          presetId: eventSeason.presetId,
        })
        .from(eventSeason)
        .innerJoin(eventPreset, eq(eventPreset.id, eventSeason.presetId))
        .where(inArray(eventSeason.id, ids))
    ).map((r) => ({ id: r.id, label: `${r.name} ${r.season}`, href: `/vorlagen/${r.presetId}` })),
  checklist_template: async (ids) =>
    (
      await db
        .select({ id: checklistTemplate.id, label: checklistTemplate.name })
        .from(checklistTemplate)
        .where(inArray(checklistTemplate.id, ids))
    ).map((r) => ({ ...r, href: `/vorlagen/ablauf/${r.id}` })),
  template_version: async (ids) =>
    (
      await db
        .select({
          id: templateVersion.id,
          label: checklistTemplate.name,
          templateId: templateVersion.templateId,
        })
        .from(templateVersion)
        .innerJoin(checklistTemplate, eq(checklistTemplate.id, templateVersion.templateId))
        .where(inArray(templateVersion.id, ids))
    ).map((r) => ({ id: r.id, label: r.label, href: `/vorlagen/ablauf/${r.templateId}` })),
  next_time_note: async (ids) =>
    (
      await db
        .select({ id: nextTimeNote.id, label: eventPreset.name, presetId: nextTimeNote.presetId })
        .from(nextTimeNote)
        .innerJoin(eventPreset, eq(eventPreset.id, nextTimeNote.presetId))
        .where(inArray(nextTimeNote.id, ids))
    ).map((r) => ({ id: r.id, label: r.label, href: `/vorlagen/${r.presetId}` })),
  checklist: async (ids) =>
    (
      await db
        .select({ id: checklist.id, label: checklist.name, eventId: checklist.eventId })
        .from(checklist)
        .where(inArray(checklist.id, ids))
    ).map((r) => ({
      id: r.id,
      label: r.label,
      href: r.eventId ? `/veranstaltungen/${r.eventId}` : undefined,
    })),
  document: async (ids) =>
    db
      .select({ id: document.id, label: document.fileName })
      .from(document)
      .where(inArray(document.id, ids)),
  payable: async (ids) =>
    (
      await db
        .select({ id: payable.id, label: payable.title })
        .from(payable)
        .where(inArray(payable.id, ids))
    ).map((r) => ({
      ...r,
      href: isModuleHidden("finance") ? undefined : `/finanzen/posten/${r.id}`,
    })),
  installment: async (ids) =>
    (
      await db
        .select({ id: installment.id, label: payable.title, payableId: installment.payableId })
        .from(installment)
        .innerJoin(payable, eq(payable.id, installment.payableId))
        .where(inArray(installment.id, ids))
    ).map((r) => ({
      id: r.id,
      label: r.label,
      href: isModuleHidden("finance") ? undefined : `/finanzen/posten/${r.payableId}`,
    })),
  expense: async (ids) =>
    db
      .select({ id: expense.id, label: expense.description })
      .from(expense)
      .where(inArray(expense.id, ids)),
  user: async (ids) =>
    (
      await db.select({ id: user.id, label: user.name }).from(user).where(inArray(user.id, ids))
    ).map((r) => ({ ...r, href: "/einstellungen/benutzer" })),
  staff_member: async (ids) =>
    db
      .select({ id: staffMember.id, label: staffMember.displayName })
      .from(staffMember)
      .where(inArray(staffMember.id, ids)),
  notification: async (ids) =>
    db
      .select({ id: notification.id, label: notification.title })
      .from(notification)
      .where(inArray(notification.id, ids)),
};

type Diff = {
  fileName?: unknown;
  title?: unknown;
  name?: unknown;
  label?: unknown;
  description?: unknown;
  changes?: { name?: { to?: unknown }; title?: { to?: unknown }; fileName?: { to?: unknown } };
};

/** A name the entry carries itself, for records that are gone or have no name column. */
function nameFromDiff(diff: unknown): string | null {
  const d = (diff && typeof diff === "object" ? diff : {}) as Diff;
  for (const value of [
    d.changes?.fileName?.to,
    d.changes?.name?.to,
    d.changes?.title?.to,
    d.fileName,
    d.title,
    d.name,
    d.label,
    d.description,
  ])
    if (typeof value === "string" && value.trim() !== "") return value;
  return null;
}

type ActivityRow = Omit<ActivityEntry, "target" | "at"> & { at: Date };

/**
 * The id of the record an entry is about. User ids are text, so entries about a user keep it in the diff
 * (`entity_id` is a uuid column).
 */
function recordId(r: ActivityRow): string | null {
  if (r.entityId) return r.entityId;
  const userId = (r.diff as { userId?: unknown } | null)?.userId;
  return r.entityType === "user" && typeof userId === "string" ? userId : null;
}

/** Fills `target` for a page of entries (task, permit and event come with the main query). */
async function withTargets(rows: ActivityRow[]): Promise<ActivityEntry[]> {
  const idsByType = new Map<string, Set<string>>();
  for (const r of rows) {
    const id = recordId(r);
    if (!id || !TARGETS[r.entityType]) continue;
    const set = idsByType.get(r.entityType) ?? new Set<string>();
    set.add(id);
    idsByType.set(r.entityType, set);
  }
  const found = new Map<string, ActivityTarget>();
  await Promise.all(
    [...idsByType].map(async ([type, ids]) => {
      const resolve = TARGETS[type];
      if (!resolve) return;
      for (const n of await resolve([...ids]))
        if (n.label) found.set(`${type}:${n.id}`, { label: n.label, href: n.href });
    }),
  );
  return rows.map((r) => {
    let target: ActivityTarget | null = null;
    if (r.taskTitle)
      target = {
        label: r.taskTitle,
        href: r.taskEventId ? `/veranstaltungen/${r.taskEventId}?aufgabe=${r.entityId}` : undefined,
      };
    else if (r.permitTitle)
      target = { label: r.permitTitle, href: `/genehmigungen?genehmigung=${r.entityId}` };
    else if (r.eventName) target = { label: r.eventName, href: `/veranstaltungen/${r.entityId}` };
    else target = found.get(`${r.entityType}:${recordId(r)}`) ?? null;
    if (!target) {
      const label = nameFromDiff(r.diff);
      target = label ? { label } : null;
    }
    return { ...r, at: r.at.toISOString(), target };
  });
}

/**
 * The company-wide activity: every audit entry, newest first, with who did it and what it was about (the
 * record's name and page, see `TARGETS`). Owner and manager only (`audit:read`); `area` narrows to one kind
 * of record.
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
  return { rows: await withTargets(rows), total: totals?.n ?? 0 };
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
