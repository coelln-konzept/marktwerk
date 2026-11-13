/**
 * Empties every table in schema `app` except the sign-in tables, so a database can be reseeded with a new
 * synthetic dataset while existing logins keep working (Fahrplan R20). The seed then links those users to their
 * new staff records again (`ensureUser` in seed.ts). Used by `pnpm db:wipe` and the "Seed dev database" workflow.
 *
 * Kept: `user`, `session`, `account`, `verification` (better-auth) and `user_preference`. They reference only
 * `user`, so the cascading truncate of the other tables cannot reach them.
 */
import type { Database } from "@marktwerk/db";
import { sql } from "drizzle-orm";

export const KEPT_TABLES = [
  "user",
  "session",
  "account",
  "verification",
  "user_preference",
] as const;

/** The `app` tables a wipe empties, in name order. */
export function tablesToWipe(tables: readonly string[]): string[] {
  const kept = new Set<string>(KEPT_TABLES);
  return tables.filter((t) => !kept.has(t)).sort();
}

/** Truncates every app table except the sign-in tables; returns how many tables were emptied. */
export async function wipeAppData(db: Database): Promise<number> {
  const { rows } = await db.$client.query<{ tablename: string }>(
    "select tablename from pg_tables where schemaname = 'app'",
  );
  const tables = tablesToWipe(rows.map((r) => r.tablename));
  if (tables.length === 0) return 0;
  const list = tables.map((t) => `"app"."${t}"`).join(", ");
  await db.execute(sql.raw(`truncate ${list} restart identity cascade`));
  return tables.length;
}
