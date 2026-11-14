"use client";

import { Pencil } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState, useTransition } from "react";
import { useShell } from "@/components/shell/shell-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { NativeSelect } from "@/components/ui/native-select";
import { updateDocumentAction } from "./actions";

/** The kinds a person can choose for a file (an e-invoice stays XML and is not offered). */
export const EDITABLE_DOCUMENT_KINDS = [
  "permit",
  "contract",
  "invoice",
  "receipt",
  "photo",
  "export",
  "other",
] as const;

/**
 * "Bearbeiten" next to a document: name, description and kind in a short dialog. The file itself stays
 * as it is; the extension is kept by the service.
 */
export function EditDocumentButton({
  id,
  fileName,
  caption,
  kind,
}: {
  id: string;
  fileName: string;
  caption: string | null;
  kind: string;
}) {
  const t = useTranslations("documents");
  const { showToast, showError } = useShell();
  const uid = useId();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const kindEditable = kind !== "e_invoice_xml";

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError(null);
    startTransition(async () => {
      const result = await updateDocumentAction(id, {
        fileName: String(form.get("fileName") ?? ""),
        caption: String(form.get("caption") ?? ""),
        ...(kindEditable ? { kind: String(form.get("kind") ?? kind) } : {}),
      });
      if (!result.ok) {
        const text = t.has(`errors.${result.error}` as never)
          ? t(`errors.${result.error}` as never)
          : t("toast.failed");
        if (result.error === "empty_name" || result.error === "too_long") setError(text);
        else showError(text);
        return;
      }
      setOpen(false);
      showToast({ message: t("toast.saved", { name: result.data.fileName }) });
    });
  }

  return (
    <>
      <button
        type="button"
        aria-label={t("edit.open", { name: fileName })}
        title={t("edit.open", { name: fileName })}
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
        className="grid size-7 cursor-pointer place-items-center rounded-md text-muted-foreground hover:bg-hover hover:text-foreground touch:size-11"
      >
        <Pencil aria-hidden className="size-3.5" />
      </button>
      <Modal
        open={open}
        onOpenChange={setOpen}
        title={t("edit.title")}
        closeLabel={t("edit.cancel")}
      >
        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${uid}-name`}>{t("edit.name")}</Label>
            <Input
              id={`${uid}-name`}
              name="fileName"
              defaultValue={fileName}
              required
              maxLength={150}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? `${uid}-error` : undefined}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${uid}-caption`}>{t("edit.caption")}</Label>
            <textarea
              id={`${uid}-caption`}
              name="caption"
              defaultValue={caption ?? ""}
              maxLength={500}
              rows={3}
              placeholder={t("edit.captionPlaceholder")}
              className="w-full min-w-0 rounded-lg border border-input bg-card px-3 py-2 text-foreground placeholder:text-faint-foreground focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-1"
            />
          </div>
          {kindEditable && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${uid}-kind`}>{t("edit.kind")}</Label>
              <NativeSelect
                id={`${uid}-kind`}
                name="kind"
                defaultValue={kind}
                wrapperClassName="w-full"
              >
                {EDITABLE_DOCUMENT_KINDS.map((key) => (
                  <option key={key} value={key}>
                    {t(`kinds.${key}`)}
                  </option>
                ))}
              </NativeSelect>
            </div>
          )}
          {error && (
            <p id={`${uid}-error`} role="alert" className="text-small text-status-critical">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {t("edit.cancel")}
            </Button>
            <Button type="submit" disabled={pending} aria-busy={pending}>
              {pending ? t("saving") : t("edit.save")}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
