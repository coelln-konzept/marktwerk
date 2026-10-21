"use client";

import {
  huIntervalMonths,
  nextAnnualDate,
  OBLIGATION_KINDS,
  OBLIGATION_PRESETS,
  type ObligationPreset,
  parseWholeNumber,
} from "@marktwerk/core";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useId, useState, useTransition } from "react";
import { createObligationAction, updateObligationAction } from "@/app/(app)/firma/actions";
import { TEXTAREA_CLASS } from "@/components/event-detail/textarea-class";
import { useShell } from "@/components/shell/shell-context";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Panel, PanelBody, PanelFooter } from "@/components/ui/panel";
import { cn } from "@/lib/utils";
import { SELECT_CLASS, useErrorText } from "./shared";

export type ObligationFormValues = {
  kind: string;
  title: string;
  scope: "company" | "vehicle" | "venue";
  vehicleId: string | null;
  venueId: string | null;
  intervalMonths: number | null;
  intervalKm: number | null;
  nextDueOn: string | null;
  nextDueKm: number | null;
  leadDays: number;
  responsibleStaffMemberId: string;
  createsPayable: boolean;
  notes: string | null;
};

export type LegalMonths = {
  huUpTo3500: number | null;
  huOver3500: number | null;
  uvv: number | null;
};

const FIELD_OF: Record<string, string> = {
  invalid_kind: "kind",
  invalid_name: "title",
  invalid_scope: "scope",
  invalid_vehicle: "vehicle",
  invalid_venue: "venue",
  invalid_interval: "intervalMonths",
  invalid_date: "nextDueOn",
  invalid_due: "nextDueKm",
  invalid_lead_days: "leadDays",
  invalid_staff: "responsible",
  invalid_text: "notes",
};

/**
 * "Pflicht anlegen" and "Pflicht bearbeiten": a page, because an obligation has more than eight fields
 * (UX concept §4). Presets fill kind, interval and lead time; the HU interval follows the vehicle's gross
 * weight and the UVV interval comes from the legal numbers, never from a constant in code.
 */
