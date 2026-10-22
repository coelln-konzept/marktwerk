/**
 * Minijob allowance rules (research 06). Pure functions: legal numbers are
 * passed in from the `legal_parameter` table, never hard-coded here.
 *
 * - The monthly limit is an average over a 12-month forecast, not a hard cap.
 * - An unforeseeable overrun is allowed in at most 2 months within 12, and
 *   then at most up to 2× the limit; the reason must be documented.
 */

export type MinijobParameters = {
  /** Monthly earnings limit in cents, e.g. 60_300 in 2026. */
  limitCents: number;
  /** Multiple of the limit allowed in an overrun month (2). */
  overrunCeilingFactor: number;
  /** Max. overrun months in any rolling 12 months (2). */
  maxOverrunMonths: number;
};

export type MinijobMonthInput = {
  hourlyRateCents: number;
  workedMinutes: number;
  plannedMinutes: number;
  /** Overrun months in the 11 months before this one. */
  previousOverrunMonths: number;
  /** Earnings of the 11 months before this one, in cents. */
  previousElevenMonthsCents: number;
};

export type MinijobLevel = "ok" | "amber" | "red";

export type MinijobMonthStatus = {
  earnedCents: number;
  /** Hours (in minutes) that still fit under the monthly limit. */
  remainingMinutes: number;
  level: MinijobLevel;
  reasons: Array<
    "over_monthly_limit" | "over_overrun_ceiling" | "too_many_overrun_months" | "over_annual_limit"
  >;
};

export function minijobMonthStatus(
  input: MinijobMonthInput,
  params: MinijobParameters,
): MinijobMonthStatus {
  if (input.hourlyRateCents <= 0) throw new Error("hourlyRateCents must be positive");
  const minutes = input.workedMinutes + input.plannedMinutes;
  const earnedCents = Math.round((minutes * input.hourlyRateCents) / 60);
  return minijobEarningsStatus(
    {
      earnedCents,
      hourlyRateCents: input.hourlyRateCents,
      previousOverrunMonths: input.previousOverrunMonths,
      previousElevenMonthsCents: input.previousElevenMonthsCents,
    },
    params,
  );
}

/**
 * The same rules for earnings that are already known in cents (several rates in one month, or a fixed
 * monthly pay with a working-time account). `hourlyRateCents` only turns the remaining allowance into
 * minutes; without it `remainingMinutes` is 0.
 */
export function minijobEarningsStatus(
  input: {
    earnedCents: number;
    hourlyRateCents: number | null;
    previousOverrunMonths: number;
    previousElevenMonthsCents: number;
  },
  params: MinijobParameters,
): MinijobMonthStatus {
  const { earnedCents } = input;
  const remainingMinutes =
    input.hourlyRateCents && input.hourlyRateCents > 0
      ? Math.max(0, Math.floor(((params.limitCents - earnedCents) * 60) / input.hourlyRateCents))
      : 0;

  const reasons: MinijobMonthStatus["reasons"] = [];
  const overLimit = earnedCents > params.limitCents;
  if (overLimit) {
    reasons.push("over_monthly_limit");
    if (earnedCents > params.limitCents * params.overrunCeilingFactor)
      reasons.push("over_overrun_ceiling");
    if (input.previousOverrunMonths >= params.maxOverrunMonths)
      reasons.push("too_many_overrun_months");
  }
  if (input.previousElevenMonthsCents + earnedCents > params.limitCents * 12)
    reasons.push("over_annual_limit");

  const red = reasons.some((r) => r !== "over_monthly_limit");
  return {
    earnedCents,
    remainingMinutes,
    level: red ? "red" : overLimit ? "amber" : "ok",
    reasons,
  };
}
