import type { QuietHours } from "@marktwerk/core";

/**
 * Values for the `holidayNotes` messages ({kind}, {from}, {until}): "ganztägig" (Karfreitag), "ab 16 Uhr"
 * (Heiligabend) or "5–13 Uhr" (Volkstrauertag).
 */
export function quietHoursValues(quiet: QuietHours): {
  kind: "allDay" | "from" | "range";
  from: number;
  until: number;
} {
  const kind =
    quiet.fromHour === 0 && quiet.untilHour === 24
      ? "allDay"
      : quiet.untilHour === 24
        ? "from"
        : "range";
  return { kind, from: quiet.fromHour, until: quiet.untilHour };
}

/** A holiday as the Kalender shows it in a day cell. */
export type CalendarHoliday = {
  name: string;
  /** A real holiday (tinted); false for the stille Tage that are working days or plain Sundays. */
  dayOff: boolean;
  /** "Stiller Feiertag – Märkte meist nicht erlaubt (5–13 Uhr)", or null. */
  quiet: string | null;
};
