"use client";

import { Menu } from "@base-ui/react/menu";
import { Check, ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { setBookingFlag } from "@/app/(app)/veranstaltungen/[id]/actions";
import { useShell } from "@/components/shell/shell-context";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm";

const item =
  "flex min-h-8 cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-small outline-none data-[highlighted]:bg-hover";

type Flags = { bookingOpen: boolean; fullyBooked: boolean; carSpacesFull: boolean };
const FLAGS = ["bookingOpen", "fullyBooked", "carSpacesFull"] as const;

/** "Buchung" in the event header: the three booking flags as checkbox items, each with an undo toast. */
export function BookingMenu({
  eventId,
  flags,
  happening,
}: {
  eventId: string;
  flags: Flags;
  happening: boolean;
}) {
  const t = useTranslations("eventDetail.booking");
  const { showToast } = useShell();
  const tHappening = useTranslations("eventDetail.happening");
  const { confirm, dialog } = useConfirm();
  /** While the event is happening, every change is confirmed first (decided 2026-10-21). */
  const confirmed = async () =>
    !happening ||
    confirm({
      title: tHappening("title"),
      description: tHappening("description"),
      confirmLabel: tHappening("confirm"),
      cancelLabel: tHappening("cancel"),
    });
  const [pending, startTransition] = useTransition();

  async function toggle(flag: (typeof FLAGS)[number], value: boolean) {
    if (!(await confirmed())) return;
    startTransition(async () => {
      const result = await setBookingFlag(eventId, flag, value);
      if (!result.ok) {
        showToast({ message: t("failed") });
        return;
      }
      if (!result.data.changed) return;
      showToast({
        message: t(`${value ? "on" : "off"}.${flag}`),
        actionLabel: t("undo"),
        onAction: async () => {
          const undone = await setBookingFlag(eventId, flag, !value);
          showToast({ message: undone.ok ? t(`${value ? "off" : "on"}.${flag}`) : t("failed") });
        },
      });
    });
  }

  return (
    <>
      <Menu.Root>
        <Menu.Trigger render={<Button aria-busy={pending} disabled={pending} />}>
          {t("menu")}
          <ChevronDown aria-hidden />
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Positioner side="bottom" align="end" sideOffset={6} className="z-50">
            <Menu.Popup className="flex min-w-[240px] flex-col rounded-[10px] border bg-popover p-1 text-popover-foreground shadow-pop outline-none">
              {FLAGS.map((flag) => (
                <Menu.CheckboxItem
                  key={flag}
                  className={item}
                  checked={flags[flag]}
                  onCheckedChange={(checked) => toggle(flag, checked)}
                >
                  <span className="grid size-4 place-items-center rounded border border-input">
                    <Menu.CheckboxItemIndicator>
                      <Check aria-hidden className="size-3" />
                    </Menu.CheckboxItemIndicator>
                  </span>
                  {t(`flag.${flag}`)}
                </Menu.CheckboxItem>
              ))}
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
      {dialog}
    </>
  );
}
