import { FileText, Image as ImageIcon } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { formatDate } from "@/lib/format";
import type { DocumentRow } from "@/server/queries/finance";
import { ArchiveDocumentButton } from "./archive-document-button";

const kb = (bytes: number) =>
  bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;

/**
 * Files attached to a record, newest first: opens/downloads through /api/documents/<id>. Removing is a
 * soft delete with an undo toast (the file and the audit trail stay).
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
            {canWrite && <ArchiveDocumentButton id={d.id} fileName={d.fileName} />}
          </li>
        );
      })}
    </ul>
  );
}
