import { createDb } from "@marktwerk/db";
import { JOBS } from "@marktwerk/jobs";
import { PgBoss } from "pg-boss";
import { env } from "./env";

/**
 * Long-running worker process. pg-boss keeps its queue tables in the
 * `pgboss` schema of the same Postgres database (ADR 0005). Job handlers live
 * in @marktwerk/jobs so serverless hosting can trigger them via HTTP instead.
 */
const db = createDb(env.DATABASE_URL, { max: 5 });
const boss = new PgBoss({ connectionString: env.DATABASE_URL, schema: "pgboss" });

boss.on("error", (error) => console.error("[pg-boss]", error));

await boss.start();

for (const [name, job] of Object.entries(JOBS)) {
  await boss.createQueue(name);
  await boss.schedule(name, job.cron, null, { tz: env.APP_TIMEZONE });
  await boss.work(name, async () => job.run(db));
}

console.log(`[worker] started, queues: ${Object.keys(JOBS).join(", ")}`);

async function shutdown(signal: string) {
  console.log(`[worker] ${signal} received, stopping…`);
  await boss.stop({ graceful: true });
  await db.$client.end();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
