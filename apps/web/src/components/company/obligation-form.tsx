"use client";

import {
  huIntervalMonths,
  nextAnnualDate,
  OBLIGATION_KINDS,
  OBLIGATION_PRESETS,
  type ObligationPreset,
  parseWholeNumber,
} from "@marktwerk/core";
import { CalendarX2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useId, useState, useTransition } from "react";
import { createObligationAction, updateObligationAction } from "@/app/(app)/firma/actions";
import { TEXTAREA_CLASS } from "@/components/event-detail/textarea-class";
import { useShell } from "@/components/shell/shell-context";
import { Button, buttonVariants } from "@/components/ui/button";
import { FORM_SECTION, FORM_SECTION_TITLE } from "@/components/ui/form-section";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Panel, PanelBody, PanelFooter } from "@/components/ui/panel";
import { cn } from "@/lib/utils";
import { FieldError, FormErrorSummary, useFieldErrors } from "./field-errors";
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
  title_required: "title",
  responsible_required: "responsible",
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

/** Field order of the form: the first field with an error gets the focus. */
const ORDER = [
  "title",
  "kind",
  "scope",
  "vehicle",
  "venue",
  "intervalMonths",
  "intervalKm",
  "nextDueOn",
  "nextDueKm",
  "leadDays",
  "responsible",
  "notes",
] as const;

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
  initialPreset,
}: {
  /** Set when editing; without it the form creates an obligation. */
  obligationId?: string;
  initial: ObligationFormValues;
  vehicles: { id: string; name: string; plate: string; grossWeightKg: number | null }[];
  venues: { id: string; name: string; city: string }[];
  staff: { id: string; name: string }[];
  legal: LegalMonths;
  today: string;
  /** Preset to apply on first render (links such as "HU anlegen" on a new vehicle); create mode only. */
  initialPreset?: string;
}) {
  const t = useTranslations("company");
  const tf = useTranslations("company.form");
  const router = useRouter();
  const { showToast } = useShell();
  const errorText = useErrorText();
  const [pending, startTransition] = useTransition();
  const uid = useId();
  const editing = obligationId !== undefined;
  const f = (key: string) => `${uid}-${key}`;
  const { errors, show, clear, invalid } = useFieldErrors(f);

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

  // A link with a preset ("HU/TÜV anlegen" on a new vehicle) opens the form already filled in; the
  // person can still change everything. Runs once on mount.
  // biome-ignore lint/correctness/useExhaustiveDependencies: deliberately once, with the first state
  useEffect(() => {
    if (initialPreset && !editing) choosePreset(initialPreset);
  }, []);

  function chooseVehicle(id: string) {
    setVehicleId(id);
    if (!preset || editing) return;
    if (preset.legal) {
      const m = legalMonthsFor(preset, id);
      setMonths(m === null ? "" : String(m));
    }
    if (titleAuto) setTitle(presetTitle(preset, id));
  }

  function whole(text: string): number | null | undefined {
    const value = text.trim();
    if (value === "") return null;
    return parseWholeNumber(value) ?? undefined;
  }

  function submit() {
    clear();
    // Every wrong field is answered on the spot, at the field (no round trip); the first one gets the focus.
    const found: Record<string, string> = {};
    if (title.trim() === "") found.title = errorText("title_required");
    if (scope === "vehicle" && vehicleId === "") found.vehicle = errorText("invalid_vehicle");
    if (scope === "venue" && venueId === "") found.venue = errorText("invalid_venue");
    const intervalMonths = whole(months);
    if (intervalMonths === undefined || intervalMonths === 0)
      found.intervalMonths = errorText("invalid_interval");
    const intervalKm = whole(km);
    if (scope === "vehicle" && (intervalKm === undefined || intervalKm === 0))
      found.intervalKm = errorText("invalid_interval");
    const nextDueKm = whole(dueKm);
    if (scope === "vehicle" && nextDueKm === undefined) found.nextDueKm = errorText("invalid_due");
    const lead = whole(leadDays);
    if (lead === undefined || lead === null || lead > 365)
      found.leadDays = errorText("invalid_lead_days");
    if (responsible === "") found.responsible = errorText("responsible_required");
    if (Object.keys(found).length > 0) return show(found, ORDER);

    const input = {
      kind,
      title,
      scope,
      vehicleId: scope === "vehicle" ? vehicleId || null : null,
      venueId: scope === "venue" ? venueId || null : null,
      intervalMonths: intervalMonths ?? null,
      intervalKm: scope === "vehicle" ? (intervalKm ?? null) : null,
      nextDueOn: dueOn || null,
      nextDueKm: scope === "vehicle" ? (nextDueKm ?? null) : null,
      leadDays: lead ?? 0,
      responsibleStaffMemberId: responsible,
      createsPayable,
      notes: notes || null,
    };
    startTransition(async () => {
      const result = editing
        ? await updateObligationAction(obligationId, input)
        : await createObligationAction(input);
      if (!result.ok) {
        const field = FIELD_OF[result.error] ?? "form";
        show({ [field]: errorText(result.error) }, ORDER);
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

  const cell = "flex flex-col gap-1.5";
  const hint = "text-faint-foreground text-small";
  // Abbrechen goes back to where the person started: the obligation, the vehicle it was started from, or the list.
  const backHref = editing
    ? `/firma/pflichten/${obligationId}`
    : initial.vehicleId
      ? `/firma/fahrzeuge/${initial.vehicleId}`
      : "/firma/pflichten";
  // Without a date or km target the obligation never reminds anybody ("Fälligkeit fehlt", UX-022).
  const dueMissing = dueOn === "" && (scope !== "vehicle" || dueKm.trim() === "");

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <Panel>
        <PanelBody className="flex flex-col gap-6">
          {!editing && (
            <fieldset className="m-0 min-w-0 border-0 p-0">
              <div className={cn(cell, "max-w-md")}>
                <Label htmlFor={f("preset")} optional>
                  {tf("preset")}
                </Label>
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

          <fieldset className={FORM_SECTION}>
            <legend className={FORM_SECTION_TITLE}>{tf("basics")}</legend>
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
                <FieldError id={f("title")} text={errors.title} />
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
                <FieldError id={f("kind")} text={errors.kind} />
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
                <FieldError id={f("scope")} text={errors.scope} />
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
                  <FieldError id={f("vehicle")} text={errors.vehicle} />
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
                  <FieldError id={f("venue")} text={errors.venue} />
                </div>
              )}
            </div>
          </fieldset>

          <fieldset className={FORM_SECTION}>
            <legend className={FORM_SECTION_TITLE}>{tf("schedule")}</legend>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className={cell}>
                <Label htmlFor={f("intervalMonths")} optional>
                  {tf("intervalMonths")}
                </Label>
                <Input
                  id={f("intervalMonths")}
                  value={months}
                  inputMode="numeric"
                  autoComplete="off"
                  className="tabular"
                  onChange={(e) => setMonths(e.target.value)}
                  {...invalid("intervalMonths", f("intervalMonths-hint"))}
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
                <FieldError id={f("intervalMonths")} text={errors.intervalMonths} />
              </div>
              {scope === "vehicle" && (
                <div className={cell}>
                  <Label htmlFor={f("intervalKm")} optional>
                    {tf("intervalKm")}
                  </Label>
                  <Input
                    id={f("intervalKm")}
                    value={km}
                    inputMode="numeric"
                    autoComplete="off"
                    className="tabular"
                    onChange={(e) => setKm(e.target.value)}
                    {...invalid("intervalKm", f("intervalKm-hint"))}
                  />
                  <p id={f("intervalKm-hint")} className={hint}>
                    {tf("intervalKmHint")}
                  </p>
                  <FieldError id={f("intervalKm")} text={errors.intervalKm} />
                </div>
              )}
              <div className={cell}>
                <Label htmlFor={f("nextDueOn")} optional>
                  {tf("nextDueOn")}
                </Label>
                <Input
                  id={f("nextDueOn")}
                  type="date"
                  value={dueOn}
                  className="tabular"
                  onChange={(e) => setDueOn(e.target.value)}
                  {...invalid("nextDueOn", dueMissing ? f("due-missing") : undefined)}
                />
                <FieldError id={f("nextDueOn")} text={errors.nextDueOn} />
              </div>
              {scope === "vehicle" && (
                <div className={cell}>
                  <Label htmlFor={f("nextDueKm")} optional>
                    {tf("nextDueKm")}
                  </Label>
                  <Input
                    id={f("nextDueKm")}
                    value={dueKm}
                    inputMode="numeric"
                    autoComplete="off"
                    className="tabular"
                    onChange={(e) => setDueKm(e.target.value)}
                    {...invalid("nextDueKm", dueMissing ? f("due-missing") : undefined)}
                  />
                  <FieldError id={f("nextDueKm")} text={errors.nextDueKm} />
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
                <FieldError id={f("leadDays")} text={errors.leadDays} />
              </div>
            </div>
            {dueMissing && (
              <p
                id={f("due-missing")}
                className="mt-3 flex items-start gap-1.5 text-small text-status-warn"
              >
                <CalendarX2 aria-hidden className="mt-0.5 size-4 shrink-0" />
                {tf("dueMissingHint")}
              </p>
            )}
          </fieldset>

          <fieldset className={FORM_SECTION}>
            <legend className={FORM_SECTION_TITLE}>{tf("responsibleSection")}</legend>
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
                <FieldError id={f("responsible")} text={errors.responsible} />
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
                <Label htmlFor={f("notes")} optional>
                  {tf("notes")}
                </Label>
                <textarea
                  id={f("notes")}
                  value={notes}
                  rows={3}
                  maxLength={2000}
                  className={TEXTAREA_CLASS}
                  onChange={(e) => setNotes(e.target.value)}
                  {...invalid("notes")}
                />
                <FieldError id={f("notes")} text={errors.notes} />
              </div>
            </div>
          </fieldset>
        </PanelBody>
        <PanelFooter className="justify-between">
          <FormErrorSummary errors={errors} />
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
