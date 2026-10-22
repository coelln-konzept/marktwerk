import "server-only";
import {
  ARBZG_STATUTORY_LIMITS,
  type MinijobParameters,
  type WorkingTimeLimits,
} from "@marktwerk/core";
import { legalParameter } from "@marktwerk/db/schema";
import type { db } from "./db";

export type LegalRow = { key: string; value: number; validFrom: string };

/** The database itself or a transaction (only `select` is used). */
export type Reader = Pick<typeof db, "select">;

/** All `legal_parameter` rows (a few dozen); the value valid on a day is picked in memory. */
export async function loadLegalRows(reader: Reader): Promise<LegalRow[]> {
  return reader
    .select({
      key: legalParameter.key,
      value: legalParameter.value,
      validFrom: legalParameter.validFrom,
    })
    .from(legalParameter);
}

/** The value of `key` on `date`: the row with the latest `valid_from` on or before it. */
export function legalAt(rows: readonly LegalRow[], key: string, date: string): number | null {
  let best: LegalRow | null = null;
  for (const row of rows) {
    if (row.key === key && row.validFrom <= date && (!best || row.validFrom > best.validFrom))
      best = row;
  }
  return best ? best.value : null;
}

/** Minijob rules on a day; null if one of the three legal values is missing. */
export function minijobParamsAt(rows: readonly LegalRow[], date: string): MinijobParameters | null {
  const limitCents = legalAt(rows, "minijob_limit_cents_per_month", date);
  const overrunCeilingFactor = legalAt(rows, "minijob_overrun_ceiling_factor", date);
  const maxOverrunMonths = legalAt(rows, "minijob_max_overrun_months_12", date);
  if (limitCents === null || overrunCeilingFactor === null || maxOverrunMonths === null)
    return null;
  return { limitCents, overrunCeilingFactor, maxOverrunMonths };
}

export function minimumWageAt(rows: readonly LegalRow[], date: string): number | null {
  return legalAt(rows, "minimum_wage_cents_per_hour", date);
}

/** ArbZG limits on a day: `legal_parameter` overrides, otherwise the statutory text. */
export function workingTimeLimitsAt(rows: readonly LegalRow[], date: string): WorkingTimeLimits {
  const pick = (key: string, fallback: number) => legalAt(rows, key, date) ?? fallback;
  const d = ARBZG_STATUTORY_LIMITS;
  return {
    maxDailyMinutes: pick("arbzg_max_daily_minutes", d.maxDailyMinutes),
    minRestMinutes: pick("arbzg_min_rest_minutes", d.minRestMinutes),
    breakAfterMinutes: pick("arbzg_break_after_minutes", d.breakAfterMinutes),
    shortBreakMinutes: pick("arbzg_short_break_minutes", d.shortBreakMinutes),
    longBreakAfterMinutes: pick("arbzg_long_break_after_minutes", d.longBreakAfterMinutes),
    longBreakMinutes: pick("arbzg_long_break_minutes", d.longBreakMinutes),
  };
}
