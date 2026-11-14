"use client";

import { TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { guardedTarget } from "./unsaved-target";

/**
 * Unsaved-changes guard for a long form (UX-002; the one exception to "undo instead of confirm": nothing
 * is saved yet, so there is nothing to undo). While `dirty`, a click on an in-app link (tabs, sidebar,
 * breadcrumbs) is held and `pendingHref` is set, so the form can show an {@link UnsavedBar}; reloading or
 * closing the tab gets the browser's own prompt. Programmatic navigation (Strg+K, router.push) and the
 * browser's back button are not caught.
 */
export function useUnsavedGuard(dirty: boolean) {
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  useEffect(() => {
    if (!dirty) return;
    function onBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      // Older browsers need a return value to show the prompt.
      event.returnValue = "";
    }
    function onClick(event: MouseEvent) {
      if (event.defaultPrevented) return;
      const anchor = (event.target as Element | null)?.closest?.("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      const href = guardedTarget(anchor, event, window.location);
      if (!href) return;
      // Capture phase on the document: runs before next/link's handler, which then never sees the click.
      event.preventDefault();
      event.stopPropagation();
      setPendingHref(href);
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [dirty]);

  // Saved or reset in the meantime: nothing to ask any more.
  useEffect(() => {
    if (!dirty) setPendingHref(null);
  }, [dirty]);

  return { pendingHref, clear: () => setPendingHref(null) };
}

/**
 * The bar that asks what to do with unsaved changes when the user tried to leave: "Verwerfen" follows
 * the held link, "Weiter bearbeiten" (also Esc) stays. Focus moves into the bar when it appears.
 */
export function UnsavedBar({
  href,
  message,
  discardLabel,
  keepLabel,
  onKeep,
}: {
  href: string;
  message: string;
  discardLabel: string;
  keepLabel: string;
  onKeep: () => void;
}) {
  const router = useRouter();
  const keepRef = useRef<HTMLButtonElement>(null);
  const onKeepRef = useRef(onKeep);
  onKeepRef.current = onKeep;

  useEffect(() => {
    keepRef.current?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      onKeepRef.current();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div
      role="alertdialog"
      aria-modal="false"
      aria-labelledby="unsaved-bar-message"
      className="fixed inset-x-4 bottom-4 z-40 mx-auto flex max-w-2xl flex-wrap items-center gap-3 rounded-xl border border-status-warn bg-popover px-4 py-3 shadow-overlay"
    >
      <TriangleAlert aria-hidden className="size-4 shrink-0 text-status-warn" />
      <p id="unsaved-bar-message" className="m-0 min-w-0 flex-1 font-medium">
        {message}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => router.push(href as never)}>{discardLabel}</Button>
        <Button ref={keepRef} variant="default" onClick={onKeep}>
          {keepLabel}
        </Button>
      </div>
    </div>
  );
}
