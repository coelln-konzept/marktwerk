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
  const { showToast } = useShell();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      size="sm"
      variant="ghost"
      disabled={pending}
      aria-busy={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await removeAgreement(id);
          if (!result.ok) return showToast({ message: t("errors.generic") });
          showToast({
            message: t("removed"),
            actionLabel: t("undo"),
            onAction: async () => {
              await undoRemoveAgreement(id);
              showToast({ message: t("restored") });
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
