"use client";

import { PERMIT_TRANSITIONS, type PermitStatus } from "@marktwerk/core";
import { Check, Circle, CircleDot } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { changePermitStatus, undoPermitStatus } from "@/app/(app)/genehmigungen/actions";
import { useShell } from "@/components/shell/shell-context";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** not_started → preparing → applied → granted (rejected / not_required / superseded branch off). */
const STEPS = [
  { status: "not_started", label: "missing" },
  { status: "preparing", label: "preparing" },
  { status: "applied", label: "applied" },
  { status: "granted", label: "granted" },
] as const satisfies readonly { status: PermitStatus; label: string }[];

/**
 * The status flow of a permit: where it stands and the allowed next steps as buttons. Every change shows
 * an undo toast (UX concept §6) instead of asking for confirmation.
 */
export function PermitStatusFlow({
  permitId,
  status,
  canWrite,
}: {
  permitId: string;
  status: PermitStatus;
  canWrite: boolean;
}) {
  const t = useTranslations("permitDrawer");
  const tState = useTranslations("permitStatus");
  const { showToast } = useShell();
  const [pending, startTransition] = useTransition();
  const next = PERMIT_TRANSITIONS[status];
  const index = STEPS.findIndex((s) => s.status === status);
  const label = (s: PermitStatus) => tState(s === "not_started" ? "missing" : s);
  const errorText = (code: string) =>
    t.has(`errors.${code}` as never) ? t(`errors.${code}` as never) : t("errors.generic");

  function move(to: PermitStatus) {
    startTransition(async () => {
      const result = await changePermitStatus(permitId, to);
      if (!result.ok) return showToast({ message: errorText(result.error) });
      const { changed, previous, closedTaskIds } = result.data;
      if (!changed) return showToast({ message: t("statusUnchanged", { status: label(to) }) });
      showToast({
        message:
          closedTaskIds.length > 0
            ? `${t("statusSet", { status: label(to) })} ${t("tasksClosed", { count: closedTaskIds.length })}.`
            : t("statusSet", { status: label(to) }),
        actionLabel: t("undo"),
        onAction: async () => {
          const undone = await undoPermitStatus(permitId, to, previous, closedTaskIds);
          showToast({ message: undone.ok ? t("reverted") : errorText(undone.error) });
        },
      });
    });
  }

  return (
    <section aria-labelledby="flow-title" className="flex flex-col gap-3">
      <h3 id="flow-title" className="font-semibold text-foreground-2 text-small">
        {t("flow")}
      </h3>
      <ol className="m-0 flex list-none items-start justify-between gap-1 p-0">
        {STEPS.map((step, i) => {
          const done = index > i || status === "granted";
          const current = index === i;
          const Icon = done ? Check : current ? CircleDot : Circle;
          return (
            <li
              key={step.status}
              aria-current={current ? "step" : undefined}
              className={cn(
                "flex min-w-0 flex-1 flex-col items-center gap-1 text-center text-tiny",
                current ? "font-semibold text-foreground" : "text-muted-foreground",
              )}
            >
              <Icon
                aria-hidden
                className={cn(
                  "size-4",
                  done && "text-status-ok",
                  current && "text-accent-soft-foreground",
                )}
              />
              <span>{tState(step.label)}</span>
            </li>
          );
        })}
      </ol>
      {index === -1 && (
        <p className="text-small">
          <span className="font-semibold">{label(status)}</span>
        </p>
      )}
      {canWrite &&
        (next.length === 0 ? (
          <p className="text-muted-foreground text-small">{t("noNextStep")}</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {next.map((to, i) => (
              <Button
                key={to}
                size="sm"
                variant={i === 0 ? "default" : "outline"}
                disabled={pending}
                aria-busy={pending}
                onClick={() => move(to)}
              >
                {t(`actions.${to}` as never)}
              </Button>
            ))}
          </div>
        ))}
    </section>
  );
}
