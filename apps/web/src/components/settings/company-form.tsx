"use client";

import { Check, ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState, useTransition } from "react";
import { saveCompanySettings } from "@/app/(app)/einstellungen/actions";
import { useShell } from "@/components/shell/shell-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Panel, PanelBody, PanelFooter, PanelHeader, PanelTitle } from "@/components/ui/panel";
import type { CompanySettings } from "@/server/queries/settings";
import type { CompanyField, SettingsFieldError } from "@/server/services/settings";
import { SELECT_CLASS } from "./select-class";

type Values = Pick<CompanySettings, CompanyField>;
type Errors = Partial<Record<CompanyField, SettingsFieldError>>;

const MAX = 200;

/** Options for the select fields; the server accepts exactly these. */
export type CompanyFormOptions = { bundeslaender: string[]; locales: string[] };

/**
 * Company data form (owner, `settings:manage`). One page rather than a dialog: 15 fields in five sections.
 * Field errors from the server are shown next to the fields; saving shows a toast.
 */
export function CompanyForm({
  initial,
  timeZone,
  options,
  created,
}: {
  initial: Values;
  timeZone: string;
  options: CompanyFormOptions;
  /** False when the settings row does not exist yet (first save creates it). */
  created: boolean;
}) {
  const t = useTranslations("settings.company");
  const { showToast } = useShell();
  const [values, setValues] = useState<Values>(initial);
  const [saved, setSaved] = useState<Values>(initial);
  const [errors, setErrors] = useState<Errors>({});
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();
  const [justSaved, setJustSaved] = useState(false);
  const formId = useId();
  const dirty =
    !created || (Object.keys(values) as CompanyField[]).some((k) => values[k] !== saved[k]);

  const set = <K extends CompanyField>(key: K, value: Values[K]) => {
    setValues((v) => ({ ...v, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
    setJustSaved(false);
  };

  function errorText(field: CompanyField): string | undefined {
    const code = errors[field];
    if (!code) return undefined;
    if (code === "invalid" && t.has(`fieldInvalid.${field}` as never))
      return t(`fieldInvalid.${field}` as never);
    return t(`errors.${code}`, { max: MAX });
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!dirty || pending) return;
    setFailed(false);
    startTransition(async () => {
      try {
        const result = await saveCompanySettings(values);
        if (!result.ok) {
          if (result.fields) setErrors(result.fields);
          else setFailed(true);
          return;
        }
        setErrors({});
        setSaved(values);
        setJustSaved(true);
        showToast({ message: result.data.changed ? t("saved") : t("unchanged") });
      } catch {
        setFailed(true);
      }
    });
  }

  const hasErrors = Object.values(errors).some(Boolean);
  const bankHasError = (["taxNumber", "vatId", "iban", "bic"] as const).some((f) => errors[f]);

  const text = (
    field: CompanyField & keyof Values,
    opts: {
      type?: string;
      autoComplete?: string;
      className?: string;
      inputMode?: "tel" | "email" | "numeric";
    } = {},
  ) => {
    const id = `${formId}-${field}`;
    const err = errorText(field);
    const hint = t.has(`hints.${field}` as never) ? t(`hints.${field}` as never) : null;
    return (
      <div className={`flex flex-col gap-1.5 ${opts.className ?? ""}`}>
        <Label htmlFor={id}>{t(`fields.${field}`)}</Label>
        <Input
          id={id}
          type={opts.type ?? "text"}
          inputMode={opts.inputMode}
          autoComplete={opts.autoComplete ?? "off"}
          value={String(values[field])}
          maxLength={MAX}
          onChange={(e) => set(field, e.target.value as never)}
          aria-invalid={err ? true : undefined}
          aria-describedby={err ? `${id}-error` : hint ? `${id}-hint` : undefined}
        />
        {err ? (
          <p id={`${id}-error`} role="alert" className="text-small text-status-critical">
            {err}
          </p>
        ) : (
          hint && (
            <p id={`${id}-hint`} className="text-muted-foreground text-tiny">
              {hint}
            </p>
          )
        )}
      </div>
    );
  };

  const grid = "grid grid-cols-1 gap-4 sm:grid-cols-2";

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-6">
      <Panel aria-labelledby={`${formId}-identity`}>
        <PanelHeader>
          <PanelTitle id={`${formId}-identity`}>{t("sections.identity")}</PanelTitle>
        </PanelHeader>
        <PanelBody className={grid}>
          {text("companyName", { className: "sm:col-span-2" })}
        </PanelBody>
      </Panel>

      <Panel aria-labelledby={`${formId}-address`}>
        <PanelHeader>
          <PanelTitle id={`${formId}-address`}>{t("sections.address")}</PanelTitle>
        </PanelHeader>
        <PanelBody className={grid}>
          {text("addressLine1", { autoComplete: "address-line1" })}
          {text("addressLine2", { autoComplete: "address-line2" })}
          {text("postalCode", { autoComplete: "postal-code", inputMode: "numeric" })}
          {text("city", { autoComplete: "address-level2" })}
          {text("country", { autoComplete: "country" })}
        </PanelBody>
      </Panel>

      <Panel aria-labelledby={`${formId}-contact`}>
        <PanelHeader>
          <PanelTitle id={`${formId}-contact`}>{t("sections.contact")}</PanelTitle>
        </PanelHeader>
        <PanelBody className={grid}>
          {text("email", { type: "email", inputMode: "email" })}
          {text("phone", { type: "tel", inputMode: "tel" })}
        </PanelBody>
      </Panel>

      {/* Collapsed: tax number and bank data are rarely touched (UX pass 2026-10-22). Opens by itself on a field error. */}
      <details
        open={bankHasError || undefined}
        className="group rounded-xl border bg-card shadow-card"
      >
        <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 font-semibold text-[15px] [&::-webkit-details-marker]:hidden">
          <ChevronRight
            aria-hidden
            className="size-4 text-muted-foreground transition-transform group-open:rotate-90"
          />
          {t("sections.bank")}
          <span className="ml-auto font-normal text-muted-foreground text-small">
            {t("bankSummary")}
          </span>
        </summary>
        <div className={`${grid} border-border-subtle border-t p-4`}>
          {text("taxNumber")}
          {text("vatId")}
          {text("iban")}
          {text("bic")}
        </div>
      </details>

      <Panel aria-labelledby={`${formId}-operations`}>
        <PanelHeader>
          <PanelTitle id={`${formId}-operations`}>{t("sections.operations")}</PanelTitle>
        </PanelHeader>
        <PanelBody className={grid}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${formId}-timeZone`}>{t("fields.timeZone")}</Label>
            <Input
              id={`${formId}-timeZone`}
              value={timeZone}
              readOnly
              aria-describedby={`${formId}-timeZone-hint`}
            />
            <p id={`${formId}-timeZone-hint`} className="text-muted-foreground text-tiny">
              {t("hints.timeZone")}
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${formId}-bundesland`}>{t("fields.bundesland")}</Label>
            <select
              id={`${formId}-bundesland`}
              value={values.bundesland}
              onChange={(e) => set("bundesland", e.target.value)}
              aria-describedby={`${formId}-bundesland-hint`}
              className={SELECT_CLASS}
            >
              {options.bundeslaender.map((code) => (
                <option key={code} value={code}>
                  {t.has(`bundeslaender.${code}` as never)
                    ? t(`bundeslaender.${code}` as never)
                    : code}
                </option>
              ))}
            </select>
            <p id={`${formId}-bundesland-hint`} className="text-muted-foreground text-tiny">
              {t("hints.bundesland")}
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${formId}-defaultLocale`}>{t("fields.defaultLocale")}</Label>
            <select
              id={`${formId}-defaultLocale`}
              value={values.defaultLocale}
              onChange={(e) => set("defaultLocale", e.target.value)}
              aria-describedby={`${formId}-defaultLocale-hint`}
              className={SELECT_CLASS}
            >
              {options.locales.map((code) => (
                <option key={code} value={code}>
                  {t(`locales.${code}` as never)}
                </option>
              ))}
            </select>
            <p id={`${formId}-defaultLocale-hint`} className="text-muted-foreground text-tiny">
              {t("hints.defaultLocale")}
            </p>
          </div>

          {text("defaultDueTime", { type: "time" })}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${formId}-permitHorizonDays`}>{t("fields.permitHorizonDays")}</Label>
            <div className="flex items-center gap-2">
              <Input
                id={`${formId}-permitHorizonDays`}
                type="number"
                inputMode="numeric"
                min={7}
                max={180}
                step={1}
                className="w-28"
                value={Number.isNaN(values.permitHorizonDays) ? "" : values.permitHorizonDays}
                onChange={(e) =>
                  set(
                    "permitHorizonDays",
                    e.target.value === "" ? Number.NaN : Number(e.target.value),
                  )
                }
                aria-invalid={errors.permitHorizonDays ? true : undefined}
                aria-describedby={`${formId}-permitHorizonDays-${errors.permitHorizonDays ? "error" : "hint"}`}
              />
              <span className="text-muted-foreground">{t("units.days")}</span>
            </div>
            {errors.permitHorizonDays ? (
              <p
                id={`${formId}-permitHorizonDays-error`}
                role="alert"
                className="text-small text-status-critical"
              >
                {errorText("permitHorizonDays")}
              </p>
            ) : (
              <p
                id={`${formId}-permitHorizonDays-hint`}
                className="text-muted-foreground text-tiny"
              >
                {t("hints.permitHorizonDays")}
              </p>
            )}
          </div>

          <div className="flex items-start gap-3 sm:col-span-2">
            <input
              id={`${formId}-email`}
              type="checkbox"
              checked={values.emailEnabled}
              onChange={(e) => set("emailEnabled", e.target.checked)}
              aria-describedby={`${formId}-email-hint`}
              className="mt-0.5 size-4 accent-primary"
            />
            <div className="flex flex-col gap-1">
              <Label htmlFor={`${formId}-email`}>{t("fields.emailEnabled")}</Label>
              <p id={`${formId}-email-hint`} className="text-muted-foreground text-tiny">
                {t("hints.emailEnabled")}
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 sm:col-span-2">
            <input
              id={`${formId}-digest`}
              type="checkbox"
              checked={values.dailyDigestEnabled}
              disabled={!values.emailEnabled}
              onChange={(e) => set("dailyDigestEnabled", e.target.checked)}
              aria-describedby={`${formId}-digest-hint`}
              className="mt-0.5 size-4 accent-primary disabled:cursor-not-allowed"
            />
            <div className="flex flex-col gap-1">
              <Label htmlFor={`${formId}-digest`}>{t("fields.dailyDigestEnabled")}</Label>
              <p id={`${formId}-digest-hint`} className="text-muted-foreground text-tiny">
                {values.emailEnabled
                  ? t("hints.dailyDigestEnabled")
                  : t("hints.dailyDigestNeedsEmail")}
              </p>
            </div>
          </div>
        </PanelBody>
        <PanelFooter>
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
          {(hasErrors || failed) && (
            <p role="alert" className="m-0 text-small text-status-critical">
              {failed ? t("failed") : t("errorSummary")}
            </p>
          )}
        </PanelFooter>
      </Panel>
    </form>
  );
}
