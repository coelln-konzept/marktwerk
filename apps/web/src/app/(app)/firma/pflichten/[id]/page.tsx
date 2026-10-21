import { can } from "@marktwerk/core";
import { Archive, Pencil } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { ArchiveObligationButton } from "@/components/company/archive-buttons";
import { CompleteButton } from "@/components/company/complete-dialog";
import { KindIcon } from "@/components/company/kind-icon";
import { DueCell, IntervalText, TargetCell } from "@/components/company/obligation-cells";
import { ObligationStatusBadge } from "@/components/company/status";
import { Page, PageHeader } from "@/components/shell/page";
import { buttonVariants } from "@/components/ui/button";
import { Panel, PanelBody, PanelHeader, PanelTitle } from "@/components/ui/panel";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { Facts } from "@/components/ui/vorschau";
import { formatDate, formatMoney, formatNumber, todayIn } from "@/lib/format";
import { getActor } from "@/server/actor";
import { getObligation } from "@/server/queries/company";
import { requirePermission } from "@/server/session";

export async function generateMetadata({
  params,
}: PageProps<"/firma/pflichten/[id]">): Promise<Metadata> {
  const found = await getObligation((await params).id, todayIn());
  return { title: found?.obligation.title ?? (await getTranslations("company"))("title") };
}

export default async function ObligationPage({ params }: PageProps<"/firma/pflichten/[id]">) {
  await requirePermission("company", "read");
  const actor = await getActor();
  const { id } = await params;
  const today = todayIn();
  const found = await getObligation(id, today);
  if (!found) notFound();
  const { obligation: o, completions, archived } = found;
  const t = await getTranslations("company");
  const td = await getTranslations("company.obligation");
  const locale = await getLocale();
  const canWrite = can(actor.role, "company", "write");

  return (
    <Page
      crumbs={[
        { label: t("title"), href: "/firma" },
        { label: t("obligations.title"), href: "/firma/pflichten" },
        { label: o.title },
      ]}
    >
      <PageHeader
        eyebrow={
          <Link href={"/firma/pflichten" as never} className="hover:underline">
            {td("back")}
          </Link>
        }
        title={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <KindIcon kind={o.kind} className="size-5 shrink-0 text-muted-foreground" />
            {o.title}
          </span>
        }
        subtitle={
          archived ? (
            <span className="inline-flex items-center gap-1.5">
              <Archive aria-hidden className="size-4" />
              {td("archivedNote")}
            </span>
          ) : (
            <ObligationStatusBadge
              status={o.status}
              daysLeft={o.daysLeft}
              kmLeft={o.kmLeft}
              trigger={o.trigger}
            />
          )
        }
        actions={
          canWrite && !archived ? (
            <>
              <CompleteButton
                variant="default"
                today={today}
                target={{
                  id: o.id,
                  title: o.title,
                  kind: o.kind,
                  intervalKm: o.intervalKm,
                  onVehicle: o.scope === "vehicle",
                  currentKm: o.currentKm,
                }}
              />
              <Link
                href={`/firma/pflichten/${o.id}/bearbeiten` as never}
                className={buttonVariants({ variant: "outline" })}
              >
                <Pencil aria-hidden />
                {td("edit")}
              </Link>
              <ArchiveObligationButton id={o.id} title={o.title} />
            </>
          ) : undefined
        }
      />

      <Panel>
        <PanelHeader>
          <PanelTitle>{td("facts")}</PanelTitle>
        </PanelHeader>
        <PanelBody>
          <Facts
            items={[
              { label: td("kind"), value: t(`kinds.${o.kind}`) },
              {
                label: td("target"),
                value: (
                  <TargetCell
                    scope={o.scope}
                    vehicleId={o.vehicleId}
                    vehicleName={o.vehicleName}
                    vehiclePlate={o.vehiclePlate}
                    venueId={o.venueId}
                    venueName={o.venueName}
                  />
                ),
              },
              {
                label: td("interval"),
                value: <IntervalText months={o.intervalMonths} km={o.intervalKm} />,
              },
              {
                label: td("nextDue"),
                value: (
                  <span className="flex flex-col gap-0.5">
                    <DueCell dueOn={o.nextDueOn} dueKm={o.nextDueKm} />
                    {o.nextDueKm !== null && o.currentKm !== null && (
                      <span className="text-muted-foreground text-small">
                        {td("currentKm", { km: formatNumber(o.currentKm, locale, 0) })}
                      </span>
                    )}
                  </span>
                ),
              },
              { label: td("leadDays"), value: td("leadDaysValue", { days: o.leadDays }) },
              { label: td("responsible"), value: o.responsibleName },
              {
                label: td("lastDone"),
                value: o.lastDoneOn ? formatDate(o.lastDoneOn, locale) : t("none"),
              },
              {
                label: td("payable"),
                value: o.createsPayable ? td("payableYes") : td("payableNo"),
              },
              ...(o.notes
                ? [
                    {
                      label: td("notes"),
                      value: <span className="whitespace-pre-line">{o.notes}</span>,
                    },
                  ]
                : []),
            ]}
          />
        </PanelBody>
      </Panel>

      <Panel className="overflow-hidden">
        <PanelHeader>
          <PanelTitle>{td("history")}</PanelTitle>
        </PanelHeader>
        {completions.length === 0 ? (
          <PanelBody className="text-muted-foreground">{td("noHistory")}</PanelBody>
        ) : (
          <Table>
            <caption className="sr-only">{td("historyCaption")}</caption>
            <THead>
              <tr>
                <TH>{td("historyCols.doneOn")}</TH>
                <TH className="text-right">{td("historyCols.km")}</TH>
                <TH className="text-right">{td("historyCols.cost")}</TH>
                <TH>{td("historyCols.by")}</TH>
                <TH>{td("historyCols.checker")}</TH>
                <TH>{td("historyCols.notes")}</TH>
                <TH>{td("historyCols.next")}</TH>
              </tr>
            </THead>
            <tbody>
              {completions.map((c) => (
                <TR key={c.id}>
                  <TD className="tabular whitespace-nowrap font-medium">
                    {formatDate(c.doneOn, locale)}
                  </TD>
                  <TD className="tabular whitespace-nowrap text-right">
                    {c.doneKm === null ? t("none") : `${formatNumber(c.doneKm, locale, 0)} km`}
                  </TD>
                  <TD className="tabular whitespace-nowrap text-right">
                    {c.costCents === null ? t("none") : formatMoney(c.costCents, locale)}
                  </TD>
                  <TD className="whitespace-nowrap">{c.doneByName ?? t("none")}</TD>
                  <TD className="whitespace-nowrap">{c.checkerName ?? t("none")}</TD>
                  <TD className="max-w-72 truncate" title={c.notes ?? undefined}>
                    {c.notes ?? t("none")}
                  </TD>
                  <TD className="tabular whitespace-nowrap">
                    {c.nextDueOnAfter ? formatDate(c.nextDueOnAfter, locale) : null}
                    {c.nextDueOnAfter && c.nextDueKmAfter !== null ? " · " : null}
                    {c.nextDueKmAfter !== null
                      ? `${formatNumber(c.nextDueKmAfter, locale, 0)} km`
                      : null}
                    {!c.nextDueOnAfter && c.nextDueKmAfter === null ? t("none") : null}
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </Panel>
    </Page>
  );
}
