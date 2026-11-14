"use client";

import { isValidEmail, normalizePhone } from "@marktwerk/core";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useId, useState, useTransition } from "react";
import {
  createContactAction,
  similarContactsAction,
  updateContactAction,
} from "@/app/(app)/kontakte/actions";
import { useShell } from "@/components/shell/shell-context";
import { useSafeAction } from "@/components/shell/use-safe-action";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label, OptionalMark } from "@/components/ui/label";
import { DiscardBar, useBeforeUnload } from "@/components/ui/leave-guard";
import { Panel, PanelBody } from "@/components/ui/panel";
import type { ContactInput } from "@/server/services/contacts";
import { contactListHref } from "./list-context";
import { SimilarHint, useSimilar } from "./similar-hint";

const SELECT_CLASS =
  "flex min-h-(--control-h) w-full rounded-lg border border-input bg-card px-3 py-1 text-foreground focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-1";
const TEXTAREA_CLASS =
  "min-h-28 w-full resize-y rounded-lg border border-input bg-card px-3 py-2 text-foreground leading-relaxed placeholder:text-faint-foreground focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-1 aria-invalid:border-destructive";

type FieldName = keyof ContactInput | "form";

/** Which field an error code belongs to (for aria-invalid, the message under it and the focus). */
const ERROR_FIELD: Record<string, FieldName> = {
  name_required: "name",
  invalid_kind: "kind",
  invalid_email: "email",
  invalid_phone: "phone",
};

const EMPTY: ContactInput = {
  kind: "authority",
  name: "",
  contactPerson: "",
  email: "",
  phone: "",
  street: "",
  postalCode: "",
  city: "",
  notes: "",
};

/**
 * Create and edit form for a contact. Nine fields, so a page rather than a modal (UX concept §4:
 * modals up to 8 fields). `edit` carries the id and the `updatedAt` the form was loaded with, which the
 * service uses as the optimistic lock. `liste` is the Kontakte list's query (search, filters, sort):
 * saving and "Abbrechen" return to that list (UX-038).
 */
