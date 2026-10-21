import "server-only";
import { randomUUID } from "node:crypto";
import {
  type Action,
  can,
  DOCUMENT_MAX_BYTES,
  type DocumentFileType,
  type Resource,
  safeFileName,
  sniffDocumentType,
} from "@marktwerk/core";
import { document, documentKind } from "@marktwerk/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { forbidden } from "next/navigation";
import type { Actor } from "../actor";
import { db } from "../db";
import { getStorage, sha256Hex, storageKeyFor } from "../storage";
import { audit } from "./audit";

export const DOCUMENT_KINDS = documentKind.enumValues;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

/**
 * The records a document can hang on (columns of `document`) and the permission that governs them.
 * Writing needs the write grant of the record's module, reading its read grant; a document on several
 * records needs the grant for every one of them. Other modules just pick their link column.
 */
export const DOCUMENT_LINKS = {
  payableId: { resource: "finance", read: "read", write: "write" },
  installmentId: { resource: "finance", read: "read", write: "write" },
  expenseId: { resource: "finance", read: "read", write: "write" },
  permitId: { resource: "permit", read: "read", write: "write" },
  eventId: { resource: "event", read: "read", write: "write" },
  venueId: { resource: "venue", read: "read", write: "write" },
  locationAgreementId: { resource: "venue", read: "read", write: "write" },
  vehicleId: { resource: "company", read: "read", write: "write" },
  vehicleIssueId: { resource: "company", read: "read", write: "write" },
  obligationCompletionId: { resource: "company", read: "read", write: "write" },
  taskId: { resource: "task", read: "read", write: "write" },
  employmentContractId: { resource: "team", read: "read", write: "manage" },
  payrollPeriodId: { resource: "team", read: "read", write: "manage" },
} as const satisfies Record<string, { resource: Resource; read: string; write: string }>;

export type DocumentLinkKey = keyof typeof DOCUMENT_LINKS;
export const DOCUMENT_LINK_KEYS = Object.keys(DOCUMENT_LINKS) as DocumentLinkKey[];
export type DocumentLink = Partial<Record<DocumentLinkKey, string>>;

export type DocumentError =
  | "not_found"
  | "no_link"
  | "invalid_link"
  | "link_not_found"
  | "empty_file"
  | "too_large"
  | "unsupported_type"
  | "invalid_kind"
  | "duplicate"
  | "too_long";

export class DocumentInputError extends Error {
  constructor(readonly code: DocumentError) {
    super(code);
  }
}

const UUID = /^[0-9a-f-]{36}$/i;

/** Keeps only the known link columns with a valid id; throws when there is none or one is malformed. */
export function parseDocumentLink(link: Record<string, unknown>): DocumentLink {
  const clean: DocumentLink = {};
  for (const key of DOCUMENT_LINK_KEYS) {
    const value = link[key];
    if (value === undefined || value === null || value === "") continue;
    if (typeof value !== "string" || !UUID.test(value))
      throw new DocumentInputError("invalid_link");
    clean[key] = value;
  }
  if (Object.keys(clean).length === 0) throw new DocumentInputError("no_link");
  return clean;
}

function mayAccess(actor: Actor, link: DocumentLink, mode: "read" | "write"): boolean {
  return (Object.keys(link) as DocumentLinkKey[]).every((key) => {
    const rule = DOCUMENT_LINKS[key];
    return can(actor.role, rule.resource as Resource, rule[mode] as Action<Resource>);
  });
}

/** The receipt kinds that count as "has a receipt" for payments (Beleg fehlt). */
export const RECEIPT_KINDS = [
  "receipt",
  "invoice",
  "e_invoice_xml",
] as const satisfies readonly DocumentKind[];

const defaultKind = (link: DocumentLink): DocumentKind =>
  link.installmentId || link.expenseId ? "receipt" : link.payableId ? "invoice" : "other";

type DocumentRow = typeof document.$inferSelect;

function linkOf(row: DocumentRow): DocumentLink {
  const link: DocumentLink = {};
  for (const key of DOCUMENT_LINK_KEYS) {
    const value = row[key];
    if (value) link[key] = value;
  }
  return link;
}

const isForeignKeyViolation = (error: unknown) => {
  const code = (error as { code?: string; cause?: { code?: string } }) ?? {};
  return code.code === "23503" || code.cause?.code === "23503";
};

export type UploadInput = {
  fileName: string;
  bytes: Uint8Array;
  link: Record<string, unknown>;
  kind?: string | null;
  caption?: string | null;
};

/**
 * Stores a file and creates its `document` row. The bytes are checked (size, magic numbers: PDF, JPEG,
 * PNG, HEIC; XML only as `e_invoice_xml`), hashed and written to the storage driver as they are; they
 * never change afterwards. Audited as `document.upload`. Needs the write grant of every linked record.
 */
