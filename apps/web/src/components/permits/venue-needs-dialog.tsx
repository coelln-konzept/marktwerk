"use client";

import {
  isVenueNeedType,
  suggestedVenueNeeds,
  VENUE_NEED_TYPES,
  type VenueKindKey,
  type VenueNeedType,
} from "@marktwerk/core";
import { useTranslations } from "next-intl";
import { useEffect, useId, useState, useTransition } from "react";
import {
  setVenueNeedsAction,
  undoVenueNeedsAction,
} from "@/app/(app)/orte/[id]/genehmigungen/actions";
import { useShell } from "@/components/shell/shell-context";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { callAction, NETWORK_ERROR } from "@/lib/call-action";

/** Why the dialog opens: a new Ort, a switch Städtisch ↔ Privat, or "Was braucht dieser Ort?" on the Ort page. */
export type VenueNeedsReason = "created" | "kindChanged" | "manual";

/** The main permits and the Festsetzung first, the extras (Standrohr, PVBT, Plakatierung, Toiletten) below. */
const MAIN: readonly VenueNeedType[] = ["market_permit", "landowner_ok", "market_fixing"];
const EXTRAS = VENUE_NEED_TYPES.filter((type) => !MAIN.includes(type));

/** What is ticked when the dialog opens (core `suggestedVenueNeeds`; on the Ort page: what the Ort has). */
function initialTicks(
  kind: VenueKindKey,
  current: readonly string[],
  reason: VenueNeedsReason,
): VenueNeedType[] {
  const has = current.filter(isVenueNeedType);
  if (reason === "manual" && has.length > 0) return has;
  return suggestedVenueNeeds(kind, current);
}

/**
 * "Was braucht dieser Ort?" (product owner 2026-11-13, Fahrplan R30): opens after an Ort is created (on its page,
 * or stacked on the quick form inside "Markt planen") and after a switch Städtisch ↔ Privat. Pre-ticked from the
 * kind (Städtisch: Marktgenehmigung + Festsetzung; Privat: Einverständnis des Eigentümers + Festsetzung), the extras
 * unticked; everything can be changed, "Überspringen" saves nothing. Saving sets the Ort's permit requirements
 * (`setVenueNeeds`) with an undo toast; details (Behörde, Gebühr, Fenster) go on the requirement form later.
 */
export function VenueNeedsDialog({
  open,
  onOpenChange,
  venueId,
  venueName,
  kind,
  current,
  reason,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  venueId: string;
  venueName: string;
  kind: VenueKindKey;
  /** Permit types of the Ort's live requirements. */
  current: readonly string[];
  reason: VenueNeedsReason;
  onSaved?: () => void;
}) {
  const t = useTranslations("venueNeeds");
  const tKinds = useTranslations("venues.kinds");
  const tErrors = useTranslations("errors");
  const { showToast, showError } = useShell();
  const uid = useId();
  const [pending, startTransition] = useTransition();
  const [ticked, setTicked] = useState<VenueNeedType[]>(() => initialTicks(kind, current, reason));
  const [error, setError] = useState<string | null>(null);

  // Every opening starts from the suggestion again.
  // biome-ignore lint/correctness/useExhaustiveDependencies: only when it opens
  useEffect(() => {
    if (!open) return;
    setTicked(initialTicks(kind, current, reason));
    setError(null);
  }, [open]);

  const toggle = (type: VenueNeedType) =>
    setTicked((prev) => (prev.includes(type) ? prev.filter((x) => x !== type) : [...prev, type]));
  // What saving would take away from the Ort (shown, since it removes requirements).
  const removing = current.filter(
    (type): type is VenueNeedType => isVenueNeedType(type) && !ticked.includes(type),
  );

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await callAction(() => setVenueNeedsAction(venueId, ticked));
      if (!result.ok) {
        setError(result.error === NETWORK_ERROR ? tErrors("network") : t("errors.generic"));
        return;
      }
      onOpenChange(false);
      onSaved?.();
      const change = result.data;
      if (change.created.length === 0 && change.archived.length === 0) {
        showToast({ message: t("unchanged") });
        return;
      }
      showToast({
        message: t("saved", {
          name: venueName,
          added: change.created.length,
          removed: change.archived.length,
        }),
        actionLabel: t("undo"),
        onAction: async () => {
          const undone = await callAction(() => undoVenueNeedsAction(venueId, change));
          if (undone.ok) showToast({ message: t("undone") });
          else showError(t("errors.generic"));
        },
      });
    });
  }

  const row = (type: VenueNeedType) => {
    const id = `${uid}-${type}`;
    return (
      <li key={type} className="flex items-start gap-3">
        <input
          id={id}
          type="checkbox"
          checked={ticked.includes(type)}
          disabled={pending}
          onChange={() => toggle(type)}
          aria-describedby={`${id}-hint`}
          className="mt-0.5 size-4 accent-primary"
        />
        <label htmlFor={id} className="flex min-w-0 flex-col">
          <span className="font-medium">{t(`types.${type}.label`)}</span>
          <span id={`${id}-hint`} className="text-muted-foreground text-small">
            {t(`types.${type}.hint`)}
          </span>
        </label>
      </li>
    );
  };

  return (
    <Modal
      open={open}
      onOpenChange={(next) => !pending && onOpenChange(next)}
      title={t("title")}
      description={t(`intro.${reason}`, { name: venueName, kind: tKinds(kind) })}
      closeLabel={t("skip")}
    >
      <form
        noValidate
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          // Stacked on the Ort quick form: keep the submit away from the form around the opener.
          e.stopPropagation();
          if (!pending) save();
        }}
      >
        <fieldset className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0">
          <legend className="mb-2 font-medium text-small">{t("mainTitle")}</legend>
          <ul className="m-0 flex list-none flex-col gap-3 p-0">{MAIN.map(row)}</ul>
        </fieldset>
        <fieldset className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0">
          <legend className="mb-2 font-medium text-small">{t("extrasTitle")}</legend>
          <ul className="m-0 flex list-none flex-col gap-3 p-0">{EXTRAS.map(row)}</ul>
        </fieldset>
        {removing.length > 0 && (
          <p className="text-small text-status-warn">
            {t("removing", {
              list: removing.map((type) => t(`types.${type}.label`)).join(", "),
            })}
          </p>
        )}
        <p className="text-faint-foreground text-small">{t("detailsHint")}</p>
        <div className="flex items-center justify-between gap-3">
          <p role="alert" className="min-w-0 flex-1 text-small text-status-critical">
            {error}
          </p>
          <div className="flex items-center gap-2">
            <Button type="button" disabled={pending} onClick={() => onOpenChange(false)}>
              {t("skip")}
            </Button>
            <Button type="submit" variant="default" aria-busy={pending} disabled={pending}>
              {t("save")}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
