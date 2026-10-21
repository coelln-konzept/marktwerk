import { type ParsedRRule, parseRRule } from "./rrule";

/*
 * Human-readable text for a preset's recurrence rule, e.g. "jeden 1. Sonntag, Apr–Okt" or
 * "jährlich: 1. Samstag im Jun und Sep". Pure: takes the rule string, returns text, so the Vorlagen
 * screen shows what `expandRRule` will actually generate.
 */

export type DescribeLocale = "de" | "en";

const WEEKDAYS: Record<DescribeLocale, string[]> = {
  de: ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"],
  en: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
};

const MONTHS: Record<DescribeLocale, string[]> = {
  de: ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"],
  en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
};

function ordinal(position: number, locale: DescribeLocale): string {
  if (position === -1) return locale === "de" ? "letzten" : "last";
  if (locale === "de") return `${position}.`;
  const suffix = position === 1 ? "st" : position === 2 ? "nd" : position === 3 ? "rd" : "th";
  return `${position}${suffix}`;
}

function join(items: string[], locale: DescribeLocale): string {
  const and = locale === "de" ? "und" : "and";
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} ${and} ${items.at(-1)}`;
}

/** "Apr–Okt" for 3+ consecutive months, otherwise "Mär, Mai, Sep". */
function monthSpan(months: number[], locale: DescribeLocale): string {
  const sorted = [...new Set(months)].sort((a, b) => a - b);
  const names = MONTHS[locale];
  const consecutive = sorted.every((m, i) => i === 0 || m === (sorted[i - 1] as number) + 1);
  if (sorted.length >= 3 && consecutive) {
    return `${names[(sorted[0] as number) - 1]}–${names[(sorted.at(-1) as number) - 1]}`;
  }
  return sorted.map((m) => names[m - 1]).join(", ");
}

function describeParsed(rule: ParsedRRule, locale: DescribeLocale): string {
  const days = rule.weekdays.map((d) => WEEKDAYS[locale][d] as string);
  const de = locale === "de";
  const sortedMonths = rule.months ? [...rule.months].sort((a, b) => a - b) : null;

  if (rule.freq === "YEARLY") {
    const months = join(
      (sortedMonths ?? []).map((m) => MONTHS[locale][m - 1] as string),
      locale,
    );
    const what =
      rule.setPos === null
        ? de
          ? `jeder ${join(days, locale)}`
          : `every ${join(days, locale)}`
        : `${ordinal(rule.setPos, locale)} ${join(days, locale)}`;
    return de ? `jährlich: ${what} im ${months}` : `yearly: ${what} in ${months}`;
  }

  const what =
    rule.setPos === null
      ? de
        ? `jeden ${join(days, locale)}`
        : `every ${join(days, locale)}`
      : de
        ? `jeden ${ordinal(rule.setPos, locale)} ${join(days, locale)}`
        : `every ${ordinal(rule.setPos, locale)} ${join(days, locale)}`;
  if (!sortedMonths) return de ? `${what} im Monat` : `${what} of the month`;
  return `${what}, ${monthSpan(sortedMonths, locale)}`;
}

/** Text for the rule, or null if the rule is missing or not supported by `parseRRule`. */
export function describeRRule(
  rule: string | null | undefined,
  locale: DescribeLocale,
): string | null {
  if (!rule) return null;
  try {
    return describeParsed(parseRRule(rule), locale);
  } catch {
    return null;
  }
}
