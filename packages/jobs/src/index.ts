import type { Database } from "@marktwerk/db";
import { dailyDigest } from "./daily-digest";
import { deadlineSweep } from "./deadline-sweep";
import { payrollReminders } from "./payroll-reminders";

/**
 * Every scheduled job, keyed by name. The worker schedules these with pg-boss;
 * on serverless hosting an external scheduler calls /api/cron/<name> (ADR 0017).
 * Handlers must be idempotent: they can run twice or late.
 */
export const JOBS = {
  "deadline-sweep": { cron: "*/15 * * * *", run: (db: Database) => deadlineSweep(db) },
  "daily-digest": { cron: "0 7 * * *", run: (db: Database) => dailyDigest(db) },
  "payroll-reminders": { cron: "5 7 * * *", run: (db: Database) => payrollReminders(db) },
} as const satisfies Record<string, { cron: string; run: (db: Database) => Promise<unknown> }>;

export type JobName = keyof typeof JOBS;

export function isJobName(value: string): value is JobName {
  return Object.hasOwn(JOBS, value);
}

export { dailyDigest, deadlineSweep, payrollReminders };
