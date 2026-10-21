import { can } from "@marktwerk/core";
import { Archive, Pencil, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { ArchiveVehicleButton } from "@/components/company/archive-buttons";
import { CompleteButton } from "@/components/company/complete-dialog";
import { ReportIssueButton } from "@/components/company/issue-dialog";
import { IssuesTable } from "@/components/company/issues-table";
import { KindIcon } from "@/components/company/kind-icon";
import { DueCell, IntervalText } from "@/components/company/obligation-cells";
import { OdometerButton } from "@/components/company/odometer-dialog";
import { ObligationStatusBadge } from "@/components/company/status";
import { Page, PageHeader } from "@/components/shell/page";
import { buttonVariants } from "@/components/ui/button";
import { Panel, PanelBody, PanelHeader, PanelTitle } from "@/components/ui/panel";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { Facts } from "@/components/ui/vorschau";
import { formatDate, formatNumber, todayIn } from "@/lib/format";
import { getActor } from "@/server/actor";
import { getVehicle, huFor, legalIntervals, listStaffOptions } from "@/server/queries/company";
import { requirePermission } from "@/server/session";

export async function generateMetadata({
  params,
}: PageProps<"/firma/fahrzeuge/[id]">): Promise<Metadata> {
  const found = await getVehicle((await params).id, todayIn());
  return { title: found?.vehicle.name ?? (await getTranslations("company.vehicles"))("title") };
}

export default async function VehiclePage({ params }: PageProps<"/firma/fahrzeuge/[id]">) {
  await requirePermission("company", "read");
  const actor = await getActor();
  const { id } = await params;
  const today = todayIn();
  const found = await getVehicle(id, today);
  if (!found) notFound();
  const { vehicle: v, obligations, issues } = found;
  const t = await getTranslations("company");
  const tv = await getTranslations("company.vehicle");
  const locale = await getLocale();
  const canWrite = can(actor.role, "company", "write") && !v.archivedAt;
  const [legal, staff] = await Promise.all([
    legalIntervals(today),
    canWrite ? listStaffOptions() : Promise.resolve([]),
  ]);
  const huMonths = huFor(v.grossWeightKg, legal);

  return (
    <Page
      crumbs={[
        { label: t("title"), href: "/firma" },
        { label: t("vehicles.title"), href: "/firma/fahrzeuge" },
        { label: v.name },
      ]}
    >
      <PageHeader
        eyebrow={
          <Link href={"/firma/fahrzeuge" as never} className="hover:underline">
            {tv("back")}
          </Link>
        }
        title={v.name}
        subtitle={
          v.archivedAt ? (
            <span className="inline-flex items-center gap-1.5">
              <Archive aria-hidden className="size-4" />
              {v.plate}
            </span>
          ) : (
            <span className="tabular">{v.plate}</span>
          )
        }
        actions={
          canWrite ? (
            <>
              <OdometerButton
                vehicleId={v.id}
                name={v.name}
                currentKm={v.odometerKm}
                today={today}
              />
              <ReportIssueButton
                variant="outline"
                vehicleId={v.id}
                vehicles={[{ id: v.id, name: v.name, plate: v.plate }]}
                staff={staff}
                defaultReporterId={actor.staffMemberId}
              />
              <Link
                href={`/firma/fahrzeuge/${v.id}/bearbeiten` as never}
                className={buttonVariants({ variant: "outline" })}
              >
                <Pencil aria-hidden />
                {tv("edit")}
              </Link>
              <ArchiveVehicleButton id={v.id} name={v.name} />
            </>
          ) : undefined
        }
      />

      <Panel>
        <PanelHeader>
          <PanelTitle>{tv("facts")}</PanelTitle>
        </PanelHeader>
        <PanelBody>
          <Facts
            items={[
              { label: tv("plate"), value: <span className="tabular">{v.plate}</span> },
              {
                label: tv("make"),
                value: [v.make, v.model].filter(Boolean).join(" ") || t("none"),
              },
              { label: tv("vin"), value: <span className="tabular">{v.vin ?? t("none")}</span> },
              {
                label: tv("firstRegistration"),
                value: v.firstRegistrationOn
                  ? formatDate(v.firstRegistrationOn, locale)
                  : t("none"),
              },
              {
                label: tv("weight"),
                value:
                  v.grossWeightKg === null
                    ? t("none")
                    : tv("weightValue", { kg: formatNumber(v.grossWeightKg, locale, 0) }),
              },
              ...(huMonths !== null
                ? [
                    {
                      label: tv("huInterval"),
                      value: tv("huIntervalValue", { months: huMonths }),
                    },
                  ]
                : []),
              {
                label: tv("odometer"),
                value:
                  v.odometerKm === null ? (
                    t("none")
                  ) : (
                    <span className="tabular">
                      {formatNumber(v.odometerKm, locale, 0)} km
                      {v.odometerRecordedOn && (
                        <span className="ml-2 text-muted-foreground text-small">
                          {t("vehicles.asOf", { date: formatDate(v.odometerRecordedOn, locale) })}
                        </span>
                      )}
                    </span>
                  ),
              },
              { label: tv("insurer"), value: v.insurer ?? t("none") },
              {
                label: tv("policy"),
                value: <span className="tabular">{v.policyNumber ?? t("none")}</span>,
              },
              ...(v.notes
                ? [
                    {
                      label: tv("notes"),
                      value: <span className="whitespace-pre-line">{v.notes}</span>,
                    },
                  ]
                : []),
            ]}
          />
        </PanelBody>
      </Panel>

      <section aria-labelledby="vehicle-obligations" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="vehicle-obligations" className="font-semibold text-[15px]">
            {tv("obligations")}
          </h2>
          {canWrite && (
            <Link
              href={`/firma/pflichten/neu?fahrzeug=${v.id}` as never}
              className={buttonVariants({ variant: "outline" })}
            >
              <Plus aria-hidden />
              {tv("newObligation")}
            </Link>
          )}
        </div>
        <Panel className="overflow-hidden">
          {obligations.length === 0 ? (
            <PanelBody className="text-muted-foreground">{tv("noObligations")}</PanelBody>
          ) : (
            <Table>
              <caption className="sr-only">{tv("obligationsCaption")}</caption>
              <THead>
                <tr>
                  <TH>{t("obligations.cols.status")}</TH>
                  <TH>{t("obligations.cols.title")}</TH>
                  <TH>{t("obligations.cols.interval")}</TH>
                  <TH>{t("obligations.cols.due")}</TH>
                  <TH>{t("obligations.cols.responsible")}</TH>
                  {canWrite && (
                    <TH>
                      <span className="sr-only">{t("obligations.cols.actions")}</span>
                    </TH>
                  )}
                </tr>
              </THead>
              <tbody>
                {obligations.map((o) => (
                  <TR key={o.id}>
                    <TD>
                      <ObligationStatusBadge
                        status={o.status}
                        daysLeft={o.daysLeft}
                        kmLeft={o.kmLeft}
                        trigger={o.trigger}
                      />
                    </TD>
                    <TD className="max-w-80">
                      <Link
                        href={`/firma/pflichten/${o.id}` as never}
                        className="inline-flex items-center gap-2 font-semibold text-accent-soft-foreground hover:underline"
                      >
                        <KindIcon kind={o.kind} />
                        <span className="truncate">{o.title}</span>
                      </Link>
                    </TD>
                    <TD className="text-small text-foreground-2">
                      <IntervalText months={o.intervalMonths} km={o.intervalKm} />
                    </TD>
                    <TD>
                      <DueCell dueOn={o.nextDueOn} dueKm={o.nextDueKm} />
                    </TD>
                    <TD className="whitespace-nowrap">{o.responsibleName}</TD>
                    {canWrite && (
                      <TD className="text-right">
                        <CompleteButton
                          size="sm"
                          today={today}
                          target={{
                            id: o.id,
                            title: o.title,
                            kind: o.kind,
                            intervalKm: o.intervalKm,
                            onVehicle: true,
                            currentKm: o.currentKm,
                          }}
                        />
                      </TD>
                    )}
                  </TR>
                ))}
              </tbody>
            </Table>
          )}
        </Panel>
      </section>

      <section aria-labelledby="vehicle-issues" className="flex flex-col gap-3">
        <h2 id="vehicle-issues" className="font-semibold text-[15px]">
          {tv("issues")}
        </h2>
        <Panel className="overflow-hidden">
          {issues.length === 0 ? (
            <PanelBody className="text-muted-foreground">{tv("noIssues")}</PanelBody>
          ) : (
            <IssuesTable rows={issues} canWrite={canWrite} showVehicle={false} />
          )}
        </Panel>
      </section>
    </Page>
  );
}
