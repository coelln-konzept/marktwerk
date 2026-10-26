import { can } from "@marktwerk/core";
import { CalendarClock, FileWarning, Plus, SearchX, Wallet } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { ExpensesView } from "@/components/finance/expenses-view";
import { MissingReceiptsView } from "@/components/finance/missing-receipts-view";
import { PayDialog } from "@/components/finance/pay-dialog";
import { PayableCard } from "@/components/finance/payable-card";
import { CriticalBadge, FinanceStatusBadge } from "@/components/finance/status";
import { Page, PageHeader } from "@/components/shell/page";
import { AutoSubmitSelect } from "@/components/ui/auto-submit";
import { buttonVariants } from "@/components/ui/button";
import { FilterChip } from "@/components/ui/chip";
import { Panel, PanelBody, PanelHeader, PanelTitle } from "@/components/ui/panel";
import { EmptyState } from "@/components/ui/states";
import { OVERDUE_ICON } from "@/lib/due-ui";
import { formatDateShort, formatMoney, todayIn } from "@/lib/format";
import { hrefWith, param } from "@/lib/url";
import { getActor } from "@/server/actor";
import {
  financeKpis,
  isStatusView,
  listFinanceOptions,
  listPayableSeasons,
  listPayables,
  payableHref,
  STATUS_VIEWS,
} from "@/server/queries/finance";
import { requirePermission } from "@/server/session";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("nav"))("finance") };
}

const PATH = "/finanzen";
const VIEWS = ["posten", "ausgaben", "belege"] as const;
type View = (typeof VIEWS)[number];

const SCOPES = ["event", "company", "vehicle", "venue_season"] as const;
const CATEGORIES = [
  "location",
  "permit",
  "water_power",
  "equipment_rental",
  "staff_external",
  "security",
  "cleaning_waste",
  "toilets",
  "marketing",
  "gema",
  "transport_fuel",
  "vehicle",
  "insurance",
  "tax_fees",
  "other",
] as const;

