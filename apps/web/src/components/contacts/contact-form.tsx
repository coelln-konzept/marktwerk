"use client";

import { isValidEmail, normalizePhone } from "@marktwerk/core";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useId, useState, useTransition } from "react";
import { createContactAction, updateContactAction } from "@/app/(app)/kontakte/actions";
import { useShell } from "@/components/shell/shell-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label, OptionalMark } from "@/components/ui/label";
import { Panel, PanelBody, PanelHeader, PanelTitle } from "@/components/ui/panel";
import type { ContactInput } from "@/server/services/contacts";

const SELECT_CLASS =
  "flex min-h-(--control-h) w-full rounded-lg border border-input bg-card px-3 py-1 text-foreground focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-1";
const TEXTAREA_CLASS =
  "min-h-28 w-full resize-y rounded-lg border border-input bg-card px-3 py-2 text-foreground leading-relaxed placeholder:text-faint-foreground focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-1 aria-invalid:border-destructive";

type FieldName = keyof ContactInput | "form";

/** Which field an error code belongs to (for aria-invalid and the focus). */
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
 * service uses as the optimistic lock.
 */
export function ContactForm({
  kinds,
  initial,
  edit,
}: {
  kinds: { value: string; label: string }[];
  initial?: ContactInput;
  edit?: { id: string; updatedAt: string };
}) {
  const t = useTranslations("contacts.form");
  const tToast = useTranslations("contacts.toast");
  const router = useRouter();
  const { showToast } = useShell();
  const [pending, startTransition] = useTransition();
  const [values, setValues] = useState<ContactInput>(initial ?? EMPTY);
  const [error, setError] = useState<{ field: FieldName; code: string } | null>(null);
  const uid = useId();
  const id = (field: string) => `${uid}-${field}`;
  const backHref = edit ? `/kontakte?vorschau=${edit.id}` : "/kontakte";

  const set = (field: keyof ContactInput) => (value: string) =>
    setValues((prev) => ({ ...prev, [field]: value }));
  const text = (field: keyof ContactInput) => values[field] ?? "";

  const errorText = (code: string) =>
    t.has(`errors.${code}` as never) ? t(`errors.${code}` as never) : t("errors.generic");
  const invalid = (field: FieldName) =>
    error?.field === field
      ? { "aria-invalid": true as const, "aria-describedby": id("error") }
      : {};

  const phoneTyped = text("phone").trim();
  const phoneNormalized = phoneTyped ? normalizePhone(phoneTyped) : "";
  const showPhoneHint = phoneNormalized !== "" && phoneNormalized !== phoneTyped;

  function fail(code: string) {
    const field = ERROR_FIELD[code] ?? "form";
    setError({ field, code });
    if (field !== "form") document.getElementById(id(field))?.focus();
  }

  function submit() {
    // Same checks as the service, in field order (the first wrong field gets the focus), so mistakes
    // show up without a round trip.
    if (text("name").trim() === "") return fail("name_required");
    if (phoneNormalized !== "" && !/\d/.test(phoneNormalized)) return fail("invalid_phone");
    const email = text("email").trim();
    if (email !== "" && !isValidEmail(email)) return fail("invalid_email");
    setError(null);
    const input: ContactInput = { ...values, phone: phoneNormalized };
    startTransition(async () => {
      const result = edit
        ? await updateContactAction(edit.id, input, edit.updatedAt)
        : await createContactAction(input);
      if (!result.ok) return fail(result.error);
      if (edit) {
        const changed = (result.data as { changed: boolean }).changed;
        showToast({ message: changed ? tToast("saved") : tToast("unchanged") });
        router.push(backHref as never);
      } else {
        showToast({ message: tToast("created") });
        router.push(`/kontakte?vorschau=${(result.data as { id: string }).id}` as never);
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
      <Panel>
        <PanelHeader>
          <PanelTitle>{t("sectionBasics")}</PanelTitle>
        </PanelHeader>
        <PanelBody className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={id("kind")}>{t("kind")}</Label>
            <select
              id={id("kind")}
              value={values.kind}
              onChange={(e) => set("kind")(e.target.value)}
              className={SELECT_CLASS}
              {...invalid("kind")}
            >
              {kinds.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </select>
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
              {...invalid("name")}
            />
          </div>
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
              aria-describedby={showPhoneHint ? id("phone-hint") : undefined}
              {...invalid("phone")}
            />
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
              {...invalid("email")}
            />
          </div>
        </PanelBody>
      </Panel>

      <Panel>
        <PanelHeader>
          <PanelTitle>{t("sectionAddress")}</PanelTitle>
        </PanelHeader>
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

      <Panel>
        <PanelHeader>
          <PanelTitle>
            {t("sectionNotes")} <OptionalMark />
          </PanelTitle>
        </PanelHeader>
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

      {error && (
        <div id={id("error")} role="alert" className="flex flex-wrap items-center gap-3">
          <p className="text-small text-status-critical">{errorText(error.code)}</p>
          {error.code === "conflict" && (
            <Button size="sm" onClick={() => window.location.reload()}>
              {t("reload")}
            </Button>
          )}
        </div>
      )}

      <div className="flex flex-wrap justify-end gap-2">
        <Link
          href={backHref as never}
          className="inline-flex min-h-8 items-center rounded-lg border border-input bg-card px-3 font-medium hover:bg-hover"
        >
          {t("cancel")}
        </Link>
        <Button type="submit" variant="default" aria-busy={pending} disabled={pending}>
          {edit ? t("save") : t("create")}
        </Button>
      </div>
    </form>
  );
}
