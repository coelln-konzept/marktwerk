"use client";

import { Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import {
  archiveRequirementAction,
  restoreRequirementAction,
} from "@/app/(app)/orte/[id]/genehmigungen/actions";
import { useShell } from "@/components/shell/shell-context";

/** Removes a requirement from the venue; an undo toast brings it back (no confirmation dialog). */
export function RemoveRequirementButton({ id, title }: { id: string; title: string }) {
  const t = useTranslations("requirements");
  const { showToast, showError } = useShell();
  const [pending, startTransition] = useTransition();
  const errorText = (code: string) =>
    t.has(`errors.${code}` as never) ? t(`errors.${code}` as never) : t("errors.generic");

  function remove() {
    startTransition(async () => {
      const result = await archiveRequirementAction(id);
      if (!result.ok) return showError(t("errors.generic"));
      showToast({
        message: t("removed", { title }),
        actionLabel: t("undo"),
        onAction: async () => {
          const undone = await restoreRequirementAction(id);
          if (undone.ok) showToast({ message: t("restored") });
          else showError(errorText(undone.error));
        },
      });
    });
  }

  return (
    <button
      type="button"
      disabled={pending}
      aria-busy={pending}
      onClick={remove}
      aria-label={t("remove", { title })}
      className="inline-grid size-7 cursor-pointer place-items-center rounded-md hover:bg-hover disabled:cursor-not-allowed disabled:opacity-45"
    >
      <Trash2 aria-hidden className="size-4" />
    </button>
  );
}
