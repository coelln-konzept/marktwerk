"use client";

import { NEXT_TIME_NOTE_MAX, nextTimeNoteProblem } from "@marktwerk/core";
import { useTranslations } from "next-intl";
import { useId, useState, useTransition } from "react";
import {
  addNextTimeNoteAction,
  removeNextTimeNoteAction,
} from "@/app/(app)/next-time-notes-actions";
import { TEXTAREA_CLASS } from "@/components/event-detail/textarea-class";
import { useShell } from "@/components/shell/shell-context";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { callAction } from "@/lib/call-action";
import { cn } from "@/lib/utils";
import type { NextTimeNoteTarget } from "@/server/services/next-time-notes";

/** Shows the counter once the text gets close to the limit. */
const COUNTER_FROM = NEXT_TIME_NOTE_MAX - 100;

/** The error text for a service code (`empty`, `too_long`, `not_found`, `no_market`, anything else). */
export function useNoteErrorText() {
  const t = useTranslations("nextTimeNotes.errors");
  return (code: string) =>
    code === "empty" || code === "not_found" || code === "no_market"
      ? t(code)
      : code === "too_long"
        ? t("too_long", { max: NEXT_TIME_NOTE_MAX })
        : t("failed");
}

/**
 * "Neue Notiz fürs nächste Mal" (Fahrplan R25): a short text field and "Notieren". Saved against the market of
 * `target`; the toast offers "Rückgängig" (the author takes it back). Strg/⌘+Enter saves too.
 */
export function NextTimeNoteForm({
  target,
  autoFocus,
  hint,
  onSaved,
  onCancel,
  className,
}: {
  target: NextTimeNoteTarget;
  autoFocus?: boolean;
  /** A line under the field (the task drawer names the market). */
  hint?: string;
  onSaved?: () => void;
  /** Shows "Abbrechen" (the task drawer closes the form). */
  onCancel?: () => void;
  className?: string;
}) {
  const t = useTranslations("nextTimeNotes");
  const errorText = useNoteErrorText();
  const { showToast, showError } = useShell();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const id = useId();
  const length = [...value.trim()].length;

  function submit() {
    const problem = nextTimeNoteProblem(value);
    if (problem) {
      setError(errorText(problem));
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await callAction(() => addNextTimeNoteAction(target, value));
      if (!result.ok) {
        setError(errorText(result.error));
        return;
      }
      setValue("");
      onSaved?.();
      const noteId = result.data.id;
      showToast({
        message: t("toast.added"),
        actionLabel: t("toast.undo"),
        onAction: async () => {
          const undone = await callAction(() => removeNextTimeNoteAction(noteId));
          if (undone.ok) showToast({ message: t("toast.removed") });
          else showError(errorText(undone.error));
        },
      });
    });
  }

  const describedBy = [error ? `${id}-error` : null, hint ? `${id}-hint` : null]
    .filter(Boolean)
    .join(" ");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className={cn("flex flex-col gap-2", className)}
    >
      <Label htmlFor={id}>{t("label")}</Label>
      <textarea
        id={id}
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          if (error) setError(null);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            submit();
          } else if (e.key === "Escape" && onCancel) {
            // Esc closes the inline form, not the drawer around it (the drawer skips handled keys).
            e.preventDefault();
            e.stopPropagation();
            onCancel();
          }
        }}
        // biome-ignore lint/a11y/noAutofocus: opened on purpose by "Fürs nächste Mal notieren"
        autoFocus={autoFocus}
        rows={2}
        maxLength={NEXT_TIME_NOTE_MAX}
        placeholder={t("placeholder")}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        className={`${TEXTAREA_CLASS} min-h-16 resize-y leading-relaxed`}
      />
      {hint && (
        <p id={`${id}-hint`} className="m-0 text-muted-foreground text-small">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} role="alert" className="m-0 text-small text-status-critical">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" variant="default" disabled={pending} aria-busy={pending}>
          {t("add")}
        </Button>
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel}>
            {t("drawer.cancel")}
          </Button>
        )}
        <span role="status" className="text-muted-foreground text-small">
          {pending ? t("saving") : null}
        </span>
        {length >= COUNTER_FROM && (
          <span className="tabular ml-auto text-faint-foreground text-tiny">
            {t("chars", { count: length, max: NEXT_TIME_NOTE_MAX })}
          </span>
        )}
      </div>
    </form>
  );
}
