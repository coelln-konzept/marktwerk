"use client";

import {
  isPostalCode,
  landownerKindsFor,
  mayOwnVenue,
  VENUE_KINDS,
  type VenueKindKey,
  venueNameFromAddress,
} from "@marktwerk/core";
import { useTranslations } from "next-intl";
import { useEffect, useId, useMemo, useState, useTransition } from "react";
import {
  createVenueAction,
  landownerOptionsAction,
  similarVenuesAction,
} from "@/app/(app)/orte/actions";
import {
  ContactQuickCreate,
  type CreatedContact,
} from "@/components/contacts/contact-quick-create";
import { SimilarHint, useSimilar } from "@/components/contacts/similar-hint";
import { VenueNeedsDialog } from "@/components/permits/venue-needs-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { QuickCreateDialog } from "@/components/ui/quick-create-dialog";
import { RecordPicker } from "@/components/ui/record-picker";
import { callAction, NETWORK_ERROR } from "@/lib/call-action";
import { SELECT_CLASS, useErrorText } from "./shared";

/** An Ort just created in place, ready to be added to a picker's options and selected. */
export type CreatedVenue = { id: string; name: string; city: string };

/**
 * "+ Neu" of an Ort picker (user test 2, UT2-01/07): address, Städtisch/Privat and an optional Eigentümer
 * (which can itself be created in a second stacked dialog, UT2-04). The name may stay empty: it becomes
 * "Stadt – Straße". Zones, rows, Zufahrt and coordinates are added later on the Ort's page. Right after creating,
 * "Was braucht dieser Ort?" opens in its place (Fahrplan R30; e.g. inside "Markt planen"), pre-ticked from the kind;
 * the new Ort is already selected, so skipping it loses nothing. Creating an Ort needs `venue:write`, which only
 * roles with every permit grant have, so the dialog is always offered.
 */
