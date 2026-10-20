import type { Database } from "@marktwerk/db";

/**
 * The "nothing slips" engine. Runs every 15 minutes and must be idempotent:
 * notifications are inserted with a deterministic dedupe key
 * (`reminderDedupeKey` from @marktwerk/core), so repeated sweeps never
 * notify twice. See docs/architecture/data-model.md → "Deadline sweep".
 *
 * Implemented in milestone M1 together with the task/permit/notification tables.
 */
export async function deadlineSweep(
  _db: Database,
  now: Date = new Date(),
): Promise<{ created: number }> {
  console.log(`[deadline-sweep] ${now.toISOString()} (no task tables yet, skipping)`);
  return { created: 0 };
}
