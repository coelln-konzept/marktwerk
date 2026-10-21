import "server-only";
import { randomBytes } from "node:crypto";
import {
  can,
  checkPresetFields,
  type EventTimesInput,
  normalizeClockTime,
  type PresetFieldsInput,
  type PresetIssueCode,
  presetKeyBase,
} from "@marktwerk/core";
import { dutyRole, eventPreset, eventType, staffMember, venue } from "@marktwerk/db/schema";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { forbidden } from "next/navigation";
import type { Actor } from "../actor";
import { db } from "../db";
import { audit } from "./audit";

export type PresetError =
  | PresetIssueCode
  | "not_found"
  | "invalid_type"
  | "invalid_venue"
  | "invalid_duty_role"
  | "invalid_staff"
  | "invalid_input"
  | "conflict";

/**
 * `field` is the form field the error belongs to ("name", "type", "venue", "open", "rrule",
 * "duty.market_lead", …); undefined for errors about the whole preset (not_found, conflict).
 */
export class PresetInputError extends Error {
  constructor(
    readonly code: PresetError,
    readonly field?: string,
  ) {
    super(code);
  }
}

/** What the Vorlage form edits. Everything else (key, archive state) is not editable. */
export type PresetInput = PresetFieldsInput & {
  eventTypeId: string;
  venueId: string;
  /** duty_role.key → staff_member.id; roles that are not listed have no default person. */
  defaultDuties: Record<string, string>;
  active: boolean;
};

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const UUID = /^[0-9a-f-]{36}$/i;
const TIME_KEYS = ["setup", "open", "close", "teardown"] as const;

/** Trims and normalises what can be normalised ("5.30" → "05:30", blank text → null). */
function normalize(input: PresetInput): PresetInput {
  const times = { ...input.times };
  for (const key of TIME_KEYS) {
    const value = typeof times[key] === "string" ? normalizeClockTime(times[key]) : null;
    if (value !== null) times[key] = value;
  }
  const blankToNull = (text: string | null) => {
    const trimmed = typeof text === "string" ? text.trim() : "";
    return trimmed === "" ? null : trimmed;
  };
  return {
    ...input,
    name: typeof input.name === "string" ? input.name.trim() : "",
    publicTitle: blankToNull(input.publicTitle),
    publicText: blankToNull(input.publicText),
    times,
    rrule: input.rrule === null || input.rrule === "" ? null : input.rrule,
  };
}

function assertShape(input: PresetInput) {
  const ok =
    input !== null &&
    typeof input === "object" &&
    typeof input.eventTypeId === "string" &&
    typeof input.venueId === "string" &&
    typeof input.active === "boolean" &&
    typeof input.durationDays === "number" &&
    typeof input.pricePerMCents === "number" &&
    typeof input.bookingFeeCents === "number" &&
    typeof input.times === "object" &&
    input.times !== null &&
    typeof input.defaultDuties === "object" &&
    input.defaultDuties !== null &&
    !Array.isArray(input.defaultDuties) &&
    Object.values(input.defaultDuties).every((v) => typeof v === "string");
  if (!ok) throw new PresetInputError("invalid_input");
}

function checkFields(input: PresetInput) {
  const [issue] = checkPresetFields(input);
  if (issue) throw new PresetInputError(issue.code, issue.field);
}

/**
 * Type, venue, duty roles and people must exist; archived types/venues and inactive/archived people
 * only stay if the preset already had them (so an old preset can still be saved).
 */
