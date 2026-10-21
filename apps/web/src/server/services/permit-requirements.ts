import "server-only";
import { can, isMonthDay, type PermitCadence } from "@marktwerk/core";
import {
  contact,
  event,
  eventType,
  type PermitDeliverables,
  permitCadence,
  permitCategory,
  permitRequirement,
  permitType,
  venue,
} from "@marktwerk/db/schema";
import { and, eq, gte, isNull, ne } from "drizzle-orm";
import { forbidden } from "next/navigation";
import { todayIn } from "@/lib/format";
import type { Actor } from "../actor";
import { db } from "../db";
import { audit } from "./audit";
import { checkedDeliverables, fillLogbookForEvents, PermitInputError, type Tx } from "./permits";

type RequirementRow = typeof permitRequirement.$inferSelect;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_TITLE = 200;
const MAX_NOTES = 4000;
const MAX_LEAD_TIME_DAYS = 730;
const MAX_FEE_CENTS = 100_000_000;

export type RequirementInput = {
  category: (typeof permitCategory.enumValues)[number];
  permitType: (typeof permitType.enumValues)[number];
  title: string;
  /** Narrows the requirement to one event type; null = every event at the venue. */
  eventTypeId: string | null;
  authorityContactId: string | null;
  cadence: PermitCadence;
  leadTimeDays: number;
  submissionWindowStartMd: string | null;
  submissionWindowEndMd: string | null;
  expectedDecisionMd: string | null;
  typicalFeeCents: number | null;
  deliverables: PermitDeliverables;
  notes: string | null;
};

function toInput(row: RequirementRow): RequirementInput {
  return {
    category: row.category,
    permitType: row.permitType,
    title: row.title,
    eventTypeId: row.eventTypeId,
    authorityContactId: row.authorityContactId,
    cadence: row.cadence,
    leadTimeDays: row.leadTimeDays,
    submissionWindowStartMd: row.submissionWindowStartMd,
    submissionWindowEndMd: row.submissionWindowEndMd,
    expectedDecisionMd: row.expectedDecisionMd,
    typicalFeeCents: row.typicalFeeCents,
    deliverables: row.deliverables,
    notes: row.notes,
  };
}

const optionalMonthDay = (value: unknown): string | null => {
  if (value === null || value === undefined || value === "") return null;
  if (!isMonthDay(value)) throw new PermitInputError("invalid_month_day");
  return value;
};

async function checked(tx: Tx, input: RequirementInput): Promise<RequirementInput> {
  const title = typeof input.title === "string" ? input.title.trim().replace(/\s+/g, " ") : "";
  if (title === "" || title.length > MAX_TITLE) throw new PermitInputError("invalid_title");
  if (!permitCategory.enumValues.includes(input.category))
    throw new PermitInputError("invalid_category");
  if (!permitType.enumValues.includes(input.permitType)) throw new PermitInputError("invalid_type");
  if (!permitCadence.enumValues.includes(input.cadence))
    throw new PermitInputError("invalid_cadence");
  if (
    !Number.isInteger(input.leadTimeDays) ||
    input.leadTimeDays < 0 ||
    input.leadTimeDays > MAX_LEAD_TIME_DAYS
  )
    throw new PermitInputError("invalid_lead_time");
  const fee = input.typicalFeeCents;
  if (fee !== null && (!Number.isSafeInteger(fee) || fee < 0 || fee > MAX_FEE_CENTS))
    throw new PermitInputError("invalid_fee");
  const notes = typeof input.notes === "string" ? input.notes.trim() : "";
  if (notes.length > MAX_NOTES) throw new PermitInputError("invalid_text");

  let eventTypeId: string | null = null;
  if (input.eventTypeId) {
    const [type] = UUID.test(input.eventTypeId)
      ? await tx
          .select({ id: eventType.id })
          .from(eventType)
          .where(and(eq(eventType.id, input.eventTypeId), isNull(eventType.archivedAt)))
      : [];
    if (!type) throw new PermitInputError("invalid_event_type");
    eventTypeId = type.id;
  }
  let authorityContactId: string | null = null;
  if (input.authorityContactId) {
    const [found] = UUID.test(input.authorityContactId)
      ? await tx
          .select({ id: contact.id })
          .from(contact)
          .where(and(eq(contact.id, input.authorityContactId), isNull(contact.archivedAt)))
      : [];
    if (!found) throw new PermitInputError("invalid_contact");
    authorityContactId = found.id;
  }
  return {
    category: input.category,
    permitType: input.permitType,
    title,
    eventTypeId,
    authorityContactId,
    cadence: input.cadence,
    leadTimeDays: input.leadTimeDays,
    submissionWindowStartMd: optionalMonthDay(input.submissionWindowStartMd),
    submissionWindowEndMd: optionalMonthDay(input.submissionWindowEndMd),
    expectedDecisionMd: optionalMonthDay(input.expectedDecisionMd),
    typicalFeeCents: fee,
    deliverables: checkedDeliverables(input.deliverables ?? {}),
    notes: notes === "" ? null : notes,
  };
}

