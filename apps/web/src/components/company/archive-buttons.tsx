"use client";

import { Archive } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import {
  archiveObligationAction,
  archiveVehicleAction,
  restoreObligationAction,
  restoreVehicleAction,
} from "@/app/(app)/firma/actions";
import { useShell } from "@/components/shell/shell-context";
import { Button } from "@/components/ui/button";
import { useErrorText } from "./shared";

/**
 * "Archivieren" of an obligation: it leaves the lists and the reminders at once; the history stays.
 * An undo toast instead of a question (UX concept §6).
 */
export function ArchiveObligationButton({ id, title }: { id: string; title: string }) {
  const t = useTranslations("company");
  const router = useRouter();
  const { showToast } = useShell();
  const errorText = useErrorText();
  const [pending, startTransition] = useTransition();

  function archive() {
    startTransition(async () => {
      const result = await archiveObligationAction(id);
      if (!result.ok) {
        showToast({ message: errorText(result.error) });
        return;
      }
      router.push("/firma/pflichten" as never);
      showToast({
        message: t("obligation.archiveToast", { title: result.data.title }),
        actionLabel: t("undo"),
        onAction: async () => {
          const undone = await restoreObligationAction(id);
          showToast({
            message: undone.ok
              ? t("obligation.restored", { title: undone.data.title })
              : errorText(undone.error),
          });
        },
      });
    });
  }

  return (
    <Button
      aria-label={`${t("obligation.archive")}: ${title}`}
      disabled={pending}
      onClick={archive}
    >
      <Archive aria-hidden />
      {t("obligation.archive")}
    </Button>
  );
}

/** "Archivieren" of a vehicle (sold or scrapped): the vehicle and its obligations leave lists and reminders. */
export function ArchiveVehicleButton({ id, name }: { id: string; name: string }) {
  const t = useTranslations("company");
  const router = useRouter();
  const { showToast } = useShell();
  const errorText = useErrorText();
  const [pending, startTransition] = useTransition();

  function archive() {
    startTransition(async () => {
      const result = await archiveVehicleAction(id);
      if (!result.ok) {
        showToast({ message: errorText(result.error) });
        return;
      }
      router.push("/firma/fahrzeuge" as never);
      showToast({
        message: t("vehicle.archiveToast", { name: result.data.name }),
        actionLabel: t("undo"),
        onAction: async () => {
          const undone = await restoreVehicleAction(id);
          showToast({
            message: undone.ok
              ? t("vehicle.restored", { name: undone.data.name })
              : errorText(undone.error),
          });
        },
      });
    });
  }

  return (
    <Button aria-label={`${t("vehicle.archive")}: ${name}`} disabled={pending} onClick={archive}>
      <Archive aria-hidden />
      {t("vehicle.archive")}
    </Button>
  );
}
