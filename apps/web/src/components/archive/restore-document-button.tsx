"use client";

import { RotateCcw } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { archiveDocumentAction, restoreDocumentAction } from "@/components/documents/actions";
import { useShell } from "@/components/shell/shell-context";
import { Button } from "@/components/ui/button";

/**
 * "Wiederherstellen" in Archiv › Dokumente › Entfernte: the document hangs on its record again. The toast
 * offers "Rückgängig" (removes it again), like every other change.
 */
export function RestoreDocumentButton({ id, fileName }: { id: string; fileName: string }) {
  const t = useTranslations("documents");
  const tArchive = useTranslations("archive.documents");
  const { showToast, showError } = useShell();
  const [pending, startTransition] = useTransition();

  function restore() {
    startTransition(async () => {
      const result = await restoreDocumentAction(id);
      if (!result.ok) {
        showError(t("toast.failed"));
        return;
      }
      showToast({
        message: t("toast.restored", { name: result.data.fileName }),
        actionLabel: t("toast.undo"),
        onAction: async () => {
          const undone = await archiveDocumentAction(id);
          if (undone.ok) showToast({ message: t("toast.removed", { name: undone.data.fileName }) });
          else showError(t("toast.failed"));
        },
      });
    });
  }

  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      aria-busy={pending}
      aria-label={tArchive("restoreFor", { name: fileName })}
      onClick={restore}
      className="touch:min-h-11"
    >
      <RotateCcw aria-hidden />
      {tArchive("restore")}
    </Button>
  );
}
