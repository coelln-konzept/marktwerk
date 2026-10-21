import { timingSafeEqual } from "node:crypto";
import { isJobName, JOBS } from "@marktwerk/jobs";
import { db } from "@/server/db";
import { env } from "@/server/env";

/**
 * Runs a scheduled job on serverless hosting, where no long-running worker
 * exists (ADR 0017). Called by the scheduler with `Authorization: Bearer <CRON_SECRET>`.
 */
export async function POST(request: Request, { params }: RouteContext<"/api/cron/[job]">) {
  if (!authorised(request)) return new Response("Unauthorized", { status: 401 });
  const { job } = await params;
  if (!isJobName(job)) return new Response("Unknown job", { status: 404 });
  const result = await JOBS[job].run(db);
  return Response.json({ job, result: result ?? null });
}

function authorised(request: Request): boolean {
  if (!env.CRON_SECRET) return false;
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${env.CRON_SECRET}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
