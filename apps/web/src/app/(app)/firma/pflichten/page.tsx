import { can, OBLIGATION_STATUS_ORDER, type ObligationStatus } from "@marktwerk/core";
import { ClipboardList, Plus, SearchX } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { CompanyHeader } from "@/components/company/company-header";
import { CompleteButton } from "@/components/company/complete-dialog";
import { KindIcon } from "@/components/company/kind-icon";
import { DueCell, IntervalText, TargetCell } from "@/components/company/obligation-cells";
import { ObligationStatusBadge } from "@/components/company/status";
import { Page } from "@/components/shell/page";
import { buttonVariants } from "@/components/ui/button";
import { FilterChip } from "@/components/ui/chip";
import { Panel } from "@/components/ui/panel";
import { EmptyState } from "@/components/ui/states";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { formatDate, todayIn } from "@/lib/format";
import { hrefWith, param } from "@/lib/url";
import { getActor } from "@/server/actor";
import { listObligations } from "@/server/queries/company";
import { requirePermission } from "@/server/session";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("company.obligations"))("title") };
}

const PATH = "/firma/pflichten";
const SCOPES = ["company", "vehicle", "venue"] as const;

export default async function ObligationsPage({ searchParams }: PageProps<"/firma/pflichten">) {
  await requirePermission("company", "read");
  const actor = await getActor();
  const sp = await searchParams;
  const t = await getTranslations("company");
  const to = await getTranslations("company.obligations");
  const locale = await getLocale();
  const today = todayIn();
  const canWrite = can(actor.role, "company", "write");

  const statusParam = param(sp.status);
  const status = OBLIGATION_STATUS_ORDER.find((s) => s === statusParam);
  const scopeParam = param(sp.bereich);
  const scope = SCOPES.find((s) => s === scopeParam);

  const all = await listObligations(today);
  const byScope = scope ? all.filter((o) => o.scope === scope) : all;
  const rows = status ? byScope.filter((o) => o.status === status) : byScope;
  const count = (s: ObligationStatus) => byScope.filter((o) => o.status === s).length;

  return (
    <Page crumbs={[{ label: t("title"), href: "/firma" }, { label: to("title") }]}>
      <CompanyHeader
        actor={actor}
        actions={
          canWrite ? (
            <Link
              href={"/firma/pflichten/neu" as never}
              className={buttonVariants({ variant: "default" })}
            >
              <Plus aria-hidden />
              {to("new")}
            </Link>
          ) : undefined
        }
      />

      <div className="flex flex-col gap-2">
        <nav aria-label={to("filterStatus")} className="flex flex-wrap gap-2">
          <FilterChip
            href={hrefWith(PATH, sp, { status: undefined })}
            active={!status}
            count={byScope.length}
          >
            {to("all")}
          </FilterChip>
          {OBLIGATION_STATUS_ORDER.map((s) => (
            <FilterChip
              key={s}
              href={hrefWith(PATH, sp, { status: s })}
              active={status === s}
              count={count(s)}
            >
              {t(`status.${s}`)}
            </FilterChip>
          ))}
        </nav>
        <nav aria-label={to("filterScope")} className="flex flex-wrap gap-2">
          <FilterChip href={hrefWith(PATH, sp, { bereich: undefined })} active={!scope}>
            {to("allScopes")}
          </FilterChip>
          {SCOPES.map((s) => (
            <FilterChip key={s} href={hrefWith(PATH, sp, { bereich: s })} active={scope === s}>
              {t(`scopes.${s}`)}
            </FilterChip>
          ))}
        </nav>
      </div>

      <Panel className="overflow-hidden">
        {all.length === 0 ? (
          <EmptyState icon={ClipboardList} title={to("empty")} hint={to("emptyHint")}>
            {canWrite && (
              <Link
                href={"/firma/pflichten/neu" as never}
                className={buttonVariants({ variant: "default" })}
              >
                <Plus aria-hidden />
                {to("new")}
              </Link>
            )}
          </EmptyState>
        ) : rows.length === 0 ? (
          <EmptyState icon={SearchX} title={to("emptyFiltered")}>
            <Link
              href={PATH as never}
              className="inline-flex min-h-8 items-center rounded-lg border border-input bg-card px-3 font-medium hover:bg-hover"
            >
              {to("resetFilters")}
            </Link>
          </EmptyState>
        ) : (
          <Table>
            <caption className="sr-only">{to("caption")}</caption>
            <THead>
              <tr>
                <TH>{to("cols.status")}</TH>
                <TH>{to("cols.title")}</TH>
                <TH>{to("cols.target")}</TH>
                <TH>{to("cols.interval")}</TH>
                <TH>{to("cols.due")}</TH>
                <TH>{to("cols.lastDone")}</TH>
                <TH>{to("cols.responsible")}</TH>
                {canWrite && (
                  <TH>
                    <span className="sr-only">{to("cols.actions")}</span>
                  </TH>
                )}
              </tr>
            </THead>
            <tbody>
              {rows.map((o) => (
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
                  <TD className="max-w-56 truncate">
                    <TargetCell
                      scope={o.scope}
                      vehicleId={o.vehicleId}
                      vehicleName={o.vehicleName}
                      vehiclePlate={o.vehiclePlate}
                      venueId={o.venueId}
                      venueName={o.venueName}
                    />
                  </TD>
                  <TD className="text-small text-foreground-2">
                    <IntervalText months={o.intervalMonths} km={o.intervalKm} />
                  </TD>
                  <TD>
                    <DueCell dueOn={o.nextDueOn} dueKm={o.nextDueKm} />
                  </TD>
                  <TD className="tabular whitespace-nowrap">
                    {o.lastDoneOn ? (
                      formatDate(o.lastDoneOn, locale)
                    ) : (
                      <span className="text-faint-foreground">{t("none")}</span>
                    )}
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
                          onVehicle: o.scope === "vehicle",
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
    </Page>
  );
}
