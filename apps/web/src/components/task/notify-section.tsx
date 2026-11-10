"use client";

import { DEFAULT_TIME_ZONE } from "@marktwerk/core";
import { useLocale, useTranslations } from "next-intl";
import { useId, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import type { NotifyInput } from "@/server/services/tasks";
import { NotifyFields, type NotifyRecipient } from "./notify-fields";
import {
  type NotifyFormValue,
  notifyFormOf,
  notifyInputOf,
  notifyProblemOf,
  RELATIVE_TIMINGS,
} from "./notify-form";

/**
 * The drawer's "Benachrichtigung": the saved setting as one line ("Mail · 1 Tag vorher an Anna"), with
 * "Ändern" opening the same fields inline. Saving goes through `onSave` (the task's `updateTask`).
 */
export function NotifySection({
  saved,
  recipient,
  hasDue,
  canWrite,
  onSave,
  onEditingChange,
}: {
  saved: NotifyInput;
  recipient: NotifyRecipient | null;
  hasDue: boolean;
  canWrite: boolean;
  /** Saves; resolves to an error text on failure (the editor stays open and shows it) or null. */
  onSave: (next: NotifyInput) => Promise<string | null>;
  /** So the drawer's Esc handling knows there is an unsaved draft. */
  onEditingChange?: (editing: boolean) => void;
}) {
  const t = useTranslations("board.notify");
  const locale = useLocale();
  const errorId = useId();
  const [draft, setDraft] = useState<NotifyFormValue | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function edit(next: NotifyFormValue | null) {
    setDraft(next);
    setError(null);
    onEditingChange?.(next !== null);
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!draft) return;
    const problem = notifyProblemOf(draft, hasDue);
    if (problem) {
      setError(t(`errors.${problem}`));
      return;
    }
    const next = notifyInputOf(draft);
    startTransition(async () => {
      const failure = await onSave(next);
      if (failure) setError(failure);
      else edit(null);
    });
  }

  if (draft) {
    return (
      <form noValidate onSubmit={submit} className="flex flex-col gap-2">
        <NotifyFields
          value={draft}
          onChange={(next) => {
            setDraft(next);
            setError(null);
          }}
          recipient={recipient}
          hasDue={hasDue}
          disabled={pending}
          invalid={error !== null}
          describedBy={error ? errorId : undefined}
        />
        {error && (
          <p id={errorId} role="alert" className="text-small text-status-critical">
            {error}
          </p>
        )}
        <div className="flex gap-2">
          <Button type="submit" size="sm" variant="default" disabled={pending}>
            {t("save")}
          </Button>
          <Button type="button" size="sm" onClick={() => edit(null)}>
            {t("cancel")}
          </Button>
        </div>
      </form>
    );
  }

  const when = saved.timing
    ? saved.timing === "custom" && saved.at
      ? t("at", {
          date: new Intl.DateTimeFormat(locale, {
            timeZone: DEFAULT_TIME_ZONE,
            dateStyle: "medium",
            timeStyle: "short",
          }).format(new Date(saved.at)),
        })
      : t(`timing.${saved.timing}`)
    : null;
  const summary =
    saved.channels.length === 0 || !when
      ? t("none")
      : t(recipient?.kind === "self" ? "summarySelf" : recipient ? "summary" : "summaryNobody", {
          channels: saved.channels.map((c) => t(`channels.${c}`)).join(" + "),
          when,
          name: recipient?.kind === "person" ? recipient.name : "",
        });

  // A relative timing follows the due date: without one the saved setting cannot be sent.
  const needsDue =
    !hasDue &&
    saved.channels.length > 0 &&
    saved.timing !== null &&
    RELATIVE_TIMINGS.includes(saved.timing);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-small">{summary}</span>
      {needsDue && <span className="text-muted-foreground text-tiny">{t("needsDue")}</span>}
      {canWrite && (
        <Button size="sm" disabled={pending} onClick={() => edit(notifyFormOf(saved))}>
          {t("change")}
        </Button>
      )}
    </div>
  );
}
