"use client";

import { Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { archiveExpenseAction, unarchiveExpenseAction } from "@/app/(app)/finanzen/actions";
import { useShell } from "@/components/shell/shell-context";

/** "Entfernen" on an expense row: soft delete with an undo toast. */
export function ArchiveExpenseButton({ id, description }: { id: string; description: string }) {
  const t = useTranslations("finance.expense");
  const { showToast } = useShell();
  const [pending, startTransition] = useTransition();

  function archive() {
    startTransition(async () => {
      const result = await archiveExpenseAction(id);
      if (!result.ok) return showToast({ message: t("failed") });
      showToast({
        message: t("removed", { description: result.data.description }),
        actionLabel: t("undo"),
        onAction: async () => {
          const undone = await unarchiveExpenseAction(id);
          showToast({
            message: undone.ok
              ? t("restored", { description: undone.data.description })
              : t("failed"),
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
      aria-label={t("remove", { description })}
      title={t("remove", { description })}
      onClick={archive}
      className="grid size-7 cursor-pointer place-items-center rounded-md hover:bg-hover disabled:cursor-progress disabled:opacity-60"
    >
      <Trash2 aria-hidden className="size-4" />
    </button>
  );
}
