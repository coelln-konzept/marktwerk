"use client";

import { Download, FileCheck2, Lock, LockOpen } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import {
  approvePeriodAction,
  exportPeriodAction,
  lockPeriodAction,
  unlockPeriodAction,
} from "@/app/(app)/team/actions";
import { useShell } from "@/components/shell/shell-context";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm";
import { Input } from "@/components/ui/input";

type Status = "open" | "locked" | "approved" | "exported";

/** Saves text as a UTF-8 file in the browser (the CSV is generated on the server on the fly). */
function download(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/**
 * The buttons of the month close: sperren (names the consequence first), freigeben, CSV herunterladen
 * and "Entsperren" with a reason. Only for people with team:manage.
 */
export function CloseActions({
  month,
  monthLabel,
  status,
  blockers,
}: {
  /** "YYYY-MM-01" */
  month: string;
  monthLabel: string;
  status: Status;
  blockers: number;
}) {
  const t = useTranslations("hours.close");
  const tErr = useTranslations("hours.errors");
  const { showToast } = useShell();
  const { confirm, dialog } = useConfirm();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [unlocking, setUnlocking] = useState(false);
  const [reason, setReason] = useState("");

  const errorText = (code: string) =>
    tErr.has(code as never) ? tErr(code as never) : tErr("generic");

  function run(action: () => Promise<{ ok: boolean; error?: string }>, done: string) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.error ?? "generic");
        return;
      }
      showToast({ message: done });
    });
  }

  async function lock() {
    const ok = await confirm({
      title: t("lockConfirm.title", { month: monthLabel }),
      description: t("lockConfirm.description", { month: monthLabel }),
      confirmLabel: t("lockConfirm.confirm"),
      cancelLabel: t("lockConfirm.cancel"),
    });
    if (ok) run(() => lockPeriodAction(month), t("locked", { month: monthLabel }));
  }

  function exportCsv() {
    setError(null);
    startTransition(async () => {
      const result = await exportPeriodAction(month);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      download(result.data.filename, result.data.csv);
      showToast({ message: t("exported", { file: result.data.filename }) });
    });
  }

  function unlock() {
    if (reason.trim().length < 3) return setError("reason_required");
    run(
      async () => {
        const result = await unlockPeriodAction(month, reason);
        if (result.ok) {
          setUnlocking(false);
          setReason("");
        }
        return result;
      },
      t("unlocked", { month: monthLabel }),
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {status === "open" && (
          <Button
            variant="default"
            disabled={pending || blockers > 0}
            aria-busy={pending}
            onClick={lock}
          >
            <Lock aria-hidden />
            {t("lock")}
          </Button>
        )}
        {status === "locked" && (
          <Button
            variant="default"
            disabled={pending}
            aria-busy={pending}
            onClick={() =>
              run(() => approvePeriodAction(month), t("approved", { month: monthLabel }))
            }
          >
            <FileCheck2 aria-hidden />
            {t("approve")}
          </Button>
        )}
        {(status === "approved" || status === "exported") && (
          <Button variant="default" disabled={pending} aria-busy={pending} onClick={exportCsv}>
            <Download aria-hidden />
            {status === "exported" ? t("exportAgain") : t("export")}
          </Button>
        )}
        {status !== "open" && !unlocking && (
          <Button disabled={pending} onClick={() => setUnlocking(true)}>
            <LockOpen aria-hidden />
            {t("unlock")}
          </Button>
        )}
      </div>
      {status === "open" && blockers > 0 && (
        <p className="m-0 text-muted-foreground text-small">{t("blocked", { count: blockers })}</p>
      )}
      {unlocking && (
        <form
          className="flex max-w-xl flex-col gap-2 rounded-lg border bg-sunken p-3"
          onSubmit={(e) => {
            e.preventDefault();
            unlock();
          }}
        >
          <label htmlFor="unlock-reason" className="font-medium text-small">
            {t("unlockReason")}
          </label>
          <Input
            id="unlock-reason"
            autoComplete="off"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            aria-invalid={error === "reason_required"}
          />
          <span className="text-faint-foreground text-tiny">{t("unlockHint")}</span>
          <div className="flex gap-2">
            <Button type="submit" variant="default" disabled={pending} aria-busy={pending}>
              {t("unlockConfirm")}
            </Button>
            <Button disabled={pending} onClick={() => setUnlocking(false)}>
              {t("cancel")}
            </Button>
          </div>
        </form>
      )}
      {error && (
        <p role="alert" className="m-0 text-small text-status-critical">
          {errorText(error)}
        </p>
      )}
      {dialog}
    </div>
  );
}
