"use client";

import { Archive, Pencil } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import {
  archiveAppointmentAction,
  restoreAppointmentAction,
} from "@/app/(app)/appointment-actions";
import { useShell } from "@/components/shell/shell-context";
import { Button } from "@/components/ui/button";
import { guardedCall } from "./guarded-call";

/**
 * "Bearbeiten" and "Archivieren" in the Vorschau of a Besprechung. Archiving has no confirmation dialog: an undo
 * toast brings the Besprechung back and reopens its Vorschau (UX concept §6).
 */
export function AppointmentActions({
  canEdit,
  canArchive,
  id,
  title,
  editHref,
  closeHref,
  reopenHref,
}: {
  /** `appointment:write` shows Bearbeiten, `appointment:delete` shows Archivieren. */
  canEdit: boolean;
  canArchive: boolean;
  id: string;
  title: string;
  editHref: string;
  closeHref: string;
  reopenHref: string;
}) {
  const t = useTranslations("appointments.vorschau");
  const tToast = useTranslations("appointments.toast");
  const router = useRouter();
  const { showToast, showError } = useShell();
  const [pending, startTransition] = useTransition();

  function archive() {
    startTransition(async () => {
      const result = await guardedCall(() => archiveAppointmentAction(id));
      if (!result.ok) {
        showError(t("failed"));
        return;
      }
      router.replace(closeHref as never, { scroll: false });
      showToast({
        message: t("archived", { title }),
        actionLabel: tToast("undo"),
        onAction: async () => {
          const undone = await guardedCall(() => restoreAppointmentAction(id));
          if (undone.ok) router.replace(reopenHref as never, { scroll: false });
          if (undone.ok) showToast({ message: t("restored", { title }) });
          else showError(t("failed"));
        },
      });
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2 border-border-subtle border-t pt-3">
      {canEdit && (
        <Link
          href={editHref as never}
          scroll={false}
          aria-label={`${t("edit")}: ${title}`}
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
