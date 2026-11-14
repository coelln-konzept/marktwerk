"use server";

import { refresh } from "next/cache";
import { getActor } from "@/server/actor";
import {
  archiveDocument,
  DocumentInputError,
  type DocumentUpdate,
  restoreDocument,
  updateDocument,
} from "@/server/services/documents";
import { requireUser } from "@/server/session";

export type DocumentActionResult =
  | { ok: true; data: { fileName: string } }
  /** `existing`: on `duplicate`, the name of the live file with the same content on the record. */
  | { ok: false; error: string; existing?: string };

/** Removes a document from the lists (soft delete). The service checks the grant of the linked records. */
export async function archiveDocumentAction(id: string): Promise<DocumentActionResult> {
  await requireUser();
  const actor = await getActor();
  try {
    const data = await archiveDocument(actor, id);
    refresh();
    return { ok: true, data };
  } catch (error) {
    if (error instanceof DocumentInputError) return { ok: false, error: error.code };
    throw error;
  }
}

/** Undo toast of `archiveDocumentAction` and "Wiederherstellen" in Archiv › Dokumente › Entfernte. */
export async function restoreDocumentAction(id: string): Promise<DocumentActionResult> {
  await requireUser();
  const actor = await getActor();
  try {
    const data = await restoreDocument(actor, id);
    refresh();
    return { ok: true, data };
  } catch (error) {
    if (error instanceof DocumentInputError)
      return { ok: false, error: error.code, existing: error.existing };
    throw error;
  }
}

/** Rename, description and kind of a document ("Bearbeiten" in the document list). */
export async function updateDocumentAction(
  id: string,
  input: DocumentUpdate,
): Promise<DocumentActionResult> {
  await requireUser();
  const actor = await getActor();
  try {
    const data = await updateDocument(actor, id, input);
    refresh();
    return { ok: true, data };
  } catch (error) {
    if (error instanceof DocumentInputError) return { ok: false, error: error.code };
    throw error;
  }
}
