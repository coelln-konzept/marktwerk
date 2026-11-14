import { addDays, daysInMonth, eachDay, isoDate, weekday } from "../dates/calendar";
import { expandRRule, parseRRule } from "./rrule";

/*
 * The date rule of "Markt planen" (UX-015, UX-043): "jeden 1. Samstag und den Sonntag danach, April bis Oktober
 * 2027". Several weekdays form one run: the position ("1.", "letzten", or every week) picks the run's first day
 * (its Beginn) in each month, and the other weekdays are the days after it. So "1. Sa + So" is the first weekend,
 * not the first Saturday or Sunday (which is what BYSETPOS on several BYDAY codes would give). Pure: dates are
 * business dates ("YYYY-MM-DD"), weekdays 0 = Sunday … 6 = Saturday. The months are a list, not a range: a
 * market held in May and October is not held from May to October.
 */

export type PlanRule = {
  weekdays: number[];
  /** null = every week, 1–5 = the n-th Beginn of the month (5 = only in months that have a 5th), -1 = the last. */
  setPos: number | null;
  /** The months, 1–12, ascending. */
  months: number[];
  year: number;
};

export const ALL_MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;

/** The months ascending, without duplicates or invalid values. */
export function planRuleMonths(months: readonly number[]): number[] {
  return ALL_MONTHS.filter((m) => months.includes(m));
}

/** The months as one first–last range when they follow each other ("April bis Oktober"), else null. */
export function planRuleMonthRange(months: readonly number[]): { from: number; to: number } | null {
  const list = planRuleMonths(months);
  const from = list[0];
  const to = list.at(-1);
  if (from === undefined || to === undefined || to - from + 1 !== list.length) return null;
  return { from, to };
}

/** Monday first, the German week. */
const MONDAY_FIRST = [1, 2, 3, 4, 5, 6, 0] as const;

/** The weekdays in Monday-first order, without duplicates or invalid values. */
export function planRuleWeekdays(weekdays: readonly number[]): number[] {
  return MONDAY_FIRST.filter((d) => weekdays.includes(d));
}

/**
 * The first day of the run (the Beginn): the first weekday in Monday-first order, except for a run over the
 * weekend into Monday (Sa + So + Mo starts on Saturday, So + Mo on Sunday). Null without weekdays.
 */
export function planRuleStart(weekdays: readonly number[]): number | null {
  const days = planRuleWeekdays(weekdays);
  if (days.length === 0) return null;
  if (days.includes(0) && days.includes(1) && days.length < 7) {
    let start = 0;
    while (days.includes((start + 6) % 7)) start = (start + 6) % 7;
    return start;
  }
  return days[0] as number;
}

/** The weekdays after the Beginn, in run order (for "und den Sonntag danach"). */
export function planRuleFollowing(weekdays: readonly number[]): number[] {
  const start = planRuleStart(weekdays);
  if (start === null) return [];
  return planRuleWeekdays(weekdays)
    .filter((d) => d !== start)
    .sort((a, b) => ((a - start + 7) % 7) - ((b - start + 7) % 7));
}

/** Every date the rule yields, ascending (a run that starts at the end of a month keeps its later days). */
export function expandPlanRule(rule: PlanRule): string[] {
  const start = planRuleStart(rule.weekdays);
  if (start === null) return [];
  const offsets = [0, ...planRuleFollowing(rule.weekdays).map((d) => (d - start + 7) % 7)];
  const dates = new Set<string>();
  for (const month of planRuleMonths(rule.months)) {
    const starts: string[] = [];
    for (let day = 1; day <= daysInMonth(rule.year, month); day += 1) {
      const date = isoDate(rule.year, month, day);
      if (weekday(date) === start) starts.push(date);
    }
    const chosen =
      rule.setPos === null
        ? starts
        : [starts.at(rule.setPos > 0 ? rule.setPos - 1 : rule.setPos)].filter(
            (d): d is string => d !== undefined,
          );
    for (const first of chosen) for (const offset of offsets) dates.add(addDays(first, offset));
  }
  return [...dates].sort();
}

/**
 * A stored preset rhythm as a plan rule, or null if unreadable. `exact` says whether the plan rule means the
 * same dates as the stored one: a stored rule with several weekdays and a position ("BYDAY=SA,SU;BYSETPOS=1")
 * is the first Saturday-or-Sunday of the month everywhere else in the app (one day), while the plan rule reads
 * it as the first weekend (a run of two days). Such a rule is only a starting point.
 */
export function planRuleFromRRule(
  rrule: string | null,
  year: number,
): (PlanRule & { exact: boolean }) | null {
  if (!rrule) return null;
  let parsed: ReturnType<typeof parseRRule>;
  try {
    parsed = parseRRule(rrule);
  } catch {
    return null;
  }
  const weekdays = planRuleWeekdays(parsed.weekdays);
  return {
    weekdays,
    setPos: parsed.setPos,
    months: planRuleMonths(parsed.months ?? ALL_MONTHS),
    year,
    exact: weekdays.length === 1 || parsed.setPos === null,
  };
}

/**
 * The dates a stored rhythm yields in a year, exactly as the Vorlage preview shows them (`expandRRule`), or []
 * when the rule is unreadable.
 */
