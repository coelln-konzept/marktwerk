"use client";

import { Check, TriangleAlert, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { Kbd } from "@/components/ui/kbd";
import { cn } from "@/lib/utils";
import { TOAST_MS, type ToastEntry, useShell } from "./shell-context";

/** After hover or focus has held a toast, it stays at least this long once let go. */
const MIN_LEFT_MS = 3000;

/**
 * Up to three toasts, bottom centre, the newest at the bottom. Two live regions that exist before
 * anything is shown: successes (polite) and errors (`role="alert"`, red, stay until closed). Hovering
 * or focusing a toast stops its clock; Strg+Z runs the newest undo (see `shell-context.tsx`).
 */
export function ToastRegion() {
  const { toasts } = useShell();
  const t = useTranslations("toasts");
  const polite = toasts.filter((e) => e.toast.tone !== "error");
  const alerts = toasts.filter((e) => e.toast.tone === "error");
  // The toast Strg+Z would undo gets the key hint and `aria-keyshortcuts`.
  const undoId = toasts.findLast(
    (e) => e.toast.onAction && e.toast.actionLabel && e.toast.undoable !== false,
  )?.id;
  return (
    <section
      aria-label={t("region")}
      className="pointer-events-none fixed inset-x-0 bottom-5 z-[60] flex flex-col items-center px-4"
    >
      <div role="status" aria-atomic="false" className="flex w-full flex-col items-center">
        {polite.map((entry) => (
          <ToastItem key={entry.id} entry={entry} undoKey={entry.id === undoId} />
        ))}
      </div>
      <div role="alert" aria-atomic="false" className="flex w-full flex-col items-center">
        {alerts.map((entry) => (
          <ToastItem key={entry.id} entry={entry} undoKey={entry.id === undoId} />
        ))}
      </div>
    </section>
  );
}

function ToastItem({ entry, undoKey }: { entry: ToastEntry; undoKey: boolean }) {
  const { dismissToastById, runToastAction, busyToastIds } = useShell();
  const t = useTranslations("toasts");
  const { toast } = entry;
  const error = toast.tone === "error";
  const busy = busyToastIds.has(entry.id);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const paused = hovered || focused || busy;
  const left = useRef(TOAST_MS);

  // The clock runs for successes only, and not while the pointer or the focus is on the toast.
  useEffect(() => {
    if (error || paused) return;
    const started = Date.now();
    const timer = setTimeout(() => dismissToastById(entry.id), left.current);
    return () => {
      clearTimeout(timer);
      left.current = Math.max(MIN_LEFT_MS, left.current - (Date.now() - started));
    };
  }, [error, paused, entry.id, dismissToastById]);

  const hover = error ? "hover:bg-status-critical-dot/15" : "hover:bg-toast-foreground/15";
  const Icon = error ? TriangleAlert : Check;
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: hover/focus only pause the clock; Esc closes.
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") dismissToastById(entry.id);
      }}
      className={cn(
        "pointer-events-auto mb-2 flex w-fit max-w-full items-center gap-3 rounded-xl py-2 pr-1.5 pl-4 font-medium shadow-pop",
        error
          ? "border border-status-critical-dot bg-status-critical-bg text-status-critical"
          : "bg-toast text-toast-foreground",
      )}
    >
      <Icon aria-hidden className="size-4 shrink-0" />
      <span className="min-w-0 break-words">{toast.message}</span>
      {toast.actionLabel && toast.onAction && (
        <button
          type="button"
          disabled={busy}
          aria-keyshortcuts={undoKey ? "Control+Z Meta+Z" : undefined}
          onClick={() => void runToastAction(entry.id)}
          className={cn(
            "flex min-h-8 cursor-pointer items-center gap-2 whitespace-nowrap rounded-md px-2 font-semibold",
            error ? "underline" : "text-toast-action",
            hover,
          )}
        >
          {toast.actionLabel}
          {undoKey && (
            <Kbd className="inline border-current/30 bg-transparent text-current opacity-70 max-sm:hidden touch:hidden">
              {t("undoKey")}
            </Kbd>
          )}
        </button>
      )}
      <button
        type="button"
        aria-label={t("close")}
        title={t("close")}
        onClick={() => dismissToastById(entry.id)}
        className={cn(
          "grid size-8 shrink-0 cursor-pointer place-items-center rounded-md opacity-80 hover:opacity-100",
          hover,
        )}
      >
        <X aria-hidden className="size-4" />
      </button>
    </div>
  );
}
