import type { EventStatus } from "./lifecycle";

/** Local wall-clock times of an event day ("HH:mm", Europe/Berlin). */
export type EventTimesInput = { setup: string; open: string; close: string; teardown: string };

export type EventTimesError =
  | "invalid_time"
  | "open_after_close"
  | "close_after_teardown"
  | "setup_after_open";

const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isClockTime(value: unknown): value is string {
  return typeof value === "string" && CLOCK.test(value);
}

/**
 * A time as typed ("5", "05", "530", "5:30", "5.30", "05:30 Uhr") → "HH:mm"; null if it isn't one.
 * Always 24-hour, independent of the browser's locale.
 */
export function normalizeClockTime(input: string): string | null {
  const s = input.trim().replace(/\s*uhr$/i, "");
  const match = /^(\d{1,2})(?:[:.]?(\d{2}))?$/.exec(s);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2] ?? "0");
  if (hours > 23 || minutes > 59) return null;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

/**
 * Order of the times of one event day: open < close ≤ teardown. Setup must not be after opening on
 * single-day markets (set up the same morning); multi-day events are set up the day before, so any
 * setup time is fine there. Times past midnight are not supported.
 */
export function checkEventTimes(times: EventTimesInput, multiDay: boolean): EventTimesError | null {
  if (![times.setup, times.open, times.close, times.teardown].every(isClockTime))
    return "invalid_time";
  if (times.open >= times.close) return "open_after_close";
  if (times.close > times.teardown) return "close_after_teardown";
  if (!multiDay && times.setup > times.open) return "setup_after_open";
  return null;
}

/** Upper bound for prices and fees typed in the office (10.000 €). */
export const MAX_PRICE_CENTS = 1_000_000;

/**
 * Euro amount as typed ("12", "12,5", "12,50 €", "1.234,50", "12.50") → integer cents; null if it isn't
 * an amount, negative or above MAX_PRICE_CENTS. A single dot followed by exactly three digits is a
 * thousands separator ("1.500" = 1500 €), otherwise a decimal point.
 */
export function parseEuroCents(input: string): number | null {
  let s = input.replace(/\s|€/g, "");
  if (s === "") return null;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const [whole = "0", fraction = ""] = s.split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(cents) && cents <= MAX_PRICE_CENTS ? cents : null;
}

/** An event can be moved to another date until it runs (decided 2026-10-21). */
export function canMoveEvent(status: EventStatus): boolean {
  return status === "draft" || status === "planned" || status === "confirmed";
}

/** Already announced: moving it needs a word to vendors, so the preview warns. */
export function isAnnounced(status: EventStatus): boolean {
  return status === "planned" || status === "confirmed";
}
