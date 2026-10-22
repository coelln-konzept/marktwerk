import type { HealthLevel } from "../events/health";

export type TaskHealthInput = {
  /** Open tasks of the event (todo, in progress, waiting, blocked). */
  open: number;
  overdue: number;
  blocked: number;
  /** Highest carry-over count among open tasks. */
  maxRollover: number;
};

/** Escalation point of the carry-over rules; kept in sync with `ESCALATION_ROLLOVERS`. */
const CRITICAL_ROLLOVERS = 3;
const CRITICAL_OVERDUE = 5;

/**
 * Task dimension of an event's health (assumption, to be confirmed): Kritisch when something has been
 * carried over 3+ times or 5+ tasks are overdue; Achtung when anything is overdue or blocked;
 * otherwise Im Plan. Null while the event has no open tasks at all.
 */
export function taskHealth(input: TaskHealthInput): HealthLevel | null {
  if (input.open === 0) return null;
  if (input.maxRollover >= CRITICAL_ROLLOVERS || input.overdue >= CRITICAL_OVERDUE)
    return "critical";
  if (input.overdue > 0 || input.blocked > 0) return "warn";
  return "ok";
}
