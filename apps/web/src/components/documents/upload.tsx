"use client";

import { DOCUMENT_ACCEPT, DOCUMENT_MAX_BYTES } from "@marktwerk/core";
import { Camera, CircleAlert, Paperclip, Upload, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useId, useRef, useState } from "react";
import { useShell } from "@/components/shell/shell-context";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { documentErrorText } from "./error-text";

/**
 * Which record the files belong to: one of the link columns of `document` (see DOCUMENT_LINKS in
 * server/services/documents.ts), e.g. `{ installmentId }` or `{ eventId }`.
 */
export type DocumentUploadLink = Record<string, string>;

/** One refused file of the last upload: its name and why. */
type Failure = { key: string; name: string; message: string };

/** The file being sent: which of how many, and how much of it is through. */
type Progress = { index: number; count: number; name: string; percent: number };

type Answer = { status: number; payload: { error?: string; existing?: string } | null };

/**
 * POST with upload progress (fetch has none). Rejects with "network" when the connection fails and with
 * "aborted" when `Abbrechen` stops it.
 */
function post(
  body: FormData,
  onProgress: (percent: number) => void,
  register: (xhr: XMLHttpRequest | null) => void,
): Promise<Answer> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    register(xhr);
    xhr.open("POST", "/api/documents");
    xhr.responseType = "json";
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onload = () => {
      register(null);
      resolve({ status: xhr.status, payload: xhr.response as Answer["payload"] });
    };
    xhr.onerror = () => {
      register(null);
      reject(new Error("network"));
    };
    xhr.onabort = () => {
      register(null);
      reject(new Error("aborted"));
    };
    xhr.send(body);
  });
}

