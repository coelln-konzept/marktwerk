import type { Database } from "@marktwerk/db";

/**
 * 07:00 Europe/Berlin: email each user their overdue, due-today and
 * due-this-week items. Implemented in milestone M1.
 */
export async function dailyDigest(_db: Database, now: Date = new Date()): Promise<void> {
  console.log(`[daily-digest] ${now.toISOString()} (not implemented yet)`);
}
