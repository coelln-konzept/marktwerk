"use client";

import { CircleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { DUE_MAX, DUE_MIN, type DueProblem, dueProblem } from "./drawer-logic";

/** Why the field's content is not saved: a date problem, or clearing it is not allowed here. */
type FieldProblem = DueProblem | "required";

type DueDateInputProps = {
  id?: string;
  /** `YYYY-MM-DD` or null. */
  value: string | null;
  /** A save is running: the same value is not sent twice (the field keeps its focus). */
  pending: boolean;
  /**
   * The new date, or null when the field was cleared. Resolves to false when the save failed: the field
   * then shows the saved value again instead of what was typed.
   */
  onCommit: (value: string | null) => Promise<boolean>;
  /**
   * Why the date may not be cleared (e.g. the notification is timed from it), shown at the field instead of
   * sending a save the server refuses. Null or absent: clearing saves "no due date".
   */
  clearBlocked?: string | null;
  className?: string;
  "aria-label"?: string;
};

/**
 * The due-date field of the task drawer (the task's own and each subtask's). A value is committed once:
 * when the field is left, on Enter, or after a second without typing (picking in the calendar never
 * blurs), not on every keystroke and not again while that save is still running. A cleared field saves
 * "no due date" (`null`, with undo) when it is left or on Enter. A half-typed or impossible date is never
 * dropped silently: it stays in the field with an error under it (UX-001).
 * The field starts over (saved value, no error) whenever the saved value changes, e.g. by an undo, and
 * when a save fails.
 */
export function DueDateInput(props: DueDateInputProps) {
  const [round, setRound] = useState(0);
  const refocus = useRef(false);
  return (
    <DueDateField
      key={`${props.value ?? "none"}:${round}`}
      {...props}
      takeFocus={() => {
        // Once: only the remount right after the failed save gets the focus back.
        const focus = refocus.current;
        refocus.current = false;
        return focus;
      }}
      onFailed={(hadFocus) => {
        refocus.current = hadFocus;
        setRound((r) => r + 1);
      }}
    />
  );
}

function DueDateField({
  id,
  value,
  pending,
  onCommit,
  clearBlocked,
  className,
  "aria-label": ariaLabel,
  takeFocus,
  onFailed,
}: DueDateInputProps & { takeFocus: () => boolean; onFailed: (hadFocus: boolean) => void }) {
  const t = useTranslations("tasks.dueField");
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const sent = useRef<string | null | undefined>(undefined);
  const field = useRef<HTMLInputElement>(null);
  const [problem, setProblem] = useState<FieldProblem | null>(null);
  const errorId = useId();
  useEffect(() => () => clearTimeout(timer.current), []);
  // biome-ignore lint/correctness/useExhaustiveDependencies: only when this field starts over after a failed save
  useEffect(() => {
    if (takeFocus()) field.current?.focus();
  }, []);

  /** `typing`: the pause timer fired; problems and clearing wait until the field is left. */
  function commit(input: HTMLInputElement, typing = false) {
    clearTimeout(timer.current);
    const found = dueProblem({ value: input.value, badInput: input.validity.badInput });
    if (found) {
      if (!typing) setProblem(found);
      return;
    }
    const next = input.value === "" ? null : input.value;
    if (next === null && clearBlocked) {
      if (!typing) setProblem("required");
      return;
    }
    setProblem(null);
    if (next === value) return;
    if (next === null && typing) return;
    if (pending && next === sent.current) return;
    sent.current = next;
    void onCommit(next).then((ok) => {
      if (!ok) onFailed(document.activeElement === input);
    });
  }

  return (
    <span className="inline-flex flex-col gap-1">
      <Input
        ref={field}
        id={id}
        type="date"
        aria-label={ariaLabel}
        min={DUE_MIN}
        max={DUE_MAX}
        defaultValue={value ?? ""}
        readOnly={pending}
        aria-busy={pending || undefined}
        aria-invalid={problem !== null || undefined}
        aria-describedby={problem ? errorId : undefined}
        className={cn("w-auto", className)}
        onChange={(e) => {
          clearTimeout(timer.current);
          const input = e.currentTarget;
          if (
            problem &&
            !dueProblem({ value: input.value, badInput: input.validity.badInput }) &&
            !(problem === "required" && input.value === "")
          )
            setProblem(null);
          timer.current = setTimeout(() => commit(input, true), 1000);
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
          {problem === "required" ? clearBlocked : t(problem)}
        </span>
      )}
    </span>
  );
}
