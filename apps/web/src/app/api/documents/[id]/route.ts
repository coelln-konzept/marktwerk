import { isInlineType, safeFileName } from "@marktwerk/core";
import { apiActor, forbiddenResponse, isForbiddenError } from "@/server/api";
import { DocumentInputError, readDocument } from "@/server/services/documents";
import { StorageNotFoundError } from "@/server/storage";

/**
 * Download of one document. PDF, JPEG and PNG open in the browser; everything else (HEIC, XML) is a
 * download. `?download=1` forces a download. Never served as anything but the stored type.
 */
export async function GET(request: Request, { params }: RouteContext<"/api/documents/[id]">) {
  const actor = await apiActor();
  if (actor instanceof Response) return actor;
  const { id } = await params;
  try {
    const { row, bytes } = await readDocument(actor, id);
    const inline =
      isInlineType(row.mimeType) && new URL(request.url).searchParams.get("download") !== "1";
    const name = safeFileName(row.fileName);
    return new Response(Buffer.from(bytes), {
      headers: {
        "Content-Type": row.mimeType,
        "Content-Length": String(bytes.length),
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${encodeURIComponent(name)}"; filename*=UTF-8''${encodeURIComponent(name)}`,
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
        "Cache-Control": "private, max-age=3600, immutable",
      },
    });
  } catch (error) {
    if (isForbiddenError(error)) return forbiddenResponse();
    if (error instanceof DocumentInputError || error instanceof StorageNotFoundError)
      return Response.json({ error: "not_found" }, { status: 404 });
    throw error;
  }
}
