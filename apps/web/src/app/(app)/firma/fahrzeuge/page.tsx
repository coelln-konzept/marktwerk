import { can } from "@marktwerk/core";
import { Plus, Truck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { CompanyHeader } from "@/components/company/company-header";
import { Page } from "@/components/shell/page";
import { buttonVariants } from "@/components/ui/button";
import { HealthShape } from "@/components/ui/health";
import { Panel } from "@/components/ui/panel";
import { EmptyState } from "@/components/ui/states";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { formatDate, formatNumber, todayIn } from "@/lib/format";
import { getActor } from "@/server/actor";
import { listVehicles } from "@/server/queries/company";
import { requirePermission } from "@/server/session";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("company.vehicles"))("title") };
}

export default async function VehiclesPage() {
  await requirePermission("company", "read");
  const actor = await getActor();
  const t = await getTranslations("company");
  const tv = await getTranslations("company.vehicles");
  const locale = await getLocale();
  const canWrite = can(actor.role, "company", "write");
  const rows = await listVehicles(todayIn());

  return (
    <Page crumbs={[{ label: t("title"), href: "/firma" }, { label: tv("title") }]}>
      <CompanyHeader
        actor={actor}
        actions={
          canWrite ? (
            <Link
              href={"/firma/fahrzeuge/neu" as never}
              className={buttonVariants({ variant: "default" })}
            >
              <Plus aria-hidden />
              {tv("new")}
            </Link>
          ) : undefined
        }
      />

      <Panel className="overflow-hidden">
        {rows.length === 0 ? (
          <EmptyState icon={Truck} title={tv("empty")} hint={tv("emptyHint")}>
            {canWrite && (
              <Link
                href={"/firma/fahrzeuge/neu" as never}
                className={buttonVariants({ variant: "default" })}
              >
                <Plus aria-hidden />
                {tv("new")}
              </Link>
            )}
          </EmptyState>
        ) : (
          <Table>
            <caption className="sr-only">{tv("caption")}</caption>
            <THead>
              <tr>
                <TH>{tv("cols.vehicle")}</TH>
                <TH>{tv("cols.model")}</TH>
                <TH className="text-right">{tv("cols.odometer")}</TH>
                <TH>{tv("cols.obligations")}</TH>
                <TH>{tv("cols.issues")}</TH>
                <TH>{tv("cols.insurer")}</TH>
              </tr>
            </THead>
            <tbody>
              {rows.map((v) => {
                const total =
                  v.statusCounts.overdue +
                  v.statusCounts.due +
                  v.statusCounts.soon +
                  v.statusCounts.ok;
                const level =
                  v.worstStatus === "overdue"
                    ? "critical"
                    : v.worstStatus === "ok"
                      ? total === 0
                        ? "none"
                        : "ok"
                      : "warn";
                return (
                  <TR key={v.id}>
                    <TD>
                      <Link
                        href={`/firma/fahrzeuge/${v.id}` as never}
                        className="flex flex-col font-semibold text-accent-soft-foreground hover:underline"
                      >
                        {v.name}
                        <span className="tabular font-normal text-muted-foreground text-small">
                          {v.plate}
                        </span>
                      </Link>
                    </TD>
                    <TD className="whitespace-nowrap">
                      {[v.make, v.model].filter(Boolean).join(" ") || t("none")}
                    </TD>
                    <TD className="tabular whitespace-nowrap text-right">
                      {v.odometerKm === null ? (
                        t("none")
                      ) : (
                        <span className="flex flex-col">
                          <span>{formatNumber(v.odometerKm, locale, 0)} km</span>
                          {v.odometerRecordedOn && (
                            <span className="text-muted-foreground text-small">
                              {tv("asOf", { date: formatDate(v.odometerRecordedOn, locale) })}
                            </span>
                          )}
                        </span>
                      )}
                    </TD>
                    <TD>
                      <span className="inline-flex items-center gap-1.5 text-small">
                        <HealthShape level={level} />
                        <span>
                          {total === 0
                            ? tv("obligationsNone")
                            : v.statusCounts.overdue > 0
                              ? tv("overdueCount", { count: v.statusCounts.overdue })
                              : v.statusCounts.due > 0
                                ? tv("dueCount", { count: v.statusCounts.due })
                                : v.statusCounts.soon > 0
                                  ? tv("soonCount", { count: v.statusCounts.soon })
                                  : tv("obligationsOk")}
                        </span>
                      </span>
                    </TD>
                    <TD>
                      <span className="inline-flex items-center gap-1.5 text-small">
                        <HealthShape
                          level={
                            v.criticalIssues > 0 ? "critical" : v.openIssues > 0 ? "warn" : "none"
                          }
                        />
                        <span>
                          {v.openIssues === 0
                            ? tv("issuesNone")
                            : v.criticalIssues > 0
                              ? `${tv("issuesOpen", { count: v.openIssues })}, ${tv("issuesCritical", { count: v.criticalIssues })}`
                              : tv("issuesOpen", { count: v.openIssues })}
                        </span>
                      </span>
                    </TD>
                    <TD className="max-w-48 truncate" title={v.insurer ?? undefined}>
                      {v.insurer ?? t("none")}
                    </TD>
                  </TR>
                );
              })}
            </tbody>
          </Table>
        )}
      </Panel>
    </Page>
  );
}
