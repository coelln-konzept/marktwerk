"use server";

import { refresh } from "next/cache";
import { getActor } from "@/server/actor";
import { archiveDocument, DocumentInputError, restoreDocument } from "@/server/services/documents";
import { requireUser } from "@/server/session";

export type DocumentActionResult =
  | { ok: true; data: { fileName: string } }
  | { ok: false; error: string };

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

/** Undo toast of `archiveDocumentAction`. */
export async function restoreDocumentAction(id: string): Promise<DocumentActionResult> {
  await requireUser();
  const actor = await getActor();
  try {
    const data = await restoreDocument(actor, id);
    refresh();
    return { ok: true, data };
  } catch (error) {
    if (error instanceof DocumentInputError) return { ok: false, error: error.code };
    throw error;
  }
}
