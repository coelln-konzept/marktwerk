"use client";

import { CircleCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { saveJustificationAction } from "@/app/(app)/team/actions";
import { useShell } from "@/components/shell/shell-context";
import { Button } from "@/components/ui/button";
import { TEXTAREA_CLASS } from "../event-detail/textarea-class";

/**
 * "Begründung erfassen" (flow 4): why a Minijob person went over the monthly limit. The reason is kept
 * with the month and exported with the payroll CSV. Read-only once the month is locked.
 */
export function JustificationForm({
  staffMemberId,
  month,
  saved,
  canEdit,
  red,
}: {
  staffMemberId: string;
  /** "YYYY-MM-01" */
  month: string;
  saved: { reason: string; meta: string } | null;
  canEdit: boolean;
  /** The overrun is not allowed as "unforeseeable" any more (third month / above the ceiling). */
  red: boolean;
}) {
  const t = useTranslations("hours.justification");
  const tErr = useTranslations("hours.errors");
  const { showToast } = useShell();
  const [text, setText] = useState(saved?.reason ?? "");
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await saveJustificationAction(staffMemberId, month, text);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setEditing(false);
      showToast({ message: t("saved") });
    });
  }

  if (saved && !editing) {
    return (
      <div className="flex flex-col gap-1.5 rounded-lg border border-status-ok-dot bg-status-ok-bg p-3">
        <span className="inline-flex items-center gap-1.5 font-semibold text-status-ok text-tiny">
          <CircleCheck aria-hidden className="size-3.5" />
          {t("savedBy", { meta: saved.meta })}
        </span>
        <p className="m-0 whitespace-pre-line text-small">{saved.reason}</p>
        {canEdit && (
          <div>
            <Button size="sm" onClick={() => setEditing(true)}>
              {t("change")}
            </Button>
          </div>
        )}
      </div>
    );
  }
  if (!canEdit) return <p className="m-0 text-faint-foreground text-small">{t("missing")}</p>;

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <label htmlFor="justification" className="font-medium text-small">
        {t("label")}
      </label>
      <textarea
        id="justification"
        rows={3}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={red ? t("placeholderRed") : t("placeholder")}
        className={TEXTAREA_CLASS}
        aria-invalid={error !== null}
      />
      <span className="text-faint-foreground text-tiny">{t("hint")}</span>
      {error && (
        <p role="alert" className="m-0 text-small text-status-critical">
          {tErr.has(error as never) ? tErr(error as never) : tErr("generic")}
        </p>
      )}
      <div className="flex justify-end gap-2">
        {editing && (
          <Button disabled={pending} onClick={() => setEditing(false)}>
            {t("cancel")}
          </Button>
        )}
        <Button
          type="submit"
          variant="default"
          aria-busy={pending}
          disabled={pending || text.trim().length < 5}
        >
          {t("save")}
        </Button>
      </div>
    </form>
  );
}
