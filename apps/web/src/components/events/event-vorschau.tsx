import { getLocale, getTranslations } from "next-intl/server";
import { EventTypeTag } from "@/components/ui/event-type-tag";
import { Facts, Vorschau } from "@/components/ui/vorschau";
import { formatDateWithWeekday, formatMoney, formatWeek } from "@/lib/format";
import { isModuleVisible } from "@/lib/modules";
import { getActor } from "@/server/actor";
import { getEvent } from "@/server/queries/events";
import { EventStatusBadge } from "./event-status";
import { HealthSummary } from "./health-summary";

/**
 * Vorschau of one event: key facts and dates. "Öffnen" goes to the event page (Überblick), or to the
 * given tab, e.g. `openTab="board"` from the Übersicht and the Kalender.
 */
export async function EventVorschau({
  id,
  closeHref,
  openTab,
}: {
  id: string;
  closeHref: string;
  openTab?: "board";
}) {
  const actor = await getActor();
  const event = await getEvent(actor, id);
  if (!event) return null;
  const t = await getTranslations("eventPage");
  const locale = await getLocale();
  const anchor = (key: string) => event.anchors.find((a) => a.key === key)?.date;
  const cutoff = anchor("booking_cutoff");
  const assigned = event.duties.filter((d) => d.staffMemberId).length;
  return (
    <Vorschau
      kind={t("kind")}
      title={event.name}
      closeHref={closeHref}
      openHref={`/veranstaltungen/${event.id}${openTab ? `/${openTab}` : ""}`}
      badges={
        <>
          <EventTypeTag typeKey={event.type.key}>
            {locale === "en" ? event.type.nameEn : event.type.nameDe}
          </EventTypeTag>
          <EventStatusBadge status={event.status} />
        </>
      }
    >
      <Facts
        items={[
          {
            label: t("facts.date"),
            value: `${formatDateWithWeekday(event.startsOn, locale)}${event.endsOn !== event.startsOn ? ` – ${formatDateWithWeekday(event.endsOn, locale)}` : ""} · ${formatWeek(event.startsOn, locale)}`,
          },
          { label: t("facts.venue"), value: event.venue.name },
          { label: t("facts.times"), value: t("facts.timesValue", event.times) },
          ...(isModuleVisible("team")
            ? [
                {
                  label: t("facts.team"),
                  value: t("facts.teamValue", { assigned, total: event.duties.length }),
                },
              ]
            : []),
          { label: t("facts.price"), value: `${formatMoney(event.pricePerMCents, locale)} / m` },
          ...(cutoff
            ? [{ label: t("facts.cutoff"), value: formatDateWithWeekday(cutoff, locale) }]
            : []),
          { label: t("facts.health"), value: <HealthSummary health={event.health} /> },
        ]}
      />
    </Vorschau>
  );
}