/**
 * Reusable upload control for receipts and other documents: choose a file, take a photo (phones open the
 * camera) or drop files. Posts to /api/documents one file at a time with a progress bar and "Abbrechen",
 * lists every refused file with its reason (the list stays until closed), and refreshes the page when done.
 * Any module can use it by passing its link column.
 *
 * `compact` renders a small "Beleg" button for table rows; the default is a drop area. The photo button only
 * shows on touch screens (a desktop browser would just open a second file dialog).
 *
 * `kinds` adds a choice of document kind next to the buttons (labels from `documents.kinds`, the field
 * label from `kindLabel`); `kind` is then the preselected one, and the choice goes back to it after each
 * upload, so the next file does not silently get the last file's kind.
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
  const current = useRef<XMLHttpRequest | null>(null);
  const cancelled = useRef(false);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [failures, setFailures] = useState<Failure[]>([]);
  const [dragging, setDragging] = useState(false);
  const initialKind = kind && kinds?.includes(kind) ? kind : kinds?.[0];
  const [pickedKind, setPickedKind] = useState(initialKind);
  const sentKind = kinds ? pickedKind : kind;
  const busy = progress !== null;

  const errorText = (code: string, existing?: string) => documentErrorText(t, code, existing);

  async function send(files: File[]) {
    if (files.length === 0 || busy) return;
    cancelled.current = false;
    setFailures([]);
    const failed: Failure[] = [];
    let stored = 0;
    try {
      for (const [index, file] of files.entries()) {
        if (cancelled.current) break;
        setProgress({ index: index + 1, count: files.length, name: file.name, percent: 0 });
        if (file.size > DOCUMENT_MAX_BYTES) {
          failed.push({ key: `${index}`, name: file.name, message: errorText("too_large") });
          continue;
        }
        const body = new FormData();
        body.set("file", file);
        body.set("link", JSON.stringify(link));
        if (sentKind) body.set("kind", sentKind);
        let answer: Answer;
        try {
          answer = await post(
            body,
            (percent) =>
              setProgress({ index: index + 1, count: files.length, name: file.name, percent }),
            (xhr) => {
              current.current = xhr;
            },
          );
        } catch (error) {
          if ((error as Error).message === "aborted") break;
          // Offline: the files after this one would fail the same way.
          for (const [offset, rest] of files.slice(index).entries())
            failed.push({
              key: `${index + offset}`,
              name: rest.name,
              message: errorText("network"),
            });
          break;
        }
        if (answer.status >= 200 && answer.status < 300) {
          stored++;
          continue;
        }
        failed.push({
          key: `${index}`,
          name: file.name,
          message: errorText(answer.payload?.error ?? "generic", answer.payload?.existing),
        });
      }
    } finally {
      current.current = null;
      setProgress(null);
      for (const input of [fileInput.current, cameraInput.current]) if (input) input.value = "";
    }
    setFailures(failed);
    if (stored > 0 && failed.length > 0)
      showToast({ message: t("storedSome", { stored, failed: failed.length }) });
    else if (stored > 0) showToast({ message: t("stored", { count: stored }) });
    else if (cancelled.current) showToast({ message: t("cancelled") });
    if (stored > 0) {
      setPickedKind(initialKind);
      router.refresh();
    }
  }

  function cancel() {
    cancelled.current = true;
    current.current?.abort();
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
        aria-label={pickLabel}
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
        aria-label={t("photo")}
        accept="image/*"
        capture="environment"
        className="sr-only"
        tabIndex={-1}
        onChange={onPick}
      />
    </>
  );

  // In a table cell (`compact`) everything stays as narrow as the button row, so the table does not widen.
  const progressView = progress && (
    <div
      className={cn("flex min-w-0 flex-col gap-1", compact ? "w-40 max-w-full" : "w-full max-w-96")}
    >
      <div
        className={cn(
          "flex items-center justify-between gap-2",
          compact ? "text-tiny" : "text-small",
        )}
      >
        <span className="min-w-0 truncate text-muted-foreground">
          {progress.count > 1
            ? t("progressOf", {
                index: progress.index,
                count: progress.count,
                name: progress.name,
              })
            : progress.name}
        </span>
        <span className="tabular shrink-0 text-muted-foreground">{progress.percent} %</span>
      </div>
      <progress
        max={100}
        value={progress.percent}
        aria-label={t("progressLabel", { name: progress.name })}
        className="h-1.5 w-full overflow-hidden rounded-full [&::-moz-progress-bar]:bg-primary [&::-webkit-progress-bar]:bg-sunken [&::-webkit-progress-value]:bg-primary"
      />
    </div>
  );

  const cancelButton =
    busy &&
    (compact ? (
      <Button
        size="icon-sm"
        variant="outline"
        onClick={cancel}
        aria-label={t("cancel")}
        title={t("cancel")}
      >
        <X aria-hidden />
      </Button>
    ) : (
      <Button size="sm" variant="outline" onClick={cancel}>
        <X aria-hidden />
        {t("cancel")}
      </Button>
    ));

  const dismissButton = (
    <button
      type="button"
      onClick={() => setFailures([])}
      aria-label={t("dismissErrors")}
      title={t("dismissErrors")}
      className={cn(
        "grid shrink-0 cursor-pointer place-items-center rounded-md text-muted-foreground hover:bg-hover hover:text-foreground touch:size-11",
        compact ? "size-5" : "size-7",
      )}
    >
      <X aria-hidden className={compact ? "size-3.5" : "size-4"} />
    </button>
  );

  // `compact` takes one file at a time: its reason as a narrow line under the button, no box.
  const compactFailure = compact && failures.length > 0 && (
    <span role="alert" className="inline-flex max-w-56 items-start gap-1 text-tiny">
      <span className="min-w-0 break-words text-status-critical">
        {failures.map((f) => f.message).join(" ")}
      </span>
      {dismissButton}
    </span>
  );

  const failureList = !compact && failures.length > 0 && (
    <div
      role="alert"
      className="flex w-full min-w-0 max-w-xl items-start gap-2 rounded-lg border border-status-critical-dot/30 bg-status-critical-bg/40 p-2.5 text-small"
    >
      <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-status-critical" />
      <div className="min-w-0 flex-1">
        <p className="font-medium text-status-critical">
          {t("failedTitle", { count: failures.length })}
        </p>
        <ul className="m-0 mt-1 flex list-none flex-col gap-0.5 p-0">
          {failures.map((f) => (
            <li key={f.key} className="break-words">
              <span className="font-medium">{f.name}</span>: {f.message}
            </li>
          ))}
        </ul>
      </div>
      {dismissButton}
    </div>
  );

  if (compact) {
    return (
      <span className={cn("inline-flex flex-col items-start gap-1", className)}>
        {inputs}
        <span className="inline-flex items-center gap-1">
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
          {cancelButton}
        </span>
        {progressView}
        {compactFailure}
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
        {cancelButton}
        {kinds && kinds.length > 1 && (
          <div className="flex items-center gap-2">
            <Label htmlFor={`${uid}-kind`} className="font-normal text-muted-foreground">
              {kindLabel}
            </Label>
            <select
              id={`${uid}-kind`}
              value={pickedKind}
              disabled={busy}
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
      {progressView}
      <p className="text-muted-foreground text-small">{t("hint")}</p>
      <p aria-live="polite" className="sr-only">
        {busy ? t("saving") : ""}
      </p>
      {failureList}
    </fieldset>
  );
}
