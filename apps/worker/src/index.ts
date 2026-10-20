import { createDb } from "@marktwerk/db";
import { PgBoss } from "pg-boss";
import { env } from "./env";
import { dailyDigest } from "./jobs/daily-digest";
import { deadlineSweep } from "./jobs/deadline-sweep";

/**
 * Long-running worker process. pg-boss keeps its queue tables in the
 * `pgboss` schema of the same Postgres database, so jobs stay in the EU
 * database with everything else (ADR 0005).
 */
const QUEUES = {
  deadlineSweep: "deadline-sweep",
  dailyDigest: "daily-digest",
} as const;

const db = createDb(env.DATABASE_URL, { max: 5 });
const boss = new PgBoss({ connectionString: env.DATABASE_URL, schema: "pgboss" });

boss.on("error", (error) => console.error("[pg-boss]", error));

await boss.start();

for (const name of Object.values(QUEUES)) {
  await boss.createQueue(name);
}

await boss.schedule(QUEUES.deadlineSweep, "*/15 * * * *", null, { tz: env.APP_TIMEZONE });
await boss.schedule(QUEUES.dailyDigest, "0 7 * * *", null, { tz: env.APP_TIMEZONE });

await boss.work(QUEUES.deadlineSweep, async () => deadlineSweep(db));
await boss.work(QUEUES.dailyDigest, async () => dailyDigest(db));

console.log(`[worker] started, queues: ${Object.values(QUEUES).join(", ")}`);

async function shutdown(signal: string) {
  console.log(`[worker] ${signal} received, stopping…`);
  await boss.stop({ graceful: true });
  await db.$client.end();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
