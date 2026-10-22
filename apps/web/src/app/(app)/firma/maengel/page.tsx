import { can } from "@marktwerk/core";
import { SearchX, Wrench } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { CompanyHeader } from "@/components/company/company-header";
import { ReportIssueButton } from "@/components/company/issue-dialog";
import { IssuesTable } from "@/components/company/issues-table";
import { Page } from "@/components/shell/page";
import { FilterChip } from "@/components/ui/chip";
import { Panel } from "@/components/ui/panel";
import { EmptyState } from "@/components/ui/states";
import { hrefWith, param } from "@/lib/url";
import { getActor } from "@/server/actor";
import { listIssues, listStaffOptions, listVehicleOptions } from "@/server/queries/company";
import { requirePermission } from "@/server/session";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("company.issues"))("title") };
}

const PATH = "/firma/maengel";
const FILTERS = ["unresolved", "open", "in_progress", "resolved", "all"] as const;
type Filter = (typeof FILTERS)[number];

export default async function IssuesPage({ searchParams }: PageProps<"/firma/maengel">) {
  await requirePermission("company", "read");
  const actor = await getActor();
  const sp = await searchParams;
  const t = await getTranslations("company");
  const ti = await getTranslations("company.issues");
  const canWrite = can(actor.role, "company", "write");
  const filter: Filter = FILTERS.find((f) => f === param(sp.status)) ?? "unresolved";

  const all = await listIssues();
  const matches = (status: string, f: Filter) =>
    f === "all" ? true : f === "unresolved" ? status !== "resolved" : status === f;
  const rows = all.filter((i) => matches(i.status, filter));
  const [vehicles, staff] = canWrite
    ? await Promise.all([listVehicleOptions(), listStaffOptions()])
    : [[], []];

  return (
    <Page crumbs={[{ label: t("title") }]}>
      <CompanyHeader
        actor={actor}
        actions={
          canWrite ? (
            <ReportIssueButton
              vehicles={vehicles}
              staff={staff}
              defaultReporterId={actor.staffMemberId}
            />
          ) : undefined
        }
      />

      <nav aria-label={ti("filterLabel")} className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <FilterChip
            key={f}
            href={hrefWith(PATH, sp, { status: f === "unresolved" ? undefined : f })}
            active={filter === f}
            count={all.filter((i) => matches(i.status, f)).length}
          >
            {ti(`filters.${f}`)}
          </FilterChip>
        ))}
      </nav>

      <Panel className="overflow-hidden">
        {all.length === 0 ? (
          <EmptyState icon={Wrench} title={ti("empty")} hint={ti("emptyHint")} />
        ) : rows.length === 0 ? (
          <EmptyState icon={SearchX} title={ti("emptyFiltered")}>
            <Link
              href={PATH as never}
              className="inline-flex min-h-8 items-center rounded-lg border border-input bg-card px-3 font-medium hover:bg-hover"
            >
              {ti("resetFilters")}
            </Link>
          </EmptyState>
        ) : (
          <IssuesTable rows={rows} canWrite={canWrite} />
        )}
      </Panel>
    </Page>
  );
}
