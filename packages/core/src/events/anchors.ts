import { addDays, bookingCutoff } from "../dates/calendar";

export type AnchorKey = "event_day" | "setup_day" | "teardown_day" | "booking_cutoff";

/**
 * Named dates of a new event (data model: event_anchor). Multi-day events (Stadtfest, Food & Wine)
 * are set up the day before; single-day markets are set up on the morning of the event.
 */
export function defaultAnchors(startsOn: string, durationDays: number): Record<AnchorKey, string> {
  if (!Number.isInteger(durationDays) || durationDays < 1)
    throw new Error(`Invalid duration: ${durationDays}`);
  return {
    event_day: startsOn,
    setup_day: durationDays > 1 ? addDays(startsOn, -1) : startsOn,
    teardown_day: addDays(startsOn, durationDays - 1),
    booking_cutoff: bookingCutoff(startsOn),
  };
}
