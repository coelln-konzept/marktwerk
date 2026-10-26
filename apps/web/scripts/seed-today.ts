/**
 * Entry of `pnpm db:seed`: generates the synthetic data against the seed day, so a fresh seed looks current
 * (a handful of overdue tasks, the next markets ahead). `@marktwerk/synthetic` reads the date once when it is
 * first imported, hence this file sets it before loading the seed. Set SYNTHETIC_REFERENCE_DATE=YYYY-MM-DD
 * yourself to seed "as of" another day.
 *
 * The seed is idempotent through fixed ids, but some ids depend on the day the data is generated for. So a
 * database that already holds synthetic data is only seeded again with an explicit date (the one it was first
 * seeded with); otherwise reset it first.
 */
import { createDb } from "@marktwerk/db";
import { sql } from "drizzle-orm";

if (!process.env.SYNTHETIC_REFERENCE_DATE) {
  const url = process.env.DATABASE_MIGRATION_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const db = createDb(url, { max: 1 });
  const result = await db.execute<{ seeded: boolean }>(
    sql`select exists (select 1 from app.event) as seeded`,
  );
  await db.$client.end();
  if (result.rows[0]?.seeded) {
    console.error(
      "The database already holds synthetic data. Reset it first (see docs/development/setup.md), or seed as of " +
        "the day it was generated for: SYNTHETIC_REFERENCE_DATE=YYYY-MM-DD pnpm db:seed",
    );
    process.exit(1);
  }
  process.env.SYNTHETIC_REFERENCE_DATE = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
  }).format(new Date());
}
console.log(`synthetic data as of ${process.env.SYNTHETIC_REFERENCE_DATE}`);

await import("./seed");