export function ContactForm({
  kinds,
  initial,
  edit,
  liste = "",
}: {
  kinds: { value: string; label: string }[];
  initial?: ContactInput;
  edit?: { id: string; updatedAt: string };
  liste?: string;
}) {
  const t = useTranslations("contacts.form");
  const tToast = useTranslations("contacts.toast");
  const tKinds = useTranslations("contacts.kinds");
  const router = useRouter();
  const { showToast } = useShell();
  const safe = useSafeAction();
  const [pending, startTransition] = useTransition();
  const start = initial ?? EMPTY;
  const [values, setValues] = useState<ContactInput>(start);
  const [error, setError] = useState<{ field: FieldName; code: string } | null>(null);
  const [leaving, setLeaving] = useState(false);
  const uid = useId();
  const id = (field: string) => `${uid}-${field}`;
  const backHref = contactListHref(liste, edit?.id);

  const set = (field: keyof ContactInput) => (value: string) =>
    setValues((prev) => ({ ...prev, [field]: value }));
  const text = (field: keyof ContactInput) => values[field] ?? "";

  // Unsaved changes (UX-002): the browser asks on close/reload, "Abbrechen" asks inline.
  const dirty = (Object.keys(start) as (keyof ContactInput)[]).some(
    (key) => (values[key] ?? "") !== (start[key] ?? ""),
  );
  useBeforeUnload(dirty && !pending);

  const errorText = (code: string) =>
    t.has(`errors.${code}` as never) ? t(`errors.${code}` as never) : t("errors.generic");
  const fieldError = (field: FieldName) => (error?.field === field ? error.code : null);
  /** aria props of a field: invalid and described by its own message (plus its hint, if any). */
  const describe = (field: FieldName, hint?: string) => {
    const wrong = fieldError(field) !== null;
    const ids = [wrong ? id(`${field}-error`) : null, hint ?? null].filter(Boolean).join(" ");
    return {
      ...(wrong ? { "aria-invalid": true as const } : {}),
      ...(ids ? { "aria-describedby": ids } : {}),
    };
  };
  /** The message under a field (UX-055: errors sit at the field, not at the end of the form). */
  const errorFor = (field: FieldName) => {
    const code = fieldError(field);
    return code ? (
      <p id={id(`${field}-error`)} className="text-small text-status-critical">
        {errorText(code)}
      </p>
    ) : null;
  };

  const phoneTyped = text("phone").trim();
  const phoneNormalized = phoneTyped ? normalizePhone(phoneTyped) : "";
  const showPhoneHint = phoneNormalized !== "" && phoneNormalized !== phoneTyped;

  // "Ähnlicher Kontakt" while typing (UX-028): same name, phone or e-mail. Never blocks saving.
  const typedName = text("name").trim();
  const typedEmail = text("email").trim();
  const similarKey =
    typedName.length >= 3 || phoneTyped.length >= 6 || typedEmail.includes("@")
      ? JSON.stringify([typedName, phoneTyped, typedEmail])
      : null;
  const similar = useSimilar(similarKey, () =>
    similarContactsAction({ name: typedName, phone: phoneTyped, email: typedEmail }, edit?.id),
  );

  function fail(code: string) {
    const field = ERROR_FIELD[code] ?? "form";
    setError({ field, code });
    if (field !== "form") document.getElementById(id(field))?.focus();
  }

  function cancel() {
    if (dirty) setLeaving(true);
    else router.push(backHref as never);
  }

  function submit() {
    // Same checks as the service, in field order (the first wrong field gets the focus), so mistakes
    // show up without a round trip.
    if (text("name").trim() === "") return fail("name_required");
    if (phoneNormalized !== "" && !/\d/.test(phoneNormalized)) return fail("invalid_phone");
    const email = text("email").trim();
    if (email !== "" && !isValidEmail(email)) return fail("invalid_email");
    setError(null);
    setLeaving(false);
    const input: ContactInput = { ...values, phone: phoneNormalized };
    startTransition(async () => {
      const result = await safe(async () =>
        edit
          ? await updateContactAction(edit.id, input, edit.updatedAt)
          : await createContactAction(input),
      );
      // Offline or a server error: the toast says so, the form keeps what was typed (UX-007).
      if (!result) return;
      if (!result.ok) return fail(result.error);
      if (edit) {
        const changed = (result.data as { changed: boolean }).changed;
        showToast({ message: changed ? tToast("saved") : tToast("unchanged") });
        router.push(backHref as never);
      } else {
        showToast({ message: tToast("created") });
        router.push(contactListHref(liste, (result.data as { id: string }).id) as never);
      }
    });
  }

  return (
    <form
      noValidate
      className="flex max-w-3xl flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <Panel title={t("sectionBasics")}>
        <PanelBody className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={id("kind")}>{t("kind")}</Label>
            <select
              id={id("kind")}
              value={values.kind}
              onChange={(e) => set("kind")(e.target.value)}
              className={SELECT_CLASS}
              {...describe("kind")}
            >
              {kinds.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </select>
            {errorFor("kind")}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={id("name")}>{t("name")}</Label>
            <Input
              id={id("name")}
              required
              maxLength={200}
              autoComplete="off"
              placeholder={t("namePlaceholder")}
              value={text("name")}
              onChange={(e) => set("name")(e.target.value)}
              {...describe("name", similar.length > 0 ? id("similar") : undefined)}
            />
            {errorFor("name")}
          </div>
          <SimilarHint
            className="sm:col-span-2"
            id={id("similar")}
            title={t("similar.title", { count: similar.length })}
            note={edit ? t("similar.noteEdit") : t("similar.note")}
            items={similar.map((c) => ({
              id: c.id,
              href: `/kontakte?vorschau=${c.id}`,
              label: c.name,
              reason: [tKinds(c.kind), c.city, t(`similar.reason.${c.reason}`)]
                .filter(Boolean)
                .join(" · "),
            }))}
          />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={id("contactPerson")} optional>
              {t("contactPerson")}
            </Label>
            <Input
              id={id("contactPerson")}
              maxLength={200}
              autoComplete="off"
              value={text("contactPerson")}
              onChange={(e) => set("contactPerson")(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={id("phone")} optional>
              {t("phone")}
            </Label>
            <Input
              id={id("phone")}
              type="tel"
              inputMode="tel"
              maxLength={200}
              autoComplete="off"
              value={text("phone")}
              onChange={(e) => set("phone")(e.target.value)}
              onBlur={(e) => {
                const typed = e.target.value.trim();
                if (typed !== "") set("phone")(normalizePhone(typed));
              }}
              {...describe("phone", showPhoneHint ? id("phone-hint") : undefined)}
            />
            {errorFor("phone")}
            <p id={id("phone-hint")} className="text-faint-foreground text-small">
              {showPhoneHint ? t("phoneNormalized", { value: phoneNormalized }) : t("phoneHint")}
            </p>
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor={id("email")} optional>
              {t("email")}
            </Label>
            <Input
              id={id("email")}
              type="email"
              maxLength={254}
              autoComplete="off"
              value={text("email")}
              onChange={(e) => set("email")(e.target.value)}
              {...describe("email")}
            />
            {errorFor("email")}
          </div>
        </PanelBody>
      </Panel>

      <Panel title={t("sectionAddress")}>
        <PanelBody className="grid gap-4 sm:grid-cols-[1fr_8rem_1fr]">
          <div className="flex flex-col gap-1.5 sm:col-span-3">
            <Label htmlFor={id("street")} optional>
              {t("street")}
            </Label>
            <Input
              id={id("street")}
              maxLength={200}
              autoComplete="off"
              value={text("street")}
              onChange={(e) => set("street")(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5 sm:col-start-2 sm:row-start-2">
            <Label htmlFor={id("postalCode")} optional>
              {t("postalCode")}
            </Label>
            <Input
              id={id("postalCode")}
              inputMode="numeric"
              maxLength={20}
              autoComplete="off"
              className="tabular"
              value={text("postalCode")}
              onChange={(e) => set("postalCode")(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5 sm:col-start-3 sm:row-start-2">
            <Label htmlFor={id("city")} optional>
              {t("city")}
            </Label>
            <Input
              id={id("city")}
              maxLength={200}
              autoComplete="off"
              value={text("city")}
              onChange={(e) => set("city")(e.target.value)}
            />
          </div>
        </PanelBody>
      </Panel>

      <Panel
        title={
          <>
            {t("sectionNotes")} <OptionalMark />
          </>
        }
      >
        <PanelBody>
          <Label htmlFor={id("notes")} className="sr-only">
            {t("notes")}
          </Label>
          <textarea
            id={id("notes")}
            rows={5}
            maxLength={4000}
            placeholder={t("notesPlaceholder")}
            value={text("notes")}
            onChange={(e) => set("notes")(e.target.value)}
            className={TEXTAREA_CLASS}
          />
        </PanelBody>
      </Panel>

      {/* Errors that belong to no single field (conflict, too long, server trouble). */}
      {error?.field === "form" && (
        <div role="alert" className="flex flex-wrap items-center gap-3">
          <p className="text-small text-status-critical">{errorText(error.code)}</p>
          {error.code === "conflict" && (
            <Button size="sm" onClick={() => window.location.reload()}>
              {t("reload")}
            </Button>
          )}
        </div>
      )}

      {leaving && (
        <DiscardBar
          message={t("unsaved")}
          discardLabel={t("discard")}
          keepLabel={t("keepEditing")}
          onDiscard={() => router.push(backHref as never)}
          onKeep={() => setLeaving(false)}
        />
      )}

      <div className="flex flex-wrap justify-end gap-2">
        <Button onClick={cancel}>{t("cancel")}</Button>
        <Button type="submit" variant="default" aria-busy={pending} disabled={pending}>
          {edit ? t("save") : t("create")}
        </Button>
      </div>
    </form>
  );
}
