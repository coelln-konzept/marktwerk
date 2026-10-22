import { addDays, expandRRule, partsToRRule, rruleToParts } from "@marktwerk/core";

/** What the rhythm builder edits (weekday 0 = Sunday, months 1–12; no months = every month). */
export type Rhythm = {
  none: boolean;
  weekdays: number[];
  /** null = every one of these weekdays, 1–5 = the n-th per month, -1 = the last. */
  setPos: number | null;
  months: number[];
};

/** Monday first, the German week. */
export const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;
export const SET_POSITIONS = [null, 1, 2, 3, 4, 5, -1] as const;

export const NO_RHYTHM: Rhythm = { none: true, weekdays: [], setPos: null, months: [] };

export function rhythmFromRule(rule: string | null): Rhythm {
  if (!rule) return NO_RHYTHM;
  try {
    const parts = rruleToParts(rule);
    return {
      none: false,
      weekdays: parts.weekdays,
      setPos: parts.setPos,
      months: parts.months ?? [],
    };
  } catch {
    return NO_RHYTHM;
  }
}

/**
 * The rule for the form state: null = "kein Rhythmus", undefined = a rhythm without weekdays (not a
 * rule yet). A rhythm the user did not change keeps its stored rule text (an old YEARLY rule would
 * otherwise be rewritten as MONTHLY, which yields the same dates).
 */
export function rhythmToRule(rhythm: Rhythm, stored: string | null): string | null | undefined {
  if (rhythm.none) return null;
  if (rhythm.weekdays.length === 0) return undefined;
  const rule = partsToRRule({
    weekdays: rhythm.weekdays,
    setPos: rhythm.setPos,
    months: rhythm.months.length > 0 ? rhythm.months : null,
  });
  if (stored) {
    try {
      if (partsToRRule(rruleToParts(stored)) === rule) return stored;
    } catch {
      // the stored rule is not readable; the rebuilt one replaces it
    }
  }
  return rule;
}

/** The next dates a rule yields within two years (first `limit`), like the Vorschau shows them. */
export function upcomingDates(rule: string | null, today: string, limit = 5): string[] {
  if (!rule) return [];
  try {
    return expandRRule(rule, today, addDays(today, 730)).slice(0, limit);
  } catch {
    return [];
  }
}
