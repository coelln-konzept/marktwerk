import "server-only";
import { can, isIsoDate } from "@marktwerk/core";
import { contact, event, locationAgreement, venue } from "@marktwerk/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { forbidden } from "next/navigation";
import type { Actor } from "../actor";
import { db } from "../db";
import { audit } from "./audit";
import {
  type CreatedEvent,
  EventInputError,
  type EventTemplate,
  instantiateEvents,
  MAX_DATES_PER_RUN,
  type ManualEventInput,
  manualTemplate,
  presetTemplate,
  validateDates,
} from "./events";

export type AgreementErrorCode =
  | "not_found"
  | "invalid_venue"
  | "invalid_contact"
  | "invalid_date"
  | "invalid_period"
  | "date_outside_period"
  | "too_many_dates"
  | "invalid_terms";

export class AgreementInputError extends Error {
  constructor(readonly code: AgreementErrorCode) {
    super(code);
  }
}

/** A multi-year agreement fixes a handful of dates per year; this is a sanity bound, not a rule. */
export const MAX_AGREEMENT_DATES = 200;
const MAX_TERMS_LENGTH = 4000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type AgreementInput = {
  counterpartyContactId: string | null;
  validFrom: string;
  validUntil: string;
  fixedDates: string[];
  terms: string | null;
};

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type AgreementRow = typeof locationAgreement.$inferSelect;

function toInput(row: AgreementRow): AgreementInput {
  return {
    counterpartyContactId: row.counterpartyContactId,
    validFrom: row.validFrom,
    validUntil: row.validUntil,
    fixedDates: row.fixedDates,
    terms: row.terms,
  };
}

/** Normalises and validates the typed agreement; the fixed dates must lie inside the validity. */
async function checked(input: AgreementInput): Promise<AgreementInput> {
  if (!isIsoDate(input.validFrom) || !isIsoDate(input.validUntil))
    throw new AgreementInputError("invalid_date");
  if (input.validUntil < input.validFrom) throw new AgreementInputError("invalid_period");
  if (!Array.isArray(input.fixedDates) || !input.fixedDates.every(isIsoDate))
    throw new AgreementInputError("invalid_date");
  const fixedDates = [...new Set(input.fixedDates)].sort();
  if (fixedDates.length > MAX_AGREEMENT_DATES) throw new AgreementInputError("too_many_dates");
  if (fixedDates.some((d) => d < input.validFrom || d > input.validUntil))
    throw new AgreementInputError("date_outside_period");
  const terms = typeof input.terms === "string" ? input.terms.trim() : "";
  if (terms.length > MAX_TERMS_LENGTH) throw new AgreementInputError("invalid_terms");

  let counterpartyContactId: string | null = null;
  if (input.counterpartyContactId) {
    const [found] = UUID.test(input.counterpartyContactId)
      ? await db
          .select({ id: contact.id })
          .from(contact)
          .where(and(eq(contact.id, input.counterpartyContactId), isNull(contact.archivedAt)))
      : [];
    if (!found) throw new AgreementInputError("invalid_contact");
    counterpartyContactId = found.id;
  }
  return {
    counterpartyContactId,
    validFrom: input.validFrom,
    validUntil: input.validUntil,
    fixedDates,
    terms: terms === "" ? null : terms,
  };
}

async function lockAgreement(tx: Tx, id: string, includeArchived = false): Promise<AgreementRow> {
  if (!UUID.test(id)) throw new AgreementInputError("not_found");
  const [row] = await tx
    .select()
    .from(locationAgreement)
    .where(
      includeArchived
        ? eq(locationAgreement.id, id)
        : and(eq(locationAgreement.id, id), isNull(locationAgreement.archivedAt)),
    )
    .for("update");
  if (!row) throw new AgreementInputError("not_found");
  return row;
}

/** New agreement for a venue. Audited as "agreement.create". */
export async function createAgreement(
  actor: Actor,
  venueId: string,
  input: AgreementInput,
): Promise<{ id: string }> {
  if (!can(actor.role, "venue", "write")) forbidden();
  const values = await checked(input);
  const [place] = UUID.test(venueId)
    ? await db
        .select({ id: venue.id })
        .from(venue)
        .where(and(eq(venue.id, venueId), isNull(venue.archivedAt)))
    : [];
  if (!place) throw new AgreementInputError("invalid_venue");
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(locationAgreement)
      .values({ venueId: place.id, ...values })
      .returning({ id: locationAgreement.id });
    if (!row) throw new Error("insert failed");
    await audit(tx, actor.id, [
      {
        action: "agreement.create",
        entityType: "location_agreement",
        entityId: row.id,
        diff: { venueId: place.id, ...values },
      },
    ]);
    return row;
  });
}

/**
 * Edits an agreement. Events that were already generated keep their link and their own data; only
 * the agreement changes. Returns the previous values for the undo toast (which calls this again with
 * `undo: true`). Audited as "agreement.update" with {field: {from, to}}.
 */
