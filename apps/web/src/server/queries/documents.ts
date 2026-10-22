import "server-only";
import { type Action, can, type Resource } from "@marktwerk/core";
import { document, staffMember } from "@marktwerk/db/schema";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import type { Actor } from "../actor";
import { db } from "../db";
import { DOCUMENT_LINKS, type DocumentLinkKey } from "../services/documents";
import type { DocumentRow } from "./finance";

export type { DocumentRow };

/** Whether the actor may read documents that hang on this kind of record (same rule as the download). */
export function canReadDocuments(actor: Actor, key: DocumentLinkKey): boolean {
  const rule = DOCUMENT_LINKS[key];
  return can(actor.role, rule.resource as Resource, rule.read as Action<Resource>);
}

/** Whether the actor may attach or remove documents on this kind of record. */
export function canWriteDocuments(actor: Actor, key: DocumentLinkKey): boolean {
  const rule = DOCUMENT_LINKS[key];
  return can(actor.role, rule.resource as Resource, rule.write as Action<Resource>);
}

/**
 * Live documents per record for one link column (a task, a permit, an event, a vehicle issue …), newest
 * first. Returns an empty map for roles that may not read that kind of record. Callers have already
 * checked that the actor can see the records themselves (row scope).
 */
export async function listLinkedDocuments(
  actor: Actor,
  key: DocumentLinkKey,
  ids: string[],
): Promise<Map<string, DocumentRow[]>> {
  const result = new Map<string, DocumentRow[]>();
  if (ids.length === 0 || !canReadDocuments(actor, key)) return result;
  const column = document[key];
  const rows = await db
    .select({
      id: document.id,
      kind: document.kind,
      fileName: document.fileName,
      mimeType: document.mimeType,
      sizeBytes: document.sizeBytes,
      caption: document.caption,
      createdAt: document.createdAt,
      uploadedByName: staffMember.displayName,
      installmentId: document.installmentId,
      payableId: document.payableId,
      expenseId: document.expenseId,
      linkId: column,
    })
    .from(document)
    .leftJoin(staffMember, eq(staffMember.id, document.uploadedByStaffMemberId))
    .where(and(isNull(document.archivedAt), inArray(column, ids)))
    .orderBy(desc(document.createdAt));
  for (const { linkId, ...r } of rows) {
    if (!linkId) continue;
    const list = result.get(linkId) ?? [];
    list.push({ ...r, createdAt: r.createdAt.toISOString() });
    result.set(linkId, list);
  }
  return result;
}
