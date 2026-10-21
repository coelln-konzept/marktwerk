"use client";

import { Pencil, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { deleteRowAction, restoreRowAction } from "@/app/(app)/orte/actions";
import { useShell } from "@/components/shell/shell-context";
import { Button } from "@/components/ui/button";
import { RowActions } from "@/components/ui/table";
import { RowDialog, type RowValues } from "./row-dialog";
import { useErrorText } from "./shared";

/** Edit and delete buttons at the end of a row; delete shows an undo toast instead of asking. */
export function RowControls({ row, zone }: { row: RowValues; zone: { id: string; name: string } }) {
  const t = useTranslations("venues.manage");
  const { showToast } = useShell();
  const errorText = useErrorText();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function remove() {
    startTransition(async () => {
      const result = await deleteRowAction(row.id);
      if (!result.ok) {
        showToast({ message: errorText(result.error) });
        return;
      }
      showToast({
        message: t("row.deleted", { row: result.data.label }),
        actionLabel: t("undo"),
        onAction: async () => {
          const undone = await restoreRowAction(row.id);
          showToast({
            message: undone.ok
              ? t("row.restored", { row: undone.data.label })
              : errorText(undone.error),
          });
        },
      });
    });
  }

  return (
    <RowActions>
      <Button
        size="icon-sm"
        variant="ghost"
        aria-label={t("row.edit", { row: row.label })}
        onClick={() => setOpen(true)}
      >
        <Pencil aria-hidden />
      </Button>
      <Button
        size="icon-sm"
        variant="ghost"
        aria-label={t("row.delete", { row: row.label })}
        aria-busy={pending}
        disabled={pending}
        onClick={remove}
      >
        <Trash2 aria-hidden />
      </Button>
      <RowDialog open={open} onOpenChange={setOpen} zone={zone} row={row} />
    </RowActions>
  );
}