export default async function FinancePage({ searchParams }: PageProps<"/finanzen">) {
  await requirePermission("finance", "read");
  const actor = await getActor();
  const canWrite = can(actor.role, "finance", "write");
  const sp = await searchParams;
  const t = await getTranslations("finance");
  const locale = await getLocale();
  const today = todayIn();

  const viewParam = param(sp.ansicht);
  const view: View = (VIEWS as readonly string[]).includes(viewParam ?? "")
    ? (viewParam as View)
    : "posten";
  const statusParam = param(sp.status);
  const status = isStatusView(statusParam) ? statusParam : "open";
  const filters = {
    view: status,
    scope: param(sp.art),
    category: param(sp.kategorie),
    eventId: param(sp.veranstaltung),
    venueId: param(sp.ort),
    season:
      param(sp.saison) && /^\d{4}$/.test(param(sp.saison) as string)
        ? Number(param(sp.saison))
        : undefined,
    critical: param(sp.kritisch) === "1",
    q: param(sp.q)?.slice(0, 100),
  };

  const [kpis, options] = await Promise.all([financeKpis(actor, today), listFinanceOptions()]);

  const tabs = (
    <nav
      aria-label={t("viewsLabel")}
      className="-mx-4 overflow-x-auto border-b px-4 lg:-mx-7 lg:px-7"
    >
      <ul className="flex min-w-max gap-1">
        {VIEWS.map((v) => (
          <li key={v}>
            <Link
              href={(v === "posten" ? PATH : `${PATH}?ansicht=${v}`) as never}
              aria-current={v === view ? "page" : undefined}
              className={`-mb-px flex min-h-10 items-center gap-2 whitespace-nowrap border-b-2 px-3 text-body outline-none hover:text-foreground focus-visible:rounded-md focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-2 ${
                v === view
                  ? "border-primary font-semibold text-foreground"
                  : "border-transparent text-foreground-2"
              }`}
            >
              {t(`views.${v}`)}
              {v === "belege" && kpis.missingReceipts > 0 && (
                <span className="tabular inline-grid h-5 min-w-5 place-items-center rounded-full bg-status-warn-bg px-1 font-semibold text-[11.5px] text-status-warn">
                  {kpis.missingReceipts}
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );

  return (
    <Page crumbs={[{ label: t("title") }]}>
      <PageHeader
        title={t("title")}
        subtitle={t("subtitle")}
        actions={
          canWrite &&
          view === "posten" && (
            <Link
              href={"/finanzen/neu" as never}
              className={buttonVariants({ variant: "default" })}
            >
              <Plus aria-hidden />
              {t("new")}
            </Link>
          )
        }
      />

      <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-3">
        <li>
          <Link
            href={hrefWith(PATH, {}, { status: "overdue" }) as never}
            className="flex h-full flex-col gap-1 rounded-xl border bg-card p-4 hover:bg-hover"
          >
            <span className="flex items-center gap-2 text-muted-foreground text-small">
              <OVERDUE_ICON
                aria-hidden
                className={`size-4 ${kpis.overdueCount > 0 ? "text-status-critical" : ""}`}
              />
              {t("kpis.overdue")}
            </span>
            <span className="tabular font-semibold text-xl">
              {formatMoney(kpis.overdueCents, locale)}
            </span>
            <span className="text-muted-foreground text-small">
              {t("kpis.rates", { count: kpis.overdueCount })}
            </span>
          </Link>
        </li>
        <li>
          <a
            href="#woche"
            className="flex h-full flex-col gap-1 rounded-xl border bg-card p-4 hover:bg-hover"
          >
            <span className="flex items-center gap-2 text-muted-foreground text-small">
              <CalendarClock aria-hidden className="size-4" />
              {t("kpis.week")}
            </span>
            <span className="tabular font-semibold text-xl">
              {formatMoney(kpis.weekCents, locale)}
            </span>
            <span className="text-muted-foreground text-small">
              {t("kpis.rates", { count: kpis.weekCount })}
            </span>
          </a>
        </li>
        <li>
          <Link
            href={`${PATH}?ansicht=belege` as never}
            className="flex h-full flex-col gap-1 rounded-xl border bg-card p-4 hover:bg-hover"
          >
            <span className="flex items-center gap-2 text-muted-foreground text-small">
              <FileWarning
                aria-hidden
                className={`size-4 ${kpis.missingReceipts > 0 ? "text-status-warn" : ""}`}
              />
              {t("kpis.missing")}
            </span>
            <span className="tabular font-semibold text-xl">{kpis.missingReceipts}</span>
            <span className="text-muted-foreground text-small">{t("kpis.missingHint")}</span>
          </Link>
        </li>
      </ul>

      {tabs}

      {view === "ausgaben" && (
        <ExpensesView actor={actor} sp={sp} options={options} today={today} canWrite={canWrite} />
      )}
      {view === "belege" && (
        <MissingReceiptsView actor={actor} sp={sp} today={today} canWrite={canWrite} />
      )}

      {view === "posten" && (
        <PayablesView
          actor={actor}
          sp={sp}
          filters={filters}
          today={today}
          canWrite={canWrite}
          options={options}
        />
      )}
    </Page>
  );
}

async function PayablesView({
  actor,
  sp,
  filters,
  today,
  canWrite,
  options,
}: {
  actor: Awaited<ReturnType<typeof getActor>>;
  sp: Record<string, string | string[] | undefined>;
  filters: Parameters<typeof listPayables>[2];
  today: string;
  canWrite: boolean;
  options: Awaited<ReturnType<typeof listFinanceOptions>>;
}) {
  const t = await getTranslations("finance");
  const tScopes = await getTranslations("finance.scopes");
  const tCategories = await getTranslations("finance.categories");
  const locale = await getLocale();
  const [list, seasons] = await Promise.all([
    listPayables(actor, today, filters),
    listPayableSeasons(),
  ]);
  const staff = options.staff;
  const status = filters?.view ?? "open";
  const filtered = Boolean(
    filters?.scope ||
      filters?.category ||
      filters?.eventId ||
      filters?.venueId ||
      filters?.season ||
      filters?.critical ||
      filters?.q,
  );
  const selectedEvents = options.events;

  return (
    <>
      {list.focus.length > 0 ? (
        <Panel id="woche" aria-labelledby="week-title">
          <PanelHeader>
            <PanelTitle>
              <span id="week-title">{t("week.title")}</span>
            </PanelTitle>
            <span className="text-muted-foreground text-small">
              {t("week.hint", { count: list.focus.length })}
            </span>
          </PanelHeader>
          <ul className="m-0 list-none p-0">
            {list.focus.slice(0, 8).map(({ payable: p, rate }) => (
              <li
                key={rate.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-2 border-border-subtle border-b px-4 py-2.5 last:border-b-0"
              >
                <span className="flex min-w-0 flex-1 basis-56 flex-col">
                  <Link
                    href={payableHref(p.id) as never}
                    className="truncate font-semibold hover:underline"
                  >
                    {p.title}
                  </Link>
                  <span className="truncate text-muted-foreground text-small">
                    {t("week.rate", { position: `${rate.sort}/${rate.of}` })}
                    {p.counterpartyName ? ` · ${p.counterpartyName}` : ""}
                  </span>
                </span>
                <span className="flex flex-wrap items-center gap-1.5">
                  {p.critical && <CriticalBadge />}
                  <FinanceStatusBadge status={rate.state} />
                </span>
                <span className="tabular text-right text-small sm:w-36">
                  <span className="block font-medium">{formatMoney(rate.openCents, locale)}</span>
                  <span className="block text-muted-foreground text-tiny">
                    {formatDateShort(rate.dueOn, locale)}
                  </span>
                </span>
                {canWrite && (
                  <PayDialog
                    rate={{
                      id: rate.id,
                      position: t("rate.position", { position: `${rate.sort}/${rate.of}` }),
                      payableTitle: p.title,
                      openCents: rate.openCents,
                    }}
                    today={today}
                    staff={staff}
                    defaultStaffId={actor.staffMemberId}
                  />
                )}
              </li>
            ))}
          </ul>
        </Panel>
      ) : (
        <Panel id="woche">
          <PanelBody className="flex items-center gap-3 text-muted-foreground">
            <CalendarClock aria-hidden className="size-4" />
            {t("week.empty")}
          </PanelBody>
        </Panel>
      )}

      {/* biome-ignore lint/a11y/useSemanticElements: a labelled group of links, not form controls */}
      <div className="flex flex-wrap gap-2" role="group" aria-label={t("statusLabel")}>
        {STATUS_VIEWS.map((s) => (
          <FilterChip
            key={s}
            href={hrefWith(PATH, sp, { status: s === "open" ? undefined : s })}
            active={status === s}
            count={list.counts[s]}
          >
            {t(`statusChips.${s}`)}
          </FilterChip>
        ))}
        <FilterChip
          href={hrefWith(PATH, sp, { kritisch: filters?.critical ? undefined : "1" })}
          active={Boolean(filters?.critical)}
        >
          {t("criticalOnly")}
        </FilterChip>
      </div>

      <form method="get" action={PATH} className="flex flex-wrap items-center gap-2">
        {status !== "open" && <input type="hidden" name="status" value={status} />}
        {filters?.critical && <input type="hidden" name="kritisch" value="1" />}
        <label className="sr-only" htmlFor="q">
          {t("filters.search")}
        </label>
        <input
          id="q"
          name="q"
          type="search"
          defaultValue={filters?.q}
          placeholder={t("filters.search")}
          className="min-h-(--control-h) w-64 max-w-full rounded-lg border border-input bg-card px-3"
        />
        <label className="sr-only" htmlFor="f-art">
          {t("filters.scope")}
        </label>
        <AutoSubmitSelect id="f-art" name="art" defaultValue={filters?.scope ?? ""}>
          <option value="">{t("filters.anyScope")}</option>
          {SCOPES.map((s) => (
            <option key={s} value={s}>
              {tScopes(s)}
            </option>
          ))}
        </AutoSubmitSelect>
        <label className="sr-only" htmlFor="f-kategorie">
          {t("filters.category")}
        </label>
        <AutoSubmitSelect id="f-kategorie" name="kategorie" defaultValue={filters?.category ?? ""}>
          <option value="">{t("filters.anyCategory")}</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {tCategories(c)}
            </option>
          ))}
        </AutoSubmitSelect>
        <label className="sr-only" htmlFor="f-veranstaltung">
          {t("filters.event")}
        </label>
        <AutoSubmitSelect
          id="f-veranstaltung"
          name="veranstaltung"
          defaultValue={filters?.eventId ?? ""}
        >
          <option value="">{t("filters.anyEvent")}</option>
          {selectedEvents.map((ev) => (
            <option key={ev.id} value={ev.id}>
              {formatDateShort(ev.startsOn, locale)} · {ev.name}
            </option>
          ))}
        </AutoSubmitSelect>
        <label className="sr-only" htmlFor="f-ort">
          {t("filters.venue")}
        </label>
        <AutoSubmitSelect id="f-ort" name="ort" defaultValue={filters?.venueId ?? ""}>
          <option value="">{t("filters.anyVenue")}</option>
          {options.venues.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name} · {v.city}
            </option>
          ))}
        </AutoSubmitSelect>
        <label className="sr-only" htmlFor="f-saison">
          {t("filters.season")}
        </label>
        <AutoSubmitSelect id="f-saison" name="saison" defaultValue={String(filters?.season ?? "")}>
          <option value="">{t("filters.anySeason")}</option>
          {seasons.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </AutoSubmitSelect>
        <noscript>
          <button type="submit" className={buttonVariants({})}>
            {t("filters.apply")}
          </button>
        </noscript>
      </form>

      <Panel className="overflow-hidden">
        {list.total === 0 && !filtered ? (
          <EmptyState icon={Wallet} title={t("empty")} hint={t("emptyHint")}>
            {canWrite && (
              <Link
                href={"/finanzen/neu" as never}
                className={buttonVariants({ variant: "default" })}
              >
                <Plus aria-hidden />
                {t("new")}
              </Link>
            )}
          </EmptyState>
        ) : list.rows.length === 0 ? (
          <EmptyState icon={SearchX} title={t("emptyFiltered")}>
            <Link
              href={PATH}
              className="inline-flex min-h-8 items-center rounded-lg border border-input bg-card px-3 font-medium hover:bg-hover"
            >
              {t("resetFilters")}
            </Link>
          </EmptyState>
        ) : (
          <div>
            {list.rows.map((p) => (
              <PayableCard
                key={p.id}
                payable={p}
                today={today}
                staff={staff}
                defaultStaffId={actor.staffMemberId}
                canWrite={canWrite}
              />
            ))}
          </div>
        )}
      </Panel>
    </>
  );
}