export async function updateAgreement(
  actor: Actor,
  id: string,
  input: AgreementInput,
  options: { undo?: boolean } = {},
): Promise<{ changed: boolean; previous: AgreementInput }> {
  if (!can(actor.role, "venue", "write")) forbidden();
  const next = await checked(input);
  return db.transaction(async (tx) => {
    const current = await lockAgreement(tx, id);
    const previous = toInput(current);
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    for (const key of Object.keys(next) as (keyof AgreementInput)[]) {
      if (JSON.stringify(previous[key]) !== JSON.stringify(next[key]))
        changes[key] = { from: previous[key], to: next[key] };
    }
    if (Object.keys(changes).length === 0) return { changed: false, previous };
    await tx.update(locationAgreement).set(next).where(eq(locationAgreement.id, id));
    await audit(tx, actor.id, [
      {
        action: "agreement.update",
        entityType: "location_agreement",
        entityId: id,
        diff: { changes, ...(options.undo ? { undo: true } : {}) },
      },
    ]);
    return { changed: true, previous };
  });
}

/** Removes an agreement from the lists (soft delete; undo restores it). Events stay as they are. */
export async function archiveAgreement(actor: Actor, id: string): Promise<void> {
  if (!can(actor.role, "venue", "write")) forbidden();
  await db.transaction(async (tx) => {
    await lockAgreement(tx, id);
    await tx
      .update(locationAgreement)
      .set({ archivedAt: new Date() })
      .where(eq(locationAgreement.id, id));
    await audit(tx, actor.id, [
      {
        action: "agreement.archive",
        entityType: "location_agreement",
        entityId: id,
      },
    ]);
  });
}

/** Undo of {@link archiveAgreement}. */
export async function restoreAgreement(actor: Actor, id: string): Promise<void> {
  if (!can(actor.role, "venue", "write")) forbidden();
  await db.transaction(async (tx) => {
    await lockAgreement(tx, id, true);
    await tx
      .update(locationAgreement)
      .set({ archivedAt: null })
      .where(eq(locationAgreement.id, id));
    await audit(tx, actor.id, [
      {
        action: "agreement.restore",
        entityType: "location_agreement",
        entityId: id,
      },
    ]);
  });
}

/** What the generated events are copied from: an active preset of the venue, or typed event data. */
export type AgreementEventPlan =
  | { presetId: string }
  | { manual: Omit<ManualEventInput, "venueId"> };

/**
 * "Termine erzeugen" on an agreement: creates draft events for its fixed dates that have no event
 * yet (an event of this agreement with that first day, not archived), linked via
 * `event.location_agreement_id`. `dates` narrows the run to some of the pending dates (the preview
 * lets the office untick some). Goes through the one creation path, `instantiateEvents`.
 */
export async function createEventsFromAgreement(
  actor: Actor,
  agreementId: string,
  plan: AgreementEventPlan,
  dates?: string[],
): Promise<{ created: CreatedEvent[]; skipped: string[] }> {
  if (!can(actor.role, "event", "write")) forbidden();
  if (!UUID.test(agreementId)) throw new AgreementInputError("not_found");
  const [agreement] = await db
    .select()
    .from(locationAgreement)
    .where(and(eq(locationAgreement.id, agreementId), isNull(locationAgreement.archivedAt)));
  if (!agreement) throw new AgreementInputError("not_found");

  let template: EventTemplate;
  if ("presetId" in plan) {
    template = await presetTemplate(plan.presetId);
    if (template.venueId !== agreement.venueId) throw new EventInputError("preset_venue_mismatch");
  } else {
    template = await manualTemplate({ ...plan.manual, venueId: agreement.venueId });
  }
  const requested = dates === undefined ? undefined : validateDates(dates);

  return db.transaction(async (tx) => {
    // Lock so two people generating at once can't create the same date twice.
    const current = await lockAgreement(tx, agreementId);
    if (requested?.some((d) => !current.fixedDates.includes(d)))
      throw new EventInputError("date_not_in_agreement");
    const have = new Set(
      (
        await tx
          .select({ startsOn: event.startsOn })
          .from(event)
          .where(and(eq(event.locationAgreementId, agreementId), isNull(event.archivedAt)))
      ).map((e) => e.startsOn),
    );
    const wanted = requested ?? current.fixedDates;
    const missing = wanted.filter((d) => !have.has(d));
    const skipped = wanted.filter((d) => have.has(d));
    if (missing.length === 0) throw new EventInputError("no_dates");
    if (missing.length > MAX_DATES_PER_RUN) throw new EventInputError("too_many_dates");
    const created = await instantiateEvents(tx, actor, template, missing, "agreement", {
      locationAgreementId: agreementId,
    });
    return { created, skipped };
  });
}
