import {
  checkWorkingTime,
  isClockTime,
  minijobEarningsStatus,
  monthStart,
  shiftLength,
} from "@marktwerk/core";
import type { LiveContext } from "@/server/queries/hours";

/** What a shift form warns about while the times are typed (same rules as the server-side lists). */
export type LiveWarning =
  | { code: "daily_max"; minutes: number; limit: number }
  | { code: "rest_period"; restMinutes: number; limit: number }
  | { code: "break_missing"; required: number }
  | { code: "overlap" }
  | { code: "minijob"; level: "amber" | "red"; earnedCents: number; limitCents: number };

export type LiveDraft = {
  staffMemberId: string;
  workDate: string;
  start: string;
  end: string;
  breakMinutes: number;
  /** The shift being edited: left out of the neighbours and of the month's earnings so far. */
  shiftId?: string;
  /** Minutes this shift counts today (before the edit). */
  currentMinutes?: number;
};

/** Warnings for a draft; empty while the times are incomplete or invalid. */
export function liveWarnings(context: LiveContext, draft: LiveDraft): LiveWarning[] {
  if (!draft.staffMemberId || !isClockTime(draft.start) || !isClockTime(draft.end)) return [];
  const span = {
    workDate: draft.workDate,
    start: draft.start,
    end: draft.end,
    breakMinutes: draft.breakMinutes,
  };
  const length = shiftLength(span);
  if (!length) return [];
  const person = context.people[draft.staffMemberId];
  const others = (person?.spans ?? []).filter((s) => s.id !== draft.shiftId);
  const warnings: LiveWarning[] = [];

  for (const w of checkWorkingTime([...others, { ...span, id: "draft" }], context.limits)) {
    if (w.date !== draft.workDate) continue;
    if (w.code === "daily_max") warnings.push({ code: w.code, minutes: w.minutes, limit: w.limit });
    else if (w.code === "rest_period")
      warnings.push({ code: w.code, restMinutes: w.restMinutes, limit: w.limit });
    else if (w.code === "break_missing") warnings.push({ code: w.code, required: w.required });
    else warnings.push({ code: "overlap" });
  }

  const month = person?.minijob[monthStart(draft.workDate)];
  if (month && context.params) {
    const cents = (minutes: number) =>
      month.hourly && month.rateCents ? Math.round((minutes * month.rateCents) / 60) : 0;
    const earnedCents =
      month.grossCents - cents(draft.currentMinutes ?? 0) + cents(length.netMinutes);
    const status = minijobEarningsStatus(
      {
        earnedCents,
        hourlyRateCents: month.rateCents,
        previousOverrunMonths: month.history.previousOverrunMonths,
        previousElevenMonthsCents: month.history.previousElevenMonthsCents,
      },
      context.params,
    );
    if (status.level !== "ok") {
      warnings.push({
        code: "minijob",
        level: status.level,
        earnedCents,
        limitCents: context.params.limitCents,
      });
    }
  }
  return warnings;
}

/** Net minutes of a draft for the live "Stunden" figure; null while the times are incomplete. */
export function draftMinutes(
  draft: Pick<LiveDraft, "workDate" | "start" | "end" | "breakMinutes">,
) {
  if (!isClockTime(draft.start) || !isClockTime(draft.end)) return null;
  return shiftLength(draft)?.netMinutes ?? null;
}
