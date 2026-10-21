"use client";

import {
  addMonthsClamped,
  centsToInput,
  isIsoDate,
  MAX_INSTALLMENTS,
  parseMoneyCents,
  planInstallments,
} from "@marktwerk/core";
import { Plus, Trash2, Wand2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useId, useRef, useState, useTransition } from "react";
import { createPayableAction, updatePayableAction } from "@/app/(app)/finanzen/actions";
import { useShell } from "@/components/shell/shell-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Panel, PanelBody, PanelHeader, PanelTitle } from "@/components/ui/panel";
import { formatDateShort, formatMoney } from "@/lib/format";
import type { FinanceOptions } from "@/server/queries/finance";
import { SELECT_CLASS, TEXTAREA_CLASS } from "./form-classes";
import { FinanceStatusBadge } from "./status";

const SCOPES = ["event", "company", "vehicle", "venue_season"] as const;
const CATEGORIES = [
  "location",
  "permit",
  "water_power",
  "equipment_rental",
  "staff_external",
  "security",
  "cleaning_waste",
  "toilets",
  "marketing",
  "gema",
  "transport_fuel",
  "vehicle",
  "insurance",
  "tax_fees",
  "other",
] as const;
const VAT_RATES = ["19", "7", "0"] as const;

type Row = { key: string; id?: string; dueOn: string; amount: string };

/** A rate that can no longer be edited (paid or part-paid): shown in the plan, counts towards the sum. */
export type LockedRate = {
  id: string;
  position: string;
  dueOn: string;
  amountCents: number;
  state: "partially_paid" | "paid";
};

export type PayableFormValues = {
  title: string;
  scope: string;
  category: string;
  counterpartyContactId: string;
  eventId: string;
  venueId: string;
  season: string;
  vehicleId: string;
  critical: boolean;
  totalGrossCents: number | null;
  vatRate: string;
  notes: string;
  permitId: string;
};

const EMPTY: PayableFormValues = {
  title: "",
  scope: "company",
  category: "other",
  counterpartyContactId: "",
  eventId: "",
  venueId: "",
  season: "",
  vehicleId: "",
  critical: false,
  totalGrossCents: null,
  vatRate: "",
  notes: "",
  permitId: "",
};

type FieldName = "title" | "total" | "event" | "venue" | "season" | "vehicle" | "plan" | "form";

const ERROR_FIELD: Record<string, FieldName> = {
  title_required: "title",
  invalid_amount: "total",
  invalid_event: "event",
  invalid_venue: "venue",
  invalid_season: "season",
  invalid_vehicle: "vehicle",
  plan_empty: "plan",
  plan_too_many: "plan",
  plan_invalid_amount: "plan",
  plan_sum_mismatch: "plan",
  invalid_date: "plan",
  installment_locked: "plan",
};

/**
 * Create and edit form for a payable with its instalment plan. Many fields, so a page (UX concept §4).
 * The plan is a list of rates (due date + amount): generate "n rates every m months" and adjust, or
 * type them. The sum has to equal the total; the service checks it again. `edit` carries the id, the
 * `updatedAt` the form was loaded with (optimistic lock) and the rates that are already paid.
 */
