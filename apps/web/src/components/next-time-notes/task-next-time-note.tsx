"use client";

import { Lightbulb } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { NextTimeNoteForm } from "./next-time-note-form";

/**
 * Task drawer: "Fürs nächste Mal notieren" (Fahrplan R25). One quiet button that opens the note form in place; the
 * note goes to the market of the task's date (or Saison), with the task as its origin. Closes after saving.
 */
export function TaskNextTimeNote({ taskId, marketName }: { taskId: string; marketName: string }) {
  const t = useTranslations("nextTimeNotes");
  const [open, setOpen] = useState(false);
  if (!open)
    return (
      <div>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(true)}>
          <Lightbulb aria-hidden className="text-status-warn" />
          {t("drawer.open")}
        </Button>
      </div>
    );
  return (
    <NextTimeNoteForm
      target={{ taskId }}
      autoFocus
      hint={t("drawer.hint", { market: marketName })}
      onSaved={() => setOpen(false)}
      onCancel={() => setOpen(false)}
      className="rounded-lg border border-border-subtle bg-surface-2 p-3"
    />
  );
}
