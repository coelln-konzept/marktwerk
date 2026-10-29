"use client";

import {
  checkPresetFields,
  type EventTimesInput,
  MARKET_COLORS,
  normalizeClockTime,
  parseEuroCents,
} from "@marktwerk/core";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useRef, useState, useTransition } from "react";
import { createPresetAction, updatePresetAction } from "@/app/(app)/vorlagen/actions";
import { TEXTAREA_CLASS } from "@/components/event-detail/textarea-class";
import { useShell } from "@/components/shell/shell-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label, OptionalMark } from "@/components/ui/label";
import { marketColorClass } from "@/components/ui/market-marker";
import { Panel, PanelBody, PanelHeader, PanelTitle } from "@/components/ui/panel";
import type { PresetFormOptions } from "@/server/queries/presets";
import type { PresetInput } from "@/server/services/presets";
import { NO_RHYTHM, type Rhythm, rhythmFromRule, rhythmToRule } from "./rhythm";
import { RhythmBuilder } from "./rhythm-builder";

const TIME_FIELDS = ["setup", "open", "close", "teardown"] as const;

const SELECT_CLASS =
  "flex min-h-(--control-h) w-full rounded-lg border border-input bg-card px-3 py-1 text-foreground focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-1 aria-invalid:border-destructive";

/** 1250 → "12,50" (de) / "12.50" (en), the way it's typed back in. */
function centsToInput(cents: number, locale: string) {
  const text = (cents / 100).toFixed(2);
  return locale === "en" ? text : text.replace(".", ",");
}

/** Order the fields appear in; the first invalid one gets the focus. */
const FIELD_ORDER = [
  "name",
  "type",
  "venue",
  "color",
  "duration",
  "publicTitle",
  "publicText",
  ...TIME_FIELDS,
  "price",
  "fee",
  "rrule",
];

/** The preset as the page loaded it (plain values, so the page can pass them to this client form). */
export type PresetFormValues = PresetInput;

type Errors = Record<string, string>;

/**
 * "Neue Vorlage" / "Vorlage bearbeiten": one page (a preset has more than eight fields). Typed values
 * are checked here with the same rules the server uses; the server's answer is shown next to the field
 * it names. Nothing is cleared on errors. Saving goes back to the list with the Vorschau open.
 */
