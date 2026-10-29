"use client";

import { Menu } from "@base-ui/react/menu";
import { ArrowDown, ArrowUp, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { deleteZoneAction, moveZoneAction, restoreZoneAction } from "@/app/(app)/orte/actions";
import { useShell } from "@/components/shell/shell-context";
import { Button } from "@/components/ui/button";
import { RowDialog } from "./row-dialog";
import { useErrorText } from "./shared";
import { ZoneDialog } from "./zone-dialog";

const item =
  "flex min-h-8 cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-small outline-hidden data-[disabled]:cursor-default data-[disabled]:opacity-45 data-[highlighted]:bg-hover";

/** "Zone hinzufügen" above the zone list. */
export function AddZoneButton({ venueId }: { venueId: string }) {
  const t = useTranslations("venues.manage");
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus aria-hidden />
        {t("zone.add")}
      </Button>
      <ZoneDialog open={open} onOpenChange={setOpen} venueId={venueId} />
    </>
  );
}

/**
 * In a zone's header: "Reihe hinzufügen" and a menu with rename, move up/down (the keyboard and menu way
 * to reorder, no dragging) and delete, which shows an undo toast instead of asking.
 */
export function ZoneControls({
  venueId,
  zone,
  index,
  count,
}: {
  venueId: string;
  zone: { id: string; name: string };
  index: number;
  count: number;
}) {
  const t = useTranslations("venues.manage");
  const { showToast } = useShell();
  const errorText = useErrorText();
  const [renaming, setRenaming] = useState(false);
  const [addingRow, setAddingRow] = useState(false);
  const [pending, startTransition] = useTransition();

  function move(direction: "up" | "down") {
    startTransition(async () => {
      const result = await moveZoneAction(zone.id, direction);
      if (!result.ok) {
        showToast({ message: errorText(result.error) });
        return;
      }
      showToast({
        message: result.data.changed
          ? t("zone.moved", {
              zone: zone.name,
              position: result.data.position,
              count: result.data.count,
            })
          : t("zone.notMoved", { zone: zone.name, direction }),
      });
    });
  }

  function remove() {
    startTransition(async () => {
      const result = await deleteZoneAction(zone.id);
      if (!result.ok) {
        showToast({ message: errorText(result.error) });
        return;
      }
      const { name, rowCount } = result.data;
      showToast({
        message:
          rowCount > 0
            ? t("zone.deletedWithRows", { zone: name, rows: rowCount })
            : t("zone.deleted", { zone: name }),
        actionLabel: t("undo"),
        onAction: async () => {
          const undone = await restoreZoneAction(zone.id);
          showToast({
            message: undone.ok
              ? t("zone.restored", { zone: undone.data.name })
              : errorText(undone.error),
          });
        },
      });
    });
  }

  return (
    <div className="flex items-center gap-1">
      <Button size="sm" onClick={() => setAddingRow(true)}>
        <Plus aria-hidden />
        {t("row.add")}
      </Button>
      <Menu.Root>
        <Menu.Trigger
          render={
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label={t("zone.menu", { zone: zone.name })}
              aria-busy={pending}
              disabled={pending}
            />
          }
        >
          <MoreHorizontal aria-hidden />
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Positioner side="bottom" align="end" sideOffset={6} className="z-50">
            <Menu.Popup className="flex min-w-[200px] flex-col rounded-[10px] border bg-popover p-1 text-popover-foreground shadow-pop outline-hidden">
              <Menu.Item className={item} onClick={() => setRenaming(true)}>
                <Pencil aria-hidden className="size-4 text-muted-foreground" />
                {t("zone.rename")}
              </Menu.Item>
              <Menu.Item className={item} disabled={index === 0} onClick={() => move("up")}>
                <ArrowUp aria-hidden className="size-4 text-muted-foreground" />
                {t("zone.up")}
              </Menu.Item>
              <Menu.Item
                className={item}
                disabled={index === count - 1}
                onClick={() => move("down")}
              >
                <ArrowDown aria-hidden className="size-4 text-muted-foreground" />
                {t("zone.down")}
              </Menu.Item>
              <Menu.Separator className="my-1 h-px bg-border" />
              <Menu.Item className={item} onClick={remove}>
                <Trash2 aria-hidden className="size-4 text-status-critical" />
                {t("zone.delete")}
              </Menu.Item>
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
      <ZoneDialog open={renaming} onOpenChange={setRenaming} venueId={venueId} zone={zone} />
      <RowDialog open={addingRow} onOpenChange={setAddingRow} zone={zone} />
    </div>
  );
}
