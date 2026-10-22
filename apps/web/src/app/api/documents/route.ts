import { DOCUMENT_MAX_BYTES } from "@marktwerk/core";
import { apiActor, forbiddenResponse, isForbiddenError, isSameOrigin } from "@/server/api";
import { createDocument, DocumentInputError } from "@/server/services/documents";

/** Status per error code; everything else is a plain 400. */
const STATUS: Record<string, number> = {
  too_large: 413,
  unsupported_type: 415,
  not_found: 404,
  link_not_found: 404,
  duplicate: 409,
};

/**
 * Upload of a receipt or other document (multipart form: `file`, `link` as JSON such as
 * `{"installmentId":"…"}`, optional `kind` and `caption`). The size is checked before the body is read
 * (Content-Length) and again on the bytes; the type by magic numbers, not by the file name.
 */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return forbiddenResponse();
  const actor = await apiActor();
  if (actor instanceof Response) return actor;

  const declared = Number(request.headers.get("content-length") ?? 0);
  // The multipart envelope adds a few hundred bytes around the file.
  if (declared > DOCUMENT_MAX_BYTES + 64 * 1024)
    return Response.json({ error: "too_large" }, { status: 413 });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "invalid_form" }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) return Response.json({ error: "empty_file" }, { status: 400 });
  let link: unknown;
  try {
    link = JSON.parse(String(form.get("link") ?? "{}"));
  } catch {
    return Response.json({ error: "invalid_link" }, { status: 400 });
  }
  if (typeof link !== "object" || link === null || Array.isArray(link))
    return Response.json({ error: "invalid_link" }, { status: 400 });

  try {
    const created = await createDocument(actor, {
      fileName: file.name,
      bytes: new Uint8Array(await file.arrayBuffer()),
      link: link as Record<string, unknown>,
      kind: typeof form.get("kind") === "string" ? (form.get("kind") as string) : null,
      caption: typeof form.get("caption") === "string" ? (form.get("caption") as string) : null,
    });
    return Response.json(created, { status: 201 });
  } catch (error) {
    if (isForbiddenError(error)) return forbiddenResponse();
    if (error instanceof DocumentInputError)
      return Response.json({ error: error.code }, { status: STATUS[error.code] ?? 400 });
    throw error;
  }
}
