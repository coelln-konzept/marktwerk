/*
 * What a task needs before it can be marked done: its open subtasks finished (ADR 0021) and the evidence the
 * template item asks for (requires_photo / requires_attachment). A note never blocks completion (client decision 2026-10-22): `requires_note` stays on the
 * template item as a hint, and completing offers an optional note instead. Photos and attachments are documents linked to the task
 * (`document.task_id`): a live document of kind "photo" is the photo, a live document of any other kind
 * is the attachment. They block completion.
 */

/** What the live documents on a task prove: a "photo" document is the photo, any other kind the attachment. */
export function fileEvidenceOf(kinds: readonly string[]): {
  hasPhoto: boolean;
  hasAttachment: boolean;
} {
  return {
    hasPhoto: kinds.includes("photo"),
    hasAttachment: kinds.some((kind) => kind !== "photo"),
  };
}

export type EvidenceInput = {
  requiresPhoto: boolean;
  requiresAttachment: boolean;
  /** Subtasks still open (todo, in progress, waiting, blocked): the parent can't be done before them. */
  openSubtasks: number;
  /** Whether a photo / an attachment exists (see {@link fileEvidenceOf}). */
  hasPhoto?: boolean;
  hasAttachment?: boolean;
};

export type EvidenceKind = "subtasks" | "photo" | "attachment";

/** What still blocks completion, in the order the UI shows it. */
export function missingEvidence(input: EvidenceInput): EvidenceKind[] {
  const missing: EvidenceKind[] = [];
  if (input.openSubtasks > 0) missing.push("subtasks");
  if (input.requiresPhoto && !input.hasPhoto) missing.push("photo");
  if (input.requiresAttachment && !input.hasAttachment) missing.push("attachment");
  return missing;
}