async function lockRequirement(tx: Tx, id: string, includeArchived = false) {
  if (!UUID.test(id)) throw new PermitInputError("not_found");
  const [row] = await tx
    .select()
    .from(permitRequirement)
    .where(
      includeArchived
        ? eq(permitRequirement.id, id)
        : and(eq(permitRequirement.id, id), isNull(permitRequirement.archivedAt)),
    )
    .for("update");
  if (!row) throw new PermitInputError("not_found");
  return row;
}

/**
 * New permit requirement ("blueprint") for a venue. Only events created from now on pick it up
 * automatically; `applyRequirementToUpcomingEvents` does it for the ones that exist already.
 * Audited as "permit_requirement.create".
 */
export async function createRequirement(
  actor: Actor,
  venueId: string,
  input: RequirementInput,
): Promise<{ id: string }> {
  if (!can(actor.role, "permit", "write")) forbidden();
  return db.transaction(async (tx) => {
    const [place] = UUID.test(venueId)
      ? await tx
          .select({ id: venue.id })
          .from(venue)
          .where(and(eq(venue.id, venueId), isNull(venue.archivedAt)))
      : [];
    if (!place) throw new PermitInputError("invalid_venue");
    const values = await checked(tx, input);
    const [row] = await tx
      .insert(permitRequirement)
      .values({ venueId: place.id, ...values })
      .returning({ id: permitRequirement.id });
    if (!row) throw new Error("insert failed");
    await audit(tx, actor.id, [
      {
        action: "permit_requirement.create",
        entityType: "permit_requirement",
        entityId: row.id,
        diff: { venueId: place.id, ...values },
      },
    ]);
    return row;
  });
}

/**
 * Edits a requirement. Permits that were created from it keep their own dates; the blueprint only
 * shapes what is created next. Returns the previous values for the undo toast (`undo: true`).
 * Audited as "permit_requirement.update" with {field: {from, to}}.
 */
export async function updateRequirement(
  actor: Actor,
  id: string,
  input: RequirementInput,
  options: { undo?: boolean } = {},
): Promise<{ changed: boolean; previous: RequirementInput }> {
  if (!can(actor.role, "permit", "write")) forbidden();
  return db.transaction(async (tx) => {
    const current = await lockRequirement(tx, id);
    const values = await checked(tx, input);
    const previous = toInput(current);
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    for (const key of Object.keys(values) as (keyof RequirementInput)[]) {
      if (JSON.stringify(previous[key]) !== JSON.stringify(values[key]))
        changes[key] = { from: previous[key], to: values[key] };
    }
    if (Object.keys(changes).length === 0) return { changed: false, previous };
    await tx.update(permitRequirement).set(values).where(eq(permitRequirement.id, id));
    await audit(tx, actor.id, [
      {
        action: "permit_requirement.update",
        entityType: "permit_requirement",
        entityId: id,
        diff: { changes, ...(options.undo ? { undo: true } : {}) },
      },
    ]);
    return { changed: true, previous };
  });
}

/** Removes a requirement from the venue (soft delete; permits made from it stay). */
export async function archiveRequirement(actor: Actor, id: string): Promise<{ title: string }> {
  if (!can(actor.role, "permit", "delete")) forbidden();
  return db.transaction(async (tx) => {
    const current = await lockRequirement(tx, id);
    await tx
      .update(permitRequirement)
      .set({ archivedAt: new Date() })
      .where(eq(permitRequirement.id, id));
    await audit(tx, actor.id, [
      {
        action: "permit_requirement.archive",
        entityType: "permit_requirement",
        entityId: id,
        diff: { title: current.title },
      },
    ]);
    return { title: current.title };
  });
}

/** Undo of `archiveRequirement`. */
export async function restoreRequirement(actor: Actor, id: string): Promise<{ title: string }> {
  if (!can(actor.role, "permit", "delete")) forbidden();
  return db.transaction(async (tx) => {
    const current = await lockRequirement(tx, id, true);
    await tx
      .update(permitRequirement)
      .set({ archivedAt: null })
      .where(eq(permitRequirement.id, id));
    await audit(tx, actor.id, [
      {
        action: "permit_requirement.restore",
        entityType: "permit_requirement",
        entityId: id,
        diff: { title: current.title },
      },
    ]);
    return { title: current.title };
  });
}

/**
 * Runs the logbook fill for the venue's upcoming events (not cancelled): attaches covering permits and
 * creates the missing ones. Idempotent. Returns how many permits and tasks were created.
 */
export async function applyRequirementsToUpcomingEvents(
  actor: Actor,
  venueId: string,
): Promise<{ events: number; permits: number; linked: number; tasks: number }> {
  if (!can(actor.role, "permit", "write")) forbidden();
  if (!UUID.test(venueId)) throw new PermitInputError("invalid_venue");
  return db.transaction(async (tx) => {
    const upcoming = await tx
      .select({ id: event.id })
      .from(event)
      .where(
        and(
          eq(event.venueId, venueId),
          isNull(event.archivedAt),
          ne(event.status, "cancelled"),
          gte(event.endsOn, todayIn()),
        ),
      );
    const fill = await fillLogbookForEvents(
      tx,
      upcoming.map((e) => e.id),
      actor,
    );
    return {
      events: upcoming.length,
      permits: fill.createdPermits.length,
      linked: fill.linked,
      tasks: fill.tasks,
    };
  });
}
