import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { EventStatusBadge } from "@/components/events/event-status";
import { addressLine } from "@/components/ui/phone";
import { Facts, Vorschau } from "@/components/ui/vorschau";
import { formatDateRange, formatLength, todayIn } from "@/lib/format";
import { getActor } from "@/server/actor";
import { getVenue, listVenueEvents } from "@/server/queries/venues";
import { VenueKindBadge } from "./kinds";

/** Vorschau of one venue: address, access, zones summary, next three events. */
export async function VenueVorschau({ id, closeHref }: { id: string; closeHref: string }) {
  const actor = await getActor();
  const venue = await getVenue(id);
  if (!venue) return null;
  const t = await getTranslations("venues");
  const locale = await getLocale();
  const events = await listVenueEvents(actor, id, todayIn());
  const next = events.upcoming.filter((e) => e.status !== "cancelled").slice(0, 3);
  const address = addressLine(venue);
  return (
    <Vorschau
      kind={t("vorschau.kind")}
      title={venue.name}
      closeHref={closeHref}
      openHref={`/orte/${venue.id}`}
      badges={<VenueKindBadge kind={venue.kind} label={t(`kinds.${venue.kind}`)} />}
    >
      <Facts
        items={[
          { label: t("vorschau.address"), value: address || t("none") },
          {
            label: t("vorschau.zones"),
            value:
              venue.zones.length > 0
                ? t("vorschau.zonesSummary", {
                    zones: venue.zones.length,
                    rows: venue.rowCount,
                    length: formatLength(venue.capacityCm ?? 0, locale),
                  })
                : t("vorschau.noZones"),
          },
          {
            label: t("vorschau.landowner"),
            value: venue.landownerId ? (
              <Link
                href={`/kontakte?vorschau=${venue.landownerId}` as never}
                className="font-medium text-accent-soft-foreground hover:underline"
              >
                {venue.landownerName}
              </Link>
            ) : (
              t("none")
            ),
          },
          {
            label: t("vorschau.access"),
            value: venue.accessInfo ? (
              <span className="text-small">{venue.accessInfo}</span>
            ) : (
              <span className="text-muted-foreground">{t("vorschau.noAccess")}</span>
            ),
          },
        ]}
      />
      {actor.role !== "field" && (
        <section aria-labelledby="vorschau-next">
          <h3
            id="vorschau-next"
            className="mb-1.5 font-semibold text-muted-foreground text-tiny uppercase tracking-wide"
          >
            {t("vorschau.nextEvents")}
          </h3>
          {next.length === 0 ? (
            <p className="text-muted-foreground text-small">{t("vorschau.noEvents")}</p>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
              {next.map((e) => (
                <li key={e.id} className="flex flex-wrap items-center gap-x-2 text-small">
                  <span className="tabular whitespace-nowrap font-semibold">
                    {formatDateRange(e.startsOn, e.endsOn, locale)}
                  </span>
                  <Link
                    href={`/veranstaltungen/${e.id}` as never}
                    className="min-w-0 truncate text-accent-soft-foreground hover:underline"
                  >
                    {e.name}
                  </Link>
                  <EventStatusBadge status={e.status} />
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </Vorschau>
  );
}
