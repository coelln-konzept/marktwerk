"use client";

import { DEFAULT_TIME_ZONE } from "@marktwerk/core";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { NotifyInput } from "@/server/services/tasks";
import {
  type NotifyAssignee,
  NotifyFields,
  type NotifyFormValue,
  notifyFormOf,
  notifyInputOf,
  notifyProblemOf,
} from "./notify-fields";

/**
 * The drawer's "Benachrichtigung": the saved setting as one line ("Mail · 1 Tag vorher an Anna"), with
 * "Ändern" opening the same fields inline. Saving goes through `onSave` (the task's `updateTask`).
 */
export function NotifySection({
  saved,
  assignee,
  hasDue,
  canWrite,
  pending,
  onSave,
  onEditingChange,
}: {
  saved: NotifyInput;
  assignee: NotifyAssignee | null;
  hasDue: boolean;
  canWrite: boolean;
  pending: boolean;
  onSave: (next: NotifyInput) => void;
  /** So the drawer's Esc handling knows there is an unsaved draft. */
  onEditingChange?: (editing: boolean) => void;
}) {
  const t = useTranslations("board.notify");
  const locale = useLocale();
  const [draft, setDraft] = useState<NotifyFormValue | null>(null);
  const [error, setError] = useState<string | null>(null);

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
    onSave(notifyInputOf(draft));
    edit(null);
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
          assignee={assignee}
          hasDue={hasDue}
          disabled={pending}
          invalid={error !== null}
        />
        {error && (
          <p role="alert" className="text-small text-status-critical">
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
      : t(assignee ? "summary" : "summaryNobody", {
          channels: saved.channels.map((c) => t(`channels.${c}`)).join(" + "),
          when,
          name: assignee?.name ?? "",
        });

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-small">{summary}</span>
      {canWrite && (
        <Button size="sm" disabled={pending} onClick={() => edit(notifyFormOf(saved))}>
          {t("change")}
        </Button>
      )}
    </div>
  );
}
