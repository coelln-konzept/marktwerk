"use client";

import { Pencil, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState, useTransition } from "react";
import { deleteRowAction, restoreRowAction } from "@/app/(app)/orte/actions";
import { useShell } from "@/components/shell/shell-context";
import { Button } from "@/components/ui/button";
import { RowActions } from "@/components/ui/table";
import { RowDialog, type RowValues, type ZoneRef } from "./row-dialog";
import { useErrorText } from "./shared";

/** Edit and delete buttons at the end of a row; delete shows an undo toast instead of asking. */
export function RowControls({ row, zone }: { row: RowValues; zone: ZoneRef }) {
  const t = useTranslations("venues.manage");
  const { showToast, showError } = useShell();
  const errorText = useErrorText();
  const [open, setOpen] = useState(false);
  const editButton = useRef<HTMLButtonElement>(null);
  const [pending, startTransition] = useTransition();

  function remove() {
    startTransition(async () => {
      const result = await deleteRowAction(row.id);
      if (!result.ok) {
        showError(errorText(result.error));
        return;
      }
      showToast({
        message: t("row.deleted", { row: result.data.label }),
        actionLabel: t("undo"),
        onAction: async () => {
          const undone = await restoreRowAction(row.id);
          if (undone.ok) showToast({ message: t("row.restored", { row: undone.data.label }) });
          else showError(errorText(undone.error));
        },
      });
    });
  }

  return (
    <RowActions>
      <Button
        ref={editButton}
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
      <RowDialog
        open={open}
        onOpenChange={setOpen}
        zone={zone}
        row={row}
        returnFocus={editButton}
      />
    </RowActions>
  );
}
