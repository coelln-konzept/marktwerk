"use client";

import { parseWholeNumber } from "@marktwerk/core";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useId, useState, useTransition } from "react";
import { createVehicleAction, updateVehicleAction } from "@/app/(app)/firma/actions";
import { TEXTAREA_CLASS } from "@/components/event-detail/textarea-class";
import { useShell } from "@/components/shell/shell-context";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Panel, PanelBody, PanelFooter } from "@/components/ui/panel";
import { cn } from "@/lib/utils";
import { useErrorText } from "./shared";

export type VehicleFormValues = {
  name: string;
  plate: string;
  make: string | null;
  model: string | null;
  vin: string | null;
  firstRegistrationOn: string | null;
  grossWeightKg: number | null;
  odometerKm: number | null;
  odometerRecordedOn: string | null;
  insurer: string | null;
  policyNumber: string | null;
  notes: string | null;
};

export const EMPTY_VEHICLE: VehicleFormValues = {
  name: "",
  plate: "",
  make: null,
  model: null,
  vin: null,
  firstRegistrationOn: null,
  grossWeightKg: null,
  odometerKm: null,
  odometerRecordedOn: null,
  insurer: null,
  policyNumber: null,
  notes: null,
};

const FIELD_OF: Record<string, string> = {
  invalid_name: "name",
  invalid_plate: "plate",
  plate_required: "plate",
  plate_taken: "plate",
  invalid_vin: "vin",
  vin_taken: "vin",
  invalid_date: "firstRegistration",
  future_date: "firstRegistration",
  invalid_weight: "weight",
  invalid_odometer: "odometer",
  invalid_text: "notes",
};

/**
 * "Fahrzeug anlegen" and "Fahrzeug bearbeiten": a page (more than eight fields). Weight and kilometres are
 * typed as whole numbers; the odometer date defaults to today on the server when only the km are given.
 */
