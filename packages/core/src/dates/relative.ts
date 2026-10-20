import { TZDate } from "@date-fns/tz";
import { addDays } from "date-fns";

/** Default company time zone. Overridden by settings.time_zone at runtime. */
export const DEFAULT_TIME_ZONE = "Europe/Berlin";

/** A calendar date without time, e.g. "2026-11-08". */
export type IsoDate = `${number}-${number}-${number}`;

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const LOCAL_TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;

/**
 * Resolves a relative deadline ("T-30 at 09:00") to an absolute instant.
 *
 * Offsets are counted in calendar days in the company's time zone, so a
 * deadline keeps its wall-clock time across DST changes.
 *
 * @param anchor     the market day (or other anchor date), local calendar date
 * @param offsetDays negative = before the anchor, positive = after
 * @param localTime  "HH:mm" wall-clock time on the resulting day
 */
export function resolveRelativeDue(
  anchor: IsoDate | string,
  offsetDays: number,
  localTime: string,
  timeZone: string = DEFAULT_TIME_ZONE,
): Date {
  const date = ISO_DATE.exec(anchor);
  if (!date) throw new Error(`Invalid anchor date: ${anchor}`);
  const time = LOCAL_TIME.exec(localTime);
  if (!time) throw new Error(`Invalid local time: ${localTime}`);
  if (!Number.isInteger(offsetDays)) throw new Error(`Offset must be an integer: ${offsetDays}`);

  const [, y, m, d] = date.map(Number) as [number, number, number, number];
  const [, hh, mm] = time.map(Number) as [number, number, number];

  const local = addDays(new TZDate(y, m - 1, d, hh, mm, 0, timeZone), offsetDays);
  return new Date(local.getTime());
}

/** Formats an offset for humans: -30 → "T-30", 0 → "T", 2 → "T+2". */
export function formatOffset(offsetDays: number): string {
  if (offsetDays === 0) return "T";
  return offsetDays < 0 ? `T${offsetDays}` : `T+${offsetDays}`;
}
