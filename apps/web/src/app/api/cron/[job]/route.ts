import { JOBS } from "@marktwerk/jobs";
import { handleCronRequest } from "@/server/cron";
import { db } from "@/server/db";
import { env } from "@/server/env";

/**
 * Runs a scheduled job on serverless hosting, where no long-running worker
 * exists (ADR 0017). Called by `.github/workflows/cron.yml` with
 * `Authorization: Bearer <CRON_SECRET>`; a failing job logs one line and answers 500.
 */
export async function POST(request: Request, { params }: RouteContext<"/api/cron/[job]">) {
  const { job } = await params;
  return handleCronRequest(request, job, { secret: env.CRON_SECRET, jobs: JOBS, db });
}
