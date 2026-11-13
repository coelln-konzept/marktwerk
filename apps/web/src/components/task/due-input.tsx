"use client";

import { useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * The due-date field of the task drawer (the task's own and each subtask's). A value is committed once:
 * when the field is left, on Enter, or after a second without typing (picking in the calendar never
 * blurs), not on every keystroke and not again while that save is still running. Clearing is not offered.
 */
export function DueDateInput({
  id,
  value,
  pending,
  onCommit,
  className,
  "aria-label": ariaLabel,
}: {
  id?: string;
  /** `YYYY-MM-DD` or null. */
  value: string | null;
  /** A save is running: the field is disabled and the same value is not sent twice. */
  pending: boolean;
  onCommit: (value: string) => void;
  className?: string;
  "aria-label"?: string;
}) {
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const sent = useRef<string | null>(null);
  useEffect(() => () => clearTimeout(timer.current), []);

  function commit(next: string) {
    clearTimeout(timer.current);
    if (next === "" || next === (value ?? "")) return;
    if (pending && next === sent.current) return;
    sent.current = next;
    onCommit(next);
  }

  return (
    <Input
      id={id}
      type="date"
      aria-label={ariaLabel}
      defaultValue={value ?? ""}
      // A saved (or reverted) date starts the field over.
      key={value ?? "none"}
      disabled={pending}
      className={cn("w-auto", className)}
      onChange={(e) => {
        clearTimeout(timer.current);
        const next = e.target.value;
        timer.current = setTimeout(() => commit(next), 1000);
      }}
      onBlur={(e) => commit(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit(e.currentTarget.value);
      }}
    />
  );
}
