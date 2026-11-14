"use client";

import { CircleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { DUE_MAX, DUE_MIN, type DueProblem, dueProblem } from "./drawer-logic";

/**
 * The due-date field of the task drawer (the task's own and each subtask's). A value is committed once:
 * when the field is left, on Enter, or after a second without typing (picking in the calendar never
 * blurs), not on every keystroke and not again while that save is still running. A cleared field saves
 * "no due date" (`null`, with undo) when it is left or on Enter. A half-typed or impossible date is never
 * dropped silently: it stays in the field with an error under it (UX-001).
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
  /** A save is running: the same value is not sent twice (the field keeps its focus). */
  pending: boolean;
  /** The new date, or null when the field was cleared. */
  onCommit: (value: string | null) => void;
  className?: string;
  "aria-label"?: string;
}) {
  const t = useTranslations("tasks.dueField");
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const sent = useRef<string | null | undefined>(undefined);
  const [problem, setProblem] = useState<DueProblem | null>(null);
  const errorId = useId();
  useEffect(() => () => clearTimeout(timer.current), []);

  /** `typing`: the pause timer fired; problems and clearing wait until the field is left. */
  function commit(field: HTMLInputElement, typing = false) {
    clearTimeout(timer.current);
    const found = dueProblem({ value: field.value, badInput: field.validity.badInput });
    if (found) {
      if (!typing) setProblem(found);
      return;
    }
    setProblem(null);
    const next = field.value === "" ? null : field.value;
    if (next === value) return;
    if (next === null && typing) return;
    if (pending && next === sent.current) return;
    sent.current = next;
    onCommit(next);
  }

  return (
    <span className="inline-flex flex-col gap-1">
      <Input
        id={id}
        type="date"
        aria-label={ariaLabel}
        min={DUE_MIN}
        max={DUE_MAX}
        defaultValue={value ?? ""}
        // A saved (or reverted) date starts the field over.
        key={value ?? "none"}
        readOnly={pending}
        aria-busy={pending || undefined}
        aria-invalid={problem !== null || undefined}
        aria-describedby={problem ? errorId : undefined}
        className={cn("w-auto", className)}
        onChange={(e) => {
          clearTimeout(timer.current);
          const field = e.currentTarget;
          if (problem && !dueProblem({ value: field.value, badInput: field.validity.badInput }))
            setProblem(null);
          timer.current = setTimeout(() => commit(field, true), 1000);
        }}
        onBlur={(e) => commit(e.currentTarget)}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit(e.currentTarget);
        }}
      />
      {problem && (
        <span
          id={errorId}
          role="alert"
          className="flex items-start gap-1.5 text-status-critical text-tiny"
        >
          <CircleAlert aria-hidden className="mt-px size-3.5 shrink-0" />
          {t(problem)}
        </span>
      )}
    </span>
  );
}
