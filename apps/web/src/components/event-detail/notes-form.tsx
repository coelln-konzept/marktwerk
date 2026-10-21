"use client";

import { Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState, useTransition } from "react";
import { saveNotes } from "@/app/(app)/veranstaltungen/[id]/actions";
import { useShell } from "@/components/shell/shell-context";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { TEXTAREA_CLASS } from "./textarea-class";

const MAX = 20_000;

/** Notes editor for users with event:write: save button, "wird gespeichert…" while pending, toast after. */
export function NotesForm({ eventId, notes }: { eventId: string; notes: string }) {
  const t = useTranslations("eventDetail.notes");
  const { showToast } = useShell();
  const [value, setValue] = useState(notes);
  const [saved, setSaved] = useState(notes);
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  const id = useId();
  const dirty = value.trim() !== saved.trim();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!dirty) return;
    setError(null);
    startTransition(async () => {
      try {
        const result = await saveNotes(eventId, value);
        if (!result.ok) {
          setError(result.error === "notes_too_long" ? t("tooLong", { max: MAX }) : t("failed"));
          return;
        }
        setSaved(value);
        setJustSaved(true);
        showToast({ message: t("saved") });
      } catch {
        setError(t("failed"));
      }
    });
  }

  return (
    <form onSubmit={submit} className="flex max-w-[70ch] flex-col gap-3">
      <Label htmlFor={id}>{t("label")}</Label>
      <textarea
        id={id}
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setJustSaved(false);
        }}
        rows={12}
        maxLength={MAX}
        placeholder={t("placeholder")}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className={`${TEXTAREA_CLASS} min-h-40 resize-y leading-relaxed`}
      />
      {error && (
        <p id={`${id}-error`} role="alert" className="text-small text-status-critical">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="default" disabled={!dirty || pending} aria-busy={pending}>
          {t("save")}
        </Button>
        <span role="status" className="text-muted-foreground text-small">
          {pending ? (
            t("saving")
          ) : justSaved && !dirty ? (
            <span className="inline-flex items-center gap-1">
              <Check aria-hidden className="size-3.5" />
              {t("saved")}
            </span>
          ) : null}
        </span>
        <span className="tabular ml-auto text-faint-foreground text-tiny">
          {t("chars", { count: value.length })}
        </span>
      </div>
    </form>
  );
}
