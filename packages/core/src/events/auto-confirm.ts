import { type EventPermitInput, isHeld, permitDisplayState } from "../permits/status";
import type { EventStatus } from "./lifecycle";

/**
 * Auto-confirmation (client decision 2026-10-22): a planned event becomes "bestätigt" on its own once
 * every required permit is granted. Pure; the server evaluates it after each permit change.
 *
 * - Only `planned` events qualify (draft, cancelled and later states are never touched).
 * - At least one required permit must exist: an event without any stays planned, a person confirms it.
 * - A permit counts as granted while it is held (granted, also "expiring"), is not expired and, if it
 *   has an end date, still reaches the first event day. `not_required` permits are ignored.
 * - There is deliberately no counterpart that moves an event back: a permit that is withdrawn or
 *   rejected later leaves the event confirmed; its health shows the missing permit.
 */
export function shouldAutoConfirm(
  event: { status: EventStatus; startsOn: string },
  permits: readonly EventPermitInput[],
  today: string,
): boolean {
  if (event.status !== "planned") return false;
  const required = permits.filter((p) => p.required && p.status !== "not_required");
  if (required.length === 0) return false;
  return required.every((p) => {
    if (!isHeld(permitDisplayState(p, today))) return false;
    return p.validUntil === null || p.validUntil >= event.startsOn;
  });
}
