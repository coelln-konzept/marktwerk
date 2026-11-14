import { FileText, Image as ImageIcon } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { formatDate } from "@/lib/format";
import type { DocumentRow } from "@/server/queries/finance";
import { ArchiveDocumentButton } from "./archive-document-button";
import { EditDocumentButton } from "./edit-document-button";

/** "240 KB" / "1.2 MB" (also the Archiv's document list). */
export const kb = (bytes: number) =>
  bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;

/**
 * Files attached to a record, newest first: opens/downloads through /api/documents/<id>, with its
 * description below. "Bearbeiten" renames it, sets the description and the kind; removing is a soft delete
 * with an undo toast (the file and the audit trail stay; Archiv › Dokumente › Entfernte brings it back).
 */
export async function DocumentList({
  documents,
  canWrite,
  compact = false,
}: {
  documents: DocumentRow[];
  canWrite: boolean;
  compact?: boolean;
}) {
  const t = await getTranslations("documents");
  const locale = await getLocale();
  if (documents.length === 0) return null;
  return (
    <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
      {documents.map((d) => {
        const Icon = d.mimeType.startsWith("image/") ? ImageIcon : FileText;
        return (
          <li key={d.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-small">
            <Icon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
            <a
              href={`/api/documents/${d.id}`}
              target="_blank"
              rel="noreferrer"
              className="max-w-64 truncate font-medium text-accent-soft-foreground hover:underline"
              title={d.fileName}
            >
              {d.fileName}
            </a>
            {!compact && (
              <span className="text-muted-foreground text-tiny">
                {t(`kinds.${d.kind}` as never)} · {kb(d.sizeBytes)} ·{" "}
                {formatDate(d.createdAt.slice(0, 10), locale)}
                {d.uploadedByName ? ` · ${d.uploadedByName}` : ""}
              </span>
            )}
            {canWrite && (
              <span className="inline-flex items-center gap-0.5">
                <EditDocumentButton
                  id={d.id}
                  fileName={d.fileName}
                  caption={d.caption}
                  kind={d.kind}
                />
                <ArchiveDocumentButton id={d.id} fileName={d.fileName} />
              </span>
            )}
            {!compact && d.caption && (
              <p className="m-0 basis-full pl-6 text-muted-foreground text-small">{d.caption}</p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
