"use client";

import { Archive, ArchiveRestore } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useTransition } from "react";
import {
  archiveObligationAction,
  archiveVehicleAction,
  restoreObligationAction,
  restoreVehicleAction,
} from "@/app/(app)/firma/actions";
import { useShell } from "@/components/shell/shell-context";
import { Button, buttonVariants } from "@/components/ui/button";
import { formatDate } from "@/lib/format";
import { useErrorText } from "./shared";

/**
 * "Archivieren" of an obligation: it leaves the lists and the reminders at once; the history stays.
 * An undo toast instead of a question (UX concept §6).
 */
export function ArchiveObligationButton({ id, title }: { id: string; title: string }) {
  const t = useTranslations("company");
  const router = useRouter();
  const { showToast, showError } = useShell();
  const errorText = useErrorText();
  const [pending, startTransition] = useTransition();

  function archive() {
    startTransition(async () => {
      const result = await archiveObligationAction(id);
      if (!result.ok) {
        showError(errorText(result.error));
        return;
      }
      router.push("/firma/pflichten" as never);
      showToast({
        message: t("obligation.archiveToast", { title: result.data.title }),
        actionLabel: t("undo"),
        onAction: async () => {
          const undone = await restoreObligationAction(id);
          if (undone.ok)
            showToast({ message: t("obligation.restored", { title: undone.data.title }) });
          else showError(errorText(undone.error));
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

/**
 * Banner on an archived vehicle or obligation (UX-060: an archived vehicle showed only an icon and could not
 * be brought back after the undo toast was gone): when it was archived and "Wiederherstellen". The restore
 * shows an undo toast that archives it again. An obligation archived together with its vehicle comes back
 * with the vehicle, so its banner links there instead.
 */
export function ArchivedBanner({
  kind,
  id,
  archivedOn,
  canRestore,
  vehicleHref,
}: {
  kind: "vehicle" | "obligation";
  id: string;
  /** Berlin day it was archived ("YYYY-MM-DD"). */
  archivedOn: string;
  canRestore: boolean;
  /** Obligation of an archived vehicle: where to restore it (the vehicle's page). */
  vehicleHref?: string;
}) {
  const t = useTranslations("company");
  const tb = useTranslations("company.archived");
  const locale = useLocale();
  const router = useRouter();
  const { showToast, showError } = useShell();
  const errorText = useErrorText();
  const [pending, startTransition] = useTransition();

  function restore() {
    startTransition(async () => {
      const result =
        kind === "vehicle" ? await restoreVehicleAction(id) : await restoreObligationAction(id);
      if (!result.ok) {
        showError(errorText(result.error));
        return;
      }
      showToast({
        message:
          "name" in result.data
            ? t("vehicle.restored", { name: result.data.name })
            : t("obligation.restored", { title: result.data.title }),
        actionLabel: t("undo"),
        onAction: async () => {
          const undone =
            kind === "vehicle" ? await archiveVehicleAction(id) : await archiveObligationAction(id);
          if (!undone.ok) return showError(errorText(undone.error));
          router.refresh();
          showToast({ message: tb("archivedAgain") });
        },
      });
    });
  }

  const date = formatDate(archivedOn, locale);
  return (
    <div
      role="status"
      className="flex flex-col gap-3 rounded-lg border border-border bg-status-neutral-bg px-4 py-3 sm:flex-row sm:items-center"
    >
      <p className="m-0 flex min-w-0 flex-1 items-start gap-2 text-foreground">
        <Archive aria-hidden className="mt-0.5 size-4 shrink-0" />
        <span>
          <span className="font-semibold">{tb("title", { date })}</span>{" "}
          {vehicleHref
            ? tb("withVehicle")
            : kind === "vehicle"
              ? tb("vehicleNote")
              : t("obligation.archivedNote")}
        </span>
      </p>
      {vehicleHref ? (
        <Link href={vehicleHref as never} className={buttonVariants({ variant: "outline" })}>
          {tb("toVehicle")}
        </Link>
      ) : (
        canRestore && (
          <Button disabled={pending} aria-busy={pending} onClick={restore}>
            <ArchiveRestore aria-hidden />
            {tb("restore")}
          </Button>
        )
      )}
    </div>
  );
}

/** "Archivieren" of a vehicle (sold or scrapped): the vehicle and its obligations leave lists and reminders. */
export function ArchiveVehicleButton({ id, name }: { id: string; name: string }) {
  const t = useTranslations("company");
  const router = useRouter();
  const { showToast, showError } = useShell();
  const errorText = useErrorText();
  const [pending, startTransition] = useTransition();

  function archive() {
    startTransition(async () => {
      const result = await archiveVehicleAction(id);
      if (!result.ok) {
        showError(errorText(result.error));
        return;
      }
      router.push("/firma/fahrzeuge" as never);
      showToast({
        message: t("vehicle.archiveToast", { name: result.data.name }),
        actionLabel: t("undo"),
        onAction: async () => {
          const undone = await restoreVehicleAction(id);
          if (undone.ok) showToast({ message: t("vehicle.restored", { name: undone.data.name }) });
          else showError(errorText(undone.error));
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
