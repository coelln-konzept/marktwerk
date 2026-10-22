/**
 * Helpers shared by the seed modules. Every module exports one `seedXyz(tx, ctx)` function that is
 * idempotent: rows keep fixed ids (the synthetic ones, or ids derived from them) and are inserted with
 * ON CONFLICT DO NOTHING, so `pnpm db:seed` is safe to run repeatedly.
 */

import { createHash } from "node:crypto";
import type { Database } from "@marktwerk/db";
import type { Dataset } from "@marktwerk/synthetic";

export type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

/** What every module gets: the in-memory synthetic dataset plus lookups the modules share. */
export interface SeedContext {
  data: Dataset;
  /** duty_role.key → id */
  roleIdByKey: Map<string, string>;
  /** First staff member with the `manager` permission role, else the owner; stands in for "the office". */
  officeStaffId: string | null;
}

/** Inserts in chunks (Postgres caps bind parameters at 65,535 per statement). */
export async function insertAll<T extends object>(
  tx: Tx,
  table: Parameters<Tx["insert"]>[0],
  rows: T[],
  label: string,
) {
  for (let i = 0; i < rows.length; i += 500) {
    await tx
      .insert(table)
      .values(rows.slice(i, i + 500) as never)
      .onConflictDoNothing();
  }
  console.log(`✓ ${label}: ${rows.length}`);
}

/** Synthetic anchor keys (camelCase) → `event_anchor.key` / `template_item.anchor_key` (snake_case). */
export const ANCHOR_KEYS = {
  eventDay: "event_day",
  setupDay: "setup_day",
  bookingCutoff: "booking_cutoff",
} as const;

/**
 * Deterministic UUID (name-based, SHA-1, version-5 layout) for rows the synthetic dataset has no id for:
 * the same `kind` + `key` always gives the same id, so re-seeding never duplicates them.
 */
export function derivedId(kind: string, key: string): string {
  const bytes = createHash("sha1").update(`marktwerk-seed:${kind}:${key}`).digest().subarray(0, 16);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x50;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** An instant from the dataset's ISO string, or null. */
export function instant(value: string | null | undefined): Date | null {
  return value ? new Date(value) : null;
}

/** "HH:mm" → minutes since midnight. */
export function minutesOf(time: string): number {
  const [hours = 0, minutes = 0] = time.split(":").map(Number);
  return hours * 60 + minutes;
}
