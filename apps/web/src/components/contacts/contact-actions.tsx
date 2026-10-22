"use client";

import { Archive, Pencil } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { archiveContactAction, unarchiveContactAction } from "@/app/(app)/kontakte/actions";
import { useShell } from "@/components/shell/shell-context";
import { Button } from "@/components/ui/button";

/**
 * "Bearbeiten" and "Archivieren" in the Vorschau of a contact. Archiving has no confirmation dialog:
 * an undo toast brings the contact back (UX concept §6).
 */
export function ContactActions({
  id,
  name,
  closeHref,
  canWrite,
  canArchive,
}: {
  id: string;
  name: string;
  closeHref: string;
  canWrite: boolean;
  canArchive: boolean;
}) {
  const t = useTranslations("contacts");
  const router = useRouter();
  const { showToast } = useShell();
  const [pending, startTransition] = useTransition();

  function archive() {
    startTransition(async () => {
      const result = await archiveContactAction(id);
      if (!result.ok) {
        showToast({ message: t("toast.failed") });
        return;
      }
      router.replace(closeHref as never, { scroll: false });
      showToast({
        message: t("toast.archived", { name: result.data.name }),
        actionLabel: t("toast.undo"),
        onAction: async () => {
          const undone = await unarchiveContactAction(id);
          if (undone.ok) router.replace(`/kontakte?vorschau=${id}` as never, { scroll: false });
          showToast({
            message: undone.ok
              ? t("toast.restored", { name: undone.data.name })
              : t("toast.failed"),
          });
        },
      });
    });
  }

  if (!canWrite && !canArchive) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 border-border-subtle border-t pt-3">
      {canWrite && (
        <Link
          href={`/kontakte/${id}/bearbeiten` as never}
          aria-label={t("editRow", { name })}
          className="inline-flex min-h-8 items-center gap-2 rounded-lg border border-input bg-card px-3 font-medium hover:bg-hover"
        >
          <Pencil aria-hidden className="size-4" />
          {t("edit")}
        </Link>
      )}
      {canArchive && (
        <Button disabled={pending} aria-busy={pending} onClick={archive}>
          <Archive aria-hidden />
          {t("archive")}
        </Button>
      )}
    </div>
  );
}
