"use client";

import { Menu } from "@base-ui/react/menu";
import { PERMIT_FLOW_STEPS, type PermitStatus, splitPermitTransitions } from "@marktwerk/core";
import { Check, Circle, CircleDot, Ellipsis } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { changePermitStatus, undoPermitStatus } from "@/app/(app)/genehmigungen/actions";
import { useShell } from "@/components/shell/shell-context";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const STEPS = PERMIT_FLOW_STEPS;

const MENU_POPUP =
  "flex min-w-[240px] flex-col rounded-[10px] border bg-popover p-1 text-popover-foreground shadow-pop outline-hidden";
const MENU_ITEM =
  "flex min-h-8 cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-small outline-hidden data-[disabled]:cursor-default data-[disabled]:opacity-50 data-[highlighted]:bg-hover";

/**
 * The status flow of a permit: where it stands and the allowed next steps. Every change shows an undo
 * toast (UX concept §6) instead of asking for confirmation.
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
  const { primary, secondary, menu } = splitPermitTransitions(status);
  const none = !primary && secondary.length === 0 && menu.length === 0;
  const index = (STEPS as readonly PermitStatus[]).indexOf(status);
  // "Fehlt" is the alarm word of the matrix; in the flow the first step is just "not applied for yet".
  const label = (s: PermitStatus) => (s === "not_started" ? t("steps.not_started") : tState(s));
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
          const passed = index > i || status === "granted";
          const current = index === i;
          // The first step is where every permit starts: passing it is no achievement worth a check mark.
          const Icon = passed && i > 0 ? Check : current ? CircleDot : Circle;
          return (
            <li
              key={step}
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
                  passed && i > 0 && "text-status-ok",
                  current && "text-accent-soft-foreground",
                )}
              />
              <span>{label(step)}</span>
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
        (none ? (
          <p className="text-muted-foreground text-small">{t("noNextStep")}</p>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            {primary && (
              <Button
                size="sm"
                variant="default"
                disabled={pending}
                aria-busy={pending}
                onClick={() => move(primary)}
              >
                {t(`actions.${primary}` as never)}
              </Button>
            )}
            {secondary.map((to) => (
              <Button
                key={to}
                size="sm"
                variant="outline"
                disabled={pending}
                aria-busy={pending}
                onClick={() => move(to)}
              >
                {t(`actions.${to}` as never)}
              </Button>
            ))}
            {menu.length > 0 && (
              <Menu.Root>
                <Menu.Trigger
                  aria-label={t("moreSteps")}
                  disabled={pending}
                  className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-md border border-input bg-card text-muted-foreground hover:bg-hover focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50 data-[popup-open]:bg-hover"
                >
                  <Ellipsis aria-hidden className="size-4" />
                </Menu.Trigger>
                <Menu.Portal>
                  <Menu.Positioner side="bottom" align="start" sideOffset={4} className="z-50">
                    <Menu.Popup className={MENU_POPUP}>
                      {menu.map((to) => (
                        <Menu.Item key={to} className={MENU_ITEM} onClick={() => move(to)}>
                          {t(`actions.${to}` as never)}
                        </Menu.Item>
                      ))}
                    </Menu.Popup>
                  </Menu.Positioner>
                </Menu.Portal>
              </Menu.Root>
            )}
          </div>
        ))}
    </section>
  );
}
