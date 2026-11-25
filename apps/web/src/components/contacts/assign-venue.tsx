"use client";

import { mayOwnVenue } from "@marktwerk/core";
import { MapPinPlus, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useId, useState, useTransition } from "react";
import { landownerTargetsAction, setVenueLandownerAction } from "@/app/(app)/orte/actions";
import { useShell } from "@/components/shell/shell-context";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { RecordPicker } from "@/components/ui/record-picker";
import { callAction } from "@/lib/call-action";
import type { LandownerTarget } from "@/server/queries/venues";

/**
 * "Als Eigentümer bei Ort eintragen…" in a contact's Vorschau (UX-055): picks an Ort and makes this
 * contact its Eigentümer, without going through the Ort's edit form. Only Orte this contact may own are
 * offered (a Behörde only städtische). The toast's undo puts the previous Eigentümer back (or none),
 * instead of asking first; the dialog says beforehand when one will be replaced.
 */
export function AssignVenue({ contact }: { contact: { id: string; name: string; kind: string } }) {
  const t = useTranslations("contacts.assign");
  const tErrors = useTranslations("venues.manage.errors");
  const { showToast, showError } = useShell();
  const uid = useId();
  const [open, setOpen] = useState(false);
  const [targets, setTargets] = useState<LandownerTarget[] | null>(null);
  const [venueId, setVenueId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // The Orte are loaded when the dialog opens, not with every Vorschau.
  useEffect(() => {
    if (!open) return;
    setVenueId(null);
    setError(null);
    void callAction(async () => ({ ok: true as const, data: await landownerTargetsAction() })).then(
      (result) => setTargets(result.ok ? result.data : []),
    );
  }, [open]);

  const options = (targets ?? [])
    .filter((v) => mayOwnVenue(contact.kind, v.kind) && v.landownerId !== contact.id)
    .map((v) => ({
      id: v.id,
      label: v.name,
      hint: v.landownerName ? t("currentOwner", { city: v.city, owner: v.landownerName }) : v.city,
    }));
  const picked = targets?.find((v) => v.id === venueId) ?? null;

  const errorText = (code: string) =>
    tErrors.has(code as never) ? tErrors(code as never) : tErrors("generic");

  function submit() {
    if (!venueId) {
      setError(t("pickVenue"));
      document.getElementById(`${uid}-venue`)?.focus();
      return;
    }
    startTransition(async () => {
      const result = await callAction(() => setVenueLandownerAction(venueId, contact.id));
      if (!result.ok) {
        setError(errorText(result.error));
        return;
      }
      setOpen(false);
      const { venueName, previous } = result.data;
      showToast({
        message: previous
          ? t("replaced", { venue: venueName, name: contact.name, previous: previous.name })
          : t("assigned", { venue: venueName, name: contact.name }),
        actionLabel: t("undo"),
        onAction: async () => {
          // `undoOf`: the previous Eigentümer goes back even if it was archived meanwhile.
          const undone = await callAction(() =>
            setVenueLandownerAction(venueId, previous?.id ?? null, contact.id),
          );
          if (undone.ok) showToast({ message: t("restored", { venue: venueName }) });
          else showError(errorText(undone.error));
        },
      });
    });
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <MapPinPlus aria-hidden />
        {t("button")}
      </Button>
      <Modal
        open={open}
        onOpenChange={setOpen}
        title={t("title", { name: contact.name })}
        description={contact.kind === "authority" ? t("descriptionAuthority") : t("description")}
        closeLabel={t("close")}
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
            <Label htmlFor={`${uid}-venue`}>{t("venue")}</Label>
            <RecordPicker
              id={`${uid}-venue`}
              options={options}
              value={venueId}
              onChange={(next) => {
                setVenueId(next);
                setError(null);
              }}
              placeholder={targets === null ? t("loading") : t("placeholder")}
              disabled={targets === null}
              aria-invalid={error !== null}
              aria-describedby={`${uid}-hint`}
            />
            <p id={`${uid}-hint`} className="text-small">
              {error ? (
                <span className="text-status-critical">{error}</span>
              ) : picked?.landownerName ? (
                <span className="flex items-center gap-1.5 text-status-warn">
                  <TriangleAlert aria-hidden className="size-4 shrink-0" />
                  {t("willReplace", { previous: picked.landownerName })}
                </span>
              ) : (
                <span className="text-faint-foreground">
                  {targets !== null && options.length === 0 ? t("noVenues") : t("hint")}
                </span>
              )}
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <Button disabled={pending} onClick={() => setOpen(false)}>
              {t("cancel")}
            </Button>
            <Button type="submit" variant="default" aria-busy={pending} disabled={pending}>
              {t("submit")}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
