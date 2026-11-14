import "server-only";
import {
  type ContactSuggestionReason,
  can,
  isTaskContactRole,
  suggestTaskContact,
} from "@marktwerk/core";
import {
  checklist,
  contact,
  event,
  eventPreset,
  eventSeason,
  eventType,
  permit,
  type task,
  templateItem,
} from "@marktwerk/db/schema";
import { eq, inArray } from "drizzle-orm";
import type { Actor } from "../actor";
import { db } from "../db";
import { contactContextKey, loadContactContexts } from "../services/task-instantiation";

/** The contact a task is about, as the drawer shows it (Fahrplan R24). */
export type TaskContact = {
  id: string;
  name: string;
  kind: "authority" | "landowner" | "supplier" | "service" | "other";
  /** The person to ask for ("Ansprechpartner"). */
  person: string | null;
  phone: string | null;
  email: string | null;
  /** Archived since it was linked: still shown, no longer offered. */
  archived: boolean;
};

export type TaskContactInfo = {
  /** The actor may see contact data (`contact` read); false = the drawer shows no contact block at all. */
  visible: boolean;
  contact: TaskContact | null;
  /** "Vorschlag: …" while the task has no contact (never saved by itself). */
  suggestion: (TaskContact & { reason: ContactSuggestionReason }) | null;
};

type TaskRow = typeof task.$inferSelect;

const HIDDEN: TaskContactInfo = { visible: false, contact: null, suggestion: null };

async function loadContacts(ids: string[]): Promise<Map<string, TaskContact>> {
  if (ids.length === 0) return new Map();
  const rows = await db
    .select({
      id: contact.id,
      name: contact.name,
      kind: contact.kind,
      person: contact.contactPerson,
      phone: contact.phoneE164,
      email: contact.email,
      archivedAt: contact.archivedAt,
    })
    .from(contact)
    .where(inArray(contact.id, [...new Set(ids)]));
  return new Map(
    rows.map(({ archivedAt, ...r }) => [r.id, { ...r, archived: archivedAt !== null }]),
  );
}

/**
 * The task's contact and, while it has none, the suggestion from its context (core `suggestTaskContact`): the
 * Behörde of its permit, its template item's default role, the Ort's Behörde or owner. Nothing for an actor without
 * `contact` read (field users).
 */
export async function taskContactInfo(actor: Actor, t: TaskRow): Promise<TaskContactInfo> {
  if (!can(actor.role, "contact", "read")) return HIDDEN;
  if (t.contactId) {
    const linked = await loadContacts([t.contactId]);
    return { visible: true, contact: linked.get(t.contactId) ?? null, suggestion: null };
  }
  // No contact: what the context points to. A permit's preparation tasks belong to it through their checklist.
  // A handful of point lookups by primary key; the drawer opens one task at a time.
  const [ofEvent] = t.eventId
    ? await db
        .select({ venueId: event.venueId, typeKey: eventType.key })
        .from(event)
        .innerJoin(eventType, eq(eventType.id, event.eventTypeId))
        .where(eq(event.id, t.eventId))
    : [];
  const [season] = t.seasonId
    ? await db
        .select({ venueId: eventPreset.venueId, typeKey: eventType.key })
        .from(eventSeason)
        .innerJoin(eventPreset, eq(eventPreset.id, eventSeason.presetId))
        .innerJoin(eventType, eq(eventType.id, eventPreset.eventTypeId))
        .where(eq(eventSeason.id, t.seasonId))
    : [];
  const [item] = t.templateItemId
    ? await db
        .select({ role: templateItem.contactRole, permitType: templateItem.permitType })
        .from(templateItem)
        .where(eq(templateItem.id, t.templateItemId))
    : [];
  const [list] = t.checklistId
    ? await db
        .select({ permitId: checklist.permitId })
        .from(checklist)
        .where(eq(checklist.id, t.checklistId))
    : [];
  const permitId = t.permitId ?? list?.permitId ?? null;
  const [ofPermit] = permitId
    ? await db
        .select({
          authorityId: permit.authorityContactId,
          permitType: permit.permitType,
          venueId: permit.venueId,
        })
        .from(permit)
        .where(eq(permit.id, permitId))
    : [];

  const venueId = ofEvent?.venueId ?? season?.venueId ?? ofPermit?.venueId ?? null;
  const typeKey = ofEvent?.typeKey ?? season?.typeKey ?? "";
  const contexts = venueId
    ? await loadContactContexts(db, [{ venueId, eventTypeKey: typeKey }])
    : null;
  // A Behörde archived since it was entered on the permit is not suggested.
  const authority = ofPermit?.authorityId ? await loadContacts([ofPermit.authorityId]) : null;
  const permitAuthorityId =
    ofPermit?.authorityId && authority?.get(ofPermit.authorityId)?.archived === false
      ? ofPermit.authorityId
      : null;

  const suggestion = suggestTaskContact({
    category: t.category,
    permitType: item?.permitType ?? ofPermit?.permitType ?? null,
    permitAuthorityId,
    role: isTaskContactRole(item?.role) ? item.role : null,
    context: venueId ? (contexts?.get(contactContextKey(venueId, typeKey)) ?? null) : null,
  });
  if (!suggestion) return { visible: true, contact: null, suggestion: null };
  const found = (await loadContacts([suggestion.contactId])).get(suggestion.contactId);
  return {
    visible: true,
    contact: null,
    suggestion: found && !found.archived ? { ...found, reason: suggestion.reason } : null,
  };
}
