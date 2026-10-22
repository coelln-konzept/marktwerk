"use client";

import { useCallback, useRef, useState } from "react";
import { Button } from "./button";
import { Modal } from "./modal";

export type ConfirmOptions = {
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel: string;
};

/**
 * Asks before a change, for the few cases where an undo toast isn't enough (decided 2026-10-21: edits
 * while an event is happening; name, length or venue of an event). `confirm()` resolves true/false;
 * render `dialog` once in the component.
 */
export function useConfirm() {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const confirm = useCallback(
    (next: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        resolver.current?.(false);
        resolver.current = resolve;
        setOptions(next);
      }),
    [],
  );

  const close = (ok: boolean) => {
    resolver.current?.(ok);
    resolver.current = null;
    setOptions(null);
  };

  const dialog = (
    <Modal
      open={options !== null}
      onOpenChange={(open) => !open && close(false)}
      title={options?.title ?? ""}
      description={options?.description}
      closeLabel={options?.cancelLabel ?? ""}
    >
      <div className="flex justify-end gap-2">
        <Button onClick={() => close(false)}>{options?.cancelLabel}</Button>
        <Button variant="default" onClick={() => close(true)}>
          {options?.confirmLabel}
        </Button>
      </div>
    </Modal>
  );

  return { confirm, dialog };
}
