"use client";

import { Archive } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { archiveVenueAction, restoreVenueAction } from "@/app/(app)/orte/actions";
import { useShell } from "@/components/shell/shell-context";
import { Button } from "@/components/ui/button";
import { useErrorText } from "./shared";

/**
 * "Archivieren": the venue leaves lists and pickers at once; events there keep it. An undo toast
 * instead of a question (UX concept §6).
 */
export function ArchiveVenueButton({ id, name }: { id: string; name: string }) {
  const t = useTranslations("venues.manage");
  const router = useRouter();
  const { showToast } = useShell();
  const errorText = useErrorText();
  const [pending, startTransition] = useTransition();

  function archive() {
    startTransition(async () => {
      const result = await archiveVenueAction(id);
      if (!result.ok) {
        showToast({ message: errorText(result.error) });
        return;
      }
      router.push("/orte" as never);
      showToast({
        message: t("archive.toast", { name: result.data.name }),
        actionLabel: t("undo"),
        onAction: async () => {
          const undone = await restoreVenueAction(id);
          showToast({
            message: undone.ok
              ? t("archive.restored", { name: undone.data.name })
              : errorText(undone.error),
          });
        },
      });
    });
  }

  return (
    <Button aria-label={`${t("archive.button")}: ${name}`} disabled={pending} onClick={archive}>
      <Archive aria-hidden />
      {t("archive.button")}
    </Button>
  );
}
