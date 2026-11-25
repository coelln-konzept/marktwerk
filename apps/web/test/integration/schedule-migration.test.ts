import { readFileSync } from "node:fs";
import { type Schedule, scheduleFromTimes } from "@marktwerk/core";
import { sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/server/db";

afterAll(async () => {
  await db.$client.end();
});

/** Old `times` values: the usual ones, the edge cases of the rules and broken data. */
const SAMPLES: unknown[] = [
  { setup: "06:00", open: "08:00", close: "16:00", teardown: "18:00" },
  { setup: "05:00", open: "09:00", close: "17:00", teardown: "19:00" },
  { setup: "07:30", open: "11:00", close: "22:00", teardown: "23:30" },
  // Setup after opening: "the day before" on multi-day markets.
  { setup: "14:00", open: "10:00", close: "18:00", teardown: "20:00" },
  // Setup equal to opening, teardown equal to closing: no setup / teardown row.
  { setup: "08:00", open: "08:00", close: "16:00", teardown: "16:00" },
  // Setup at 23:59 after opening: no row (the window would be empty).
  { setup: "23:59", open: "10:00", close: "18:00", teardown: "20:00" },
  // Teardown before closing: no teardown row.
  { setup: "06:00", open: "08:00", close: "16:00", teardown: "15:00" },
  // No opening window: 08:00–16:00.
  { setup: "06:00", open: "17:00", close: "16:00", teardown: "18:00" },
  { setup: "06:00", open: "16:00", close: "16:00", teardown: "18:00" },
  // Malformed and missing fields fall back to the default.
  { setup: "6:00", open: "8 Uhr", close: "24:00", teardown: "" },
  { open: "09:00", close: "15:00" },
  { setup: null, open: 900, close: true, teardown: { at: "18:00" } },
  {},
];

/** The CREATE FUNCTION statement of migration 0017, exactly as shipped. */
function migrationFunction(): string {
  const file = new URL("../../../../packages/db/drizzle/0017_zeitplan.sql", import.meta.url);
  const statement = readFileSync(file, "utf8")
    .split("--> statement-breakpoint")
    .map((part) => part.trim())
    .map((part) => part.slice(part.indexOf("CREATE FUNCTION")))
    .find((part) => part.startsWith("CREATE FUNCTION"));
  if (!statement) throw new Error("0017 has no CREATE FUNCTION");
  return statement;
}

class Rollback extends Error {}

describe("migration 0017: times → Zeitplan", () => {
  it("converts like scheduleFromTimes in core", async () => {
    const results: unknown[] = [];
    await db
      .transaction(async (tx) => {
        await tx.execute(sql.raw(migrationFunction()));
        for (const times of SAMPLES) {
          const { rows } = await tx.execute<{ schedule: Schedule }>(
            sql`select "app"."schedule_from_times"(${JSON.stringify(times)}::jsonb) as schedule`,
          );
          results.push(rows[0]?.schedule);
        }
        throw new Rollback();
      })
      .catch((error: unknown) => {
        if (!(error instanceof Rollback)) throw error;
      });

    expect(results).toHaveLength(SAMPLES.length);
    SAMPLES.forEach((times, i) => {
      expect({ times, schedule: results[i] }).toEqual({
        times,
        schedule: scheduleFromTimes(times as Parameters<typeof scheduleFromTimes>[0]),
      });
    });
  });

  it("leaves no helper function behind", async () => {
    const { rows } = await db.execute(
      sql`select 1 from pg_proc where proname = 'schedule_from_times'`,
    );
    expect(rows).toHaveLength(0);
  });
});