export async function createDocument(
  actor: Actor,
  input: UploadInput,
): Promise<{ id: string; fileName: string; kind: DocumentKind; mime: string }> {
  const link = parseDocumentLink(input.link);
  if (!mayAccess(actor, link, "write")) forbidden();
  if (input.bytes.length === 0) throw new DocumentInputError("empty_file");
  if (input.bytes.length > DOCUMENT_MAX_BYTES) throw new DocumentInputError("too_large");
  const type: DocumentFileType | null = sniffDocumentType(input.bytes);
  if (!type) throw new DocumentInputError("unsupported_type");
  const kind = (input.kind ?? "").trim() === "" ? defaultKind(link) : (input.kind as string);
  if (!(DOCUMENT_KINDS as readonly string[]).includes(kind))
    throw new DocumentInputError("invalid_kind");
  // Only an e-invoice may be XML, and an e-invoice can't be a photo.
  if (type.ext === "xml" && kind !== "e_invoice_xml")
    throw new DocumentInputError("unsupported_type");
  const caption = (input.caption ?? "").trim() === "" ? null : (input.caption as string).trim();
  if (caption !== null && caption.length > 500) throw new DocumentInputError("too_long");

  const fileName = safeFileName(input.fileName, `beleg.${type.ext}`);
  const sha256 = sha256Hex(input.bytes);
  const id = randomUUID();
  const storageKey = storageKeyFor(sha256, id, type.ext);

  // Same file on the same record twice (double tap, retry): refuse instead of storing a copy.
  const sameLink = Object.entries(link).map(([key, value]) =>
    eq(document[key as DocumentLinkKey], value as string),
  );
  const [duplicate] = await db
    .select({ id: document.id })
    .from(document)
    .where(and(eq(document.sha256, sha256), isNull(document.archivedAt), ...sameLink));
  if (duplicate) throw new DocumentInputError("duplicate");

  await getStorage().put(storageKey, input.bytes);
  try {
    await db.transaction(async (tx) => {
      await tx.insert(document).values({
        id,
        kind: kind as DocumentKind,
        fileName,
        mimeType: type.mime,
        sizeBytes: input.bytes.length,
        sha256,
        storageKey,
        caption,
        uploadedByStaffMemberId: actor.staffMemberId,
        ...link,
      });
      await audit(tx, actor.id, [
        {
          action: "document.upload",
          entityType: "document",
          entityId: id,
          diff: { fileName, kind, mime: type.mime, sizeBytes: input.bytes.length, sha256, link },
        },
      ]);
    });
  } catch (error) {
    // The stored file stays behind unreferenced; keys carry the document id, so it is never reused.
    if (isForeignKeyViolation(error)) throw new DocumentInputError("link_not_found");
    throw error;
  }
  return { id, fileName, kind: kind as DocumentKind, mime: type.mime };
}

/** A document the actor may read, with its bytes. Archived documents count as not found. */
export async function readDocument(
  actor: Actor,
  id: string,
): Promise<{ row: DocumentRow; bytes: Uint8Array }> {
  if (!UUID.test(id)) throw new DocumentInputError("not_found");
  const [row] = await db
    .select()
    .from(document)
    .where(and(eq(document.id, id), isNull(document.archivedAt)));
  if (!row) throw new DocumentInputError("not_found");
  if (!mayAccess(actor, linkOf(row), "read")) forbidden();
  return { row, bytes: await getStorage().get(row.storageKey) };
}

/**
 * Takes a document off the lists (soft delete: the file and the row stay, with who and why). Audited as
 * `document.archive`; `restoreDocument` is the undo.
 */
export async function archiveDocument(
  actor: Actor,
  id: string,
  reason?: string | null,
): Promise<{ fileName: string }> {
  if (!UUID.test(id)) throw new DocumentInputError("not_found");
  const why = (reason ?? "").trim() === "" ? null : (reason as string).trim();
  if (why !== null && why.length > 500) throw new DocumentInputError("too_long");
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(document)
      .where(and(eq(document.id, id), isNull(document.archivedAt)))
      .for("update");
    if (!row) throw new DocumentInputError("not_found");
    if (!mayAccess(actor, linkOf(row), "write")) forbidden();
    await tx
      .update(document)
      .set({
        archivedAt: new Date(),
        archivedByStaffMemberId: actor.staffMemberId,
        archiveReason: why,
      })
      .where(eq(document.id, id));
    await audit(tx, actor.id, [
      {
        action: "document.archive",
        entityType: "document",
        entityId: id,
        diff: { fileName: row.fileName, sha256: row.sha256, reason: why },
      },
    ]);
    return { fileName: row.fileName };
  });
}

/** Undo of `archiveDocument`. */
export async function restoreDocument(actor: Actor, id: string): Promise<{ fileName: string }> {
  if (!UUID.test(id)) throw new DocumentInputError("not_found");
  return db.transaction(async (tx) => {
    const [row] = await tx.select().from(document).where(eq(document.id, id)).for("update");
    if (!row?.archivedAt) throw new DocumentInputError("not_found");
    if (!mayAccess(actor, linkOf(row), "write")) forbidden();
    await tx
      .update(document)
      .set({ archivedAt: null, archivedByStaffMemberId: null, archiveReason: null })
      .where(eq(document.id, id));
    await audit(tx, actor.id, [
      {
        action: "document.restore",
        entityType: "document",
        entityId: id,
        diff: { fileName: row.fileName },
      },
    ]);
    return { fileName: row.fileName };
  });
}
