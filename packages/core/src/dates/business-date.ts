import { DEFAULT_TIME_ZONE } from "./relative";

/** The calendar day ("YYYY-MM-DD") that `now` falls on in the company's time zone (default Europe/Berlin). */
export function businessDate(now: Date = new Date(), timeZone: string = DEFAULT_TIME_ZONE): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
