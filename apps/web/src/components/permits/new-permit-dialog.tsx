"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { archivePermitAction, createPermitAction } from "@/app/(app)/genehmigungen/actions";
import { SELECT_CLASS } from "@/components/settings/select-class";
import { useShell } from "@/components/shell/shell-context";
import { useOpenOnNew } from "@/components/shell/use-new-param";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { VenuePicker } from "@/components/venues/venue-picker";
import { PERMIT_TYPE_KEYS } from "@/lib/permit-status";

type Field = "venue" | "title" | "season" | "apply";
/** Which field a refused input belongs to (the one that gets the focus back). */
const FIELD_OF: Record<string, Field> = {
  invalid_venue: "venue",
  invalid_title: "title",
  invalid_season: "season",
  invalid_date: "apply",
};

/**
 * "Genehmigung anlegen" for a permit no requirement produced. Six fields, so a modal. Creating shows an
 * undo toast (undo removes it from the logbook again) and opens the new permit in the drawer. The season
 * starts as the one of the next market that needs a permit (`defaultSeason`); a refused input puts the
 * focus on the field that is wrong. With `forEvent` (the event's Genehmigungen tab, HN-16) the venue is the
 * event's, the new permit is linked to the event and opens in the tab's drawer.
 */
export function NewPermitDialog({
  venues,
  defaultSeason,
  forEvent,
  canCreateVenue = false,
}: {
  venues: { id: string; name: string; city?: string | null }[];
  defaultSeason: number;
  forEvent?: { id: string; venueId: string; path: string };
  /** "+ Neu" in the Ort picker (venue:write, UT2-01). */
  canCreateVenue?: boolean;
}) {
  const t = useTranslations("logbook");
  const tTypes = useTranslations("permitTypes");
  const tCat = useTranslations("permitCategories");
  const router = useRouter();
  const { showToast } = useShell();
  const uid = useId();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [venueId, setVenueId] = useState("");
  const [category, setCategory] = useState<"city" | "external">("city");
  const [permitType, setPermitType] = useState<(typeof PERMIT_TYPE_KEYS)[number]>("market_permit");
  const [title, setTitle] = useState("");
  const [season, setSeason] = useState(String(defaultSeason));
  const [applyBy, setApplyBy] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [focusField, setFocusField] = useState<Field | null>(null);
  const fields = {
    venue: useRef<HTMLSelectElement>(null),
    title: useRef<HTMLInputElement>(null),
    season: useRef<HTMLInputElement>(null),
    apply: useRef<HTMLInputElement>(null),
  };

  const errorText = (code: string) =>
    t.has(`errors.${code}` as never) ? t(`errors.${code}` as never) : t("errors.generic");

  // The submit button is disabled while the server works, which drops the focus to the page: put it on
  // the invalid field once the button is back.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the refs are stable
  useEffect(() => {
    if (!focusField || pending) return;
    // The Ort picker is a combobox found by id; the event's fixed Ort is the select below.
    if (focusField === "venue" && !forEvent) document.getElementById(`${uid}-venue`)?.focus();
    else fields[focusField].current?.focus();
    setFocusField(null);
  }, [focusField, pending]);

  function fail(code: string) {
    setError(code);
    setFocusField(FIELD_OF[code] ?? null);
  }

  function openDialog() {
    setVenueId(forEvent?.venueId ?? "");
    setTitle("");
    setSeason(String(defaultSeason));
    setApplyBy("");
    setError(null);
    setOpen(true);
  }

  // "+ Neu › Genehmigung" in the top bar links here with ?neu=1.
  useOpenOnNew(openDialog);

  function submit() {
    setError(null);
    if (venueId === "") return fail("invalid_venue");
    startTransition(async () => {
      const result = await createPermitAction({
        venueId,
        category,
        permitType,
        title: title.trim() === "" ? tTypes(permitType) : title,
        season: season.trim() === "" ? null : Number(season),
        applyBy: applyBy === "" ? null : applyBy,
        eventId: forEvent?.id ?? null,
      });
      if (!result.ok) return fail(result.error);
      setOpen(false);
      const { id } = result.data;
      showToast({
        message: t("toast.created"),
        actionLabel: t("toast.undo"),
        onAction: async () => {
          await archivePermitAction(id);
          showToast({ message: t("toast.createdUndone") });
        },
      });
      router.push(
        (forEvent
          ? `${forEvent.path}?genehmigung=${id}`
          : `/genehmigungen?genehmigung=${id}`) as never,
      );
    });
  }

  return (
    <>
      <Button variant="default" onClick={openDialog}>
        <Plus aria-hidden />
        {t("new")}
      </Button>
      <Modal
        open={open}
        onOpenChange={(next) => !pending && setOpen(next)}
        title={t("form.title")}
        description={t("form.description")}
        closeLabel={t("form.cancel")}
        className="w-[min(520px,calc(100%-2rem))]"
      >
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${uid}-venue`}>{t("form.venue")}</Label>
            {forEvent ? (
              <select
                id={`${uid}-venue`}
                ref={fields.venue}
                value={venueId}
                disabled
                className={SELECT_CLASS}
              >
                {venues.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            ) : (
              <VenuePicker
                id={`${uid}-venue`}
                venues={venues.map((v) => ({ id: v.id, name: v.name, city: v.city ?? null }))}
                value={venueId}
                onChange={setVenueId}
                canCreate={canCreateVenue}
                placeholder={t("form.chooseVenue")}
                invalid={error === "invalid_venue"}
              />
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${uid}-category`}>{t("form.category")}</Label>
              <select
                id={`${uid}-category`}
                value={category}
                onChange={(e) => setCategory(e.target.value as "city" | "external")}
                className={SELECT_CLASS}
              >
                <option value="city">{tCat("city")}</option>
                <option value="external">{tCat("external")}</option>
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${uid}-type`}>{t("form.type")}</Label>
              <select
                id={`${uid}-type`}
                value={permitType}
                onChange={(e) => setPermitType(e.target.value as (typeof PERMIT_TYPE_KEYS)[number])}
                className={SELECT_CLASS}
              >
                {PERMIT_TYPE_KEYS.map((key) => (
                  <option key={key} value={key}>
                    {tTypes(key)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${uid}-title`} optional>
              {t("form.name")}
            </Label>
            <Input
              id={`${uid}-title`}
              ref={fields.title}
              value={title}
              maxLength={200}
              placeholder={tTypes(permitType)}
              onChange={(e) => setTitle(e.target.value)}
              aria-invalid={error === "invalid_title" || undefined}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${uid}-season`} optional>
                {t("form.season")}
              </Label>
              <Input
                id={`${uid}-season`}
                ref={fields.season}
                inputMode="numeric"
                value={season}
                onChange={(e) => setSeason(e.target.value)}
                className="tabular"
                aria-describedby={`${uid}-season-hint`}
                aria-invalid={error === "invalid_season" || undefined}
              />
              <p id={`${uid}-season-hint`} className="text-muted-foreground text-tiny">
                {t("form.seasonHint")}
              </p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${uid}-apply`} optional>
                {t("form.applyBy")}
              </Label>
              <Input
                id={`${uid}-apply`}
                ref={fields.apply}
                type="date"
                value={applyBy}
                onChange={(e) => setApplyBy(e.target.value)}
                className="tabular"
                aria-invalid={error === "invalid_date" || undefined}
              />
            </div>
          </div>
          {error && (
            <p role="alert" className="text-small text-status-critical">
              {errorText(error)}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button disabled={pending} onClick={() => setOpen(false)}>
              {t("form.cancel")}
            </Button>
            <Button type="submit" variant="default" aria-busy={pending} disabled={pending}>
              {t("form.save")}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
