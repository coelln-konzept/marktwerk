import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

export type Database = NodePgDatabase<typeof schema> & { $client: Pool };

/**
 * Creates a Drizzle client. Call once per process (web server, worker) and
 * reuse it; the pool handles concurrency.
 */
export function createDb(connectionString: string, options: { max?: number } = {}): Database {
  const pool = new Pool({ connectionString, max: options.max ?? 10 });
  return drizzle({ client: pool, schema, casing: "snake_case" });
}

export * from "./schema";
export { schema };
