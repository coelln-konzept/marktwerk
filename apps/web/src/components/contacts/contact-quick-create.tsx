"use client";

import { useTranslations } from "next-intl";
import { useEffect, useId, useState, useTransition } from "react";
import { createContactAction, similarContactsAction } from "@/app/(app)/kontakte/actions";
import { SELECT_CLASS } from "@/components/settings/select-class";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { QuickCreateDialog } from "@/components/ui/quick-create-dialog";
import { callAction, NETWORK_ERROR } from "@/lib/call-action";
import { SimilarHint, useSimilar } from "./similar-hint";

/** The contact kinds (database enum `contact_kind`). */
export const CONTACT_KINDS = ["authority", "landowner", "supplier", "service", "other"] as const;
export type ContactKindKey = (typeof CONTACT_KINDS)[number];

/** A contact just created in place, ready to be added to a picker's options and selected. */
export type CreatedContact = {
  id: string;
  label: string;
  hint: string | null;
  kind?: ContactKindKey;
};

/**
 * "+ Neu" of a contact picker (user test 2, UT2-07): name, kind, phone and e-mail only, stacked on the form
 * that asked for it. The rest (address, notes) is edited later on the contact's page. `kinds` limits the
 * choice (one kind = no select, e.g. Eigentümer); `name` is what was typed in the picker.
 */
export function ContactQuickCreate({
  open,
  onOpenChange,
  name: initialName,
  kinds = CONTACT_KINDS,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  name: string;
  kinds?: readonly ContactKindKey[];
  onCreated: (contact: CreatedContact) => void;
}) {
  const t = useTranslations("contacts.form");
  const tQuick = useTranslations("contacts.quick");
  const tKinds = useTranslations("contacts.kinds");
  const tErrors = useTranslations("errors");
  const uid = useId();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState(initialName);
  const [kind, setKind] = useState<ContactKindKey>(kinds[0] ?? "other");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<{ code: string; field: string | null } | null>(null);

  // Each opening starts from what was typed in the picker. Keyed on the kinds' content, so callers may
  // pass an inline array.
  const firstKind = kinds[0] ?? "other";
  useEffect(() => {
    if (!open) return;
    setName(initialName);
    setKind(firstKind);
    setPhone("");
    setEmail("");
    setError(null);
  }, [open, initialName, firstKind]);

  const fieldOf = (code: string) =>
    code === "name_required"
      ? `${uid}-name`
      : code === "invalid_phone"
        ? `${uid}-phone`
        : code === "invalid_email"
          ? `${uid}-email`
          : null;
  const errorText = (code: string) =>
    code === NETWORK_ERROR
      ? tErrors("network")
      : t.has(`errors.${code}` as never)
        ? t(`errors.${code}` as never)
        : t("errors.generic");
  const invalid = (field: string) =>
    error?.field === field ? { "aria-invalid": true as const } : {};

  // "Ähnlicher Kontakt" (UX-028), as in the full form: a hint, saving stays possible.
  const typedName = name.trim();
  const similar = useSimilar(
    open && (typedName.length >= 3 || phone.trim().length >= 6 || email.includes("@"))
      ? JSON.stringify([typedName, phone.trim(), email.trim()])
      : null,
    () => similarContactsAction({ name: typedName, phone: phone.trim(), email: email.trim() }),
  );

  function submit() {
    if (name.trim() === "") {
      setError({ code: "name_required", field: `${uid}-name` });
      document.getElementById(`${uid}-name`)?.focus();
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await callAction(() =>
        createContactAction({ kind, name, phone: phone || undefined, email: email || undefined }),
      );
      if (!result.ok) {
        const field = fieldOf(result.error);
        setError({ code: result.error, field });
        if (field) document.getElementById(field)?.focus();
        return;
      }
      onCreated({
        id: result.data.id,
        label: name.trim().replace(/\s+/g, " "),
        hint: null,
        kind,
      });
      onOpenChange(false);
    });
  }

  return (
    <QuickCreateDialog
      open={open}
      onOpenChange={onOpenChange}
      title={
        kinds.length === 1
          ? tQuick("titleKind", { kind: tKinds(kinds[0] as ContactKindKey) })
          : tQuick("title")
      }
      description={tQuick("description")}
      pending={pending}
      error={error ? errorText(error.code) : null}
      onSubmit={submit}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${uid}-name`}>{t("name")}</Label>
        <Input
          id={`${uid}-name`}
          value={name}
          maxLength={200}
          autoComplete="off"
          autoFocus
          onChange={(e) => setName(e.target.value)}
          {...invalid(`${uid}-name`)}
        />
      </div>
      <SimilarHint
        title={t("similar.title", { count: similar.length })}
        note={t("similar.note")}
        items={similar.map((c) => ({
          id: c.id,
          href: `/kontakte?vorschau=${c.id}`,
          label: c.name,
          reason: [tKinds(c.kind), c.city, t(`similar.reason.${c.reason}`)]
            .filter(Boolean)
            .join(" · "),
        }))}
      />
      {kinds.length > 1 && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${uid}-kind`}>{t("kind")}</Label>
          <select
            id={`${uid}-kind`}
            value={kind}
            className={SELECT_CLASS}
            onChange={(e) => setKind(e.target.value as ContactKindKey)}
          >
            {kinds.map((k) => (
              <option key={k} value={k}>
                {tKinds(k)}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${uid}-phone`} optional>
            {t("phone")}
          </Label>
          <Input
            id={`${uid}-phone`}
            type="tel"
            value={phone}
            autoComplete="off"
            onChange={(e) => setPhone(e.target.value)}
            {...invalid(`${uid}-phone`)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${uid}-email`} optional>
            {t("email")}
          </Label>
          <Input
            id={`${uid}-email`}
            type="email"
            value={email}
            autoComplete="off"
            onChange={(e) => setEmail(e.target.value)}
            {...invalid(`${uid}-email`)}
          />
        </div>
      </div>
    </QuickCreateDialog>
  );
}
