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
import { AutoSubmitSelect } from "@/components/ui/auto-submit";
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
    <Page crumbs={[{ label: t("title") }]}>
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

      {/* One filter row: status chips (links) and the scope as a select, all in the URL. */}
      <div className="flex flex-wrap items-center gap-2">
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
        <form method="get" action={PATH} className="ml-auto">
          {status && <input type="hidden" name="status" value={status} />}
          <label className="sr-only" htmlFor="filter-bereich">
            {to("filterScope")}
          </label>
          <AutoSubmitSelect id="filter-bereich" name="bereich" defaultValue={scope ?? ""}>
            <option value="">{to("allScopes")}</option>
            {SCOPES.map((s) => (
              <option key={s} value={s}>
                {t(`scopes.${s}`)}
              </option>
            ))}
          </AutoSubmitSelect>
        </form>
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
          <>
            {/* Phones (< 640 px): stacked rows, so Fällig and "Erledigt" are reachable without sideways scrolling. */}
            <ul className="m-0 flex list-none flex-col p-0 sm:hidden">
              {rows.map((o) => (
                <li
                  key={o.id}
                  className="flex flex-col gap-2 border-border-subtle border-b px-4 py-3 last:border-b-0"
                >
                  <div>
                    <ObligationStatusBadge
                      status={o.status}
                      dueOn={o.nextDueOn}
                      today={today}
                      kmLeft={o.kmLeft}
                      trigger={o.trigger}
                    />
                  </div>
                  <Link
                    href={`/firma/pflichten/${o.id}` as never}
                    className="inline-flex items-start gap-2 font-semibold text-accent-soft-foreground"
                  >
                    <KindIcon
                      kind={o.kind}
                      className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                    />
                    <span>{o.title}</span>
                  </Link>
                  <div className="flex flex-wrap gap-x-2 text-muted-foreground text-small">
                    <TargetCell
                      scope={o.scope}
                      vehicleId={o.vehicleId}
                      vehicleName={o.vehicleName}
                      vehiclePlate={o.vehiclePlate}
                      venueId={o.venueId}
                      venueName={o.venueName}
                    />
                    <span aria-hidden>·</span>
                    <IntervalText months={o.intervalMonths} km={o.intervalKm} />
                  </div>
                  <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-small">
                    <dt className="text-muted-foreground">{to("cols.due")}</dt>
                    <dd className="m-0">
                      <DueCell dueOn={o.nextDueOn} dueKm={o.nextDueKm} />
                    </dd>
                    <dt className="text-muted-foreground">{to("cols.responsible")}</dt>
                    <dd className="m-0">{o.responsibleName}</dd>
                  </dl>
                  {canWrite && (
                    <CompleteButton
                      className="min-h-11 w-full"
                      today={today}
                      target={{
                        id: o.id,
                        title: o.title,
                        kind: o.kind,
                        intervalKm: o.intervalKm,
                        onVehicle: o.scope === "vehicle",
                        createsPayable: o.createsPayable,
                        currentKm: o.currentKm,
                      }}
                    />
                  )}
                </li>
              ))}
            </ul>
            <div className="hidden sm:block">
              <Table>
                <caption className="sr-only">{to("caption")}</caption>
                <THead>
                  <tr>
                    <TH>{to("cols.status")}</TH>
                    <TH>{to("cols.title")}</TH>
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
                      <TD className="w-px whitespace-nowrap">
                        <ObligationStatusBadge
                          status={o.status}
                          dueOn={o.nextDueOn}
                          today={today}
                          kmLeft={o.kmLeft}
                          trigger={o.trigger}
                        />
                      </TD>
                      {/* The title wraps; where it applies (Bezug) and how often (Intervall) sit under it, so no column can print over another. */}
                      <TD className="min-w-64 max-w-[28rem]">
                        <Link
                          href={`/firma/pflichten/${o.id}` as never}
                          className="inline-flex items-start gap-2 font-semibold text-accent-soft-foreground hover:underline"
                        >
                          <KindIcon
                            kind={o.kind}
                            className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                          />
                          <span>{o.title}</span>
                        </Link>
                        <div className="mt-0.5 flex flex-wrap gap-x-2 text-muted-foreground text-small">
                          <TargetCell
                            scope={o.scope}
                            vehicleId={o.vehicleId}
                            vehicleName={o.vehicleName}
                            vehiclePlate={o.vehiclePlate}
                            venueId={o.venueId}
                            venueName={o.venueName}
                          />
                          <span aria-hidden>·</span>
                          <IntervalText months={o.intervalMonths} km={o.intervalKm} />
                        </div>
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
                      <TD>{o.responsibleName}</TD>
                      {canWrite && (
                        <TD className="w-px whitespace-nowrap text-right">
                          <CompleteButton
                            size="sm"
                            today={today}
                            target={{
                              id: o.id,
                              title: o.title,
                              kind: o.kind,
                              intervalKm: o.intervalKm,
                              onVehicle: o.scope === "vehicle",
                              createsPayable: o.createsPayable,
                              currentKm: o.currentKm,
                            }}
                          />
                        </TD>
                      )}
                    </TR>
                  ))}
                </tbody>
              </Table>
            </div>
          </>
        )}
      </Panel>
    </Page>
  );
}
