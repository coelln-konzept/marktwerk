"use client";

import { useTranslations } from "next-intl";
import type * as React from "react";
import { Button } from "./button";
import { Modal } from "./modal";

/**
 * Shell of the quick-create dialogs (UT2-07): "+ Neu" in a `RecordPicker` opens one with only the required
 * fields. Rendered inside the dialog or sheet that holds the picker, it stacks on top of it (base-ui nests
 * the dialogs: Esc closes only this one, focus goes back to the picker). Can't be closed while `pending`.
 * The fields come as `children`; `onSubmit` runs on "Anlegen" and on Enter in a field.
 */
export function QuickCreateDialog({
  open,
  onOpenChange,
  title,
  description,
  pending = false,
  error,
  submitLabel,
  onSubmit,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: React.ReactNode;
  pending?: boolean;
  /** Message under the fields (e.g. a server error); announced as an alert. */
  error?: string | null;
  /** Defaults to "Anlegen". */
  submitLabel?: string;
  onSubmit: () => void;
  children: React.ReactNode;
}) {
  const t = useTranslations("quickCreate");
  return (
    <Modal
      open={open}
      onOpenChange={(next) => !pending && onOpenChange(next)}
      title={title}
      description={description}
      closeLabel={t("cancel")}
    >
      <form
        noValidate
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          // The form sits in a portal but React still bubbles the event to the form around the opener.
          e.stopPropagation();
          if (!pending) onSubmit();
        }}
      >
        {children}
        <div className="flex items-center justify-between gap-3">
          <p role="alert" className="min-w-0 flex-1 text-small text-status-critical">
            {error}
          </p>
          <div className="flex items-center gap-2">
            <Button type="button" disabled={pending} onClick={() => onOpenChange(false)}>
              {t("cancel")}
            </Button>
            <Button type="submit" variant="default" aria-busy={pending} disabled={pending}>
              {submitLabel ?? t("submit")}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
