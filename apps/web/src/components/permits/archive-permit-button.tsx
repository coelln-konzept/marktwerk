"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { archivePermitAction, restorePermitAction } from "@/app/(app)/genehmigungen/actions";
import { useShell } from "@/components/shell/shell-context";
import { Button } from "@/components/ui/button";

/** "Aus dem Logbuch entfernen": soft delete with an undo toast, then the drawer closes. */
export function ArchivePermitButton({
  permitId,
  title,
  closeHref,
}: {
  permitId: string;
  title: string;
  closeHref: string;
}) {
  const t = useTranslations("permitDrawer");
  const router = useRouter();
  const { showToast, showError } = useShell();
  const [pending, startTransition] = useTransition();
  const errorText = (code: string) =>
    t.has(`errors.${code}` as never) ? t(`errors.${code}` as never) : t("errors.generic");

  function archive() {
    startTransition(async () => {
      const result = await archivePermitAction(permitId);
      if (!result.ok) return showError(t("errors.generic"));
      router.replace(closeHref as never, { scroll: false });
      showToast({
        message: t("archived", { title }),
        actionLabel: t("undoArchive"),
        onAction: async () => {
          const undone = await restorePermitAction(permitId);
          if (undone.ok) showToast({ message: t("restored") });
          else showError(errorText(undone.error));
        },
      });
    });
  }

  return (
    <Button size="sm" variant="ghost" disabled={pending} aria-busy={pending} onClick={archive}>
      <Trash2 aria-hidden />
      {t("archive")}
    </Button>
  );
}
