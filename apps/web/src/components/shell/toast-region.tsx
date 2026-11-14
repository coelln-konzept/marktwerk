"use client";

import { Check, Info, TriangleAlert, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { Kbd } from "@/components/ui/kbd";
import { cn } from "@/lib/utils";
import { TOAST_MS, type ToastEntry, useShell } from "./shell-context";

/** After hover or focus has held a toast, it stays at least this long once let go. */
const MIN_LEFT_MS = 3000;
/** Default distance of the stack from the bottom edge (Tailwind `bottom-5`). */
const BOTTOM_PX = 20;
/** Footers of open sheets and side panels (step summary, "Weiter", "Speichern"), which toasts keep clear of. */
const FOOTERS = "[role=dialog] footer, aside footer";

/**
 * How far the stack has to move up so it does not cover the footer of an open sheet or drawer (UX-031):
 * a footer at the bottom edge that reaches into the middle band where the toasts sit.
 */
function footerClearance(): number {
  const height = window.innerHeight;
  const middle = window.innerWidth / 2;
  let lift = 0;
  for (const footer of document.querySelectorAll<HTMLElement>(FOOTERS)) {
    const box = footer.getBoundingClientRect();
    if (box.height === 0 || box.bottom < height - 24) continue;
    if (box.right < middle - 200 || box.left > middle + 200) continue;
    lift = Math.max(lift, height - box.top);
  }
  return lift;
}

/** Keeps `bottom` above sheet footers while toasts are shown (open/close of a sheet, resize). */
function useBottomOffset(active: boolean): number {
  const [bottom, setBottom] = useState(BOTTOM_PX);
  useEffect(() => {
    if (!active) return;
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const lift = footerClearance();
        setBottom(lift > 0 ? lift + 8 : BOTTOM_PX);
      });
    };
    measure();
    const observer = new MutationObserver(measure);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("resize", measure);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [active]);
  return bottom;
}

/**
 * Up to three toasts, bottom centre (above the footer of an open sheet), the newest at the bottom. Two
 * live regions that exist before anything is shown: successes and notes (polite) and errors
 * (`role="alert"`, red, stay until closed). Hovering or focusing a toast stops its clock; Strg+Z runs
 * the newest undo (see `shell-context.tsx`).
 */
export function ToastRegion() {
  const { toasts } = useShell();
  const t = useTranslations("toasts");
  const bottom = useBottomOffset(toasts.length > 0);
  const polite = toasts.filter((e) => e.toast.tone !== "error");
  const alerts = toasts.filter((e) => e.toast.tone === "error");
  // The toast Strg+Z would undo gets the key hint and `aria-keyshortcuts`.
  const undoId = toasts.findLast(
    (e) => e.toast.onAction && e.toast.actionLabel && e.toast.undoable !== false,
  )?.id;
  return (
    <section
      aria-label={t("region")}
      data-toast-region
      style={{ bottom }}
      className="pointer-events-none fixed inset-x-0 z-[60] flex flex-col items-center px-4"
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
  const box = useRef<HTMLDivElement>(null);
  // Where the focus came from (Tab, F6, a screen reader's jump), so closing the toast hands it back.
  const cameFrom = useRef<HTMLElement | null>(null);

  // The clock runs for successes and notes only, and not while the pointer or the focus is on the toast.
  useEffect(() => {
    if (error || paused) return;
    const started = Date.now();
    const timer = setTimeout(() => dismissToastById(entry.id), left.current);
    return () => {
      clearTimeout(timer);
      left.current = Math.max(MIN_LEFT_MS, left.current - (Date.now() - started));
    };
  }, [error, paused, entry.id, dismissToastById]);

  /** The toast is about to go: a focus inside it goes back where it came from, else to the page. */
  function handBackFocus() {
    if (!box.current?.contains(document.activeElement)) return;
    const back = cameFrom.current;
    const target =
      back?.isConnected && !back.closest("[data-toast-region]")
        ? back
        : document.getElementById("main");
    target?.focus({ preventScroll: true });
  }

  const hover = error ? "hover:bg-status-critical-dot/15" : "hover:bg-toast-foreground/15";
  const Icon = error ? TriangleAlert : toast.tone === "info" ? Info : Check;
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: hover/focus only pause the clock; Esc closes.
    <div
      ref={box}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={(event) => {
        const from = event.relatedTarget;
        if (from instanceof HTMLElement && !event.currentTarget.contains(from))
          cameFrom.current = from;
        setFocused(true);
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
      }}
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        // Esc closes this toast only, not the drawer or Vorschau behind it (they skip handled keys).
        event.preventDefault();
        event.stopPropagation();
        handBackFocus();
        dismissToastById(entry.id);
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
          // "Rückgängig: „Plakate“ erledigt", not "Rückgängig Strg Z" (UX-031).
          aria-label={t("action", { action: toast.actionLabel, what: toast.message })}
          aria-keyshortcuts={undoKey ? "Control+Z Meta+Z" : undefined}
          onClick={() => {
            handBackFocus();
            void runToastAction(entry.id);
          }}
          className={cn(
            "flex min-h-8 cursor-pointer items-center gap-2 whitespace-nowrap rounded-md px-2 font-semibold",
            error ? "underline" : "text-toast-action",
            hover,
          )}
        >
          {toast.actionLabel}
          {undoKey && (
            <Kbd
              aria-hidden
              className="inline border-current/30 bg-transparent text-current opacity-70 max-sm:hidden touch:hidden"
            >
              {t("undoKey")}
            </Kbd>
          )}
        </button>
      )}
      <button
        type="button"
        aria-label={t("close")}
        title={t("close")}
        onClick={() => {
          handBackFocus();
          dismissToastById(entry.id);
        }}
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
