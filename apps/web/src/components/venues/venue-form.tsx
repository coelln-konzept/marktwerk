"use client";

import {
  BUNDESLAENDER,
  formatCoordinate,
  formatMetres,
  isPostalCode,
  landownerKindsFor,
  mayOwnVenue,
  parseCoordinate,
  parseMetresToCm,
  VENUE_KINDS,
  VENUE_NAME_MAX,
  venueNameFromAddress,
} from "@marktwerk/core";
import { TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useId, useMemo, useState, useTransition } from "react";
import {
  createVenueAction,
  similarVenuesAction,
  updateVenueAction,
} from "@/app/(app)/orte/actions";
import {
  ContactQuickCreate,
  type CreatedContact,
} from "@/components/contacts/contact-quick-create";
import { SimilarHint, useSimilar } from "@/components/contacts/similar-hint";
import { TEXTAREA_CLASS } from "@/components/event-detail/textarea-class";
import { useShell } from "@/components/shell/shell-context";
import { Button } from "@/components/ui/button";
import { FORM_SECTION, FORM_SECTION_TITLE } from "@/components/ui/form-section";
import { Input } from "@/components/ui/input";
import { Label, OptionalMark } from "@/components/ui/label";
import { DiscardBar, useBeforeUnload } from "@/components/ui/leave-guard";
import { Panel, PanelBody, PanelFooter } from "@/components/ui/panel";
import { RecordPicker } from "@/components/ui/record-picker";
import { formatLength } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { VenueFormValues } from "./defaults";
import { fieldOfVenueError, SELECT_CLASS, useErrorText } from "./shared";

const KINDS = VENUE_KINDS;

/**
 * "Neuer Ort" and "Ort bearbeiten": a page, not a modal, because a venue has more than eight fields
 * (UX concept §4). Lengths are typed in metres with a comma and stored as centimetres. After creating an Ort, or
 * switching it between Städtisch and Privat, the Ort page opens "Was braucht dieser Ort?" (`?bedarf=`, Fahrplan R30).
 */
