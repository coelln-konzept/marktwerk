"use client";

import { ExternalLink, Lightbulb } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useId, useMemo, useState, useTransition } from "react";
import { loadTaskContactOptions } from "@/app/(app)/board/actions";
import { ContactKindBadge } from "@/components/catalogue/kinds";
import { ContactPicker } from "@/components/contacts/contact-picker";
import { ContactReach } from "@/components/contacts/contact-reach";
import { useShell } from "@/components/shell/shell-context";
import { Button } from "@/components/ui/button";
import type { RecordPickerOption } from "@/components/ui/record-picker";
import { callAction } from "@/lib/call-action";
import type { TaskContact, TaskContactInfo } from "@/server/queries/task-contact";

type Options = { options: RecordPickerOption[]; canCreate: boolean };

/**
 * "Kontakt" in the task drawer (Fahrplan R24, gap G7): the contact the task is about, with Anrufen / E-Mail
 * (44 px on phones) and a link into Kontakte. Without one: "Vorschlag: …" from the task's context (the permit's
 * Behörde, the Ort's owner …) with one click to take it, or "Kontakt wählen". Set, change and remove go through
 * `onSet` (the drawer saves with undo). The picker's contacts load when it opens; "+ Neu" creates one in place
 * for those who may write contacts. Renders nothing for someone without `contact` read.
 */
export function TaskContactSection({
  info,
  writable,
  onSet,
  onPickingChange,
}: {
  info: TaskContactInfo;
  writable: boolean;
  /** Saves the new contact (null = remove); resolves to whether it was saved. */
  onSet: (contactId: string | null, name: string | null) => Promise<boolean>;
  onPickingChange?: (picking: boolean) => void;
}) {
  const t = useTranslations("tasks.contact");
  const tKinds = useTranslations("contacts.kinds");
  const tErrors = useTranslations("errors");
  const { showError: onError } = useShell();
  const uid = useId();
  const [picking, setPicking] = useState(false);
  const [options, setOptions] = useState<Options | null>(null);
  const [loading, startLoading] = useTransition();
  const [saving, setSaving] = useState(false);

  useEffect(() => onPickingChange?.(picking), [picking, onPickingChange]);
  // The picker's input takes the focus as soon as its options are there.
  useEffect(() => {
    if (picking && options) document.getElementById(`${uid}-picker`)?.focus();
  }, [picking, options, uid]);

  const nameOf = useMemo(() => {
    const map = new Map(options?.options.map((o) => [o.id, o.label]) ?? []);
    return (id: string) => map.get(id) ?? null;
  }, [options]);

  if (!info.visible) return null;
  const { contact, suggestion } = info;

  function startPicking() {
    setPicking(true);
    if (options) return;
    startLoading(async () => {
      const result = await callAction(() => loadTaskContactOptions());
      if (!result.ok) {
        setPicking(false);
        onError(tErrors("network"));
        return;
      }
      setOptions({
        options: result.data.options.map((c) => ({
          id: c.id,
          label: c.name,
          hint: [tKinds(c.kind), c.city].filter(Boolean).join(" · "),
        })),
        canCreate: result.data.canCreate,
      });
    });
  }

  async function set(id: string | null, name: string | null) {
    setSaving(true);
    const ok = await onSet(id, name);
    setSaving(false);
    if (ok) setPicking(false);
  }

  const kindLine = (c: TaskContact) => (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground text-small">
      <ContactKindBadge kind={c.kind} label={tKinds(c.kind)} />
      {c.person && <span>{t("person", { person: c.person })}</span>}
      {c.archived && <span>{t("archived")}</span>}
    </span>
  );

  return (
    <section className="flex flex-col gap-2" aria-labelledby={`${uid}-title`}>
      <h3 id={`${uid}-title`} className="font-semibold text-small">
        {t("title")}
      </h3>
      {contact ? (
        <div className="flex flex-col gap-2 rounded-lg border bg-card p-3">
          <div className="flex min-w-0 flex-col gap-1">
            <span className="font-medium">{contact.name}</span>
            {kindLine(contact)}
          </div>
          <ContactReach name={contact.name} phone={contact.phone} email={contact.email} primary />
          {!contact.phone && !contact.email && (
            <p className="m-0 text-muted-foreground text-small">{t("noReach")}</p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/kontakte?vorschau=${contact.id}` as never}
              className="inline-flex min-h-8 items-center gap-1.5 rounded-md text-accent-soft-foreground text-small hover:underline focus-visible:outline-2 focus-visible:outline-ring tap:min-h-11"
            >
              <ExternalLink aria-hidden className="size-4" />
              {t("open")}
            </Link>
            {writable && !picking && (
              <>
                <Button size="sm" className="ml-auto" disabled={saving} onClick={startPicking}>
                  {t("change")}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={saving}
                  aria-label={t("removeAria", { name: contact.name })}
                  onClick={() => set(null, null)}
                >
                  {t("remove")}
                </Button>
              </>
            )}
          </div>
        </div>
      ) : writable && suggestion ? (
        <div className="flex flex-col gap-2 rounded-lg border border-dashed p-3">
          <p className="m-0 flex items-start gap-1.5 text-small">
            <Lightbulb aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <span>
              {t.rich("suggestion", {
                name: suggestion.name,
                b: (chunks) => <b className="font-semibold">{chunks}</b>,
              })}{" "}
              <span className="text-muted-foreground">{t(`reason.${suggestion.reason}`)}</span>
            </span>
          </p>
          {!picking && (
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="default"
                disabled={saving}
                aria-label={t("acceptAria", { name: suggestion.name })}
                onClick={() => set(suggestion.id, suggestion.name)}
              >
                {t("accept")}
              </Button>
              <Button size="sm" disabled={saving} onClick={startPicking}>
                {t("pickOther")}
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <p className="m-0 text-muted-foreground text-small">{t("none")}</p>
          {writable && !picking && (
            <Button size="sm" disabled={saving} onClick={startPicking}>
              {t("pick")}
            </Button>
          )}
        </div>
      )}
      {picking && (
        <div className="flex flex-col gap-2">
          <label htmlFor={`${uid}-picker`} className="text-muted-foreground text-small">
            {t("pickerLabel")}
          </label>
          {options ? (
            <ContactPicker
              id={`${uid}-picker`}
              options={options.options}
              value={contact?.id ?? null}
              onChange={(id) => {
                if (id && id !== contact?.id) set(id, nameOf(id));
              }}
              placeholder={t("pickerPlaceholder")}
              canCreate={options.canCreate}
              disabled={saving}
            />
          ) : (
            <p className="m-0 text-muted-foreground text-small" aria-live="polite">
              {loading ? t("loading") : null}
            </p>
          )}
          <div>
            <Button size="sm" onClick={() => setPicking(false)}>
              {t("cancel")}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