export function PresetForm({
  edit,
  initial,
  options,
}: {
  /** Set when editing: the preset and its `updated_at` (ISO) as loaded, for the concurrency check. */
  edit?: { id: string; updatedAt: string };
  initial: PresetFormValues;
  options: PresetFormOptions;
}) {
  const t = useTranslations("templates.form");
  const locale = useLocale();
  const router = useRouter();
  const { showToast } = useShell();
  const editing = edit !== undefined;
  const [pending, startTransition] = useTransition();

  const [name, setName] = useState(initial.name);
  const [typeId, setTypeId] = useState(initial.eventTypeId);
  const [venueId, setVenueId] = useState(initial.venueId);
  const [duration, setDuration] = useState(String(initial.durationDays));
  const [publicTitle, setPublicTitle] = useState(initial.publicTitle ?? "");
  const [publicText, setPublicText] = useState(initial.publicText ?? "");
  const [times, setTimes] = useState<EventTimesInput>(initial.times);
  const [price, setPrice] = useState(centsToInput(initial.pricePerMCents, locale));
  const [fee, setFee] = useState(centsToInput(initial.bookingFeeCents, locale));
  const [rhythm, setRhythm] = useState<Rhythm>(editing ? rhythmFromRule(initial.rrule) : NO_RHYTHM);
  const [duties, setDuties] = useState<Record<string, string>>(initial.defaultDuties);
  const [active, setActive] = useState(initial.active);
  const [color, setColor] = useState<string | null>(initial.color ?? null);
  const tColor = useTranslations("templates.form.color");
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  /** Prices follow the event type's defaults on a new preset until somebody types one. */
  const priceTouched = useRef(editing);
  /** The version the user may overwrite after a conflict: the newest the page has seen. */
  const latestUpdatedAt = useRef(edit?.updatedAt);
  latestUpdatedAt.current = edit?.updatedAt;
  const loadedUpdatedAt = useRef(edit?.updatedAt);

  const message = (code: string) =>
    t.has(`errors.${code}` as never) ? t(`errors.${code}` as never) : t("errors.generic");

  function chooseType(id: string) {
    setTypeId(id);
    const type = options.types.find((x) => x.id === id);
    if (!priceTouched.current && type) {
      if (type.defaultPricePerMCents !== null)
        setPrice(centsToInput(type.defaultPricePerMCents, locale));
      if (type.defaultBookingFeeCents !== null)
        setFee(centsToInput(type.defaultBookingFeeCents, locale));
    }
  }

  /** Form state → service input, or the errors that keep it from being one. */
  function build(): { input: PresetInput } | { errors: Errors } {
    const found: Errors = {};
    const normalizedTimes = { ...times };
    for (const key of TIME_FIELDS) {
      const value = normalizeClockTime(times[key]);
      if (value === null) found[key] = "invalid_time";
      else normalizedTimes[key] = value;
    }
    setTimes(normalizedTimes);
    const pricePerMCents = parseEuroCents(price);
    if (pricePerMCents === null) found.price = "invalid_price";
    const bookingFeeCents = parseEuroCents(fee);
    if (bookingFeeCents === null) found.fee = "invalid_fee";
    const durationDays = /^\d{1,2}$/.test(duration.trim()) ? Number(duration) : Number.NaN;
    if (!Number.isInteger(durationDays)) found.duration = "invalid_duration";
    const rrule = rhythmToRule(rhythm, initial.rrule);
    if (rrule === undefined) found.rrule = "rrule_empty";
    if (!typeId) found.type = "invalid_type";
    if (!venueId) found.venue = "invalid_venue";

    const input: PresetInput = {
      name: name.trim(),
      eventTypeId: typeId,
      venueId,
      durationDays,
      publicTitle: publicTitle.trim() === "" ? null : publicTitle.trim(),
      publicText: publicText.trim() === "" ? null : publicText.trim(),
      times: normalizedTimes,
      pricePerMCents: pricePerMCents ?? 0,
      bookingFeeCents: bookingFeeCents ?? 0,
      rrule: rrule ?? null,
      defaultDuties: Object.fromEntries(Object.entries(duties).filter(([, id]) => id !== "")),
      active,
      color,
    };
    // The same rules the server applies; parse problems found above come first.
    for (const issue of checkPresetFields({
      ...input,
      durationDays: Number.isInteger(durationDays) ? durationDays : 1,
    })) {
      if (!found[issue.field]) found[issue.field] = issue.code;
    }
    return Object.keys(found).length > 0 ? { errors: found } : { input };
  }

  function focusFirst(fields: string[]) {
    const first =
      FIELD_ORDER.find((f) => fields.includes(f)) ?? fields.find((f) => f.startsWith("duty."));
    if (!first) return;
    const id = first.startsWith("duty.") ? `preset-duty-${first.slice(5)}` : `preset-${first}`;
    document.getElementById(id)?.focus();
  }

  function submit(overwrite: boolean) {
    setFormError(null);
    const built = build();
    if ("errors" in built) {
      setErrors(built.errors);
      setConflict(false);
      focusFirst(Object.keys(built.errors));
      return;
    }
    setErrors({});
    startTransition(async () => {
      const expected = (overwrite ? latestUpdatedAt.current : loadedUpdatedAt.current) ?? "";
      const result = edit
        ? await updatePresetAction(edit.id, built.input, expected)
        : await createPresetAction(built.input);
      if (!result.ok) {
        if (result.error === "conflict") {
          setConflict(true);
          return;
        }
        setConflict(false);
        if (result.field && result.field !== "form") {
          setErrors({ [result.field]: result.error });
          focusFirst([result.field]);
        } else {
          setFormError(result.error);
        }
        return;
      }
      const id = edit ? edit.id : (result.data as { id: string }).id;
      const changed = edit ? (result.data as { changed: boolean }).changed : true;
      showToast({ message: changed ? t(edit ? "saved" : "created") : t("unchanged") });
      router.push(`/vorlagen?vorschau=${id}` as never);
    });
  }

  const fieldProps = (field: string) =>
    errors[field]
      ? { "aria-invalid": true as const, "aria-describedby": `preset-${field}-error` }
      : {};
  const fieldError = (field: string) =>
    errors[field] ? (
      <p id={`preset-${field}-error`} className="text-small text-status-critical">
        {message(errors[field])}
      </p>
    ) : null;

  const errorCount = Object.keys(errors).length;
  const roleName = (role: { nameDe: string; nameEn: string }) =>
    locale === "en" ? role.nameEn : role.nameDe;
  const typeName = (type: { nameDe: string; nameEn: string }) =>
    locale === "en" ? type.nameEn : type.nameDe;

  return (
    <form
      noValidate
      className="flex flex-col gap-6"
      onSubmit={(e) => {
        e.preventDefault();
        submit(false);
      }}
    >
      <p className="rounded-lg border border-border-subtle bg-sunken px-3 py-2 text-small">
        {t("propagationHint")}
      </p>

      <Panel aria-labelledby="preset-basics-title">
        <PanelHeader>
          <PanelTitle id="preset-basics-title">{t("basics.title")}</PanelTitle>
        </PanelHeader>
        <PanelBody className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="preset-name">{t("basics.name")}</Label>
            <Input
              id="preset-name"
              autoComplete="off"
              required
              maxLength={200}
              value={name}
              onChange={(e) => setName(e.target.value)}
              {...fieldProps("name")}
            />
            {fieldError("name")}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="preset-type">{t("basics.type")}</Label>
            <select
              id="preset-type"
              className={SELECT_CLASS}
              required
              value={typeId}
              onChange={(e) => chooseType(e.target.value)}
              {...fieldProps("type")}
            >
              {typeId === "" && <option value="">{t("basics.choose")}</option>}
              {options.types.map((type) => (
                <option key={type.id} value={type.id}>
                  {typeName(type)}
                  {type.retired ? ` ${t("basics.retired")}` : ""}
                </option>
              ))}
            </select>
            {fieldError("type")}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="preset-venue">{t("basics.venue")}</Label>
            <select
              id="preset-venue"
              className={SELECT_CLASS}
              required
              value={venueId}
              onChange={(e) => setVenueId(e.target.value)}
              {...fieldProps("venue")}
            >
              {venueId === "" && <option value="">{t("basics.choose")}</option>}
              {options.venues.map((place) => (
                <option key={place.id} value={place.id}>
                  {place.name}, {place.city}
                  {place.retired ? ` ${t("basics.retired")}` : ""}
                </option>
              ))}
            </select>
            {fieldError("venue")}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="preset-duration">{t("basics.duration")}</Label>
            <Input
              id="preset-duration"
              inputMode="numeric"
              autoComplete="off"
              maxLength={2}
              required
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              className="tabular max-w-24"
              {...fieldProps("duration")}
            />
            {fieldError("duration")}
          </div>
          <fieldset className="flex flex-col gap-2 sm:col-span-2">
            <legend className="mb-1 flex gap-2 font-medium text-small">
              {tColor("legend")}
              <OptionalMark />
            </legend>
            <div className="flex flex-wrap items-center gap-2">
              {MARKET_COLORS.map((key) => (
                <label key={key} className="cursor-pointer">
                  <input
                    type="radio"
                    name="preset-color"
                    value={key}
                    checked={color === key}
                    onChange={() => setColor(key)}
                    className="peer sr-only"
                    aria-label={tColor("swatch", { name: tColor(`names.${key}`) })}
                  />
                  <span
                    aria-hidden
                    title={tColor(`names.${key}`)}
                    className={`block size-7 rounded-md ${marketColorClass(key)} ring-offset-2 ring-offset-card peer-checked:ring-2 peer-checked:ring-foreground peer-focus-visible:outline-2 peer-focus-visible:outline-ring`}
                  />
                </label>
              ))}
              <label className="inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded-md px-2 text-muted-foreground text-small has-checked:bg-selected has-checked:text-foreground has-focus-visible:outline-2 has-focus-visible:outline-ring">
                <input
                  type="radio"
                  name="preset-color"
                  value=""
                  checked={color === null}
                  onChange={() => setColor(null)}
                  className="sr-only"
                />
                {tColor("none")}
              </label>
            </div>
            <p className="text-faint-foreground text-small">{tColor("hint")}</p>
            {fieldError("color")}
          </fieldset>
          <div className="flex flex-col justify-end gap-1.5">
            <label
              htmlFor="preset-active"
              className="flex min-h-(--control-h) cursor-pointer items-center gap-2 text-small"
            >
              <input
                id="preset-active"
                type="checkbox"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
                aria-describedby="preset-active-hint"
                className="size-4 shrink-0 accent-primary"
              />
              <span className="font-medium">{t("basics.active")}</span>
            </label>
            <p id="preset-active-hint" className="text-faint-foreground text-small">
              {t("basics.activeHint")}
            </p>
          </div>
        </PanelBody>
      </Panel>

      <Panel aria-labelledby="preset-public-title-heading">
        <PanelHeader>
          <PanelTitle id="preset-public-title-heading">{t("public.title")}</PanelTitle>
        </PanelHeader>
        <PanelBody className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="preset-publicTitle" optional>
              {t("public.publicTitle")}
            </Label>
            <Input
              id="preset-publicTitle"
              autoComplete="off"
              value={publicTitle}
              onChange={(e) => setPublicTitle(e.target.value)}
              {...fieldProps("publicTitle")}
            />
            {fieldError("publicTitle")}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="preset-publicText" optional>
              {t("public.publicText")}
            </Label>
            <textarea
              id="preset-publicText"
              rows={5}
              value={publicText}
              onChange={(e) => setPublicText(e.target.value)}
              className={TEXTAREA_CLASS}
              {...fieldProps("publicText")}
            />
            {fieldError("publicText")}
          </div>
        </PanelBody>
      </Panel>

      <Panel aria-labelledby="preset-times-title">
        <PanelHeader>
          <PanelTitle id="preset-times-title">{t("times.title")}</PanelTitle>
        </PanelHeader>
        <PanelBody className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {TIME_FIELDS.map((key) => (
              <div key={key} className="flex flex-col gap-1.5">
                <Label htmlFor={`preset-${key}`}>{t(`times.${key}`)}</Label>
                <Input
                  id={`preset-${key}`}
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="HH:MM"
                  maxLength={9}
                  required
                  value={times[key]}
                  onChange={(e) => setTimes({ ...times, [key]: e.target.value })}
                  onBlur={(e) => {
                    const value = normalizeClockTime(e.target.value);
                    if (value) setTimes((prev) => ({ ...prev, [key]: value }));
                  }}
                  className="tabular"
                  {...fieldProps(key)}
                />
              </div>
            ))}
          </div>
          {TIME_FIELDS.map((key) => (
            <div key={key}>{fieldError(key)}</div>
          ))}
          <p className="text-faint-foreground text-small">{t("times.hint")}</p>
        </PanelBody>
      </Panel>

      <Panel aria-labelledby="preset-prices-title">
        <PanelHeader>
          <PanelTitle id="preset-prices-title">{t("prices.title")}</PanelTitle>
        </PanelHeader>
        <PanelBody className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="preset-price">{t("prices.price")}</Label>
            <div className="relative">
              <Input
                id="preset-price"
                inputMode="decimal"
                autoComplete="off"
                value={price}
                onChange={(e) => {
                  priceTouched.current = true;
                  setPrice(e.target.value);
                }}
                className="tabular pr-14"
                {...fieldProps("price")}
              />
              <span className="-translate-y-1/2 pointer-events-none absolute top-1/2 right-3 text-muted-foreground text-small">
                {t("prices.perMeter")}
              </span>
            </div>
            {fieldError("price")}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="preset-fee">{t("prices.fee")}</Label>
            <div className="relative">
              <Input
                id="preset-fee"
                inputMode="decimal"
                autoComplete="off"
                value={fee}
                onChange={(e) => {
                  priceTouched.current = true;
                  setFee(e.target.value);
                }}
                className="tabular pr-8"
                {...fieldProps("fee")}
              />
              <span className="-translate-y-1/2 pointer-events-none absolute top-1/2 right-3 text-muted-foreground text-small">
                €
              </span>
            </div>
            {fieldError("fee")}
          </div>
          {!editing && (
            <p className="text-faint-foreground text-small sm:col-span-2">{t("prices.hint")}</p>
          )}
        </PanelBody>
      </Panel>

      <Panel aria-labelledby="preset-rhythm-title">
        <PanelHeader>
          <PanelTitle id="preset-rhythm-title">{t("rhythm.title")}</PanelTitle>
        </PanelHeader>
        <PanelBody>
          <RhythmBuilder
            rhythm={rhythm}
            onChange={setRhythm}
            storedRule={initial.rrule}
            durationDays={Number(duration)}
            error={errors.rrule ? message(errors.rrule) : undefined}
          />
        </PanelBody>
      </Panel>

      <Panel aria-labelledby="preset-team-title">
        <PanelHeader>
          <PanelTitle id="preset-team-title">{t("team.title")}</PanelTitle>
        </PanelHeader>
        <PanelBody className="flex flex-col gap-4">
          <p className="text-faint-foreground text-small">{t("team.hint")}</p>
          {options.roles.length === 0 ? (
            <p className="text-muted-foreground text-small">{t("team.noRoles")}</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {options.roles.map((role) => (
                <div key={role.key} className="flex flex-col gap-1.5">
                  <Label htmlFor={`preset-duty-${role.key}`} optional>
                    {roleName(role)}
                  </Label>
                  <select
                    id={`preset-duty-${role.key}`}
                    className={SELECT_CLASS}
                    value={duties[role.key] ?? ""}
                    onChange={(e) => setDuties({ ...duties, [role.key]: e.target.value })}
                    {...fieldProps(`duty.${role.key}`)}
                  >
                    <option value="">{t("team.nobody")}</option>
                    {options.staff.map((person) => (
                      <option key={person.id} value={person.id}>
                        {person.name}
                        {person.retired ? ` ${t("team.retired")}` : ""}
                      </option>
                    ))}
                  </select>
                  {fieldError(`duty.${role.key}`)}
                </div>
              ))}
            </div>
          )}
        </PanelBody>
      </Panel>

      {formError && (
        <p role="alert" className="text-small text-status-critical">
          {message(formError)}
        </p>
      )}
      {conflict && (
        <div
          role="alert"
          className="flex flex-col gap-2 rounded-lg border border-status-warn bg-status-warn-bg px-3 py-2.5 text-small"
        >
          <p>{t("conflict.text")}</p>
          <div>
            <Button size="sm" disabled={pending} onClick={() => submit(true)}>
              {t("conflict.overwrite")}
            </Button>
          </div>
        </div>
      )}

      {/* Sticky: the form is about 2500 px long, Speichern and the error count stay in reach. */}
      <div className="sticky bottom-0 z-10 -mx-4 -mb-6 flex flex-wrap items-center justify-between gap-3 border-t bg-card px-4 py-3 lg:-mx-7 lg:px-7">
        <p role="alert" className="m-0 text-small text-status-critical">
          {errorCount > 0 ? t("errors.summary", { count: errorCount }) : null}
        </p>
        <div className="flex flex-wrap justify-end gap-2">
          <Button disabled={pending} onClick={() => router.push("/vorlagen" as never)}>
            {t("cancel")}
          </Button>
          <Button type="submit" variant="default" aria-busy={pending} disabled={pending}>
            {t(editing ? "save" : "create")}
          </Button>
        </div>
      </div>
    </form>
  );
}