export function PayableForm({
  options,
  today,
  initial,
  initialPlan,
  edit,
}: {
  options: FinanceOptions;
  today: string;
  initial?: Partial<PayableFormValues>;
  initialPlan?: { id?: string; dueOn: string; amountCents: number }[];
  edit?: { id: string; updatedAt: string; locked: LockedRate[] };
}) {
  const t = useTranslations("finance.form");
  const tScopes = useTranslations("finance.scopes");
  const tCategories = useTranslations("finance.categories");
  const tErrors = useTranslations("finance.errors");
  const tToast = useTranslations("finance.toast");
  const locale = useLocale();
  const router = useRouter();
  const { showToast } = useShell();
  const [pending, startTransition] = useTransition();
  const uid = useId();
  const id = (field: string) => `${uid}-${field}`;
  const decimalComma = locale !== "en";
  const keyCounter = useRef(0);
  const nextKey = () => `row-${++keyCounter.current}`;

  const [values, setValues] = useState<PayableFormValues>({ ...EMPTY, ...initial });
  const [total, setTotal] = useState(
    initial?.totalGrossCents ? centsToInput(initial.totalGrossCents, decimalComma) : "",
  );
  const [rows, setRows] = useState<Row[]>(() =>
    (initialPlan ?? []).map((r) => ({
      key: nextKey(),
      id: r.id,
      dueOn: r.dueOn,
      amount: centsToInput(r.amountCents, decimalComma),
    })),
  );
  const [gen, setGen] = useState({ count: "3", first: today, interval: "1" });
  const [error, setError] = useState<{ field: FieldName; code: string } | null>(null);

  const locked = edit?.locked ?? [];
  const lockedCents = locked.reduce((s, r) => s + r.amountCents, 0);
  const totalCents = parseMoneyCents(total);
  const remaining = totalCents === null ? null : totalCents - lockedCents;
  const rowCents = rows.map((r) => parseMoneyCents(r.amount));
  const planSum = rowCents.reduce<number>((s, c) => s + (c ?? 0), 0);
  const difference = remaining === null ? null : remaining - planSum;

  const set = <K extends keyof PayableFormValues>(field: K, value: PayableFormValues[K]) =>
    setValues((prev) => ({ ...prev, [field]: value }));
  const errorText = (code: string) =>
    tErrors.has(code as never) ? tErrors(code as never) : tErrors("generic");
  const invalid = (field: FieldName) =>
    error?.field === field
      ? { "aria-invalid": true as const, "aria-describedby": id("error") }
      : {};

  function fail(code: string) {
    const field = ERROR_FIELD[code] ?? "form";
    setError({ field, code });
    if (field !== "form" && field !== "plan") document.getElementById(id(field))?.focus();
  }

  function generate() {
    if (remaining === null || remaining <= 0) return fail("invalid_amount");
    const count = Number(gen.count);
    const interval = Number(gen.interval);
    if (
      !Number.isInteger(count) ||
      count < 1 ||
      count > MAX_INSTALLMENTS ||
      !Number.isInteger(interval) ||
      interval < 1 ||
      !isIsoDate(gen.first)
    )
      return fail("invalid_generator");
    setError(null);
    setRows(
      planInstallments({
        totalCents: remaining,
        count,
        firstDueOn: gen.first,
        intervalMonths: interval,
      }).map((r) => ({
        key: nextKey(),
        dueOn: r.dueOn,
        amount: centsToInput(r.amountCents, decimalComma),
      })),
    );
  }

  function addRow() {
    const last = rows.at(-1);
    setRows([
      ...rows,
      { key: nextKey(), dueOn: last ? addMonthsClamped(last.dueOn, 1) : today, amount: "" },
    ]);
  }

  /** Puts what is missing (or too much) on the last rate. */
  function settleOnLast() {
    if (difference === null || difference === 0 || rows.length === 0) return;
    const lastIndex = rows.length - 1;
    const last = rowCents[lastIndex] ?? 0;
    const next = last + difference;
    if (next <= 0) return;
    setRows(
      rows.map((r, i) =>
        i === lastIndex ? { ...r, amount: centsToInput(next, decimalComma) } : r,
      ),
    );
  }

  function submit() {
    if (values.title.trim() === "") return fail("title_required");
    if (totalCents === null || totalCents <= 0) return fail("invalid_amount");
    if (rows.some((r, i) => rowCents[i] === null || (rowCents[i] ?? 0) <= 0 || !isIsoDate(r.dueOn)))
      return fail("plan_invalid_amount");
    if (rows.length === 0 && !(edit && remaining === 0)) return fail("plan_empty");
    if (difference !== 0) return fail("plan_sum_mismatch");
    if (values.scope === "event" && values.eventId === "") return fail("invalid_event");
    if (values.scope === "vehicle" && values.vehicleId === "") return fail("invalid_vehicle");
    if (values.scope === "venue_season") {
      if (values.venueId === "") return fail("invalid_venue");
      if (!/^\d{4}$/.test(values.season)) return fail("invalid_season");
    }
    setError(null);

    const input = {
      title: values.title,
      scope: values.scope,
      category: values.category,
      counterpartyContactId: values.counterpartyContactId || null,
      eventId: values.eventId || null,
      venueId: values.venueId || null,
      season: values.season ? Number(values.season) : null,
      vehicleId: values.vehicleId || null,
      permitId: values.permitId || null,
      totalGrossCents: totalCents,
      vatRateBp: values.vatRate === "" ? null : Math.round(Number(values.vatRate) * 100),
      critical: values.critical,
      notes: values.notes,
    };
    const plan = rows.map((r, i) => ({
      id: r.id,
      dueOn: r.dueOn,
      amountCents: rowCents[i] as number,
    }));
    startTransition(async () => {
      if (edit) {
        const result = await updatePayableAction(edit.id, input, plan, edit.updatedAt);
        if (!result.ok) return fail(result.error);
        showToast({ message: result.data.changed ? tToast("saved") : tToast("unchanged") });
        router.push(`/finanzen/posten/${edit.id}` as never);
      } else {
        const result = await createPayableAction(input, plan);
        if (!result.ok) return fail(result.error);
        showToast({ message: tToast("created") });
        router.push(`/finanzen/posten/${result.data.id}` as never);
      }
    });
  }

  const backHref = edit ? `/finanzen/posten/${edit.id}` : "/finanzen";
  const text = (field: keyof PayableFormValues) => String(values[field] ?? "");

  return (
    <form
      noValidate
      className="flex max-w-4xl flex-col gap-4"
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
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor={id("title")}>{t("title")}</Label>
            <Input
              id={id("title")}
              required
              maxLength={200}
              autoComplete="off"
              placeholder={t("titlePlaceholder")}
              value={values.title}
              onChange={(e) => set("title", e.target.value)}
              {...invalid("title")}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={id("counterparty")}>{t("counterparty")}</Label>
            <select
              id={id("counterparty")}
              value={values.counterpartyContactId}
              onChange={(e) => set("counterpartyContactId", e.target.value)}
              className={SELECT_CLASS}
            >
              <option value="">{t("noCounterparty")}</option>
              {options.contacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <p className="text-faint-foreground text-small">{t("counterpartyHint")}</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={id("category")}>{t("category")}</Label>
            <select
              id={id("category")}
              value={values.category}
              onChange={(e) => set("category", e.target.value)}
              className={SELECT_CLASS}
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {tCategories(c)}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={id("scope")}>{t("scope")}</Label>
            <select
              id={id("scope")}
              value={values.scope}
              onChange={(e) => set("scope", e.target.value)}
              className={SELECT_CLASS}
            >
              {SCOPES.map((s) => (
                <option key={s} value={s}>
                  {tScopes(s)}
                </option>
              ))}
            </select>
            <p className="text-faint-foreground text-small">
              {t(`scopeHint.${values.scope}` as never)}
            </p>
          </div>
          {values.scope === "event" && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={id("event")}>{t("event")}</Label>
              <select
                id={id("event")}
                value={values.eventId}
                onChange={(e) => set("eventId", e.target.value)}
                className={SELECT_CLASS}
                {...invalid("event")}
              >
                <option value="">{t("pick")}</option>
                {options.events.map((ev) => (
                  <option key={ev.id} value={ev.id}>
                    {formatDateShort(ev.startsOn, locale)} · {ev.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          {values.scope === "vehicle" && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={id("vehicle")}>{t("vehicle")}</Label>
              <select
                id={id("vehicle")}
                value={values.vehicleId}
                onChange={(e) => set("vehicleId", e.target.value)}
                className={SELECT_CLASS}
                {...invalid("vehicle")}
              >
                <option value="">{t("pick")}</option>
                {options.vehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} · {v.plate}
                  </option>
                ))}
              </select>
            </div>
          )}
          {values.scope === "venue_season" && (
            <>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={id("venue")}>{t("venue")}</Label>
                <select
                  id={id("venue")}
                  value={values.venueId}
                  onChange={(e) => set("venueId", e.target.value)}
                  className={SELECT_CLASS}
                  {...invalid("venue")}
                >
                  <option value="">{t("pick")}</option>
                  {options.venues.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name} · {v.city}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={id("season")}>{t("season")}</Label>
                <Input
                  id={id("season")}
                  inputMode="numeric"
                  maxLength={4}
                  autoComplete="off"
                  placeholder={today.slice(0, 4)}
                  value={values.season}
                  onChange={(e) => set("season", e.target.value)}
                  className="tabular"
                  {...invalid("season")}
                />
              </div>
            </>
          )}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={id("total")}>{t("total")}</Label>
            <div className="relative">
              <Input
                id={id("total")}
                inputMode="decimal"
                autoComplete="off"
                value={total}
                onChange={(e) => setTotal(e.target.value)}
                onBlur={() => {
                  const cents = parseMoneyCents(total);
                  if (cents !== null) setTotal(centsToInput(cents, decimalComma));
                }}
                className="tabular pr-8"
                {...invalid("total")}
              />
              <span className="-translate-y-1/2 pointer-events-none absolute top-1/2 right-3 text-muted-foreground text-small">
                €
              </span>
            </div>
            <p className="text-faint-foreground text-small">{t("totalHint")}</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={id("vat")}>{t("vat")}</Label>
            <select
              id={id("vat")}
              value={values.vatRate}
              onChange={(e) => set("vatRate", e.target.value)}
              className={SELECT_CLASS}
            >
              <option value="">{t("vatUnknown")}</option>
              {VAT_RATES.map((v) => (
                <option key={v} value={v}>
                  {v} %
                </option>
              ))}
              {values.vatRate !== "" &&
                !(VAT_RATES as readonly string[]).includes(values.vatRate) && (
                  <option value={values.vatRate}>{values.vatRate} %</option>
                )}
            </select>
          </div>
          <label className="flex items-start gap-2 sm:col-span-2" htmlFor={id("critical")}>
            <input
              id={id("critical")}
              type="checkbox"
              checked={values.critical}
              onChange={(e) => set("critical", e.target.checked)}
              className="mt-0.5 size-4"
            />
            <span>
              <span className="font-medium">{t("critical")}</span>
              <span className="block text-muted-foreground text-small">{t("criticalHint")}</span>
            </span>
          </label>
        </PanelBody>
      </Panel>

      <Panel>
        <PanelHeader>
          <PanelTitle>{t("sectionPlan")}</PanelTitle>
        </PanelHeader>
        <PanelBody className="flex flex-col gap-4">
          <fieldset className="grid grid-cols-2 items-end gap-3 sm:grid-cols-4">
            <legend className="mb-2 font-medium text-small">{t("generator")}</legend>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={id("gen-count")} className="text-small">
                {t("genCount")}
              </Label>
              <Input
                id={id("gen-count")}
                inputMode="numeric"
                value={gen.count}
                onChange={(e) => setGen({ ...gen, count: e.target.value })}
                className="tabular"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={id("gen-first")} className="text-small">
                {t("genFirst")}
              </Label>
              <Input
                id={id("gen-first")}
                type="date"
                value={gen.first}
                onChange={(e) => setGen({ ...gen, first: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={id("gen-interval")} className="text-small">
                {t("genInterval")}
              </Label>
              <Input
                id={id("gen-interval")}
                inputMode="numeric"
                value={gen.interval}
                onChange={(e) => setGen({ ...gen, interval: e.target.value })}
                className="tabular"
              />
            </div>
            <Button onClick={generate}>
              <Wand2 aria-hidden />
              {t("generate")}
            </Button>
          </fieldset>
          {error?.code === "invalid_generator" && (
            <p role="alert" className="text-small text-status-critical">
              {errorText("invalid_generator")}
            </p>
          )}

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <caption className="sr-only">{t("planCaption")}</caption>
              <thead>
                <tr className="text-muted-foreground text-tiny">
                  <th scope="col" className="px-2 py-1 font-semibold">
                    {t("rate")}
                  </th>
                  <th scope="col" className="px-2 py-1 font-semibold">
                    {t("dueOn")}
                  </th>
                  <th scope="col" className="px-2 py-1 text-right font-semibold">
                    {t("amount")}
                  </th>
                  <th scope="col" className="px-2 py-1">
                    <span className="sr-only">{t("actions")}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {locked.map((r) => (
                  <tr key={r.id} className="border-border-subtle border-t text-muted-foreground">
                    <td className="px-2 py-1.5">{r.position}</td>
                    <td className="px-2 py-1.5">{formatDateShort(r.dueOn, locale)}</td>
                    <td className="tabular px-2 py-1.5 text-right">
                      {formatMoney(r.amountCents, locale)}
                    </td>
                    <td className="px-2 py-1.5">
                      <FinanceStatusBadge status={r.state} />
                    </td>
                  </tr>
                ))}
                {rows.map((r, i) => (
                  <tr key={r.key} className="border-border-subtle border-t">
                    <td className="px-2 py-1.5 text-muted-foreground">{locked.length + i + 1}</td>
                    <td className="px-2 py-1.5">
                      <Input
                        type="date"
                        aria-label={t("dueOnRow", { n: locked.length + i + 1 })}
                        value={r.dueOn}
                        onChange={(e) =>
                          setRows(
                            rows.map((x) =>
                              x.key === r.key ? { ...x, dueOn: e.target.value } : x,
                            ),
                          )
                        }
                        className="w-40"
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <div className="relative ml-auto w-36">
                        <Input
                          inputMode="decimal"
                          autoComplete="off"
                          aria-label={t("amountRow", { n: locked.length + i + 1 })}
                          value={r.amount}
                          onChange={(e) =>
                            setRows(
                              rows.map((x) =>
                                x.key === r.key ? { ...x, amount: e.target.value } : x,
                              ),
                            )
                          }
                          className="tabular pr-8 text-right"
                        />
                        <span className="-translate-y-1/2 pointer-events-none absolute top-1/2 right-3 text-muted-foreground text-small">
                          €
                        </span>
                      </div>
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label={t("removeRow", { n: locked.length + i + 1 })}
                        onClick={() => setRows(rows.filter((x) => x.key !== r.key))}
                      >
                        <Trash2 aria-hidden />
                      </Button>
                    </td>
                  </tr>
                ))}
                {locked.length + rows.length === 0 && (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-2 py-4 text-center text-muted-foreground text-small"
                    >
                      {t("planEmpty")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button onClick={addRow}>
              <Plus aria-hidden />
              {t("addRate")}
            </Button>
            <p
              aria-live="polite"
              className={
                difference === 0
                  ? "text-small text-status-ok"
                  : "font-medium text-small text-status-warn"
              }
            >
              {remaining === null
                ? t("sumNoTotal")
                : difference === 0
                  ? t("sumOk", { sum: formatMoney(planSum + lockedCents, locale) })
                  : t("sumOff", {
                      sum: formatMoney(planSum + lockedCents, locale),
                      total: formatMoney(totalCents ?? 0, locale),
                      difference: formatMoney(Math.abs(difference ?? 0), locale),
                      direction: (difference ?? 0) > 0 ? "missing" : "over",
                    })}
            </p>
            {difference !== null && difference !== 0 && rows.length > 0 && (
              <Button size="sm" onClick={settleOnLast}>
                {t("settleOnLast")}
              </Button>
            )}
          </div>
        </PanelBody>
      </Panel>

      <Panel>
        <PanelHeader>
          <PanelTitle>{t("sectionNotes")}</PanelTitle>
        </PanelHeader>
        <PanelBody>
          <Label htmlFor={id("notes")} className="sr-only">
            {t("notes")}
          </Label>
          <textarea
            id={id("notes")}
            rows={4}
            maxLength={4000}
            placeholder={t("notesPlaceholder")}
            value={text("notes")}
            onChange={(e) => set("notes", e.target.value)}
            className={TEXTAREA_CLASS}
          />
        </PanelBody>
      </Panel>

      {error && error.code !== "invalid_generator" && (
        <div id={id("error")} role="alert" className="flex flex-wrap items-center gap-3">
          <p className="text-small text-status-critical">{errorText(error.code)}</p>
          {(error.code === "conflict" || error.code === "installment_locked") && (
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
