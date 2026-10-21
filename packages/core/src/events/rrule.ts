import { daysInMonth, isoDate, weekday } from "../dates/calendar";

/*
 * Recurrence rules of event presets, a small RFC 5545 subset that matches how the old website's presets
 * were used: FREQ=MONTHLY or YEARLY, BYMONTH, BYDAY (weekday codes without ordinal prefixes) and
 * BYSETPOS (1..5 or -1). BYSETPOS picks the n-th matching weekday **within each month**, also for
 * YEARLY rules ("FREQ=YEARLY;BYMONTH=6,9;BYDAY=SA;BYSETPOS=1" = first Saturday of June and of September),
 * which deliberately differs from strict RFC 5545. Unsupported parts throw instead of being ignored.
 */

const WEEKDAY_CODES: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

export type ParsedRRule = {
  freq: "MONTHLY" | "YEARLY";
  months: number[] | null;
  weekdays: number[];
  setPos: number | null;
};

export function parseRRule(rule: string): ParsedRRule {
  const parts = new Map<string, string>();
  for (const segment of rule.split(";")) {
    const [key, value] = segment.split("=");
    if (!key || value === undefined || value === "")
      throw new Error(`Invalid RRULE segment: "${segment}"`);
    if (!["FREQ", "BYMONTH", "BYDAY", "BYSETPOS"].includes(key)) {
      throw new Error(`Unsupported RRULE part "${key}" in "${rule}"`);
    }
    parts.set(key, value);
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
  if (months?.some((m) => !Number.isInteger(m) || m < 1 || m > 12)) {
    throw new Error(`Invalid BYMONTH in "${rule}"`);
  }
  if (freq === "YEARLY" && months === null) throw new Error(`YEARLY needs BYMONTH in "${rule}"`);

  const bySetPos = parts.get("BYSETPOS");
  const setPos = bySetPos === undefined ? null : Number(bySetPos);
  if (
    setPos !== null &&
    !(setPos === -1 || (Number.isInteger(setPos) && setPos >= 1 && setPos <= 5))
  ) {
    throw new Error(`Unsupported BYSETPOS in "${rule}"`);
  }
  return { freq, months, weekdays, setPos };
}

/** Every occurrence date in the inclusive range [from, to], ascending. MONTHLY without BYMONTH = every month. */
export function expandRRule(rule: string, from: string, to: string): string[] {
  const parsed = parseRRule(rule);
  const months = parsed.months ?? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  const occurrences: string[] = [];
  for (let year = Number(from.slice(0, 4)); year <= Number(to.slice(0, 4)); year += 1) {
    for (const month of months) {
      const candidates: string[] = [];
      for (let day = 1; day <= daysInMonth(year, month); day += 1) {
        const date = isoDate(year, month, day);
        if (parsed.weekdays.includes(weekday(date))) candidates.push(date);
      }
      let chosen = candidates;
      if (parsed.setPos !== null) {
        const picked = candidates.at(parsed.setPos > 0 ? parsed.setPos - 1 : parsed.setPos);
        chosen = picked === undefined ? [] : [picked];
      }
      for (const date of chosen) if (date >= from && date <= to) occurrences.push(date);
    }
  }
  return occurrences.sort();
}
