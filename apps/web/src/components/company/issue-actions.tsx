"use client";

import { Check, RotateCcw, Wrench } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { setIssueStatusAction } from "@/app/(app)/firma/actions";
import { TEXTAREA_CLASS } from "@/components/event-detail/textarea-class";
import { useShell } from "@/components/shell/shell-context";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { useErrorText } from "./shared";

type Status = "open" | "in_progress" | "resolved";

const NEXT: Record<Status, Status[]> = {
  open: ["in_progress", "resolved"],
  in_progress: ["resolved", "open"],
  resolved: ["open"],
};

const ICON = { in_progress: Wrench, resolved: Check, open: RotateCcw } as const;

/**
 * Status buttons of one issue: open → in Reparatur → behoben (and back). "Behoben" asks for an optional note
 * in a small modal; every change shows an undo toast that restores the previous status.
 */
export function IssueActions({
  issueId,
  title,
  status,
}: {
  issueId: string;
  title: string;
  status: Status;
}) {
  const t = useTranslations("company");
  const ti = useTranslations("company.issues");
  const tr = useTranslations("company.resolveDialog");
  const { showToast } = useShell();
  const errorText = useErrorText();
  const [pending, startTransition] = useTransition();
  const [resolving, setResolving] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  function change(to: Status, resolutionNote?: string) {
    startTransition(async () => {
      const result = await setIssueStatusAction(issueId, to, {
        resolutionNote: resolutionNote || null,
      });
      if (!result.ok) {
        if (resolving) setError(errorText(result.error));
        else showToast({ message: errorText(result.error) });
        return;
      }
      setResolving(false);
      if (!result.data.changed) return;
      const { from } = result.data;
      showToast({
        message: ti("changed", { title, status: ti(`status.${to}`) }),
        actionLabel: t("undo"),
        onAction: async () => {
          const undone = await setIssueStatusAction(issueId, from, { expected: to });
          showToast({ message: undone.ok ? ti("reverted") : errorText(undone.error) });
        },
      });
    });
  }

  return (
    <>
      <span className="inline-flex flex-wrap items-center gap-1.5">
        {NEXT[status].map((to) => {
          const Icon = ICON[to];
          return (
            <Button
              key={to}
              size="sm"
              disabled={pending}
              aria-label={ti("actFor", { action: ti(`act.${to}`), title })}
              onClick={() => {
                if (to === "resolved") {
                  setNote("");
                  setError(null);
                  setResolving(true);
                } else change(to);
              }}
            >
              <Icon aria-hidden />
              {ti(`act.${to}`)}
            </Button>
          );
        })}
      </span>
      <Modal
        open={resolving}
        onOpenChange={(next) => !pending && setResolving(next)}
        title={tr("title")}
        description={title}
        closeLabel={t("close")}
      >
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            change("resolved", note);
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`resolve-${issueId}`} optional>
              {tr("note")}
            </Label>
            <textarea
              id={`resolve-${issueId}`}
              value={note}
              rows={3}
              maxLength={2000}
              className={TEXTAREA_CLASS}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
          <p role="alert" className="min-h-5 text-small text-status-critical">
            {error}
          </p>
          <div className="flex justify-end gap-2">
            <Button disabled={pending} onClick={() => setResolving(false)}>
              {t("cancel")}
            </Button>
            <Button type="submit" variant="default" aria-busy={pending} disabled={pending}>
              {tr("save")}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
