/**
 * Event lifecycle (data model principle 6: booking state lives in separate flags, not here).
 * Entwurf → geplant → bestätigt → läuft → abgeschlossen → abgerechnet; "abgesagt" can be reached
 * before the event runs and is reopened as a draft.
 */
export const EVENT_STATUSES = [
  "draft",
  "planned",
  "confirmed",
  "live",
  "completed",
  "closed",
  "cancelled",
] as const;

export type EventStatus = (typeof EVENT_STATUSES)[number];

const TRANSITIONS: Record<EventStatus, readonly EventStatus[]> = {
  draft: ["planned", "confirmed", "cancelled"],
  planned: ["confirmed", "cancelled", "draft"],
  confirmed: ["live", "cancelled", "planned"],
  live: ["completed"],
  completed: ["closed"],
  closed: [],
  cancelled: ["draft"],
};

export function isEventStatus(value: unknown): value is EventStatus {
  return typeof value === "string" && (EVENT_STATUSES as readonly string[]).includes(value);
}

/** The statuses an event may move to from `status`, in menu order. */
export function allowedTransitions(status: EventStatus): readonly EventStatus[] {
  return TRANSITIONS[status];
}

export function canTransition(from: EventStatus, to: EventStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

/** Cancelling needs a reason (it is shown in the history and to the team). */
export function requiresReason(to: EventStatus): boolean {
  return to === "cancelled";
}
