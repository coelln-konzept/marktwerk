"use client";

import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { centsToInput, type EventFieldsValue } from "@/components/events/event-fields";
import { NewMarketForm } from "@/components/events/new-market-form";
import { useShell } from "@/components/shell/shell-context";
import { Modal } from "@/components/ui/modal";
import type { EventTypeOption } from "@/server/queries/event-form";
import type { PresetSource } from "@/server/queries/events";
import type { VenueOption } from "@/server/queries/venues";

const daysOf = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000) + 1;

/**
 * "Als Vorlage speichern" (Archiv › Vergangene Veranstaltungen, `?vorlage=<eventId>`): the new-market form,
 * prefilled from the past event. Nothing is saved until the person confirms; the market's tasks are copied
 * from the event's market (`createMarket` with `fromEventId`). Closing returns to the list.
 */
export function SaveAsPreset({
  source,
  types,
  venues,
  closeHref,
}: {
  source: PresetSource;
  types: EventTypeOption[];
  venues: VenueOption[];
  closeHref: string;
}) {
  const t = useTranslations("archive.preset");
  const tMarket = useTranslations("generate.market");
  const locale = useLocale();
  const router = useRouter();
  const { showToast } = useShell();
  const close = () => router.replace(closeHref as never, { scroll: false });

  const initial: EventFieldsValue = {
    name: source.name,
    eventTypeId: source.eventTypeId,
    venueId: source.venueId,
    startsOn: "",
    days: String(daysOf(source.startsOn, source.endsOn)),
    times: { ...source.times },
    price: centsToInput(source.pricePerMCents, locale),
    fee: centsToInput(source.bookingFeeCents, locale),
    // The event's own prices, not the type's defaults.
    priceTouched: true,
    feeTouched: true,
  };

  return (
    <Modal
      open
      onOpenChange={(open) => !open && close()}
      title={t("title")}
      closeLabel={tMarket("cancel")}
      className="max-w-xl"
    >
      <NewMarketForm
        types={types}
        venues={venues}
        initialName={source.name}
        initialValue={initial}
        fromEventId={source.id}
        title={null}
        hint={t("hint", { name: source.name })}
        onCancel={close}
        onCreated={(market, template) => {
          close();
          showToast({
            message: t("created", { name: market.name, tasks: template?.items ?? 0 }),
            actionLabel: t("open"),
            undoable: false,
            onAction: () => router.push(`/einstellungen/bibliothek?vorschau=${market.id}` as never),
          });
        }}
      />
    </Modal>
  );
}