export function VehicleForm({
  vehicleId,
  initial,
}: {
  /** Set when editing; without it the form creates a vehicle. */
  vehicleId?: string;
  initial: VehicleFormValues;
}) {
  const t = useTranslations("company");
  const tf = useTranslations("company.vehicleForm");
  const router = useRouter();
  const { showToast } = useShell();
  const errorText = useErrorText();
  const [pending, startTransition] = useTransition();
  const uid = useId();
  const editing = vehicleId !== undefined;
  const [error, setError] = useState<{ field: string | null; text: string } | null>(null);

  const [name, setName] = useState(initial.name);
  const [plate, setPlate] = useState(initial.plate);
  const [make, setMake] = useState(initial.make ?? "");
  const [model, setModel] = useState(initial.model ?? "");
  const [vin, setVin] = useState(initial.vin ?? "");
  const [firstRegistration, setFirstRegistration] = useState(initial.firstRegistrationOn ?? "");
  const [weight, setWeight] = useState(initial.grossWeightKg?.toString() ?? "");
  const [odometer, setOdometer] = useState(initial.odometerKm?.toString() ?? "");
  const [odometerOn, setOdometerOn] = useState(initial.odometerRecordedOn ?? "");
  const [insurer, setInsurer] = useState(initial.insurer ?? "");
  const [policy, setPolicy] = useState(initial.policyNumber ?? "");
  const [notes, setNotes] = useState(initial.notes ?? "");

  const f = (key: string) => `${uid}-${key}`;
  const invalid = (field: string) =>
    error?.field === field ? { "aria-invalid": true as const } : {};

  function fail(code: string, field?: string) {
    const target = field ?? FIELD_OF[code] ?? null;
    setError({ field: target, text: errorText(code) });
    if (target) document.getElementById(f(target))?.focus();
  }

  function whole(text: string): number | null | undefined {
    const value = text.trim();
    if (value === "") return null;
    return parseWholeNumber(value) ?? undefined;
  }

  function submit() {
    setError(null);
    // Required fields are answered on the spot (no round trip); the first wrong field gets the focus.
    if (name.trim() === "") return fail("invalid_name");
    if (plate.trim() === "") return fail("plate_required");
    const grossWeightKg = whole(weight);
    if (grossWeightKg === undefined) return fail("invalid_weight");
    const odometerKm = whole(odometer);
    if (odometerKm === undefined) return fail("invalid_odometer");

    const input = {
      name,
      plate,
      make: make || null,
      model: model || null,
      vin: vin || null,
      firstRegistrationOn: firstRegistration || null,
      grossWeightKg,
      odometerKm,
      odometerRecordedOn: odometerOn || null,
      insurer: insurer || null,
      policyNumber: policy || null,
      notes: notes || null,
    };
    startTransition(async () => {
      const result = editing
        ? await updateVehicleAction(vehicleId, input)
        : await createVehicleAction(input);
      if (!result.ok) {
        fail(result.error);
        if (result.error === "not_found" && editing) router.push("/firma/fahrzeuge" as never);
        return;
      }
      const id = "id" in result.data ? result.data.id : vehicleId;
      if (editing && "changed" in result.data && !result.data.changed) {
        showToast({ message: tf("unchanged") });
      } else {
        showToast({ message: tf(editing ? "saved" : "created", { name: name.trim() }) });
      }
      router.push(`/firma/fahrzeuge/${id}` as never);
    });
  }

  const legend = "mb-3 font-semibold text-[15px]";
  const cell = "flex flex-col gap-1.5";
  const hint = "text-faint-foreground text-small";
  const backHref = editing ? `/firma/fahrzeuge/${vehicleId}` : "/firma/fahrzeuge";

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
          <fieldset className="m-0 min-w-0 border-0 p-0">
            <legend className={legend}>{tf("basics")}</legend>
            <div className="grid gap-4 sm:grid-cols-6">
              <div className={cn(cell, "sm:col-span-3")}>
                <Label htmlFor={f("name")}>{tf("name")}</Label>
                <Input
                  id={f("name")}
                  value={name}
                  maxLength={120}
                  required
                  autoComplete="off"
                  aria-describedby={f("name-hint")}
                  onChange={(e) => setName(e.target.value)}
                  {...invalid("name")}
                />
                <p id={f("name-hint")} className={hint}>
                  {tf("nameHint")}
                </p>
              </div>
              <div className={cn(cell, "sm:col-span-3")}>
                <Label htmlFor={f("plate")}>{tf("plate")}</Label>
                <Input
                  id={f("plate")}
                  value={plate}
                  maxLength={15}
                  required
                  autoComplete="off"
                  className="uppercase"
                  onChange={(e) => setPlate(e.target.value)}
                  {...invalid("plate")}
                />
              </div>
              <div className={cn(cell, "sm:col-span-3")}>
                <Label htmlFor={f("make")} optional>
                  {tf("make")}
                </Label>
                <Input
                  id={f("make")}
                  value={make}
                  maxLength={120}
                  autoComplete="off"
                  onChange={(e) => setMake(e.target.value)}
                />
              </div>
              <div className={cn(cell, "sm:col-span-3")}>
                <Label htmlFor={f("model")} optional>
                  {tf("model")}
                </Label>
                <Input
                  id={f("model")}
                  value={model}
                  maxLength={120}
                  autoComplete="off"
                  onChange={(e) => setModel(e.target.value)}
                />
              </div>
              <div className={cn(cell, "sm:col-span-3")}>
                <Label htmlFor={f("vin")} optional>
                  {tf("vin")}
                </Label>
                <Input
                  id={f("vin")}
                  value={vin}
                  maxLength={20}
                  autoComplete="off"
                  className="tabular uppercase"
                  onChange={(e) => setVin(e.target.value)}
                  {...invalid("vin")}
                />
              </div>
              <div className={cn(cell, "sm:col-span-3")}>
                <Label htmlFor={f("firstRegistration")} optional>
                  {tf("firstRegistration")}
                </Label>
                <Input
                  id={f("firstRegistration")}
                  type="date"
                  value={firstRegistration}
                  className="tabular"
                  onChange={(e) => setFirstRegistration(e.target.value)}
                  {...invalid("firstRegistration")}
                />
              </div>
              <div className={cn(cell, "sm:col-span-3")}>
                <Label htmlFor={f("weight")} optional>
                  {tf("weight")}
                </Label>
                <Input
                  id={f("weight")}
                  value={weight}
                  inputMode="numeric"
                  autoComplete="off"
                  aria-describedby={f("weight-hint")}
                  className="tabular"
                  onChange={(e) => setWeight(e.target.value)}
                  {...invalid("weight")}
                />
                <p id={f("weight-hint")} className={hint}>
                  {tf("weightHint")}
                </p>
              </div>
            </div>
          </fieldset>

          <fieldset className="m-0 min-w-0 border-0 p-0">
            <legend className={legend}>{tf("odometerSection")}</legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className={cell}>
                <Label htmlFor={f("odometer")} optional>
                  {tf("odometer")}
                </Label>
                <div className="relative">
                  <Input
                    id={f("odometer")}
                    value={odometer}
                    inputMode="numeric"
                    autoComplete="off"
                    className="tabular pr-10"
                    onChange={(e) => setOdometer(e.target.value)}
                    {...invalid("odometer")}
                  />
                  <span className="-translate-y-1/2 pointer-events-none absolute top-1/2 right-3 text-muted-foreground text-small">
                    km
                  </span>
                </div>
              </div>
              <div className={cell}>
                <Label htmlFor={f("odometerOn")} optional>
                  {tf("odometerOn")}
                </Label>
                <Input
                  id={f("odometerOn")}
                  type="date"
                  value={odometerOn}
                  className="tabular"
                  onChange={(e) => setOdometerOn(e.target.value)}
                />
              </div>
            </div>
          </fieldset>

          <fieldset className="m-0 min-w-0 border-0 p-0">
            <legend className={legend}>{tf("insuranceSection")}</legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className={cell}>
                <Label htmlFor={f("insurer")} optional>
                  {tf("insurer")}
                </Label>
                <Input
                  id={f("insurer")}
                  value={insurer}
                  maxLength={120}
                  autoComplete="off"
                  onChange={(e) => setInsurer(e.target.value)}
                />
              </div>
              <div className={cell}>
                <Label htmlFor={f("policy")} optional>
                  {tf("policy")}
                </Label>
                <Input
                  id={f("policy")}
                  value={policy}
                  maxLength={120}
                  autoComplete="off"
                  className="tabular"
                  onChange={(e) => setPolicy(e.target.value)}
                />
              </div>
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
