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
  const { showToast } = useShell();
  const [pending, startTransition] = useTransition();

  function remove() {
    startTransition(async () => {
      const result = await archiveRequirementAction(id);
      if (!result.ok) return showToast({ message: t("errors.generic") });
      showToast({
        message: t("removed", { title }),
        actionLabel: t("undo"),
        onAction: async () => {
          await restoreRequirementAction(id);
          showToast({ message: t("restored") });
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
