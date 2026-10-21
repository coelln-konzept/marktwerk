import type { Database } from "@marktwerk/db";
import { dailyDigest } from "./daily-digest";
import { deadlineSweep } from "./deadline-sweep";
import { installmentReminders } from "./installment-reminders";
import { obligationReminders } from "./obligation-reminders";
import { payrollReminders } from "./payroll-reminders";

/**
 * Every scheduled job, keyed by name. The worker schedules these with pg-boss;
 * on serverless hosting an external scheduler calls /api/cron/<name> (ADR 0017).
 * Handlers must be idempotent: they can run twice or late.
 */
export const JOBS = {
  "deadline-sweep": { cron: "*/15 * * * *", run: (db: Database) => deadlineSweep(db) },
  "daily-digest": { cron: "0 7 * * *", run: (db: Database) => dailyDigest(db) },
  // Date-based, so hourly is plenty; the dedupe keys make repeated runs harmless.
  "obligation-reminders": { cron: "5 * * * *", run: (db: Database) => obligationReminders(db) },
  "installment-reminders": { cron: "10 * * * *", run: (db: Database) => installmentReminders(db) },
  "payroll-reminders": { cron: "5 7 * * *", run: (db: Database) => payrollReminders(db) },
} as const satisfies Record<string, { cron: string; run: (db: Database) => Promise<unknown> }>;

export type JobName = keyof typeof JOBS;

export function isJobName(value: string): value is JobName {
  return Object.hasOwn(JOBS, value);
}

export { dailyDigest, deadlineSweep, installmentReminders, obligationReminders, payrollReminders };
