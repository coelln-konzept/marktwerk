"use client";

import { Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { removeAgreement, undoRemoveAgreement } from "@/app/(app)/orte/[id]/vereinbarungen/actions";
import { useShell } from "@/components/shell/shell-context";
import { Button } from "@/components/ui/button";

/** "Entfernen": archives the agreement; the undo toast restores it (no confirmation dialog). */
export function RemoveAgreementButton({ id }: { id: string }) {
  const t = useTranslations("agreements");
  const { showToast, showError } = useShell();
  const [pending, startTransition] = useTransition();
  const errorText = (code: string) =>
    t.has(`errors.${code}` as never) ? t(`errors.${code}` as never) : t("errors.generic");
  return (
    <Button
      size="sm"
      variant="ghost"
      disabled={pending}
      aria-busy={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await removeAgreement(id);
          if (!result.ok) return showError(t("errors.generic"));
          showToast({
            message: t("removed"),
            actionLabel: t("undo"),
            onAction: async () => {
              const undone = await undoRemoveAgreement(id);
              if (undone.ok) showToast({ message: t("restored") });
              else showError(errorText(undone.error));
            },
          });
        })
      }
    >
      <Trash2 aria-hidden />
      {t("remove")}
    </Button>
  );
}
