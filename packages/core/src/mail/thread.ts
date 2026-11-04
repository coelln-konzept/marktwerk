/**
 * Shared-inbox workflow rules (research 03 §C, spec 2026-11-04 Postfach). Pure functions, no I/O.
 */
export type ConversationStatus = "offen" | "wartet" | "erledigt";

export type StatusEvent =
  | { kind: "send" }
  | { kind: "sendAndClose" }
  | { kind: "incoming" }
  | { kind: "manual"; status: ConversationStatus };

const PREFIX = /^\s*(?:(?:aw|wg|re|fwd?|antw)\s*:\s*)+/i;

/** Subject without reply/forward prefixes, lower-cased, single spaces. */
export function normalizeSubject(subject: string): string {
  return subject.replace(PREFIX, "").replace(/\s+/g, " ").trim().toLowerCase();
}

/** Prototype threading: same normalised subject + same external address (Graph's conversationId later). */
export function threadKey(subject: string, address: string): string {
  return `${normalizeSubject(subject)}|${address.trim().toLowerCase()}`;
}

/** Reply → waiting for the other side; an incoming mail always reopens. */
export function nextStatus(_current: ConversationStatus, event: StatusEvent): ConversationStatus {
  switch (event.kind) {
    case "send":
      return "wartet";
    case "sendAndClose":
      return "erledigt";
    case "incoming":
      return "offen";
    case "manual":
      return event.status;
  }
}

/** Whoever answers an unassigned conversation takes it. */
export function autoAssign(current: string | null, senderId: string): string {
  return current ?? senderId;
}
