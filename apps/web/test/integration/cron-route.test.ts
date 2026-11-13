import { readFileSync } from "node:fs";
import { JOBS } from "@marktwerk/jobs";
import { describe, expect, it, vi } from "vitest";
import { handleCronRequest } from "@/server/cron";
import { db } from "@/server/db";

/** The handler behind POST /api/cron/[job] (route.ts only passes env.CRON_SECRET, JOBS and db). */
const SECRET = "cron-test-secret-that-is-at-least-32-characters";
const post = (authorization?: string) =>
  new Request("http://localhost:3000/api/cron/x", {
    method: "POST",
    headers: authorization ? { authorization } : {},
  });

function setup(run: () => Promise<unknown>) {
  const job = vi.fn(run);
  const logError = vi.fn<(line: string) => void>();
  const deps = { secret: SECRET, jobs: { "test-job": { run: job } }, db, logError };
  return { job, logError, deps };
}

describe("cron route handler", () => {
  it("checks the secret before anything else", async () => {
    const { job, deps } = setup(async () => ({ done: 1 }));
    for (const auth of [undefined, "Bearer wrong", `Bearer ${SECRET}x`]) {
      expect((await handleCronRequest(post(auth), "test-job", deps)).status).toBe(401);
    }
    // No secret configured: nothing is accepted, not even an empty bearer.
    const open = await handleCronRequest(post("Bearer "), "test-job", {
      ...deps,
      secret: undefined,
    });
    expect(open.status).toBe(401);
    expect(job).not.toHaveBeenCalled();
  });

  it("answers 404 for an unknown job", async () => {
    const { deps } = setup(async () => null);
    const res = await handleCronRequest(post(`Bearer ${SECRET}`), "toString", deps);
    expect(res.status).toBe(404);
  });

  it("runs the job and returns its result", async () => {
    const { job, logError, deps } = setup(async () => ({ sent: 2 }));
    const res = await handleCronRequest(post(`Bearer ${SECRET}`), "test-job", deps);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ job: "test-job", result: { sent: 2 } });
    expect(job).toHaveBeenCalledWith(db);
    expect(logError).not.toHaveBeenCalled();
  });

  it("logs one structured line and answers 500 when the job throws", async () => {
    const { logError, deps } = setup(async () => {
      throw new Error(
        `connect failed for postgres://marktwerk_app:hunter2@db.example:6543/app\nwith ${SECRET}`,
      );
    });
    const res = await handleCronRequest(post(`Bearer ${SECRET}`), "test-job", deps);

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ job: "test-job", error: "Job failed, see the server log" });

    expect(logError).toHaveBeenCalledTimes(1);
    const line = logError.mock.calls[0]?.[0] ?? "";
    expect(line).not.toContain("\n");
    expect(line).not.toContain("hunter2");
    expect(line).not.toContain(SECRET);
    expect(JSON.parse(line)).toEqual({
      level: "error",
      msg: "cron job failed",
      job: "test-job",
      error: "Error: connect failed for postgres://***@db.example:6543/app with ***",
      durationMs: expect.any(Number),
    });
  });

  it("logs non-Error throws too", async () => {
    const { logError, deps } = setup(() => Promise.reject("plain string"));
    const res = await handleCronRequest(post(`Bearer ${SECRET}`), "test-job", deps);
    expect(res.status).toBe(500);
    expect(JSON.parse(logError.mock.calls[0]?.[0] ?? "{}").error).toBe("plain string");
  });
});

describe("scheduled jobs workflow", () => {
  // The audit of 2026-11-13 found jobs that were never scheduled on the deployed app (AU4).
  const workflow = readFileSync(
    new URL("../../../../.github/workflows/cron.yml", import.meta.url),
    "utf8",
  );

  it.each(Object.keys(JOBS))("schedules and offers %s", (name) => {
    // Offered for a manual run …
    expect(workflow).toMatch(new RegExp(`^\\s+- ${name}$`, "m"));
    // … and picked by the plan step on a schedule tick.
    const plan = workflow.slice(workflow.indexOf("id: plan"));
    expect(plan).toMatch(new RegExp(`\\b${name}\\b`));
  });
});
