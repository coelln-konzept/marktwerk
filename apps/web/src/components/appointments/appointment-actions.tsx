"use client";

import { Archive, Pencil } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { archiveAppointmentAction, restoreAppointmentAction } from "@/app/(app)/termin-actions";
import { useShell } from "@/components/shell/shell-context";
import { Button } from "@/components/ui/button";
import { guardedCall } from "./guarded-call";

/**
 * "Bearbeiten" and "Archivieren" in the Vorschau of a Termin. Archiving has no confirmation dialog: an undo
 * toast brings the Termin back and reopens its Vorschau (UX concept §6).
 */
export function AppointmentActions({
  id,
  title,
  editHref,
  closeHref,
  reopenHref,
}: {
  id: string;
  title: string;
  editHref: string;
  closeHref: string;
  reopenHref: string;
}) {
  const t = useTranslations("appointments.vorschau");
  const tToast = useTranslations("appointments.toast");
  const router = useRouter();
  const { showToast } = useShell();
  const [pending, startTransition] = useTransition();

  function archive() {
    startTransition(async () => {
      const result = await guardedCall(() => archiveAppointmentAction(id));
      if (!result.ok) {
        showToast({ message: t("failed"), tone: "error" });
        return;
      }
      router.replace(closeHref as never, { scroll: false });
      showToast({
        message: t("archived"),
        actionLabel: tToast("undo"),
        onAction: async () => {
          const undone = await guardedCall(() => restoreAppointmentAction(id));
          if (undone.ok) router.replace(reopenHref as never, { scroll: false });
          showToast(
            undone.ok ? { message: t("restored") } : { message: t("failed"), tone: "error" },
          );
        },
      });
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2 border-border-subtle border-t pt-3">
      <Link
        href={editHref as never}
        scroll={false}
        aria-label={`${t("edit")}: ${title}`}
        className="inline-flex min-h-8 items-center gap-2 rounded-lg border border-input bg-card px-3 font-medium hover:bg-hover"
      >
        <Pencil aria-hidden className="size-4" />
        {t("edit")}
      </Link>
      <Button disabled={pending} aria-busy={pending} onClick={archive}>
        <Archive aria-hidden />
        {t("archive")}
      </Button>
    </div>
  );
}
