import { isoWeek } from "@marktwerk/core";

/*
 * German-first formats (UX concept §8): 16.05.2026 · Sa 16.05. · 14:30 Uhr · 1.234,56 € · 4,50 m · KW 20.
 * Business dates are "YYYY-MM-DD" strings; they are formatted in UTC so no time zone can shift the day.
 */

const tag = (locale: string) => (locale === "en" ? "en-GB" : "de-DE");

function utcNoon(date: string): Date {
  return new Date(`${date}T12:00:00Z`);
}

function parts(date: string, locale: string, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat(tag(locale), { timeZone: "UTC", ...options }).format(
    utcNoon(date),
  );
}

/** 16.05.2026 */
export function formatDate(date: string, locale: string): string {
  return parts(date, locale, { day: "2-digit", month: "2-digit", year: "numeric" });
}

/** Sa 16.05. */
export function formatDateShort(date: string, locale: string): string {
  const weekday = parts(date, locale, { weekday: "short" }).replace(/\.$/, "");
  // de-DE already ends day+month with a dot ("16.05."); en-GB gives "16/05".
  const dayMonth = parts(date, locale, { day: "2-digit", month: "2-digit" });
  return `${weekday} ${dayMonth}`;
}

/** Sa 16.05.2026 */
export function formatDateWithWeekday(date: string, locale: string): string {
  const weekday = parts(date, locale, { weekday: "short" }).replace(/\.$/, "");
  return `${weekday} ${formatDate(date, locale)}`;
}

/** Mai 2026 */
export function formatMonth(date: string, locale: string): string {
  return parts(date, locale, { month: "long", year: "numeric" });
}

/** "So 07.06." for one day, "Fr–So 21.–23.08." for a range in one month, "Fr 30.10.–So 01.11." otherwise. */
export function formatDateRange(startsOn: string, endsOn: string, locale: string): string {
  if (startsOn === endsOn) return formatDateShort(startsOn, locale);
  const wd = (d: string) => parts(d, locale, { weekday: "short" }).replace(/\.$/, "");
  if (startsOn.slice(0, 7) === endsOn.slice(0, 7) && locale !== "en") {
    return `${wd(startsOn)}–${wd(endsOn)} ${startsOn.slice(8, 10)}.–${endsOn.slice(8, 10)}.${endsOn.slice(5, 7)}.`;
  }
  return `${formatDateShort(startsOn, locale)}–${formatDateShort(endsOn, locale)}`;
}

/** Calendar week label: "KW 20" / "CW 20". */
export function formatWeek(date: string, locale: string): string {
  return `${locale === "en" ? "CW" : "KW"} ${isoWeek(date).week}`;
}

/** 1.234,56 € (cents in, always two decimals). */
export function formatMoney(cents: number, locale: string): string {
  return new Intl.NumberFormat(tag(locale), { style: "currency", currency: "EUR" }).format(
    cents / 100,
  );
}

/** 4,50 m (centimetres in). */
export function formatLength(cm: number, locale: string): string {
  return `${new Intl.NumberFormat(tag(locale), { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(cm / 100)} m`;
}

export function formatNumber(value: number, locale: string, maximumFractionDigits = 1): string {
  return new Intl.NumberFormat(tag(locale), { maximumFractionDigits }).format(value);
}

/** Today's business date in the company's time zone. */
export function todayIn(timeZone = "Europe/Berlin"): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
