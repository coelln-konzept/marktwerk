/*
 * Evidence a task needs before it can be marked done (template item: requires_note / requires_photo /
 * requires_attachment / check_items). Photos and attachments are documents linked to the task
 * (`document.task_id`): a live document of kind "photo" is the photo, a live document of any other kind
 * is the attachment. Since the document upload exists they block completion like the note does.
 */

/** Photo/attachment evidence blocks completion (switched on with the document upload, M5/integration). */
export const FILE_EVIDENCE_ENFORCED = true;

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
  requiresNote: boolean;
  requiresPhoto: boolean;
  requiresAttachment: boolean;
  /** Whether a note exists: given with this request, or an earlier comment on the task. */
  hasNote: boolean;
  /** Check items not ticked yet. */
  openCheckItems: number;
  /** Whether a photo / an attachment exists (see {@link fileEvidenceOf}). */
  hasPhoto?: boolean;
  hasAttachment?: boolean;
};

export type EvidenceKind = "note" | "check_items" | "photo" | "attachment";

/** What still blocks completion, in the order the UI shows it. */
export function missingEvidence(input: EvidenceInput): EvidenceKind[] {
  const missing: EvidenceKind[] = [];
  if (input.requiresNote && !input.hasNote) missing.push("note");
  if (input.openCheckItems > 0) missing.push("check_items");
  if (FILE_EVIDENCE_ENFORCED) {
    if (input.requiresPhoto && !input.hasPhoto) missing.push("photo");
    if (input.requiresAttachment && !input.hasAttachment) missing.push("attachment");
  }
  return missing;
}

/** Required file evidence that cannot be given yet (only while {@link FILE_EVIDENCE_ENFORCED} is off). */
export function pendingFileEvidence(input: EvidenceInput): ("photo" | "attachment")[] {
  if (FILE_EVIDENCE_ENFORCED) return [];
  const pending: ("photo" | "attachment")[] = [];
  if (input.requiresPhoto && !input.hasPhoto) pending.push("photo");
  if (input.requiresAttachment && !input.hasAttachment) pending.push("attachment");
  return pending;
}
