import { FileCheck2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { PermitStateBadge } from "@/components/permits/permit-state-badge";
import { buttonVariants } from "@/components/ui/button";
import { Health } from "@/components/ui/health";
import { Panel, PanelHeader, PanelTitle } from "@/components/ui/panel";
import { LinkRow } from "@/components/ui/row-link";
import { EmptyState } from "@/components/ui/states";
import { Table, TD, TH, THead } from "@/components/ui/table";
import { formatDate, todayIn } from "@/lib/format";
import { getActor } from "@/server/actor";
import { getEvent } from "@/server/queries/events";
import { listEventPermits } from "@/server/queries/permits";
import { requirePermission } from "@/server/session";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("eventPermits"))("title") };
}

/**
 * Tab "Genehmigungen": the permits this event needs (`event_permit`) with their state; the whole row opens the
 * permit in its drawer (Genehmigungen). Permits are created by the venue's requirements when the event is made.
 */
export default async function EventPermitsPage({
  params,
}: PageProps<"/veranstaltungen/[id]/genehmigungen">) {
  await requirePermission("permit", "read");
  const { id } = await params;
  const actor = await getActor();
  const event = await getEvent(actor, id);
  if (!event) notFound();
  const t = await getTranslations("eventPermits");
  const tHealth = await getTranslations("health");
  const tTypes = await getTranslations("permitTypes");
  const locale = await getLocale();
  const permits = await listEventPermits(actor, event, todayIn());
  const level = permits.health ?? "none";
  const none = <span className="text-faint-foreground">–</span>;

  if (permits.rows.length === 0) {
    return (
      <Panel>
        <EmptyState
          icon={FileCheck2}
          title={t("empty")}
          hint={t("emptyHint", { venue: event.venue.name })}
        >
          <Link
            href={`/orte/${event.venue.id}` as never}
            className={buttonVariants({ variant: "outline" })}
          >
            {t("emptyAction")}
          </Link>
        </EmptyState>
      </Panel>
    );
  }

  return (
    <Panel aria-labelledby="permits-title" className="overflow-hidden">
      <PanelHeader>
        <PanelTitle id="permits-title">{t("title")}</PanelTitle>
        <span className="flex flex-wrap items-center gap-3">
          <Health
            level={level}
            label={`${
              permits.required === 0
                ? t("summaryNone")
                : t("summary", { held: permits.held, required: permits.required })
            } · ${tHealth(level)}`}
          />
          <Link
            href={"/logbuch" as never}
            className="text-accent-soft-foreground text-small hover:underline"
          >
            {t("logbook")}
          </Link>
        </span>
      </PanelHeader>
      <Table>
        <caption className="sr-only">{t("caption")}</caption>
        <THead>
          <tr>
            <TH>{t("cols.permit")}</TH>
            <TH>{t("cols.status")}</TH>
            <TH>{t("cols.applyBy")}</TH>
            <TH>{t("cols.validity")}</TH>
            <TH>{t("cols.covers")}</TH>
          </tr>
        </THead>
        <tbody>
          {permits.rows.map((r) => (
            <LinkRow
              key={r.permitId}
              href={`/logbuch?genehmigung=${r.permitId}`}
              className={r.required ? undefined : "text-muted-foreground"}
            >
              <TD className="max-w-64">
                <Link
                  href={`/logbuch?genehmigung=${r.permitId}` as never}
                  className="font-semibold text-accent-soft-foreground hover:underline"
                >
                  {r.title}
                </Link>
                <div className="text-muted-foreground text-tiny">
                  {tTypes(r.permitType)}
                  {r.referenceNo ? ` · ${r.referenceNo}` : ""}
                  {!r.required ? ` · ${t("notRequired")}` : ""}
                </div>
              </TD>
              <TD>
                <PermitStateBadge state={r.state} />
                {r.status === "applied" && r.expectedDecisionOn && (
                  <div className="tabular mt-1 text-muted-foreground text-tiny">
                    {t("applied", { date: formatDate(r.expectedDecisionOn, locale) })}
                  </div>
                )}
              </TD>
              <TD className="tabular whitespace-nowrap">
                {r.applyBy ? formatDate(r.applyBy, locale) : none}
              </TD>
              <TD className="tabular whitespace-nowrap">
                {r.validFrom && r.validUntil
                  ? t("validity", {
                      from: formatDate(r.validFrom, locale),
                      until: formatDate(r.validUntil, locale),
                    })
                  : r.validUntil
                    ? t("validityUntil", { until: formatDate(r.validUntil, locale) })
                    : none}
              </TD>
              <TD className="tabular whitespace-nowrap">
                {r.coversEvents > 1 ? t("covers", { count: r.coversEvents }) : none}
              </TD>
            </LinkRow>
          ))}
        </tbody>
      </Table>
    </Panel>
  );
}