export function rruleDatesInYear(rrule: string, year: number): string[] {
  try {
    return expandRRule(rrule, `${year}-01-01`, `${year}-12-31`);
  } catch {
    return [];
  }
}

export type PastDate = { startsOn: string; endsOn: string };

/** Fewer matching dates than this are no rhythm, however well they fit (one January date is no rule). */
export const MIN_REGULAR_RUNS = 3;

export type SuggestedPlanRule = Omit<PlanRule, "year"> & {
  /** The season the suggestion was read from and how many dates it had. */
  basedOn: { season: number; dates: number };
  /** The rule matches most of those dates; otherwise it is only a starting point, not a rhythm. */
  regular: boolean;
};

/**
 * A rule read from the market's own past dates (UX-015): its latest season, the most common weekday pattern
 * (separate events on following days count as one run, so Sa + So one-day events read as "Sa + So"), the
 * position in the month (or every week when months had several dates), and the months it was held in.
 * When the market's duration already covers the run, only the Beginn is a weekday of the rule (a Fr–So
 * market of 3 days is "Freitag"). The season is the latest year with dates, unless that is the current year
 * (`today`'s, still running) and the year before had more dates. Regular only with at least
 * `MIN_REGULAR_RUNS` matching dates. Null without past dates.
 */
export function suggestPlanRule(
  past: readonly PastDate[],
  durationDays: number,
  today: string,
): SuggestedPlanRule | null {
  if (past.length === 0) return null;
  const yearOf = (p: PastDate) => Number(p.startsOn.slice(0, 4));
  const perYear = new Map<number, number>();
  for (const p of past) perYear.set(yearOf(p), (perYear.get(yearOf(p)) ?? 0) + 1);
  const years = [...perYear.keys()].sort((a, b) => b - a);
  let season = years[0] as number;
  const before = years[1];
  if (
    season >= Number(today.slice(0, 4)) &&
    before !== undefined &&
    (perYear.get(before) ?? 0) > (perYear.get(season) ?? 0)
  )
    season = before;
  const days = [
    ...new Set(
      past
        .filter((p) => yearOf(p) === season)
        .flatMap((p) => eachDay(p.startsOn, p.endsOn < p.startsOn ? p.startsOn : p.endsOn)),
    ),
  ].sort();
  // Runs of consecutive days: one occurrence of the market.
  const runs: string[][] = [];
  for (const day of days) {
    const run = runs.at(-1);
    if (run && addDays(run.at(-1) as string, 1) === day) run.push(day);
    else runs.push([day]);
  }
  const patternOf = (run: string[]) =>
    planRuleWeekdays(run.slice(0, 7).map((d) => weekday(d))).join(",");
  const counts = new Map<string, number>();
  for (const run of runs) counts.set(patternOf(run), (counts.get(patternOf(run)) ?? 0) + 1);
  let pattern = "";
  let best = 0;
  // Ties go to the pattern of the latest run.
  for (const run of [...runs].reverse()) {
    const n = counts.get(patternOf(run)) ?? 0;
    if (n > best) {
      best = n;
      pattern = patternOf(run);
    }
  }
  const matching = runs.filter((run) => patternOf(run) === pattern);
  const firsts = matching.map((run) => run[0] as string);
  const length = Math.max(...matching.map((run) => run.length));
  const startDay = weekday(firsts[0] as string);
  const weekdays = length <= durationDays ? [startDay] : pattern.split(",").map(Number);

  // Every week when most months had more than one run, otherwise the position that fits the most dates.
  const perMonth = new Map<string, number>();
  for (const first of firsts)
    perMonth.set(first.slice(0, 7), (perMonth.get(first.slice(0, 7)) ?? 0) + 1);
  const multi = [...perMonth.values()].filter((n) => n > 1).length;
  let setPos: number | null = null;
  if (multi * 2 <= perMonth.size) {
    let fit = -1;
    for (const pos of [1, 2, 3, 4, -1]) {
      const n = firsts.filter((first) => {
        const day = Number(first.slice(8, 10));
        const monthDays = daysInMonth(Number(first.slice(0, 4)), Number(first.slice(5, 7)));
        return pos === -1 ? day + 7 > monthDays : Math.ceil(day / 7) === pos;
      }).length;
      if (n > fit) {
        fit = n;
        setPos = pos;
      }
    }
  }
  const months = planRuleMonths(firsts.map((first) => Number(first.slice(5, 7))));
  // Regular: enough dates, and at least half of the Beginn days the rule gives for that season were real
  // dates. Twice a year (March and September) is no rhythm, even if both dates fall on a 3rd Friday.
  const ruleStarts = expandPlanRule({
    weekdays: [planRuleStart(weekdays) as number],
    setPos,
    months,
    year: season,
  });
  const hits = ruleStarts.filter((d) => firsts.includes(d)).length;
  return {
    weekdays: planRuleWeekdays(weekdays),
    setPos,
    months,
    basedOn: { season, dates: matching.length },
    regular: matching.length >= MIN_REGULAR_RUNS && hits * 2 >= ruleStarts.length,
  };
}
