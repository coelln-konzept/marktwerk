"use client";

import {
  BUNDESLAENDER,
  formatCoordinate,
  formatMetres,
  isPostalCode,
  parseCoordinate,
  parseMetresToCm,
} from "@marktwerk/core";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useId, useState, useTransition } from "react";
import { createVenueAction, updateVenueAction } from "@/app/(app)/orte/actions";
import { TEXTAREA_CLASS } from "@/components/event-detail/textarea-class";
import { useShell } from "@/components/shell/shell-context";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label, OptionalMark } from "@/components/ui/label";
import { Panel, PanelBody, PanelFooter } from "@/components/ui/panel";
import { formatLength } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { VenueFormValues } from "./defaults";
import { fieldOfVenueError, SELECT_CLASS, useErrorText } from "./shared";

const KINDS = ["outdoor_public", "outdoor_private", "indoor"] as const;

/**
 * "Neuer Ort" and "Ort bearbeiten": a page, not a modal, because a venue has more than eight fields
 * (UX concept §4). Lengths are typed in metres with a comma and stored as centimetres.
 */
export function VenueForm({
  venueId,
  initial,
  landowners,
  rowLengthCm = 0,
}: {
  /** Set when editing; without it the form creates a venue. */
  venueId?: string;
  initial: VenueFormValues;
  landowners: { id: string; name: string; city: string | null }[];
  /** Total length of the venue's rows; once there are rows, it replaces the stored capacity. */
  rowLengthCm?: number;
}) {
  const t = useTranslations("venues");
  const tm = useTranslations("venues.manage");
  const tf = useTranslations("venues.manage.form");
  const locale = useLocale();
  const router = useRouter();
  const { showToast } = useShell();
  const errorText = useErrorText();
  const [pending, startTransition] = useTransition();
  const uid = useId();
  const [error, setError] = useState<{ field: string | null; text: string } | null>(null);

  const [name, setName] = useState(initial.name);
  const [kind, setKind] = useState(initial.kind);
  const [street, setStreet] = useState(initial.street ?? "");
  const [postalCode, setPostalCode] = useState(initial.postalCode ?? "");
  const [city, setCity] = useState(initial.city);
  const [bundesland, setBundesland] = useState(initial.bundesland);
  const [accessInfo, setAccessInfo] = useState(initial.accessInfo ?? "");
  const [landowner, setLandowner] = useState(initial.landownerContactId ?? "");
  const [capacity, setCapacity] = useState(
    initial.capacityCm === null ? "" : formatMetres(initial.capacityCm, locale),
  );
  const [lat, setLat] = useState(initial.lat === null ? "" : formatCoordinate(initial.lat, locale));
  const [lng, setLng] = useState(initial.lng === null ? "" : formatCoordinate(initial.lng, locale));

  const editing = venueId !== undefined;
  const backHref = editing ? `/orte/${venueId}` : "/orte";

  function fail(code: string) {
    const field = fieldOfVenueError(code);
    setError({ field, text: errorText(code) });
    if (field) document.getElementById(field)?.focus();
  }

  function submit() {
    setError(null);
    // Required fields and obvious format mistakes are answered on the spot (no round trip), in field
    // order, so the focus lands on the first wrong field.
    if (name.trim() === "") return fail("invalid_name");
    if (postalCode.trim() !== "" && !isPostalCode(postalCode.trim()))
      return fail("invalid_postal_code");
    if (city.trim() === "") return fail("invalid_city");
    const capacityText = capacity.trim();
    const capacityCm = capacityText === "" ? null : parseMetresToCm(capacityText);
    if (capacityText !== "" && !capacityCm) return fail("invalid_capacity");
    const latText = lat.trim();
    const lngText = lng.trim();
    const latValue = latText === "" ? null : parseCoordinate(latText, "lat");
    const lngValue = lngText === "" ? null : parseCoordinate(lngText, "lng");
    if (
      (latText === "") !== (lngText === "") ||
      (latText !== "" && latValue === null) ||
      (lngText !== "" && lngValue === null)
    )
      return fail("invalid_coordinates");

    const input = {
      name,
      kind,
      street: street || null,
      postalCode: postalCode || null,
      city,
      bundesland,
      accessInfo: accessInfo || null,
      landownerContactId: landowner || null,
      capacityCm,
      lat: latValue,
      lng: lngValue,
    };
    startTransition(async () => {
      const result = editing
        ? await updateVenueAction(venueId, input)
        : await createVenueAction(input);
      if (!result.ok) {
        fail(result.error);
        // Archived or gone while the form was open: nothing to edit any more.
        if (result.error === "not_found" && editing) router.push("/orte" as never);
        return;
      }
      const id = "id" in result.data ? result.data.id : venueId;
      if (editing && "changed" in result.data && !result.data.changed) {
        showToast({ message: tf("unchanged") });
      } else {
        showToast({ message: tf(editing ? "saved" : "created", { name: name.trim() }) });
      }
      router.push(`/orte/${id}` as never);
    });
  }

  const invalid = (field: string) =>
    error?.field === field ? { "aria-invalid": true as const } : {};
  const f = (key: string) => `venue-${key}`;
  const legend = "mb-3 font-semibold text-[15px]";
  const cell = "flex flex-col gap-1.5";
  const hint = "text-faint-foreground text-small";

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
            <div className="grid gap-4 sm:grid-cols-[1fr_14rem]">
              <div className={cell}>
                <Label htmlFor={f("name")}>{tf("name")}</Label>
                <Input
                  id={f("name")}
                  value={name}
                  maxLength={120}
                  required
                  autoComplete="off"
                  onChange={(e) => setName(e.target.value)}
                  {...invalid(f("name"))}
                />
              </div>
              <div className={cell}>
                <Label htmlFor={f("kind")}>{tf("kind")}</Label>
                <select
                  id={f("kind")}
                  value={kind}
                  className={SELECT_CLASS}
                  onChange={(e) => setKind(e.target.value)}
                  {...invalid(f("kind"))}
                >
                  {KINDS.map((k) => (
                    <option key={k} value={k}>
                      {t(`kinds.${k}`)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </fieldset>

          <fieldset className="m-0 min-w-0 border-0 p-0">
            <legend className={legend}>{tf("address")}</legend>
            <div className="grid gap-4 sm:grid-cols-6">
              <div className={cn(cell, "sm:col-span-6")}>
                <Label htmlFor={f("street")} optional>
                  {tf("street")}
                </Label>
                <Input
                  id={f("street")}
                  value={street}
                  maxLength={120}
                  autoComplete="off"
                  onChange={(e) => setStreet(e.target.value)}
                  {...invalid(f("street"))}
                />
              </div>
              <div className={cn(cell, "sm:col-span-2")}>
                <Label htmlFor={f("postal")} optional>
                  {tf("postalCode")}
                </Label>
                <Input
                  id={f("postal")}
                  value={postalCode}
                  inputMode="numeric"
                  maxLength={5}
                  autoComplete="off"
                  className="tabular"
                  onChange={(e) => setPostalCode(e.target.value)}
                  {...invalid(f("postal"))}
                />
              </div>
              <div className={cn(cell, "sm:col-span-4")}>
                <Label htmlFor={f("city")}>{tf("city")}</Label>
                <Input
                  id={f("city")}
                  value={city}
                  maxLength={80}
                  required
                  autoComplete="off"
                  onChange={(e) => setCity(e.target.value)}
                  {...invalid(f("city"))}
                />
              </div>
              <div className={cn(cell, "sm:col-span-3")}>
                <Label htmlFor={f("bundesland")}>{tf("bundesland")}</Label>
                <select
                  id={f("bundesland")}
                  value={bundesland}
                  aria-describedby={`${uid}-bundesland`}
                  className={SELECT_CLASS}
                  onChange={(e) => setBundesland(e.target.value)}
                  {...invalid(f("bundesland"))}
                >
                  {BUNDESLAENDER.map((code) => (
                    <option key={code} value={code}>
                      {tm(`states.${code}`)}
                    </option>
                  ))}
                </select>
                <p id={`${uid}-bundesland`} className={hint}>
                  {tf("bundeslandHint")}
                </p>
              </div>
            </div>
          </fieldset>

          <fieldset className="m-0 min-w-0 border-0 p-0">
            <legend className={legend}>{tf("access")}</legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className={cn(cell, "sm:col-span-2")}>
                <Label htmlFor={f("access")} optional>
                  {tf("accessInfo")}
                </Label>
                <textarea
                  id={f("access")}
                  value={accessInfo}
                  rows={4}
                  maxLength={2000}
                  aria-describedby={`${uid}-access`}
                  className={TEXTAREA_CLASS}
                  onChange={(e) => setAccessInfo(e.target.value)}
                  {...invalid(f("access"))}
                />
                <p id={`${uid}-access`} className={hint}>
                  {tf("accessInfoHint")}
                </p>
              </div>
              <div className={cell}>
                <Label htmlFor={f("landowner")} optional>
                  {tf("landowner")}
                </Label>
                <select
                  id={f("landowner")}
                  value={landowner}
                  aria-describedby={`${uid}-landowner`}
                  className={SELECT_CLASS}
                  onChange={(e) => setLandowner(e.target.value)}
                  {...invalid(f("landowner"))}
                >
                  <option value="">{tf("noLandowner")}</option>
                  {landowners.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.city ? `${l.name} · ${l.city}` : l.name}
                    </option>
                  ))}
                </select>
                <p id={`${uid}-landowner`} className={hint}>
                  {tf("landownerHint")}
                </p>
              </div>
            </div>
          </fieldset>

          <fieldset className="m-0 min-w-0 border-0 p-0">
            <legend className={legend}>{tf("capacitySection")}</legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className={cell}>
                <Label htmlFor={f("capacity")} optional>
                  {tf("capacity")}
                </Label>
                <div className="relative">
                  <Input
                    id={f("capacity")}
                    value={capacity}
                    inputMode="decimal"
                    autoComplete="off"
                    aria-describedby={`${uid}-capacity`}
                    className="tabular pr-9"
                    onChange={(e) => setCapacity(e.target.value)}
                    onBlur={(e) => {
                      const cm = parseMetresToCm(e.target.value);
                      if (cm) setCapacity(formatMetres(cm, locale));
                    }}
                    {...invalid(f("capacity"))}
                  />
                  <span className="-translate-y-1/2 pointer-events-none absolute top-1/2 right-3 text-muted-foreground text-small">
                    m
                  </span>
                </div>
                <p id={`${uid}-capacity`} className={hint}>
                  {tf("capacityHint")}
                  {rowLengthCm > 0 &&
                    ` ${tf("capacityFromRows", { length: formatLength(rowLengthCm, locale) })}`}
                </p>
              </div>
            </div>
            {/* The coordinates are their own group, so the hint belongs to Breite/Länge and not to the capacity. */}
            <fieldset className="m-0 mt-4 min-w-0 border-0 p-0">
              <legend className="mb-1.5 flex items-center gap-2 font-medium text-small">
                {tf("coordinates")} <OptionalMark />
              </legend>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className={cell}>
                  <Label htmlFor={f("lat")}>{tf("lat")}</Label>
                  <Input
                    id={f("lat")}
                    value={lat}
                    inputMode="decimal"
                    autoComplete="off"
                    aria-describedby={`${uid}-coordinates`}
                    className="tabular"
                    onChange={(e) => setLat(e.target.value)}
                    {...invalid(f("lat"))}
                  />
                </div>
                <div className={cell}>
                  <Label htmlFor={f("lng")}>{tf("lng")}</Label>
                  <Input
                    id={f("lng")}
                    value={lng}
                    inputMode="decimal"
                    autoComplete="off"
                    aria-describedby={`${uid}-coordinates`}
                    className="tabular"
                    onChange={(e) => setLng(e.target.value)}
                    {...invalid(f("lng"))}
                  />
                </div>
                <p id={`${uid}-coordinates`} className={cn(hint, "sm:col-span-2")}>
                  {tf("coordinatesHint")}
                </p>
              </div>
            </fieldset>
          </fieldset>
        </PanelBody>
        <PanelFooter className="justify-between">
          <p role="alert" className="min-w-0 flex-1 text-small text-status-critical">
            {error?.text}
          </p>
          <div className="flex items-center gap-2">
            <Link href={backHref as never} className={buttonVariants({ variant: "outline" })}>
              {tm("cancel")}
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
