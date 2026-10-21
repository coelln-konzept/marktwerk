import { can } from "@marktwerk/core";
import { Check } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { AgreementsSection } from "@/components/agreements/agreements-section";
import { VenueKindBadge } from "@/components/catalogue/kinds";
import { addressLine, MailLink, PhoneLink } from "@/components/catalogue/phone";
import { PresetStatusBadge } from "@/components/catalogue/preset-status";
import { EventStatusBadge } from "@/components/events/event-status";
import { Page, PageHeader } from "@/components/shell/page";
import { Panel, PanelBody, PanelHeader, PanelTitle } from "@/components/ui/panel";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { Facts } from "@/components/ui/vorschau";
import { formatDateRange, formatLength, todayIn } from "@/lib/format";
import { rruleText } from "@/lib/rrule-text";
import { getActor } from "@/server/actor";
import { listPresets } from "@/server/queries/presets";
import { getVenue, listVenueEvents, type VenueEvent } from "@/server/queries/venues";
import { requirePermission } from "@/server/session";

export async function generateMetadata({ params }: PageProps<"/orte/[id]">): Promise<Metadata> {
  const venue = await getVenue((await params).id);
  return { title: venue?.name ?? (await getTranslations("nav"))("venues") };
}

export default async function VenuePage({ params }: PageProps<"/orte/[id]">) {
  await requirePermission("venue", "read");
  const actor = await getActor();
  const { id } = await params;
  const venue = await getVenue(id);
  if (!venue) notFound();
  const t = await getTranslations("venues");
  const td = await getTranslations("venues.detail");
  const locale = await getLocale();
  const today = todayIn();
  const showEvents = can(actor.role, "event", "read");
  const showPresets = can(actor.role, "template", "read");
  const [events, presets] = await Promise.all([
    listVenueEvents(actor, id, today),
    showPresets ? listPresets() : Promise.resolve([]),
  ]);
  const venuePresets = presets.filter((p) => p.venueId === id);
  const address = addressLine(venue);

  return (
    <Page crumbs={[{ label: t("title"), href: "/orte" }, { label: venue.name }]}>
      <PageHeader
        title={venue.name}
        eyebrow={
          <Link href={"/orte" as never} className="hover:underline">
            {td("back")}
          </Link>
        }
        subtitle={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>{venue.city}</span>
            <VenueKindBadge kind={venue.kind} label={t(`kinds.${venue.kind}`)} />
            <span className="tabular">
              {td("facts", {
                zones: venue.zones.length,
                rows: venue.rowCount,
                length: formatLength(venue.capacityCm ?? 0, locale),
              })}
            </span>
          </span>
        }
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel>
          <PanelHeader>
            <PanelTitle>{td("address")}</PanelTitle>
          </PanelHeader>
          <PanelBody className="flex flex-col gap-3">
            <Facts
              items={[
                { label: td("addressLabel"), value: address || t("none") },
                {
                  label: td("accessLabel"),
                  value: venue.accessInfo ? (
                    <span className="whitespace-pre-line">{venue.accessInfo}</span>
                  ) : (
                    <span className="text-muted-foreground">{td("noAccess")}</span>
                  ),
                },
              ]}
            />
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader>
            <PanelTitle>{td("owner")}</PanelTitle>
          </PanelHeader>
          <PanelBody>
            {venue.landownerId ? (
              <Facts
                items={[
                  {
                    label: td("ownerLabel"),
                    value: (
                      <Link
                        href={`/kontakte?vorschau=${venue.landownerId}` as never}
                        className="font-semibold text-accent-soft-foreground hover:underline"
                      >
                        {venue.landownerName}
                      </Link>
                    ),
                  },
                  { label: td("personLabel"), value: venue.landownerPerson ?? t("none") },
                  {
                    label: td("phoneLabel"),
                    value: venue.landownerPhone ? (
                      <PhoneLink e164={venue.landownerPhone} />
                    ) : (
                      t("none")
                    ),
                  },
                  {
                    label: td("emailLabel"),
                    value: venue.landownerEmail ? (
                      <MailLink email={venue.landownerEmail} />
                    ) : (
                      t("none")
                    ),
                  },
                ]}
              />
            ) : (
              <p className="text-muted-foreground">{td("noOwner")}</p>
            )}
          </PanelBody>
        </Panel>
      </div>

      <section aria-labelledby="zones-title" className="flex flex-col gap-3">
        <h2 id="zones-title" className="font-semibold text-[15px]">
          {td("zones")}
        </h2>
        {venue.zones.length === 0 ? (
          <Panel>
            <PanelBody className="text-muted-foreground">{td("noZones")}</PanelBody>
          </Panel>
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            {venue.zones.map((zone) => (
              <Panel key={zone.id} className="overflow-hidden">
                <PanelHeader className="py-2.5">
                  <h3 className="font-semibold">{zone.name}</h3>
                  <span className="tabular text-muted-foreground text-small">
                    {td("zoneSummary", {
                      rows: zone.rows.length,
                      length: formatLength(zone.lengthCm, locale),
                    })}
                  </span>
                </PanelHeader>
                <Table>
                  <caption className="sr-only">{td("zoneCaption", { zone: zone.name })}</caption>
                  <THead>
                    <tr>
                      <TH>{td("row")}</TH>
                      <TH className="text-right">{td("length")}</TH>
                      <TH className="text-right">{td("depth")}</TH>
                      <TH className="text-right">{td("cars")}</TH>
                      <TH className="text-center">{td("power")}</TH>
                      <TH className="text-center">{td("water")}</TH>
                    </tr>
                  </THead>
                  <tbody>
                    {zone.rows.map((row) => (
                      <TR key={row.id}>
                        <TD className="font-medium">{row.label}</TD>
                        <TD className="tabular whitespace-nowrap text-right">
                          {formatLength(row.lengthCm, locale)}
                        </TD>
                        <TD className="tabular whitespace-nowrap text-right">
                          {formatLength(row.depthCm, locale)}
                        </TD>
                        <TD className="tabular text-right">{row.carSlots}</TD>
                        <TD className="text-center">
                          <Flag on={row.power} yes={td("yes")} no={td("no")} />
                        </TD>
                        <TD className="text-center">
                          <Flag on={row.water} yes={td("yes")} no={td("no")} />
                        </TD>
                      </TR>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-surface-2 font-semibold">
                      <th scope="row" className="h-row px-3 py-(--cell-y) text-left">
                        {td("total")}
                      </th>
                      <td className="tabular whitespace-nowrap px-3 text-right">
                        {formatLength(zone.lengthCm, locale)}
                      </td>
                      <td />
                      <td className="tabular px-3 text-right">{zone.carSlots}</td>
                      <td className="tabular px-3 text-center">
                        {zone.rows.filter((r) => r.power).length}/{zone.rows.length}
                      </td>
                      <td className="tabular px-3 text-center">
                        {zone.rows.filter((r) => r.water).length}/{zone.rows.length}
                      </td>
                    </tr>
                  </tfoot>
                </Table>
              </Panel>
            ))}
          </div>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        {showEvents && (
          <Panel className="overflow-hidden">
            <PanelHeader>
              <PanelTitle>{td("events")}</PanelTitle>
            </PanelHeader>
            <EventGroup
              title={td("upcoming")}
              empty={td("noUpcoming")}
              events={events.upcoming}
              locale={locale}
            />
            <EventGroup
              title={td("recent")}
              empty={td("noRecent")}
              events={events.recent}
              locale={locale}
            />
          </Panel>
        )}

        {showPresets && (
          <Panel className="overflow-hidden self-start">
            <PanelHeader>
              <PanelTitle>{td("presets")}</PanelTitle>
            </PanelHeader>
            {venuePresets.length === 0 ? (
              <PanelBody className="text-muted-foreground">{td("noPresets")}</PanelBody>
            ) : (
              <ul className="m-0 list-none p-0">
                {venuePresets.map((p) => (
                  <li
                    key={p.id}
                    className="flex flex-wrap items-center justify-between gap-2 border-border-subtle border-b px-4 py-2.5 last:border-b-0"
                  >
                    <div className="min-w-0">
                      <Link
                        href={`/vorlagen?vorschau=${p.id}` as never}
                        className="font-semibold text-accent-soft-foreground hover:underline"
                      >
                        {p.name}
                      </Link>
                      <p className="text-muted-foreground text-small">
                        {rruleText(p.rrule, locale)}
                      </p>
                    </div>
                    <PresetStatusBadge active={p.active} />
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        )}
      </div>

      <AgreementsSection venueId={id} />
    </Page>
  );
}

function Flag({ on, yes, no }: { on: boolean; yes: string; no: string }) {
  return on ? (
    <span className="inline-flex items-center text-status-ok">
      <Check aria-hidden className="size-4" strokeWidth={2.5} />
      <span className="sr-only">{yes}</span>
    </span>
  ) : (
    <span className="text-faint-foreground">
      <span aria-hidden>–</span>
      <span className="sr-only">{no}</span>
    </span>
  );
}

async function EventGroup({
  title,
  empty,
  events,
  locale,
}: {
  title: string;
  empty: string;
  events: VenueEvent[];
  locale: string;
}) {
  const td = await getTranslations("venues.detail");
  return (
    <div>
      <h3 className="border-border-subtle border-b bg-sunken px-4 py-1.5 font-semibold text-foreground-2 text-tiny">
        {title}
      </h3>
      {events.length === 0 ? (
        <p className="px-4 py-3 text-muted-foreground text-small">{empty}</p>
      ) : (
        <Table>
          <caption className="sr-only">
            {td("eventsCaption")}: {title}
          </caption>
          <thead className="sr-only">
            <tr>
              <th scope="col">{td("eventDate")}</th>
              <th scope="col">{td("eventName")}</th>
              <th scope="col">{td("eventStatus")}</th>
            </tr>
          </thead>
          <tbody>
            {events.map((e) => (
              <TR key={e.id}>
                <TD className="tabular whitespace-nowrap font-semibold">
                  {formatDateRange(e.startsOn, e.endsOn, locale)}
                </TD>
                <TD>
                  <Link
                    href={`/veranstaltungen/${e.id}` as never}
                    className="font-medium text-accent-soft-foreground hover:underline"
                  >
                    {e.name}
                  </Link>
                </TD>
                <TD>
                  <EventStatusBadge status={e.status} />
                </TD>
              </TR>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}
