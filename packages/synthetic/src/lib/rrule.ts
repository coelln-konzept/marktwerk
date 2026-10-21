import type { DateString } from "../types";
import { daysInMonth, toDateString, weekday, yearOf } from "./dates";

/*
 * Small RFC 5545 subset, enough for event presets: FREQ=MONTHLY or YEARLY, BYMONTH, BYDAY (one or more
 * weekday codes, no ordinal prefixes), BYSETPOS (1..5 or -1). Unsupported parts throw instead of being
 * silently ignored.
 */

const WEEKDAY_CODES: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

interface ParsedRule {
  freq: "MONTHLY" | "YEARLY";
  months: number[] | null;
  weekdays: number[];
  setPos: number | null;
}

export function parseRRule(rule: string): ParsedRule {
  const parts = new Map<string, string>();
  for (const segment of rule.split(";")) {
    const [key, value] = segment.split("=");
    if (!key || value === undefined) throw new Error(`Invalid RRULE segment: "${segment}"`);
    parts.set(key, value);
  }
  for (const key of parts.keys()) {
    if (!["FREQ", "BYMONTH", "BYDAY", "BYSETPOS"].includes(key)) {
      throw new Error(`Unsupported RRULE part "${key}" in "${rule}"`);
    }
  }
  const freq = parts.get("FREQ");
  if (freq !== "MONTHLY" && freq !== "YEARLY") throw new Error(`Unsupported FREQ in "${rule}"`);

  const byDay = parts.get("BYDAY");
  if (!byDay) throw new Error(`BYDAY is required in "${rule}"`);
  const weekdays = byDay.split(",").map((code) => {
    const value = WEEKDAY_CODES[code];
    if (value === undefined) throw new Error(`Unsupported BYDAY code "${code}" in "${rule}"`);
    return value;
  });

  const byMonth = parts.get("BYMONTH");
  const months = byMonth ? byMonth.split(",").map(Number) : null;
  if (freq === "YEARLY" && months === null) throw new Error(`YEARLY needs BYMONTH in "${rule}"`);

  const bySetPos = parts.get("BYSETPOS");
  return { freq, months, weekdays, setPos: bySetPos ? Number(bySetPos) : null };
}

function candidatesInMonth(year: number, month: number, weekdays: number[]): DateString[] {
  const dates: DateString[] = [];
  for (let day = 1; day <= daysInMonth(year, month); day += 1) {
    const date = toDateString(year, month, day);
    if (weekdays.includes(weekday(date))) dates.push(date);
  }
  return dates;
}

/**
 * Every occurrence date in the inclusive range [from, to], sorted ascending.
 * Monthly rules without BYMONTH fire in every month.
 */
export function expandRRule(rule: string, from: DateString, to: DateString): DateString[] {
  const parsed = parseRRule(rule);
  const monthList = parsed.months ?? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  const occurrences: DateString[] = [];

  for (let year = yearOf(from); year <= yearOf(to); year += 1) {
    for (const month of monthList) {
      const candidates = candidatesInMonth(year, month, parsed.weekdays);
      const chosen: DateString[] = [];
      if (parsed.setPos === null) {
        chosen.push(...candidates);
      } else {
        const index = parsed.setPos > 0 ? parsed.setPos - 1 : candidates.length + parsed.setPos;
        const picked = candidates[index];
        if (picked !== undefined) chosen.push(picked);
      }
      for (const date of chosen) {
        if (date >= from && date <= to) occurrences.push(date);
      }
    }
  }
  return occurrences.sort();
}
