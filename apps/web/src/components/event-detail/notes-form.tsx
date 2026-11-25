"use client";

import { Check, History } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useId, useState, useTransition } from "react";
import { saveNotes } from "@/app/(app)/veranstaltungen/[id]/actions";
import { useShell } from "@/components/shell/shell-context";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { TEXTAREA_CLASS } from "./textarea-class";

const MAX = 20_000;

/** Where an unsaved notes text waits in this browser tab (UX-002); gone once saved or discarded. */
const draftKey = (eventId: string) => `marktwerk:event-notes-draft:${eventId}`;

function readDraft(eventId: string): string | null {
  try {
    return window.sessionStorage.getItem(draftKey(eventId));
  } catch {
    return null; // storage blocked (private mode, settings): the guard below still warns
  }
}

function writeDraft(eventId: string, text: string | null) {
  try {
    if (text === null) window.sessionStorage.removeItem(draftKey(eventId));
    else window.sessionStorage.setItem(draftKey(eventId), text);
  } catch {
    // see readDraft
  }
}

/**
 * Notes editor for users with event:write: save button, "wird gespeichert…" while pending, toast after.
 * Unsaved text is never dropped silently (UX-002): it is kept as a draft in this browser tab, so switching
 * to another tab and back (or the Back button) brings it back with a note and "Verwerfen"; closing or
 * reloading the page while it is unsaved asks the browser's "Seite verlassen?" first.
 */
export function NotesForm({ eventId, notes }: { eventId: string; notes: string }) {
  const t = useTranslations("eventDetail.notes");
  const { showToast } = useShell();
  const [value, setValue] = useState(notes);
  const [saved, setSaved] = useState(notes);
  const [restored, setRestored] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  const id = useId();
  const dirty = value.trim() !== saved.trim();

  // A draft from an earlier visit comes back (after the first render, so server and client markup match).
  // biome-ignore lint/correctness/useExhaustiveDependencies: only on mount
  useEffect(() => {
    const draft = readDraft(eventId);
    if (draft === null) return;
    if (draft.trim() === notes.trim()) writeDraft(eventId, null);
    else {
      setValue(draft);
      setRestored(true);
    }
  }, []);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function change(text: string) {
    setValue(text);
    setJustSaved(false);
    writeDraft(eventId, text.trim() === saved.trim() ? null : text);
    if (text.trim() === saved.trim()) setRestored(false);
  }

  function discard() {
    setValue(saved);
    setRestored(false);
    setError(null);
    writeDraft(eventId, null);
  }

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
        setRestored(false);
        writeDraft(eventId, null);
        setJustSaved(true);
        showToast({ message: t("saved") });
      } catch {
        setError(t("failed"));
      }
    });
  }

  return (
    <form onSubmit={submit} className="flex max-w-[70ch] flex-col gap-3">
      <Label htmlFor={id} optional>
        {t("label")}
      </Label>
      {restored && dirty && (
        <div
          role="status"
          className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-status-info-bg px-3 py-2 text-small text-status-info"
        >
          <span className="inline-flex items-center gap-1.5">
            <History aria-hidden className="size-4 shrink-0" />
            {t("draftRestored")}
          </span>
          <button
            type="button"
            onClick={discard}
            className="cursor-pointer font-medium underline underline-offset-2 hover:no-underline"
          >
            {t("discard")}
          </button>
        </div>
      )}
      <textarea
        id={id}
        value={value}
        onChange={(e) => change(e.target.value)}
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
          ) : dirty ? (
            t("unsaved")
          ) : justSaved ? (
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
