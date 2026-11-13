import "server-only";
import { timingSafeEqual } from "node:crypto";
import type { Database } from "@marktwerk/db";

type CronJob = { run: (db: Database) => Promise<unknown> };

export type CronDeps = {
  /** `CRON_SECRET`; without it every call is refused. */
  secret: string | undefined;
  jobs: Readonly<Record<string, CronJob>>;
  db: Database;
  /** Where the failure line goes (default `console.error`, i.e. the Vercel function log). */
  logError?: (line: string) => void;
};

/**
 * `POST /api/cron/<job>` (ADR 0017): checks the bearer secret first, then runs the job. A job that throws gives
 * one JSON log line (`{"level":"error","msg":"cron job failed","job":…,"error":…,"durationMs":…}`) and a 500 with
 * a short body. The body carries no error details: the scheduler prints it into the (public) Actions log.
 */
export async function handleCronRequest(
  request: Request,
  job: string,
  { secret, jobs, db, logError = console.error }: CronDeps,
): Promise<Response> {
  if (!authorised(request, secret)) return new Response("Unauthorized", { status: 401 });
  if (!Object.hasOwn(jobs, job)) return new Response("Unknown job", { status: 404 });

  const started = Date.now();
  try {
    const result = await jobs[job]?.run(db);
    return Response.json({ job, result: result ?? null });
  } catch (error) {
    logError(
      JSON.stringify({
        level: "error",
        msg: "cron job failed",
        job,
        error: errorText(error, secret),
        durationMs: Date.now() - started,
      }),
    );
    return Response.json({ job, error: "Job failed, see the server log" }, { status: 500 });
  }
}

function authorised(request: Request, secret: string | undefined): boolean {
  if (!secret) return false;
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** `Name: message` on one line, with URL credentials (`//user:pass@`) and the cron secret blanked out. */
function errorText(error: unknown, secret: string | undefined): string {
  const text = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  const redacted = text.replace(/\/\/[^/\s:@]+:[^/\s@]+@/g, "//***@").replace(/\s+/g, " ");
  return secret ? redacted.replaceAll(secret, "***") : redacted;
}