async function checkReferences(
  tx: Tx,
  input: PresetInput,
  current?: { eventTypeId: string; venueId: string; defaultDuties: Record<string, string> },
) {
  if (!UUID.test(input.eventTypeId)) throw new PresetInputError("invalid_type", "type");
  const [type] = await tx
    .select({ id: eventType.id, archivedAt: eventType.archivedAt })
    .from(eventType)
    .where(eq(eventType.id, input.eventTypeId));
  if (!type || (type.archivedAt && current?.eventTypeId !== type.id))
    throw new PresetInputError("invalid_type", "type");

  if (!UUID.test(input.venueId)) throw new PresetInputError("invalid_venue", "venue");
  const [place] = await tx
    .select({ id: venue.id, archivedAt: venue.archivedAt })
    .from(venue)
    .where(eq(venue.id, input.venueId));
  if (!place || (place.archivedAt && current?.venueId !== place.id))
    throw new PresetInputError("invalid_venue", "venue");

  const entries = Object.entries(input.defaultDuties);
  if (entries.length === 0) return;
  const roles = await tx
    .select({ key: dutyRole.key })
    .from(dutyRole)
    .where(
      inArray(
        dutyRole.key,
        entries.map(([key]) => key),
      ),
    );
  const known = new Set(roles.map((r) => r.key));
  for (const [key, staffId] of entries) {
    // A leftover key the preset already has (its role was removed) may stay until someone edits it away.
    if (!known.has(key) && current?.defaultDuties[key] !== staffId)
      throw new PresetInputError("invalid_duty_role", `duty.${key}`);
  }
  for (const [key, staffId] of entries) {
    if (!UUID.test(staffId)) throw new PresetInputError("invalid_staff", `duty.${key}`);
  }
  const people = await tx
    .select({
      id: staffMember.id,
      active: staffMember.active,
      archivedAt: staffMember.archivedAt,
    })
    .from(staffMember)
    .where(
      inArray(
        staffMember.id,
        entries.map(([, staffId]) => staffId),
      ),
    );
  const byId = new Map(people.map((p) => [p.id, p]));
  for (const [key, staffId] of entries) {
    const person = byId.get(staffId);
    const unchanged = current?.defaultDuties[key] === staffId;
    if (!person || ((!person.active || person.archivedAt) && !unchanged))
      throw new PresetInputError("invalid_staff", `duty.${key}`);
  }
}

/** Key order must not matter when comparing jsonb values. */
function stable(value: unknown): string {
  return JSON.stringify(value, (_key, v) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)))
      : v,
  );
}

type Fields = {
  name: string;
  eventTypeId: string;
  venueId: string;
  durationDays: number;
  publicTitle: string | null;
  publicText: string | null;
  defaultTimes: EventTimesInput;
  pricePerMCents: number;
  bookingFeeCents: number;
  rrule: string | null;
  defaultDuties: Record<string, string>;
  active: boolean;
};

/** The audited fields of a stored preset. */
const storedFields = (row: typeof eventPreset.$inferSelect): Fields => ({
  name: row.name,
  eventTypeId: row.eventTypeId,
  venueId: row.venueId,
  durationDays: row.durationDays,
  publicTitle: row.publicTitle,
  publicText: row.publicText,
  defaultTimes: timesOf(row.defaultTimes),
  pricePerMCents: row.pricePerMCents,
  bookingFeeCents: row.bookingFeeCents,
  rrule: row.rrule,
  defaultDuties: row.defaultDuties,
  active: row.active,
});

/** The same fields of a (normalised) form input. */
const inputFields = (input: PresetInput): Fields => ({
  name: input.name,
  eventTypeId: input.eventTypeId,
  venueId: input.venueId,
  durationDays: input.durationDays,
  publicTitle: input.publicTitle,
  publicText: input.publicText,
  defaultTimes: timesOf(input.times),
  pricePerMCents: input.pricePerMCents,
  bookingFeeCents: input.bookingFeeCents,
  rrule: input.rrule,
  defaultDuties: input.defaultDuties,
  active: input.active,
});

function diffOf(from: Fields | null, to: Fields) {
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const key of Object.keys(to) as (keyof Fields)[]) {
    const before = from ? from[key] : null;
    if (stable(before) !== stable(to[key])) changes[key] = { from: before, to: to[key] };
  }
  return changes;
}

function timesOf(times: EventTimesInput): EventTimesInput {
  return { setup: times.setup, open: times.open, close: times.close, teardown: times.teardown };
}

/**
 * Creates an event preset (permission template:write). The unique key is a slug of the name plus a
 * short random suffix. Audited as "preset.create" with {key, changes: {field: {from: null, to}}}.
 */
