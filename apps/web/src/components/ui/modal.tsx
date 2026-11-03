"use client";

import { Dialog } from "@base-ui/react/dialog";
import { X } from "lucide-react";
import type * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Centred modal for short forms (UX concept §4: ≤ 8 fields): title, optional description, close button.
 * Same look as the cancel dialog of "Status ändern".
 */
export function Modal({
  open,
  onOpenChange,
  title,
  description,
  closeLabel,
  className,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: React.ReactNode;
  closeLabel: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-40 bg-scrim" />
        <Dialog.Popup
          className={cn(
            "-translate-x-1/2 -translate-y-1/2 fixed top-1/2 left-1/2 z-40 flex max-h-[calc(100dvh-2rem)] w-[min(480px,calc(100%-2rem))] flex-col gap-4 overflow-y-auto rounded-xl border bg-card p-5 shadow-overlay outline-hidden",
            className,
          )}
        >
          <div className="flex items-start justify-between gap-3">
            <Dialog.Title className="font-semibold text-lg">{title}</Dialog.Title>
            <Dialog.Close
              aria-label={closeLabel}
              className="grid size-8 cursor-pointer place-items-center rounded-lg hover:bg-hover"
            >
              <X aria-hidden className="size-4" />
            </Dialog.Close>
          </div>
          {description && (
            <Dialog.Description className="text-muted-foreground text-small">
              {description}
            </Dialog.Description>
          )}
          {children}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
