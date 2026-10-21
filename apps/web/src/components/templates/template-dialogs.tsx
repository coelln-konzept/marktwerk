"use client";

import { Archive, Pencil, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import {
  archiveTemplateAction,
  createTemplateAction,
  updateTemplateAction,
} from "@/app/(app)/vorlagen/ablauf/actions";
import { TEXTAREA_CLASS } from "@/components/event-detail/textarea-class";
import { useShell } from "@/components/shell/shell-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";

const SELECT_CLASS =
  "flex min-h-(--control-h) w-full rounded-lg border border-input bg-card px-3 py-1 text-foreground focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-1 aria-invalid:border-destructive";

type TypeChoice = { id: string; nameDe: string; nameEn: string };

type Values = { name: string; description: string; eventTypeId: string };

function TemplateForm({
  initial,
  types,
  submitLabel,
  pending,
  error,
  onSubmit,
  onCancel,
}: {
  initial: Values;
  types: TypeChoice[];
  submitLabel: string;
  pending: boolean;
  error: { text: string; field?: string } | null;
  onSubmit: (values: Values) => void;
  onCancel: () => void;
}) {
  const t = useTranslations("taskTemplates.form");
  const locale = useLocale();
  const [values, setValues] = useState(initial);
  const set = (patch: Partial<Values>) => setValues((v) => ({ ...v, ...patch }));
  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(values);
      }}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="tpl-name">{t("name")}</Label>
        <Input
          id="tpl-name"
          value={values.name}
          maxLength={120}
          autoFocus
          aria-invalid={error?.field === "name"}
          onChange={(e) => set({ name: e.target.value })}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="tpl-type">{t("type")}</Label>
        <select
          id="tpl-type"
          className={SELECT_CLASS}
          value={values.eventTypeId}
          aria-invalid={error?.field === "type"}
          onChange={(e) => set({ eventTypeId: e.target.value })}
        >
          <option value="">{t("anyType")}</option>
          {types.map((type) => (
            <option key={type.id} value={type.id}>
              {locale === "en" ? type.nameEn : type.nameDe}
            </option>
          ))}
        </select>
        <p className="text-muted-foreground text-tiny">{t("typeHint")}</p>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="tpl-description">{t("description")}</Label>
        <textarea
          id="tpl-description"
          rows={3}
          className={TEXTAREA_CLASS}
          value={values.description}
          maxLength={1000}
          aria-invalid={error?.field === "description"}
          onChange={(e) => set({ description: e.target.value })}
        />
      </div>
      {error && (
        <p role="alert" className="text-small text-status-critical">
          {error.text}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button disabled={pending} onClick={onCancel}>
          {t("cancel")}
        </Button>
        <Button type="submit" variant="default" aria-busy={pending} disabled={pending}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

function useErrorText() {
  const t = useTranslations("taskTemplates");
  return (code: string) =>
    t.has(`errors.${code}` as never) ? t(`errors.${code}` as never) : t("errors.generic");
}

/** "Neue Ablaufvorlage": a modal (three fields); the editor opens with an empty draft. */
export function NewTemplateButton({ types }: { types: TypeChoice[] }) {
  const t = useTranslations("taskTemplates");
  const router = useRouter();
  const { showToast } = useShell();
  const errorText = useErrorText();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<{ text: string; field?: string } | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <>
      <Button variant="default" onClick={() => setOpen(true)}>
        <Plus aria-hidden />
        {t("list.new")}
      </Button>
      <Modal
        open={open}
        onOpenChange={(next) => !pending && setOpen(next)}
        title={t("form.newTitle")}
        description={t("form.newDescription")}
        closeLabel={t("form.cancel")}
      >
        <TemplateForm
          initial={{ name: "", description: "", eventTypeId: "" }}
          types={types}
          submitLabel={t("form.create")}
          pending={pending}
          error={error}
          onCancel={() => setOpen(false)}
          onSubmit={(values) => {
            setError(null);
            startTransition(async () => {
              const result = await createTemplateAction({
                name: values.name,
                description: values.description,
                eventTypeId: values.eventTypeId || null,
              });
              if (!result.ok) {
                setError({ text: errorText(result.error), field: result.field });
                return;
              }
              setOpen(false);
              showToast({ message: t("form.created") });
              router.push(`/vorlagen/ablauf/${result.data.id}` as never);
            });
          }}
        />
      </Modal>
    </>
  );
}

/** "Einstellungen" of a template: name, type, description, and archiving (undo toast). */
export function TemplateSettingsButton({
  template,
  types,
}: {
  template: { id: string; name: string; description: string | null; eventTypeId: string | null };
  types: TypeChoice[];
}) {
  const t = useTranslations("taskTemplates");
  const router = useRouter();
  const { showToast } = useShell();
  const errorText = useErrorText();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<{ text: string; field?: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function archive() {
    startTransition(async () => {
      const result = await archiveTemplateAction(template.id, true);
      if (!result.ok) {
        setError({ text: errorText(result.error) });
        return;
      }
      setOpen(false);
      router.push("/vorlagen/ablauf" as never);
      showToast({
        message: t("form.archived", { name: template.name }),
        actionLabel: t("form.undo"),
        onAction: async () => {
          const undone = await archiveTemplateAction(template.id, false);
          showToast({
            message: undone.ok
              ? t("form.restored", { name: template.name })
              : errorText(undone.error),
          });
        },
      });
    });
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Pencil aria-hidden />
        {t("form.edit")}
      </Button>
      <Modal
        open={open}
        onOpenChange={(next) => !pending && setOpen(next)}
        title={t("form.editTitle")}
        closeLabel={t("form.cancel")}
      >
        <TemplateForm
          initial={{
            name: template.name,
            description: template.description ?? "",
            eventTypeId: template.eventTypeId ?? "",
          }}
          types={types}
          submitLabel={t("form.save")}
          pending={pending}
          error={error}
          onCancel={() => setOpen(false)}
          onSubmit={(values) => {
            setError(null);
            startTransition(async () => {
              const result = await updateTemplateAction(template.id, {
                name: values.name,
                description: values.description,
                eventTypeId: values.eventTypeId || null,
              });
              if (!result.ok) {
                setError({ text: errorText(result.error), field: result.field });
                return;
              }
              setOpen(false);
              showToast({
                message: result.data.changed ? t("form.saved") : t("form.unchanged"),
              });
            });
          }}
        />
        <div className="border-border-subtle border-t pt-3">
          <Button variant="ghost" disabled={pending} onClick={archive}>
            <Archive aria-hidden />
            {t("form.archive")}
          </Button>
          <p className="mt-1 text-muted-foreground text-tiny">{t("form.archiveHint")}</p>
        </div>
      </Modal>
    </>
  );
}
