import { describeRRule } from "@marktwerk/core/events/rrule-describe";

/** The preset's recurrence in words for the current locale; falls back to the raw rule, "–" if none. */
export function rruleText(rule: string | null | undefined, locale: string): string {
  return describeRRule(rule, locale === "en" ? "en" : "de") ?? rule ?? "–";
}
