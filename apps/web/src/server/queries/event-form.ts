import "server-only";
import { eventType } from "@marktwerk/db/schema";
import { asc, isNull } from "drizzle-orm";
import { db } from "../db";

export type EventTypeOption = {
  id: string;
  key: string;
  nameDe: string;
  nameEn: string;
  /** Prefill for the price fields, from the type's rules. */
  defaultPricePerMCents: number | null;
  defaultBookingFeeCents: number | null;
};

/** Event types for the "Einzeltermin" form, with the price defaults from their rules. */
export async function listEventTypeOptions(): Promise<EventTypeOption[]> {
  const rows = await db
    .select({
      id: eventType.id,
      key: eventType.key,
      nameDe: eventType.nameDe,
      nameEn: eventType.nameEn,
      rules: eventType.rules,
    })
    .from(eventType)
    .where(isNull(eventType.archivedAt))
    .orderBy(asc(eventType.sort));
  return rows.map(({ rules, ...type }) => ({
    ...type,
    defaultPricePerMCents: rules.defaultPricePerMCents,
    defaultBookingFeeCents: rules.defaultBookingFeeCents,
  }));
}
