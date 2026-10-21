"use client";

import { Menu } from "@base-ui/react/menu";
import { Check, ChevronDown, UserMinus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { assignDuty, undoDuty } from "@/app/(app)/veranstaltungen/[id]/actions";
import { useShell } from "@/components/shell/shell-context";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import type { AssignableStaff } from "@/server/queries/team";

const item =
  "flex min-h-8 cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-small outline-none data-[disabled]:cursor-default data-[highlighted]:bg-hover";
const groupLabel =
  "px-2 pt-2 pb-1 font-semibold text-[11px] text-muted-foreground uppercase tracking-wider";

/**
 * "Ändern" on a Team tab row: pick who fills the duty role at this event, or leave it unassigned.
 * People who prefer the role come first; a clash with another event on the same days is shown as a
 * hint, not blocked. Shows an undo toast instead of asking first (UX concept §6).
 */
export function DutyMenu({
  eventId,
  roleId,
  roleName,
  current,
  staff,
}: {
  eventId: string;
  roleId: string;
  roleName: string;
  current: { id: string; name: string } | null;
  staff: AssignableStaff[];
}) {
  const t = useTranslations("eventDetail.team");
  const { showToast } = useShell();
  const [pending, startTransition] = useTransition();

  const preferred = staff.filter((s) => s.preferredDutyRoleIds.includes(roleId));
  const others = staff.filter((s) => !s.preferredDutyRoleIds.includes(roleId));
  // The current person may be inactive by now and missing from `staff`.
  const nameOf = (id: string | null) =>
    id === null
      ? null
      : (staff.find((s) => s.id === id)?.displayName ?? (id === current?.id ? current.name : null));

  const errorText = (code: string) =>
    t.has(`errors.${code}` as never) ? t(`errors.${code}` as never) : t("errors.generic");

  function message(from: string | null, to: string | null) {
    const fromName = nameOf(from);
    const toName = nameOf(to);
    if (toName === null) return t("toast.cleared", { role: roleName, name: fromName ?? "" });
    if (fromName === null) return t("toast.assigned", { role: roleName, name: toName });
    return t("toast.changed", { role: roleName, from: fromName, to: toName });
  }

  function run(to: string | null) {
    startTransition(async () => {
      const result = await assignDuty(eventId, roleId, to);
      if (!result.ok) {
        showToast({ message: errorText(result.error) });
        return;
      }
      if (!result.data.changed) return;
      const { from } = result.data;
      showToast({
        message: message(from, to),
        actionLabel: t("undo"),
        onAction: async () => {
          const undone = await undoDuty(eventId, roleId, to, from);
          showToast({
            message: undone.ok ? t("toast.reverted", { role: roleName }) : errorText(undone.error),
          });
        },
      });
    });
  }

  function person(s: AssignableStaff) {
    const selected = s.id === current?.id;
    return (
      <Menu.Item key={s.id} className={item} disabled={selected} onClick={() => run(s.id)}>
        <Avatar name={s.displayName} />
        <span className="flex min-w-0 flex-col">
          <span className="truncate">{s.displayName}</span>
          {s.busyAt && (
            <span className="truncate text-muted-foreground text-tiny">
              {t("busyAt", { event: s.busyAt })}
            </span>
          )}
        </span>
        {selected && (
          <Check aria-label={t("current")} className="ml-auto size-4 text-muted-foreground" />
        )}
      </Menu.Item>
    );
  }

  return (
    <Menu.Root>
      <Menu.Trigger
        render={
          <Button
            size="sm"
            aria-label={t(current ? "changeLabel" : "assignLabel", { role: roleName })}
            aria-busy={pending}
            disabled={pending}
          />
        }
      >
        {t(current ? "change" : "assign")}
        <ChevronDown aria-hidden />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner side="bottom" align="end" sideOffset={6} className="z-50">
          <Menu.Popup className="flex max-h-[min(420px,var(--available-height))] min-w-[260px] flex-col overflow-y-auto rounded-[10px] border bg-popover p-1 text-popover-foreground shadow-pop outline-none">
            {preferred.length > 0 && (
              <Menu.Group>
                <Menu.GroupLabel className={groupLabel}>
                  {t("preferred", { role: roleName })}
                </Menu.GroupLabel>
                {preferred.map(person)}
              </Menu.Group>
            )}
            {others.length > 0 && (
              <Menu.Group>
                <Menu.GroupLabel className={groupLabel}>
                  {preferred.length > 0 ? t("others") : t("everyone")}
                </Menu.GroupLabel>
                {others.map(person)}
              </Menu.Group>
            )}
            {current && (
              <>
                <Menu.Separator className="my-1 h-px bg-border" />
                <Menu.Item className={item} onClick={() => run(null)}>
                  <UserMinus aria-hidden className="size-4 text-muted-foreground" />
                  {t("clear")}
                </Menu.Item>
              </>
            )}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
