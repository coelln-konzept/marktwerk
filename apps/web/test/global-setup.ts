import { fileURLToPath } from "node:url";
import { createDb } from "@marktwerk/db";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { assertTestDatabase, TEST_DATABASE_URL } from "./helpers/test-db-url";

const migrationsFolder = fileURLToPath(new URL("../../../packages/db/drizzle", import.meta.url));

/**
 * Makes sure the test database exists and has all migrations applied (same journal table as
 * `drizzle-kit migrate`, so both can be mixed). Idempotent; tests seed what they need themselves.
 */
export default async function setup() {
  const name = assertTestDatabase(TEST_DATABASE_URL);

  const adminUrl = new URL(TEST_DATABASE_URL);
  adminUrl.pathname = "/postgres";
  const admin = createDb(adminUrl.toString(), { max: 1 });
  try {
    const exists = await admin.$client.query("select 1 from pg_database where datname = $1", [
      name,
    ]);
    if (exists.rowCount === 0) await admin.$client.query(`create database "${name}"`);
  } catch (error) {
    throw new Error(
      `Cannot prepare the test database on ${adminUrl.host} (${(error as Error).message}). ` +
        "Start Postgres with `pnpm db:up`, or set TEST_DATABASE_URL.",
    );
  } finally {
    await admin.$client.end();
  }

  const db = createDb(TEST_DATABASE_URL, { max: 1 });
  try {
    await migrate(db, { migrationsFolder });
  } finally {
    await db.$client.end();
  }
}