export function ObligationForm({
  obligationId,
  initial,
  vehicles,
  venues,
  staff,
  legal,
  today,
}: {
  /** Set when editing; without it the form creates an obligation. */
  obligationId?: string;
  initial: ObligationFormValues;
  vehicles: { id: string; name: string; plate: string; grossWeightKg: number | null }[];
  venues: { id: string; name: string; city: string }[];
  staff: { id: string; name: string }[];
  legal: LegalMonths;
  today: string;
}) {
  const t = useTranslations("company");
  const tf = useTranslations("company.form");
  const router = useRouter();
  const { showToast } = useShell();
  const errorText = useErrorText();
  const [pending, startTransition] = useTransition();
  const uid = useId();
  const editing = obligationId !== undefined;
  const [error, setError] = useState<{ field: string | null; text: string } | null>(null);

  const [presetKey, setPresetKey] = useState("");
  const [titleAuto, setTitleAuto] = useState(false);
  const [kind, setKind] = useState(initial.kind);
  const [title, setTitle] = useState(initial.title);
  const [scope, setScope] = useState(initial.scope);
  const [vehicleId, setVehicleId] = useState(initial.vehicleId ?? "");
  const [venueId, setVenueId] = useState(initial.venueId ?? "");
  const [months, setMonths] = useState(initial.intervalMonths?.toString() ?? "");
  const [km, setKm] = useState(initial.intervalKm?.toString() ?? "");
  const [dueOn, setDueOn] = useState(initial.nextDueOn ?? "");
  const [dueKm, setDueKm] = useState(initial.nextDueKm?.toString() ?? "");
  const [leadDays, setLeadDays] = useState(String(initial.leadDays));
  const [responsible, setResponsible] = useState(initial.responsibleStaffMemberId);
  const [createsPayable, setCreatesPayable] = useState(initial.createsPayable);
  const [notes, setNotes] = useState(initial.notes ?? "");

  const preset = OBLIGATION_PRESETS.find((p) => p.key === presetKey) ?? null;

  /** Interval a legal preset gives for the chosen vehicle; null if the legal number is missing. */
  function legalMonthsFor(p: ObligationPreset, forVehicle: string): number | null {
    if (p.legal === "uvv") return legal.uvv;
    if (p.legal === "hu") {
      const weight = vehicles.find((v) => v.id === forVehicle)?.grossWeightKg ?? null;
      return huIntervalMonths(weight, { upTo3500: legal.huUpTo3500, over3500: legal.huOver3500 });
    }
    return p.intervalMonths;
  }

  function presetTitle(p: ObligationPreset, forVehicle: string) {
    const base = t(`presets.${p.key}` as never);
    const name = vehicles.find((v) => v.id === forVehicle)?.name;
    return p.scope === "vehicle" && name ? `${base} – ${name}` : base;
  }

  function choosePreset(key: string) {
    setPresetKey(key);
    const p = OBLIGATION_PRESETS.find((x) => x.key === key);
    if (!p) return;
    const forVehicle =
      p.scope === "vehicle"
        ? vehicleId || (vehicles.length === 1 ? (vehicles[0]?.id ?? "") : "")
        : "";
    setKind(p.kind);
    setScope(p.scope);
    setVehicleId(forVehicle);
    setVenueId("");
    const m = legalMonthsFor(p, forVehicle);
    setMonths(m === null ? "" : String(m));
    setKm(p.intervalKm === null ? "" : String(p.intervalKm));
    setLeadDays(String(p.leadDays));
    setCreatesPayable(p.createsPayable);
    setDueOn(p.annualDate ? nextAnnualDate(today, p.annualDate.month, p.annualDate.day) : "");
    setDueKm("");
    setTitle(presetTitle(p, forVehicle));
    setTitleAuto(true);
  }

  function chooseVehicle(id: string) {
    setVehicleId(id);
    if (!preset || editing) return;
    if (preset.legal) {
      const m = legalMonthsFor(preset, id);
      setMonths(m === null ? "" : String(m));
    }
    if (titleAuto) setTitle(presetTitle(preset, id));
  }

  function fail(code: string, field?: string) {
    const target = field ?? FIELD_OF[code] ?? null;
    setError({ field: target, text: errorText(code) });
    if (target) document.getElementById(`${uid}-${target}`)?.focus();
  }

  function whole(text: string): number | null | undefined {
    const value = text.trim();
    if (value === "") return null;
    return parseWholeNumber(value) ?? undefined;
  }

  function submit() {
    setError(null);
    const intervalMonths = whole(months);
    if (intervalMonths === undefined) return fail("invalid_interval", "intervalMonths");
    const intervalKm = whole(km);
    if (intervalKm === undefined) return fail("invalid_interval", "intervalKm");
    const nextDueKm = whole(dueKm);
    if (nextDueKm === undefined) return fail("invalid_due", "nextDueKm");
    const lead = whole(leadDays);
    if (lead === undefined || lead === null) return fail("invalid_lead_days");

    const input = {
      kind,
      title,
      scope,
      vehicleId: scope === "vehicle" ? vehicleId || null : null,
      venueId: scope === "venue" ? venueId || null : null,
      intervalMonths,
      intervalKm: scope === "vehicle" ? intervalKm : null,
      nextDueOn: dueOn || null,
      nextDueKm: scope === "vehicle" ? nextDueKm : null,
      leadDays: lead,
      responsibleStaffMemberId: responsible,
      createsPayable,
      notes: notes || null,
    };
    startTransition(async () => {
      const result = editing
        ? await updateObligationAction(obligationId, input)
        : await createObligationAction(input);
      if (!result.ok) {
        fail(result.error);
        if (result.error === "not_found" && editing) router.push("/firma/pflichten" as never);
        return;
      }
      const id = "id" in result.data ? result.data.id : obligationId;
      if (editing && "changed" in result.data && !result.data.changed) {
        showToast({ message: tf("unchanged") });
      } else {
        showToast({ message: tf(editing ? "saved" : "created", { title: title.trim() }) });
      }
      router.push(`/firma/pflichten/${id}` as never);
    });
  }

  const f = (key: string) => `${uid}-${key}`;
  const invalid = (field: string) =>
    error?.field === field ? { "aria-invalid": true as const } : {};
  const legend = "mb-3 font-semibold text-[15px]";
  const cell = "flex flex-col gap-1.5";
  const hint = "text-faint-foreground text-small";
  const backHref = editing ? `/firma/pflichten/${obligationId}` : "/firma/pflichten";

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <Panel>
        <PanelBody className="flex flex-col gap-7">
          {!editing && (
            <fieldset className="m-0 min-w-0 border-0 p-0">
              <div className={cn(cell, "max-w-md")}>
                <Label htmlFor={f("preset")}>{tf("preset")}</Label>
                <select
                  id={f("preset")}
                  value={presetKey}
                  aria-describedby={f("preset-hint")}
                  className={SELECT_CLASS}
                  onChange={(e) => choosePreset(e.target.value)}
                >
                  <option value="">{tf("noPreset")}</option>
                  {OBLIGATION_PRESETS.map((p) => (
                    <option key={p.key} value={p.key}>
                      {t(`presets.${p.key}` as never)}
                    </option>
                  ))}
                </select>
                <p id={f("preset-hint")} className={hint}>
                  {tf("presetHint")}
                </p>
              </div>
            </fieldset>
          )}

          <fieldset className="m-0 min-w-0 border-0 p-0">
            <legend className={legend}>{tf("basics")}</legend>
            <div className="grid gap-4 sm:grid-cols-6">
              <div className={cn(cell, "sm:col-span-4")}>
                <Label htmlFor={f("title")}>{tf("title")}</Label>
                <Input
                  id={f("title")}
                  value={title}
                  maxLength={120}
                  required
                  autoComplete="off"
                  onChange={(e) => {
                    setTitle(e.target.value);
                    setTitleAuto(false);
                  }}
                  {...invalid("title")}
                />
              </div>
              <div className={cn(cell, "sm:col-span-2")}>
                <Label htmlFor={f("kind")}>{tf("kind")}</Label>
                <select
                  id={f("kind")}
                  value={kind}
                  className={SELECT_CLASS}
                  onChange={(e) => setKind(e.target.value)}
                  {...invalid("kind")}
                >
                  {OBLIGATION_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {t(`kinds.${k}`)}
                    </option>
                  ))}
                </select>
              </div>
              <div className={cn(cell, "sm:col-span-2")}>
                <Label htmlFor={f("scope")}>{tf("scope")}</Label>
                <select
                  id={f("scope")}
                  value={scope}
                  className={SELECT_CLASS}
                  onChange={(e) => setScope(e.target.value as ObligationFormValues["scope"])}
                  {...invalid("scope")}
                >
                  {(["company", "vehicle", "venue"] as const).map((s) => (
                    <option key={s} value={s}>
                      {t(`scopes.${s}`)}
                    </option>
                  ))}
                </select>
              </div>
              {scope === "vehicle" && (
                <div className={cn(cell, "sm:col-span-4")}>
                  <Label htmlFor={f("vehicle")}>{tf("vehicle")}</Label>
                  <select
                    id={f("vehicle")}
                    value={vehicleId}
                    className={SELECT_CLASS}
                    onChange={(e) => chooseVehicle(e.target.value)}
                    {...invalid("vehicle")}
                  >
                    <option value="">{tf("choose")}</option>
                    {vehicles.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name} · {v.plate}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {scope === "venue" && (
                <div className={cn(cell, "sm:col-span-4")}>
                  <Label htmlFor={f("venue")}>{tf("venue")}</Label>
                  <select
                    id={f("venue")}
                    value={venueId}
                    className={SELECT_CLASS}
                    onChange={(e) => setVenueId(e.target.value)}
                    {...invalid("venue")}
                  >
                    <option value="">{tf("choose")}</option>
                    {venues.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name} · {v.city}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </fieldset>

          <fieldset className="m-0 min-w-0 border-0 p-0">
            <legend className={legend}>{tf("schedule")}</legend>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className={cell}>
                <Label htmlFor={f("intervalMonths")}>{tf("intervalMonths")}</Label>
                <Input
                  id={f("intervalMonths")}
                  value={months}
                  inputMode="numeric"
                  autoComplete="off"
                  aria-describedby={f("intervalMonths-hint")}
                  className="tabular"
                  onChange={(e) => setMonths(e.target.value)}
                  {...invalid("intervalMonths")}
                />
                <p id={f("intervalMonths-hint")} className={hint}>
                  {preset?.legal && !editing
                    ? months !== ""
                      ? tf(preset.legal === "hu" ? "legalHu" : "legalUvv", {
                          months: Number(months),
                        })
                      : tf("legalMissing")
                    : tf("intervalMonthsHint")}
                </p>
              </div>
              {scope === "vehicle" && (
                <div className={cell}>
                  <Label htmlFor={f("intervalKm")}>{tf("intervalKm")}</Label>
                  <Input
                    id={f("intervalKm")}
                    value={km}
                    inputMode="numeric"
                    autoComplete="off"
                    aria-describedby={f("intervalKm-hint")}
                    className="tabular"
                    onChange={(e) => setKm(e.target.value)}
                    {...invalid("intervalKm")}
                  />
                  <p id={f("intervalKm-hint")} className={hint}>
                    {tf("intervalKmHint")}
                  </p>
                </div>
              )}
              <div className={cell}>
                <Label htmlFor={f("nextDueOn")}>{tf("nextDueOn")}</Label>
                <Input
                  id={f("nextDueOn")}
                  type="date"
                  value={dueOn}
                  className="tabular"
                  onChange={(e) => setDueOn(e.target.value)}
                  {...invalid("nextDueOn")}
                />
              </div>
              {scope === "vehicle" && (
                <div className={cell}>
                  <Label htmlFor={f("nextDueKm")}>{tf("nextDueKm")}</Label>
                  <Input
                    id={f("nextDueKm")}
                    value={dueKm}
                    inputMode="numeric"
                    autoComplete="off"
                    className="tabular"
                    onChange={(e) => setDueKm(e.target.value)}
                    {...invalid("nextDueKm")}
                  />
                </div>
              )}
              <div className={cell}>
                <Label htmlFor={f("leadDays")}>{tf("leadDays")}</Label>
                <Input
                  id={f("leadDays")}
                  value={leadDays}
                  inputMode="numeric"
                  autoComplete="off"
                  required
                  className="tabular"
                  onChange={(e) => setLeadDays(e.target.value)}
                  {...invalid("leadDays")}
                />
              </div>
            </div>
          </fieldset>

          <fieldset className="m-0 min-w-0 border-0 p-0">
            <legend className={legend}>{tf("responsibleSection")}</legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className={cell}>
                <Label htmlFor={f("responsible")}>{tf("responsible")}</Label>
                <select
                  id={f("responsible")}
                  value={responsible}
                  className={SELECT_CLASS}
                  onChange={(e) => setResponsible(e.target.value)}
                  {...invalid("responsible")}
                >
                  <option value="">{tf("choose")}</option>
                  {staff.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <label className="flex items-start gap-2 self-end pb-2 text-body">
                <input
                  type="checkbox"
                  checked={createsPayable}
                  onChange={(e) => setCreatesPayable(e.target.checked)}
                  className="mt-1 size-4 accent-primary"
                />
                {tf("createsPayable")}
              </label>
              <div className={cn(cell, "sm:col-span-2")}>
                <Label htmlFor={f("notes")}>{tf("notes")}</Label>
                <textarea
                  id={f("notes")}
                  value={notes}
                  rows={3}
                  maxLength={2000}
                  className={TEXTAREA_CLASS}
                  onChange={(e) => setNotes(e.target.value)}
                  {...invalid("notes")}
                />
              </div>
            </div>
          </fieldset>
        </PanelBody>
        <PanelFooter className="justify-between">
          <p role="alert" className="min-w-0 flex-1 text-small text-status-critical">
            {error?.text}
          </p>
          <div className="flex items-center gap-2">
            <Link href={backHref as never} className={buttonVariants({ variant: "outline" })}>
              {t("cancel")}
            </Link>
            <Button type="submit" variant="default" aria-busy={pending} disabled={pending}>
              {tf(editing ? "save" : "create")}
            </Button>
          </div>
        </PanelFooter>
      </Panel>
    </form>
  );
}
