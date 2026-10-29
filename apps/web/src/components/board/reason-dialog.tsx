"use client";

import type { TaskStatusKey } from "@marktwerk/core";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { TEXTAREA_CLASS } from "@/components/event-detail/textarea-class";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";

/**
 * Small modal for the statuses that come with a reason: "Wartet" (auf wen), "Blockiert" (warum) and
 * "Übersprungen" (reason required). Everything else changes status without asking.
 */
export function ReasonDialog({
  status,
  taskTitle,
  onSubmit,
  onCancel,
}: {
  /** null = closed */
  status: TaskStatusKey | null;
  taskTitle: string;
  onSubmit: (reason: string | null) => void;
  onCancel: () => void;
}) {
  const t = useTranslations("tasks.reason");
  const [reason, setReason] = useState("");
  useEffect(() => {
    if (status) setReason("");
  }, [status]);
  const required = status === "skipped";
  const key =
    status === "waiting_external" || status === "blocked" || status === "skipped"
      ? status
      : "waiting_external";
  const clean = reason.trim();

  return (
    <Modal
      open={status !== null}
      onOpenChange={(open) => !open && onCancel()}
      title={t(`${key}.title`)}
      description={taskTitle}
      closeLabel={t("cancel")}
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (required && clean === "") return;
          onSubmit(clean === "" ? null : clean);
        }}
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="task-reason" optional={!required}>
            {t(`${key}.label`)}
          </Label>
          <textarea
            id="task-reason"
            rows={3}
            maxLength={500}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder={t(`${key}.placeholder`)}
            required={required}
            className={TEXTAREA_CLASS}
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" onClick={onCancel}>
            {t("cancel")}
          </Button>
          <Button type="submit" variant="default" disabled={required && clean === ""}>
            {t("save")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
