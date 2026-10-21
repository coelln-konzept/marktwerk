"use client";

import { Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { useShell } from "@/components/shell/shell-context";
import { archiveDocumentAction, restoreDocumentAction } from "./actions";

/** "Entfernen" next to a document: soft delete with an undo toast instead of a confirmation. */
export function ArchiveDocumentButton({ id, fileName }: { id: string; fileName: string }) {
  const t = useTranslations("documents");
  const { showToast } = useShell();
  const [pending, startTransition] = useTransition();

  function archive() {
    startTransition(async () => {
      const result = await archiveDocumentAction(id);
      if (!result.ok) {
        showToast({ message: t("toast.failed") });
        return;
      }
      showToast({
        message: t("toast.removed", { name: result.data.fileName }),
        actionLabel: t("toast.undo"),
        onAction: async () => {
          const undone = await restoreDocumentAction(id);
          showToast({
            message: undone.ok
              ? t("toast.restored", { name: undone.data.fileName })
              : t("toast.failed"),
          });
        },
      });
    });
  }

  return (
    <button
      type="button"
      disabled={pending}
      aria-busy={pending}
      aria-label={t("remove", { name: fileName })}
      title={t("remove", { name: fileName })}
      onClick={archive}
      className="grid size-6 cursor-pointer place-items-center rounded-md text-muted-foreground hover:bg-hover hover:text-foreground disabled:cursor-progress disabled:opacity-60"
    >
      <Trash2 aria-hidden className="size-3.5" />
    </button>
  );
}
