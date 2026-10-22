import { can } from "@marktwerk/core";
import { CalendarPlus } from "lucide-react";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { EventStatusBadge } from "@/components/events/event-status";
import { Panel, PanelBody, PanelHeader, PanelTitle } from "@/components/ui/panel";
import { formatDate } from "@/lib/format";
import { getActor } from "@/server/actor";
import { listContactOptions, listVenueAgreements } from "@/server/queries/agreements";
import { AgreementDialog } from "./agreement-dialog";
import { RemoveAgreementButton } from "./remove-agreement-button";

/**
 * "Vereinbarungen" on the venue page: multi-year agreements with their fixed dates, create/edit, and
 * "Termine erzeugen" for the dates that have no event yet. Self-contained so the venue page only
 * needs `<AgreementsSection venueId={…} />`; the page already checked `venue:read`.
 */
export async function AgreementsSection({ venueId }: { venueId: string }) {
  const actor = await getActor();
  const t = await getTranslations("agreements");
  const locale = await getLocale();
  const canWrite = can(actor.role, "venue", "write");
  const canGenerate = can(actor.role, "event", "write");
  const showEvents = can(actor.role, "event", "read");
  const [agreements, contacts] = await Promise.all([
    listVenueAgreements(venueId),
    canWrite ? listContactOptions() : Promise.resolve([]),
  ]);

  return (
    <section aria-labelledby="agreements-title" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="agreements-title" className="font-semibold text-[15px]">
          {t("title")}
        </h2>
        {canWrite && <AgreementDialog venueId={venueId} contacts={contacts} />}
      </div>
      {agreements.length === 0 ? (
        <Panel>
          <PanelBody className="text-muted-foreground">{t("empty")}</PanelBody>
        </Panel>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {agreements.map((a) => (
            <Panel key={a.id} className="overflow-hidden">
              <PanelHeader className="py-2.5">
                <PanelTitle>
                  {a.counterpartyContactId && a.counterpartyName ? (
                    <Link
                      href={`/kontakte?vorschau=${a.counterpartyContactId}` as never}
                      className="text-accent-soft-foreground hover:underline"
                    >
                      {a.counterpartyName}
                    </Link>
                  ) : (
                    t("noCounterparty")
                  )}
                </PanelTitle>
                <span className="tabular text-muted-foreground text-small">
                  {t("validity", {
                    from: formatDate(a.validFrom, locale),
                    until: formatDate(a.validUntil, locale),
                  })}
                </span>
              </PanelHeader>
              <PanelBody className="flex flex-col gap-3">
                <p className="text-small">
                  {a.dates.length === 0
                    ? t("noDates")
                    : t("dateSummary", { total: a.dates.length, pending: a.pending.length })}
                </p>
                {a.dates.length > 0 && (
                  <ul className="m-0 flex list-none flex-col p-0">
                    {a.dates.map((d) => (
                      <li
                        key={d.date}
                        className="flex flex-wrap items-center justify-between gap-2 border-border-subtle border-b py-1.5 last:border-b-0"
                      >
                        <span className="tabular font-medium">{formatDate(d.date, locale)}</span>
                        {d.event && showEvents ? (
                          <span className="flex items-center gap-2">
                            <Link
                              href={`/veranstaltungen/${d.event.id}` as never}
                              className="text-accent-soft-foreground text-small hover:underline"
                            >
                              {d.event.name}
                            </Link>
                            <EventStatusBadge status={d.event.status} />
                          </span>
                        ) : d.event ? (
                          <span className="text-muted-foreground text-small">{t("hasEvent")}</span>
                        ) : (
                          <span className="text-muted-foreground text-small">{t("noEvent")}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                {a.terms && (
                  <details className="text-small">
                    <summary className="cursor-pointer font-medium">{t("terms")}</summary>
                    <p className="mt-1 whitespace-pre-line text-foreground-2">{a.terms}</p>
                  </details>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  {canGenerate && a.pending.length > 0 && (
                    <Link
                      href={`/orte/${venueId}/vereinbarungen/${a.id}/erzeugen` as never}
                      className="inline-flex min-h-8 items-center gap-2 rounded-lg border border-primary bg-primary px-3 font-medium text-primary-foreground hover:bg-primary-hover"
                    >
                      <CalendarPlus aria-hidden className="size-4" />
                      {t("generate")}
                    </Link>
                  )}
                  {canWrite && (
                    <>
                      <AgreementDialog
                        venueId={venueId}
                        contacts={contacts}
                        agreement={{
                          id: a.id,
                          counterpartyContactId: a.counterpartyContactId,
                          validFrom: a.validFrom,
                          validUntil: a.validUntil,
                          fixedDates: a.fixedDates,
                          terms: a.terms,
                        }}
                      />
                      <RemoveAgreementButton id={a.id} />
                    </>
                  )}
                </div>
              </PanelBody>
            </Panel>
          ))}
        </div>
      )}
    </section>
  );
}
