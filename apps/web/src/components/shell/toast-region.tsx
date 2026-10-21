"use client";

import { Check } from "lucide-react";
import { useState } from "react";
import { useShell } from "./shell-context";

/** One toast at a time, bottom centre, with an optional "Rückgängig". Announced politely. */
export function ToastRegion() {
  const { toast, dismissToast } = useShell();
  const [busy, setBusy] = useState(false);
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-7 z-[60] flex justify-center px-4"
    >
      {toast && (
        <div className="pointer-events-auto flex max-w-full items-center gap-3 rounded-xl bg-toast py-2 pr-2 pl-4 font-medium text-toast-foreground shadow-pop">
          <Check aria-hidden className="size-4 shrink-0" />
          <span>{toast.message}</span>
          {toast.actionLabel && toast.onAction && (
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                const shown = toast;
                setBusy(true);
                try {
                  await shown.onAction?.();
                } finally {
                  setBusy(false);
                  // An action may show its own toast (e.g. "Status zurückgesetzt"); keep that one.
                  dismissToast(shown);
                }
              }}
              className="min-h-8 cursor-pointer whitespace-nowrap rounded-md px-2 font-semibold text-toast-action hover:bg-white/15"
            >
              {toast.actionLabel}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
