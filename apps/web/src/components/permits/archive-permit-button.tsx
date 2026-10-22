"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { archivePermitAction, restorePermitAction } from "@/app/(app)/logbuch/actions";
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
  const { showToast } = useShell();
  const [pending, startTransition] = useTransition();

  function archive() {
    startTransition(async () => {
      const result = await archivePermitAction(permitId);
      if (!result.ok) return showToast({ message: t("errors.generic") });
      router.replace(closeHref as never, { scroll: false });
      showToast({
        message: t("archived", { title }),
        actionLabel: t("undoArchive"),
        onAction: async () => {
          await restorePermitAction(permitId);
          showToast({ message: t("restored") });
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
