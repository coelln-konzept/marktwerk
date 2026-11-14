import { addDays, daysInMonth, eachDay, isoDate, weekday } from "../dates/calendar";
import { parseRRule } from "./rrule";

/*
 * The date rule of "Markt planen" (UX-015, UX-043): "jeden 1. Samstag und den Sonntag danach, April bis Oktober
 * 2027". Several weekdays form one run: the position ("1.", "letzten", or every week) picks the run's first day
 * (its Beginn) in each month, and the other weekdays are the days after it. So "1. Sa + So" is the first weekend,
 * not the first Saturday or Sunday (which is what BYSETPOS on several BYDAY codes would give). Pure: dates are
 * business dates ("YYYY-MM-DD"), weekdays 0 = Sunday … 6 = Saturday.
 */

export type PlanRule = {
  weekdays: number[];
  /** null = every week, 1–4 = the n-th Beginn of the month, -1 = the last. */
  setPos: number | null;
  fromMonth: number;
  toMonth: number;
  year: number;
};

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
  if (start === null || rule.fromMonth > rule.toMonth) return [];
  const offsets = [0, ...planRuleFollowing(rule.weekdays).map((d) => (d - start + 7) % 7)];
  const dates = new Set<string>();
  for (let month = Math.max(1, rule.fromMonth); month <= Math.min(12, rule.toMonth); month += 1) {
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

/** A stored preset rhythm as a plan rule (months as their first–last range), or null if unreadable. */
export function planRuleFromRRule(rrule: string | null, year: number): PlanRule | null {
  if (!rrule) return null;
  let parsed: ReturnType<typeof parseRRule>;
  try {
    parsed = parseRRule(rrule);
  } catch {
    return null;
  }
  const months = parsed.months ?? [1, 12];
  return {
    weekdays: planRuleWeekdays(parsed.weekdays),
    setPos: parsed.setPos === 5 ? -1 : parsed.setPos,
    fromMonth: Math.min(...months),
    toMonth: Math.max(...months),
    year,
  };
}

export type PastDate = { startsOn: string; endsOn: string };

export type SuggestedPlanRule = Omit<PlanRule, "year"> & {
  /** The season the suggestion was read from and how many dates it had. */
  basedOn: { season: number; dates: number };
  /** The rule matches most of those dates; otherwise it is only a starting point, not a rhythm. */
  regular: boolean;
};

/**
 * A rule read from the market's own past dates (UX-015): its latest season, the most common weekday pattern
 * (separate events on following days count as one run, so Sa + So one-day events read as "Sa + So"), the
 * position in the month (or every week when months had several dates), and the first to the last month.
 * When the market's duration already covers the run, only the Beginn is a weekday of the rule (a Fr–So
 * market of 3 days is "Freitag"). Null without past dates.
 */
export function suggestPlanRule(
  past: readonly PastDate[],
  durationDays: number,
): SuggestedPlanRule | null {
  if (past.length === 0) return null;
  const season = Math.max(...past.map((p) => Number(p.startsOn.slice(0, 4))));
  const days = [
    ...new Set(
      past
        .filter((p) => Number(p.startsOn.slice(0, 4)) === season)
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
  const months = firsts.map((first) => Number(first.slice(5, 7)));
  const fromMonth = Math.min(...months);
  const toMonth = Math.max(...months);
  // Regular: at least half of the Beginn days the rule gives for that season were real dates. Twice a year
  // (March and September) is no monthly rhythm, even if both dates fall on a 3rd Friday.
  const ruleStarts = expandPlanRule({
    weekdays: [planRuleStart(weekdays) as number],
    setPos,
    fromMonth,
    toMonth,
    year: season,
  });
  const hits = ruleStarts.filter((d) => firsts.includes(d)).length;
  return {
    weekdays: planRuleWeekdays(weekdays),
    setPos,
    fromMonth,
    toMonth,
    basedOn: { season, dates: matching.length },
    regular: hits * 2 >= ruleStarts.length,
  };
}
