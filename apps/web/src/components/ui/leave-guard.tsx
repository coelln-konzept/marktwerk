"use client";

import { TriangleAlert } from "lucide-react";
import { useEffect, useRef } from "react";
import { Button } from "./button";

/**
 * Unsaved input (UX-002): closing or reloading the tab with changes asks the browser's own question.
 * This is the documented exception to "undo instead of confirm": nothing was saved, so nothing can be
 * undone.
 */
export function useBeforeUnload(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);
}

/**
 * "Ungespeicherte Änderungen – Verwerfen / Weiter bearbeiten": shown inline where "Abbrechen" was
 * pressed on a form with changes. Focus moves to "Weiter bearbeiten", the safe choice.
 */
export function DiscardBar({
  message,
  discardLabel,
  keepLabel,
  onDiscard,
  onKeep,
}: {
  message: string;
  discardLabel: string;
  keepLabel: string;
  onDiscard: () => void;
  onKeep: () => void;
}) {
  const keep = useRef<HTMLButtonElement>(null);
  useEffect(() => keep.current?.focus(), []);
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center gap-3 rounded-lg border border-status-warn bg-status-warn-bg px-3 py-2 text-small"
    >
      <span className="flex min-w-0 flex-1 items-center gap-2 font-medium text-status-warn">
        <TriangleAlert aria-hidden className="size-4 shrink-0" />
        {message}
      </span>
      <span className="flex gap-2">
        <Button size="sm" onClick={onDiscard}>
          {discardLabel}
        </Button>
        <Button ref={keep} size="sm" variant="default" onClick={onKeep}>
          {keepLabel}
        </Button>
      </span>
    </div>
  );
}