export async function createPreset(
  actor: Actor,
  rawInput: PresetInput,
): Promise<{ id: string; key: string }> {
  if (!can(actor.role, "template", "write")) forbidden();
  assertShape(rawInput);
  const input = normalize(rawInput);
  checkFields(input);

  return db.transaction(async (tx) => {
    await checkReferences(tx, input);
    const base = presetKeyBase(input.name);
    let key = "";
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const candidate = `${base}-${randomBytes(3).toString("hex")}`;
      const [taken] = await tx
        .select({ id: eventPreset.id })
        .from(eventPreset)
        .where(eq(eventPreset.key, candidate));
      if (!taken) {
        key = candidate;
        break;
      }
    }
    if (!key) throw new Error("could not find a free preset key");

    const [row] = await tx
      .insert(eventPreset)
      .values({
        key,
        eventTypeId: input.eventTypeId,
        venueId: input.venueId,
        name: input.name,
        publicTitle: input.publicTitle,
        publicText: input.publicText,
        pricePerMCents: input.pricePerMCents,
        bookingFeeCents: input.bookingFeeCents,
        defaultTimes: timesOf(input.times),
        rrule: input.rrule,
        durationDays: input.durationDays,
        defaultDuties: input.defaultDuties,
        active: input.active,
      })
      .returning({ id: eventPreset.id });
    if (!row) throw new Error("insert failed");
    await audit(tx, actor.id, [
      {
        action: "preset.create",
        entityType: "event_preset",
        entityId: row.id,
        diff: { key, changes: diffOf(null, inputFields(input)) },
      },
    ]);
    return { id: row.id, key };
  });
}

/**
 * Edits an event preset (permission template:write). `expectedUpdatedAt` is the `updated_at` the form
 * was loaded with; if the preset changed since, nothing is saved ("conflict"). Existing events are
 * never touched (templates don't propagate, CLAUDE.md). Nothing to change → no write, no audit entry.
 * Audited as "preset.update" with {changes: {field: {from, to}}}.
 */
export async function updatePreset(
  actor: Actor,
  id: string,
  rawInput: PresetInput,
  expectedUpdatedAt: Date | string,
): Promise<{ changed: boolean; updatedAt: Date }> {
  if (!can(actor.role, "template", "write")) forbidden();
  if (!UUID.test(id)) throw new PresetInputError("not_found");
  assertShape(rawInput);
  const expected = new Date(expectedUpdatedAt);
  if (Number.isNaN(expected.getTime())) throw new PresetInputError("invalid_input");
  const input = normalize(rawInput);
  checkFields(input);

  return db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(eventPreset)
      .where(and(eq(eventPreset.id, id), isNull(eventPreset.archivedAt)))
      .for("update");
    if (!current) throw new PresetInputError("not_found");
    if (current.updatedAt.getTime() !== expected.getTime()) throw new PresetInputError("conflict");

    await checkReferences(tx, input, current);
    const changes = diffOf(storedFields(current), inputFields(input));
    if (Object.keys(changes).length === 0) return { changed: false, updatedAt: current.updatedAt };

    // Strictly newer than the version the editor saw, even within the same millisecond.
    const updatedAt = new Date(Math.max(Date.now(), current.updatedAt.getTime() + 1));
    await tx
      .update(eventPreset)
      .set({
        eventTypeId: input.eventTypeId,
        venueId: input.venueId,
        name: input.name,
        publicTitle: input.publicTitle,
        publicText: input.publicText,
        pricePerMCents: input.pricePerMCents,
        bookingFeeCents: input.bookingFeeCents,
        defaultTimes: timesOf(input.times),
        rrule: input.rrule,
        durationDays: input.durationDays,
        defaultDuties: input.defaultDuties,
        active: input.active,
        updatedAt,
      })
      .where(eq(eventPreset.id, id));
    await audit(tx, actor.id, [
      { action: "preset.update", entityType: "event_preset", entityId: id, diff: { changes } },
    ]);
    return { changed: true, updatedAt };
  });
}