export function VenueForm({
  venueId,
  initial,
  landowners,
  rowLengthCm = 0,
  canSetNeeds = false,
}: {
  /** Set when editing; without it the form creates a venue. */
  venueId?: string;
  initial: VenueFormValues;
  landowners: { id: string; name: string; city: string | null; kind: string }[];
  /** Total length of the venue's rows; once there are rows, it replaces the stored capacity. */
  rowLengthCm?: number;
  /** May set the Ort's permit requirements (permit write + delete): then the needs dialog follows. */
  canSetNeeds?: boolean;
}) {
  const t = useTranslations("venues");
  const tm = useTranslations("venues.manage");
  const tf = useTranslations("venues.manage.form");
  const tKinds = useTranslations("contacts.kinds");
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
  const [landowner, setLandowner] = useState<string | null>(initial.landownerContactId);
  // Eigentümer created in place (UT2-04) join the options until the page data has them.
  const [createdLandowners, setCreatedLandowners] = useState<CreatedContact[]>([]);
  const [newLandowner, setNewLandowner] = useState<string | null>(null);
  // A städtisches Ort may also belong to a Behörde (UX-056); a private one only to an Eigentümer.
  const ownerKinds = landownerKindsFor(kind);
  const allLandowners = useMemo(
    () => [
      ...landowners.map((l) => ({ id: l.id, label: l.name, hint: l.city, kind: l.kind })),
      ...createdLandowners
        .filter((c) => !landowners.some((l) => l.id === c.id))
        .map((c) => ({ ...c, kind: c.kind ?? "landowner" })),
    ],
    [landowners, createdLandowners],
  );
  const pickedLandowner = allLandowners.find((l) => l.id === landowner) ?? null;
  // The picked one stays listed even when the kind no longer fits, so the warning below makes sense.
  const landownerOptions = allLandowners
    .filter((l) => mayOwnVenue(l.kind, kind) || l.id === landowner)
    .map((l) => ({
      id: l.id,
      label: l.label,
      hint:
        l.kind === "authority" ? [tKinds("authority"), l.hint].filter(Boolean).join(" · ") : l.hint,
    }));
  // As in the service: an Eigentümer that no longer fits (its Art was changed since) may stay while
  // neither it nor the Ort's kind changes, so unrelated edits still save. Only a new pick or a new
  // kind has to fit.
  const landownerBlocked =
    pickedLandowner !== null &&
    !mayOwnVenue(pickedLandowner.kind, kind) &&
    (landowner !== initial.landownerContactId || kind !== initial.kind);
  const landownerKindCode =
    pickedLandowner?.kind === "authority" ? "landowner_kind" : "landowner_kind_other";
  const [capacity, setCapacity] = useState(
    initial.capacityCm === null ? "" : formatMetres(initial.capacityCm, locale),
  );
  const [lat, setLat] = useState(initial.lat === null ? "" : formatCoordinate(initial.lat, locale));
  const [lng, setLng] = useState(initial.lng === null ? "" : formatCoordinate(initial.lng, locale));

  const editing = venueId !== undefined;
  const backHref = editing ? `/orte/${venueId}` : "/orte";

  // Unsaved changes (UX-002): the browser asks on close/reload, "Abbrechen" asks inline.
  const [leaving, setLeaving] = useState(false);
  const dirty =
    name !== initial.name ||
    kind !== initial.kind ||
    street !== (initial.street ?? "") ||
    postalCode !== (initial.postalCode ?? "") ||
    city !== initial.city ||
    bundesland !== initial.bundesland ||
    accessInfo !== (initial.accessInfo ?? "") ||
    landowner !== initial.landownerContactId ||
    capacity !== (initial.capacityCm === null ? "" : formatMetres(initial.capacityCm, locale)) ||
    lat !== (initial.lat === null ? "" : formatCoordinate(initial.lat, locale)) ||
    lng !== (initial.lng === null ? "" : formatCoordinate(initial.lng, locale));
  useBeforeUnload(dirty && !pending);

  function cancel() {
    if (dirty) setLeaving(true);
    else router.push(backHref as never);
  }

  function fail(code: string) {
    const field = fieldOfVenueError(code);
    setError({ field, text: errorText(code) });
    if (field) document.getElementById(field)?.focus();
  }

  // An empty name is filled from the address by the service (UT2-02); the field shows what it will be.
  const derivedName = venueNameFromAddress(city, street);

  // "Ähnlicher Ort" while typing (UX-028): same name (or the name the address gives) or same street
  // and PLZ. Never blocks saving.
  const typedName = name.trim() || derivedName;
  const similar = useSimilar(
    typedName.length >= 3 || (street.trim() !== "" && postalCode.trim().length === 5)
      ? JSON.stringify([typedName, street.trim(), postalCode.trim()])
      : null,
    () =>
      similarVenuesAction(
        { name: typedName, street: street.trim(), postalCode: postalCode.trim() },
        venueId,
      ),
  );

  function submit() {
    setError(null);
    setLeaving(false);
    // Required fields and obvious format mistakes are answered on the spot (no round trip), in field
    // order, so the focus lands on the first wrong field.
    if (postalCode.trim() !== "" && !isPostalCode(postalCode.trim()))
      return fail("invalid_postal_code");
    if (city.trim() === "") return fail("invalid_city");
    const capacityText = capacity.trim();
    const capacityCm = capacityText === "" ? null : parseMetresToCm(capacityText);
    if (landownerBlocked) return fail(landownerKindCode);
    if (capacityText !== "" && !capacityCm) return fail("invalid_capacity");
    // Each coordinate mistake gets its own message at its own field (UX-056).
    const latText = lat.trim();
    const lngText = lng.trim();
    const latValue = latText === "" ? null : parseCoordinate(latText, "lat");
    const lngValue = lngText === "" ? null : parseCoordinate(lngText, "lng");
    if (latText !== "" && latValue === null) return fail("invalid_lat");
    if (lngText !== "" && lngValue === null) return fail("invalid_lng");
    if (latText === "" && lngText !== "") return fail("lat_missing");
    if (lngText === "" && latText !== "") return fail("lng_missing");

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
        showToast({
          message: tf(editing ? "saved" : "created", { name: name.trim() || derivedName }),
        });
      }
      // A new Ort, or one that changed between Städtisch and Privat, asks what it needs (Fahrplan R30).
      const needs = !canSetNeeds
        ? null
        : !editing
          ? "neu"
          : kind !== initial.kind && "changed" in result.data && result.data.changed
            ? "art"
            : null;
      router.push(`/orte/${id}${needs ? `?bedarf=${needs}` : ""}` as never);
    });
  }

  /** A field in error: marked invalid and described by its own message, which sits right under it. */
  const invalid = (field: string, hintId?: string) =>
    error?.field === field
      ? {
          "aria-invalid": true as const,
          "aria-describedby": [`${field}-error`, hintId].filter(Boolean).join(" "),
        }
      : hintId
        ? { "aria-describedby": hintId }
        : {};
  const errorAt = (field: string) =>
    error?.field === field ? (
      <p id={`${field}-error`} className="text-small text-status-critical">
        {error.text}
      </p>
    ) : null;
  const f = (key: string) => `venue-${key}`;
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
        <PanelBody className="flex flex-col gap-6">
          <fieldset className={FORM_SECTION}>
            <legend className={FORM_SECTION_TITLE}>{tf("basics")}</legend>
            <div className="grid gap-4 sm:grid-cols-[1fr_14rem]">
              <div className={cell}>
                <Label htmlFor={f("name")} optional>
                  {tf("name")}
                </Label>
                <Input
                  id={f("name")}
                  value={name}
                  maxLength={VENUE_NAME_MAX}
                  autoComplete="off"
                  placeholder={derivedName || undefined}
                  onChange={(e) => setName(e.target.value)}
                  {...invalid(f("name"), `${uid}-name`)}
                />
                {errorAt(f("name"))}
                <p id={`${uid}-name`} className={hint}>
                  {tf("nameHint")}
                </p>
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
                {errorAt(f("kind"))}
              </div>
              <SimilarHint
                className="sm:col-span-2"
                title={tf("similar.title", { count: similar.length })}
                note={editing ? tf("similar.noteEdit") : tf("similar.note")}
                items={similar.map((v) => ({
                  id: v.id,
                  href: `/orte/${v.id}`,
                  label: v.name,
                  reason: [v.city, tf(`similar.reason.${v.reason}`)].filter(Boolean).join(" · "),
                }))}
              />
            </div>
          </fieldset>

          <fieldset className={FORM_SECTION}>
            <legend className={FORM_SECTION_TITLE}>{tf("address")}</legend>
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
                {errorAt(f("street"))}
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
                {errorAt(f("postal"))}
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
                {errorAt(f("city"))}
              </div>
              <div className={cn(cell, "sm:col-span-3")}>
                <Label htmlFor={f("bundesland")}>{tf("bundesland")}</Label>
                <select
                  id={f("bundesland")}
                  value={bundesland}
                  className={SELECT_CLASS}
                  onChange={(e) => setBundesland(e.target.value)}
                  {...invalid(f("bundesland"), `${uid}-bundesland`)}
                >
                  {BUNDESLAENDER.map((code) => (
                    <option key={code} value={code}>
                      {tm(`states.${code}`)}
                    </option>
                  ))}
                </select>
                {errorAt(f("bundesland"))}
                <p id={`${uid}-bundesland`} className={hint}>
                  {tf("bundeslandHint")}
                </p>
              </div>
            </div>
          </fieldset>

          <fieldset className={FORM_SECTION}>
            <legend className={FORM_SECTION_TITLE}>{tf("access")}</legend>
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
                  className={TEXTAREA_CLASS}
                  onChange={(e) => setAccessInfo(e.target.value)}
                  {...invalid(f("access"), `${uid}-access`)}
                />
                {errorAt(f("access"))}
                <p id={`${uid}-access`} className={hint}>
                  {tf("accessInfoHint")}
                </p>
              </div>
              <div className={cell}>
                <Label htmlFor={f("landowner")} optional>
                  {tf("landowner")}
                </Label>
                <RecordPicker
                  id={f("landowner")}
                  options={landownerOptions}
                  value={landowner}
                  onChange={setLandowner}
                  allowNone
                  noneLabel={tf("noLandowner")}
                  placeholder={tf("noLandowner")}
                  aria-describedby={[
                    error?.field === f("landowner") ? `${f("landowner")}-error` : null,
                    `${uid}-landowner`,
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  aria-invalid={error?.field === f("landowner")}
                  onCreate={(text) => setNewLandowner(text)}
                />
                <ContactQuickCreate
                  open={newLandowner !== null}
                  onOpenChange={(open) => !open && setNewLandowner(null)}
                  name={newLandowner ?? ""}
                  kinds={ownerKinds}
                  onCreated={(created) => {
                    setCreatedLandowners((prev) => [...prev, created]);
                    setLandowner(created.id);
                  }}
                />
                {errorAt(f("landowner"))}
                {/* While the error says it, the hint goes back to normal so it is not read twice. */}
                {landownerBlocked && error?.field !== f("landowner") ? (
                  <p
                    id={`${uid}-landowner`}
                    className="flex items-center gap-1.5 text-small text-status-warn"
                  >
                    <TriangleAlert aria-hidden className="size-4 shrink-0" />
                    {landownerKindCode === "landowner_kind"
                      ? tf("landownerKindMismatch")
                      : tf("landownerKindMismatchOther")}
                  </p>
                ) : (
                  <p id={`${uid}-landowner`} className={hint}>
                    {kind === "municipal" ? tf("landownerHintMunicipal") : tf("landownerHint")}
                  </p>
                )}
              </div>
            </div>
          </fieldset>

          <fieldset className={FORM_SECTION}>
            <legend className={FORM_SECTION_TITLE}>{tf("capacitySection")}</legend>
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
                    className="tabular pr-9"
                    onChange={(e) => setCapacity(e.target.value)}
                    onBlur={(e) => {
                      const cm = parseMetresToCm(e.target.value);
                      if (cm) setCapacity(formatMetres(cm, locale));
                    }}
                    {...invalid(f("capacity"), `${uid}-capacity`)}
                  />
                  <span className="-translate-y-1/2 pointer-events-none absolute top-1/2 right-3 text-muted-foreground text-small">
                    m
                  </span>
                </div>
                {errorAt(f("capacity"))}
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
                    className="tabular"
                    onChange={(e) => setLat(e.target.value)}
                    {...invalid(f("lat"), `${uid}-coordinates`)}
                  />
                  {errorAt(f("lat"))}
                </div>
                <div className={cell}>
                  <Label htmlFor={f("lng")}>{tf("lng")}</Label>
                  <Input
                    id={f("lng")}
                    value={lng}
                    inputMode="decimal"
                    autoComplete="off"
                    className="tabular"
                    onChange={(e) => setLng(e.target.value)}
                    {...invalid(f("lng"), `${uid}-coordinates`)}
                  />
                  {errorAt(f("lng"))}
                </div>
                <p id={`${uid}-coordinates`} className={cn(hint, "sm:col-span-2")}>
                  {tf("coordinatesHint")}
                </p>
              </div>
            </fieldset>
          </fieldset>
        </PanelBody>
        {leaving && (
          <PanelBody className="pt-0">
            <DiscardBar
              message={tf("unsaved")}
              discardLabel={tf("discard")}
              keepLabel={tf("keepEditing")}
              onDiscard={() => router.push(backHref as never)}
              onKeep={() => setLeaving(false)}
            />
          </PanelBody>
        )}
        <PanelFooter className="justify-between">
          {/* Field errors sit at their field (UX-055); only errors without a field show here. */}
          <p role="alert" className="min-w-0 flex-1 text-small text-status-critical">
            {error && error.field === null ? error.text : ""}
          </p>
          <div className="flex items-center gap-2">
            <Button onClick={cancel}>{tm("cancel")}</Button>
            <Button type="submit" variant="default" aria-busy={pending} disabled={pending}>
              {tf(editing ? "save" : "create")}
            </Button>
          </div>
        </PanelFooter>
      </Panel>
    </form>
  );
}
