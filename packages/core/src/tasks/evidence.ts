/*
 * Evidence a task needs before it can be marked done (template item: requires_note / requires_photo /
 * requires_attachment / check_items). Photos and attachments need document upload, which arrives in
 * M5: until then they are listed as "not yet possible" but do not block completion.
 */

/** Flip to true with document upload (M5): then photo/attachment evidence blocks completion too. */
export const FILE_EVIDENCE_ENFORCED = false;

export type EvidenceInput = {
  requiresNote: boolean;
  requiresPhoto: boolean;
  requiresAttachment: boolean;
  /** Whether a note exists: given with this request, or an earlier comment on the task. */
  hasNote: boolean;
  /** Check items not ticked yet. */
  openCheckItems: number;
  /** Whether a photo / an attachment exists (always false before M5). */
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

/** Required file evidence that cannot be given yet (shown as a hint, not enforced). */
export function pendingFileEvidence(input: EvidenceInput): ("photo" | "attachment")[] {
  if (FILE_EVIDENCE_ENFORCED) return [];
  const pending: ("photo" | "attachment")[] = [];
  if (input.requiresPhoto && !input.hasPhoto) pending.push("photo");
  if (input.requiresAttachment && !input.hasAttachment) pending.push("attachment");
  return pending;
}