export function VenueQuickCreate({
  open,
  onOpenChange,
  text,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** What was typed in the picker: taken as the name. */
  text: string;
  onCreated: (venue: CreatedVenue) => void;
}) {
  const t = useTranslations("venues.manage.form");
  const tQuick = useTranslations("venues.quick");
  const tKinds = useTranslations("venues.kinds");
  const tErrors = useTranslations("errors");
  const errorText = useErrorText();
  const uid = useId();
  const id = (field: string) => `${uid}-${field}`;
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState(text);
  const [kind, setKind] = useState<VenueKindKey>("municipal");
  const [street, setStreet] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [city, setCity] = useState("");
  const [landowner, setLandowner] = useState<string | null>(null);
  const [landowners, setLandowners] = useState<CreatedContact[]>([]);
  const [newLandowner, setNewLandowner] = useState<string | null>(null);
  const [error, setError] = useState<{ code: string; field: string | null } | null>(null);
  // The Ort just created, for "Was braucht dieser Ort?".
  const [needsFor, setNeedsFor] = useState<(CreatedVenue & { kind: VenueKindKey }) | null>(null);

  // Each opening starts from what was typed; the Eigentümer are loaded then (not with every page).
  useEffect(() => {
    if (!open) return;
    setName(text);
    setKind("municipal");
    setStreet("");
    setPostalCode("");
    setCity("");
    setLandowner(null);
    setError(null);
    let live = true;
    void callAction(async () => ({ ok: true as const, data: await landownerOptionsAction() })).then(
      (result) => {
        if (live && result.ok)
          setLandowners(
            result.data.map((l) => ({ id: l.id, label: l.name, hint: l.city, kind: l.kind })),
          );
      },
    );
    return () => {
      live = false;
    };
  }, [open, text]);

  const derived = venueNameFromAddress(city, street);
  // A städtisches Ort may also belong to a Behörde (UX-056).
  const options = useMemo(
    () => landowners.filter((l) => mayOwnVenue(l.kind ?? "landowner", kind)),
    [landowners, kind],
  );
  // "Ähnlicher Ort" (UX-028), as in the full form: a hint, creating stays possible.
  const typedName = name.trim() || derived;
  const similar = useSimilar(
    open && (typedName.length >= 3 || (street.trim() !== "" && postalCode.trim().length === 5))
      ? JSON.stringify([typedName, street.trim(), postalCode.trim()])
      : null,
    () =>
      similarVenuesAction({
        name: typedName,
        street: street.trim(),
        postalCode: postalCode.trim(),
      }),
  );

  const fieldOf = (code: string) =>
    ({
      invalid_name: id("name"),
      invalid_kind: id("kind"),
      invalid_street: id("street"),
      invalid_postal_code: id("postal"),
      invalid_city: id("city"),
      invalid_landowner: id("landowner"),
    })[code] ?? null;
  const fail = (code: string) => {
    const field = fieldOf(code);
    setError({ code, field });
    if (field) document.getElementById(field)?.focus();
  };
  const invalid = (field: string) =>
    error?.field === id(field) ? { "aria-invalid": true as const } : {};

  function submit() {
    setError(null);
    if (postalCode.trim() !== "" && !isPostalCode(postalCode.trim()))
      return fail("invalid_postal_code");
    if (city.trim() === "") return fail("invalid_city");
    startTransition(async () => {
      const result = await callAction(() =>
        createVenueAction({
          name,
          kind,
          street: street || null,
          postalCode: postalCode || null,
          city,
          bundesland: "NW",
          lat: null,
          lng: null,
          capacityCm: null,
          accessInfo: null,
          landownerContactId: landowner,
        }),
      );
      if (!result.ok) return fail(result.error);
      const created = {
        id: result.data.id,
        name: name.trim().replace(/\s+/g, " ") || derived,
        city: city.trim(),
      };
      onCreated(created);
      onOpenChange(false);
      setNeedsFor({ ...created, kind });
    });
  }

  return (
    <>
      <VenueNeedsDialog
        open={needsFor !== null}
        onOpenChange={(next) => !next && setNeedsFor(null)}
        venueId={needsFor?.id ?? ""}
        venueName={needsFor?.name ?? ""}
        kind={needsFor?.kind ?? "municipal"}
        current={[]}
        reason="created"
      />
      <QuickCreateDialog
        open={open}
        onOpenChange={onOpenChange}
        title={tQuick("title")}
        description={tQuick("description")}
        pending={pending}
        error={
          error ? (error.code === NETWORK_ERROR ? tErrors("network") : errorText(error.code)) : null
        }
        onSubmit={submit}
      >
        <div className="grid gap-4 sm:grid-cols-[1fr_10rem]">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={id("name")} optional>
              {t("name")}
            </Label>
            <Input
              id={id("name")}
              value={name}
              maxLength={120}
              autoComplete="off"
              placeholder={derived || undefined}
              onChange={(e) => setName(e.target.value)}
              {...invalid("name")}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={id("kind")}>{t("kind")}</Label>
            <select
              id={id("kind")}
              value={kind}
              className={SELECT_CLASS}
              onChange={(e) => {
                const next = e.target.value as VenueKindKey;
                setKind(next);
                // An Eigentümer that may not own this kind of Ort (a Behörde for Privat) is dropped.
                const picked = landowners.find((l) => l.id === landowner);
                if (picked && !mayOwnVenue(picked.kind ?? "landowner", next)) setLandowner(null);
              }}
            >
              {VENUE_KINDS.map((k) => (
                <option key={k} value={k}>
                  {tKinds(k)}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={id("street")} optional>
            {t("street")}
          </Label>
          <Input
            id={id("street")}
            value={street}
            maxLength={120}
            autoComplete="off"
            autoFocus
            onChange={(e) => setStreet(e.target.value)}
            {...invalid("street")}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-[8rem_1fr]">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={id("postal")} optional>
              {t("postalCode")}
            </Label>
            <Input
              id={id("postal")}
              value={postalCode}
              inputMode="numeric"
              maxLength={5}
              autoComplete="off"
              className="tabular"
              onChange={(e) => setPostalCode(e.target.value)}
              {...invalid("postal")}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={id("city")}>{t("city")}</Label>
            <Input
              id={id("city")}
              value={city}
              maxLength={80}
              autoComplete="off"
              onChange={(e) => setCity(e.target.value)}
              {...invalid("city")}
            />
          </div>
        </div>
        <SimilarHint
          title={t("similar.title", { count: similar.length })}
          note={t("similar.note")}
          items={similar.map((v) => ({
            id: v.id,
            href: `/orte/${v.id}`,
            label: v.name,
            reason: [v.city, t(`similar.reason.${v.reason}`)].filter(Boolean).join(" · "),
          }))}
        />
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={id("landowner")} optional>
            {t("landowner")}
          </Label>
          <RecordPicker
            id={id("landowner")}
            options={options}
            value={landowner}
            onChange={setLandowner}
            allowNone
            noneLabel={t("noLandowner")}
            placeholder={t("noLandowner")}
            aria-invalid={error?.field === id("landowner")}
            onCreate={(typed) => setNewLandowner(typed)}
          />
          <ContactQuickCreate
            open={newLandowner !== null}
            onOpenChange={(next) => !next && setNewLandowner(null)}
            name={newLandowner ?? ""}
            kinds={landownerKindsFor(kind)}
            onCreated={(created) => {
              setLandowners((prev) => [...prev, created]);
              setLandowner(created.id);
            }}
          />
        </div>
      </QuickCreateDialog>
    </>
  );
}
