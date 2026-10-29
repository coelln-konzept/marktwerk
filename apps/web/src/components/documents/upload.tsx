"use client";

import { DOCUMENT_ACCEPT, DOCUMENT_MAX_BYTES } from "@marktwerk/core";
import { Camera, Paperclip, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useId, useRef, useState } from "react";
import { useShell } from "@/components/shell/shell-context";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * Which record the files belong to: one of the link columns of `document` (see DOCUMENT_LINKS in
 * server/services/documents.ts), e.g. `{ installmentId }` or `{ eventId }`.
 */
export type DocumentUploadLink = Record<string, string>;

/**
 * Reusable upload control for receipts and other documents: choose a file, take a photo (phones open the
 * camera) or drop files. Posts to /api/documents one file at a time, shows progress and the reason when
 * a file is refused, and refreshes the page when done. Any module can use it by passing its link column.
 *
 * `compact` renders a small "Beleg" button for table rows; the default is a drop area. The photo button only
 * shows on touch screens (a desktop browser would just open a second file dialog).
 *
 * `kinds` adds a choice of document kind next to the buttons (labels from `documents.kinds`, the field
 * label from `kindLabel`); `kind` is then the preselected one.
 */
export function DocumentUpload({
  link,
  kind,
  kinds,
  kindLabel,
  compact = false,
  label,
  className,
}: {
  link: DocumentUploadLink;
  /** `document_kind` to store; omitted = receipt on a rate or expense, invoice on a payable. */
  kind?: string;
  /** Let the user pick the `document_kind` among these (the first one, or `kind`, is preselected). */
  kinds?: readonly string[];
  /** Label of the kind choice; needed with `kinds`. */
  kindLabel?: string;
  compact?: boolean;
  /** Replaces the default button text (for example the file's role: "Rechnung hinzufügen"). */
  label?: string;
  className?: string;
}) {
  const t = useTranslations("documents");
  const router = useRouter();
  const { showToast } = useShell();
  const uid = useId();
  const fileInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [pickedKind, setPickedKind] = useState(kind && kinds?.includes(kind) ? kind : kinds?.[0]);
  const sentKind = kinds ? pickedKind : kind;

  const errorText = (code: string) =>
    t.has(`errors.${code}` as never) ? t(`errors.${code}` as never) : t("errors.generic");

  async function send(files: File[]) {
    if (files.length === 0) return;
    setBusy(true);
    setError(null);
    let stored = 0;
    try {
      for (const file of files) {
        if (file.size > DOCUMENT_MAX_BYTES) {
          setError(`${file.name}: ${errorText("too_large")}`);
          continue;
        }
        const body = new FormData();
        body.set("file", file);
        body.set("link", JSON.stringify(link));
        if (sentKind) body.set("kind", sentKind);
        let response: Response;
        try {
          response = await fetch("/api/documents", { method: "POST", body });
        } catch {
          setError(`${file.name}: ${errorText("network")}`);
          break;
        }
        if (response.ok) {
          stored++;
          continue;
        }
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(`${file.name}: ${errorText(payload?.error ?? "generic")}`);
      }
    } finally {
      setBusy(false);
      for (const input of [fileInput.current, cameraInput.current]) if (input) input.value = "";
    }
    if (stored > 0) {
      showToast({ message: t("stored", { count: stored }) });
      router.refresh();
    }
  }

  const onPick = (event: React.ChangeEvent<HTMLInputElement>) =>
    send([...(event.target.files ?? [])]);

  const pickLabel = label ?? t("add");
  const inputs = (
    <>
      <input
        ref={fileInput}
        id={`${uid}-file`}
        type="file"
        accept={DOCUMENT_ACCEPT}
        multiple={!compact}
        className="sr-only"
        tabIndex={-1}
        onChange={onPick}
      />
      <input
        ref={cameraInput}
        id={`${uid}-camera`}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        tabIndex={-1}
        onChange={onPick}
      />
    </>
  );

  if (compact) {
    return (
      <span className={cn("inline-flex flex-col items-start gap-1", className)}>
        {inputs}
        <Button
          size="sm"
          variant="outline"
          aria-busy={busy}
          disabled={busy}
          onClick={() => fileInput.current?.click()}
        >
          <Paperclip aria-hidden />
          {busy ? t("saving") : pickLabel}
        </Button>
        {error && (
          <span role="alert" className="max-w-56 text-status-critical text-tiny">
            {error}
          </span>
        )}
      </span>
    );
  }

  return (
    <fieldset
      className={cn(
        "m-0 flex min-w-0 flex-col items-start gap-3 rounded-lg border border-dashed border-input p-3",
        dragging && "border-primary bg-selected",
        className,
      )}
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        send([...event.dataTransfer.files]);
      }}
    >
      <legend className="sr-only">{t("dropArea")}</legend>
      {inputs}
      <div className="flex flex-wrap items-center gap-2">
        <Button aria-busy={busy} disabled={busy} onClick={() => fileInput.current?.click()}>
          <Upload aria-hidden />
          {busy ? t("saving") : pickLabel}
        </Button>
        <Button
          aria-busy={busy}
          disabled={busy}
          onClick={() => cameraInput.current?.click()}
          className="hidden touch:inline-flex"
        >
          <Camera aria-hidden />
          {t("photo")}
        </Button>
        {kinds && kinds.length > 1 && (
          <div className="flex items-center gap-2">
            <Label htmlFor={`${uid}-kind`} className="font-normal text-muted-foreground">
              {kindLabel}
            </Label>
            <select
              id={`${uid}-kind`}
              value={pickedKind}
              onChange={(event) => setPickedKind(event.target.value)}
              className="min-h-(--control-h) rounded-lg border border-input bg-card px-3 py-1"
            >
              {kinds.map((key) => (
                <option key={key} value={key}>
                  {t(`kinds.${key}` as never)}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
      <p className="text-muted-foreground text-small">{t("hint")}</p>
      <p aria-live="polite" className="sr-only">
        {busy ? t("saving") : ""}
      </p>
      {error && (
        <p role="alert" className="text-small text-status-critical">
          {error}
        </p>
      )}
    </fieldset>
  );
}
