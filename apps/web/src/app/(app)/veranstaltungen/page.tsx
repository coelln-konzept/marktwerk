import { addDays, can, holidaysBetween, isoDate, isoWeek, weekendsTouched } from "@marktwerk/core";
import { CalendarDays, Copy, Eye, List, Plus, SearchX, TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { EventChip } from "@/components/events/event-chip";
import { EventStatusBadge } from "@/components/events/event-status";
import { EventVorschau } from "@/components/events/event-vorschau";
import { GenerateSheet } from "@/components/events/generate-sheet";
import { HEALTH_DIMS, HealthSummary } from "@/components/events/health-summary";
import { MonthGrid } from "@/components/events/month-grid";
import { Page, PageHeader } from "@/components/shell/page";
import { AutoSubmitSelect } from "@/components/ui/auto-submit";
import { EventTypeTag } from "@/components/ui/event-type-tag";
import { FilterBar, FilterChip, FilterChips, FilterGroup } from "@/components/ui/filter-bar";
import { KeyboardRows } from "@/components/ui/keyboard-rows";
import { Panel } from "@/components/ui/panel";
import { EmptyState } from "@/components/ui/states";
import { RowActions, Table, TD, TH, THead, TR } from "@/components/ui/table";
import { formatDateRange, formatMonth, todayIn } from "@/lib/format";
import { isModuleVisible } from "@/lib/modules";
import { EVENT_STATUSES } from "@/lib/status";
import { hrefWith, param } from "@/lib/url";
import { cn } from "@/lib/utils";
import { getActor } from "@/server/actor";
import {
  countByType,
  type EventStatusKey,
  listEvents,
  listEventTypes,
  listSeasons,
} from "@/server/queries/events";
import { listPresetsForGeneration } from "@/server/queries/presets";
import { requirePermission } from "@/server/session";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("nav"))("events") };
}

const PATH = "/veranstaltungen";

export default async function EventsPage({ searchParams }: PageProps<"/veranstaltungen">) {
  await requirePermission("event", "read");
  const actor = await getActor();
  const sp = await searchParams;
  const t = await getTranslations("events");
  const tNav = await getTranslations("nav");
  const tHealth = await getTranslations("health");
  const tStatus = await getTranslations("status.event");
  const locale = await getLocale();
  const today = todayIn();

  const seasons = await listSeasons(actor);
  const currentYear = Number(today.slice(0, 4));
  const seasonParam = Number(param(sp.saison));
  const season = seasons.includes(seasonParam)
    ? seasonParam
    : seasons.includes(currentYear)
      ? currentYear
      : (seasons[0] ?? currentYear);
  const statusParam = param(sp.status);
  const status: EventStatusKey | "active" | undefined =
    statusParam === "alle"
      ? undefined
      : statusParam && (EVENT_STATUSES as string[]).includes(statusParam)
        ? (statusParam as EventStatusKey)
        : "active";
  const typeKey = param(sp.art);
  const q = param(sp.q)?.slice(0, 100);
  const view = param(sp.ansicht) === "kalender" ? "kalender" : "liste";
  // "Ohne Genehmigung" (from the Übersicht KPI): upcoming planned events whose permits are not all
  // granted. It looks across seasons, like the KPI does.
  const openPermits = param(sp.genehmigung) === "offen";
  const filters = {
    season: openPermits ? undefined : season,
    typeKey,
    status: openPermits ? ("planned" as const) : status,
    q,
  };

  const [allRows, counts, types] = await Promise.all([
    listEvents(actor, filters),
    countByType(actor, filters),
    listEventTypes(),
  ]);
  const rows = openPermits
    ? allRows.filter(
        (r) =>
          r.endsOn >= today && (r.health.permits === "warn" || r.health.permits === "critical"),
      )
    : allRows;
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const planned = rows.filter((r) => r.status === "planned").length;
  const vorschauId = param(sp.vorschau);
  const canWrite = can(actor.role, "event", "write");
  const generating = canWrite && param(sp.erzeugen) === "1";
  const typeName = (r: { typeNameDe: string; typeNameEn: string }) =>
    locale === "en" ? r.typeNameEn : r.typeNameDe;

  // Calendar view: one month, default = today's month within the season, else the season's first month.
  const monthParam = param(sp.monat);
  const month =
    monthParam && /^\d{4}-(0[1-9]|1[0-2])$/.test(monthParam)
      ? monthParam
      : today.startsWith(String(season))
        ? today.slice(0, 7)
        : (rows[0]?.startsOn.slice(0, 7) ?? `${season}-01`);

  return (
    <Page crumbs={[{ label: tNav("events") }]} wide={view === "kalender"}>
      <PageHeader
        title={tNav("events")}
        subtitle={t("subtitle", { season, count: total, planned })}
        actions={
          canWrite && (
            <>
              <Link
                href={"/veranstaltungen/neu" as never}
                className="inline-flex min-h-8 items-center gap-2 rounded-lg border border-input bg-card px-3 font-medium hover:bg-hover"
              >
                <Plus aria-hidden className="size-4" />
                {t("single")}
              </Link>
              <Link
                href={hrefWith(PATH, sp, { erzeugen: 1, vorschau: undefined }) as never}
                scroll={false}
                className="inline-flex min-h-8 items-center gap-2 rounded-lg border border-primary bg-primary px-3 font-medium text-primary-foreground hover:bg-primary-hover"
              >
                <Copy aria-hidden className="size-4" />
                {t("generate")}
              </Link>
            </>
          )
        }
      />

      <form method="get" action={PATH} className="flex flex-wrap items-center gap-2">
        {view === "kalender" && <input type="hidden" name="ansicht" value="kalender" />}
        {typeKey && <input type="hidden" name="art" value={typeKey} />}
        <label className="sr-only" htmlFor="q">
          {t("search")}
        </label>
        <input
          id="q"
          name="q"
          type="search"
          defaultValue={q}
          placeholder={t("search")}
          className="min-h-(--control-h) w-64 rounded-lg border border-input bg-card px-3"
        />
        <label className="sr-only" htmlFor="saison">
          {t("season")}
        </label>
        <AutoSubmitSelect id="saison" name="saison" defaultValue={String(season)}>
          {seasons.map((s) => (
            <option key={s} value={s}>
              {t("seasonOption", { season: s })}
            </option>
          ))}
        </AutoSubmitSelect>
        <label className="sr-only" htmlFor="status">
          {t("status")}
        </label>
        <AutoSubmitSelect id="status" name="status" defaultValue={statusParam ?? "aktiv"}>
          <option value="aktiv">{t("statusActive")}</option>
          <option value="alle">{t("statusAll")}</option>
          {EVENT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {t("statusOnly", { status: tStatus(s) })}
            </option>
          ))}
        </AutoSubmitSelect>
        {/* biome-ignore lint/a11y/useSemanticElements: a labelled group of links, not form controls */}
        <div
          role="group"
          aria-label={t("view")}
          className="ml-auto inline-flex gap-0.5 rounded-lg border border-input bg-sunken p-0.5"
        >
          {(["liste", "kalender"] as const).map((v) => (
            <Link
              key={v}
              href={hrefWith(PATH, sp, { ansicht: v === "liste" ? undefined : v }) as never}
              aria-current={view === v ? "true" : undefined}
              className="inline-flex min-h-7 items-center gap-1 rounded-md px-3 font-medium text-foreground-2 aria-[current=true]:bg-card aria-[current=true]:text-foreground aria-[current=true]:shadow-card"
            >
              {v === "liste" ? (
                <List aria-hidden className="size-4" />
              ) : (
                <CalendarDays aria-hidden className="size-4" />
              )}
              {t(`views.${v}`)}
            </Link>
          ))}
        </div>
      </form>

      <FilterBar>
        <FilterGroup label={t("types")} wide>
          <FilterChips>
            <FilterChip
              href={hrefWith(PATH, sp, { art: undefined, vorschau: undefined })}
              active={!typeKey}
              count={total}
            >
              {t("all")}
            </FilterChip>
            {types.map((type) => (
              <FilterChip
                key={type.key}
                href={hrefWith(PATH, sp, { art: type.key, vorschau: undefined })}
                active={typeKey === type.key}
                count={counts[type.key] ?? 0}
              >
                <EventTypeTag typeKey={type.key} className="h-auto bg-transparent p-0 text-inherit">
                  {locale === "en" ? type.nameEn : type.nameDe}
                </EventTypeTag>
              </FilterChip>
            ))}
          </FilterChips>
        </FilterGroup>
        {openPermits && (
          <FilterGroup label={t("permitFilter.label")}>
            <FilterChips>
              <FilterChip
                href={hrefWith(PATH, sp, { genehmigung: undefined, status: undefined })}
                active
              >
                {t("permitFilter.open")}
              </FilterChip>
            </FilterChips>
          </FilterGroup>
        )}
      </FilterBar>

      {view === "liste" ? (
        <Panel className="overflow-hidden">
          {rows.length === 0 ? (
            <EmptyState icon={SearchX} title={t("emptyFiltered")}>
              <Link
                href={PATH}
                className="inline-flex min-h-8 items-center rounded-lg border border-input bg-card px-3 font-medium hover:bg-hover"
              >
                {t("resetFilters")}
              </Link>
            </EmptyState>
          ) : (
            <KeyboardRows>
              <Table>
                <caption className="sr-only">{t("caption", { season })}</caption>
                <THead>
                  <tr>
                    <TH className="w-14">{t("cols.week")}</TH>
                    <TH>{t("cols.date")}</TH>
                    <TH>{t("cols.event")}</TH>
                    <TH>{t("cols.type")}</TH>
                    <TH>{t("cols.venue")}</TH>
                    <TH>{t("cols.status")}</TH>
                    <TH>{t("cols.health")}</TH>
                    {isModuleVisible("estimates") && (
                      <TH className="text-right">{t("cols.effort")}</TH>
                    )}
                    <TH>
                      <span className="sr-only">{t("cols.actions")}</span>
                    </TH>
                  </tr>
                </THead>
                <tbody>
                  {rows.map((r) => {
                    const href = `${PATH}/${r.id}`;
                    const peek = hrefWith(PATH, sp, { vorschau: r.id, erzeugen: undefined });
                    return (
                      <TR
                        key={r.id}
                        tabIndex={0}
                        data-row
                        data-href={href}
                        data-peek={peek}
                        aria-selected={vorschauId === r.id}
                        className={cn(
                          "outline-none focus-visible:bg-selected",
                          r.status === "cancelled" && "text-muted-foreground",
                        )}
                      >
                        <TD className="tabular text-muted-foreground">
                          {isoWeek(r.startsOn).week}
                        </TD>
                        <TD className="tabular whitespace-nowrap font-semibold">
                          {formatDateRange(r.startsOn, r.endsOn, locale)}
                        </TD>
                        <TD>
                          <Link
                            href={href as never}
                            tabIndex={-1}
                            className="whitespace-nowrap font-semibold text-accent-soft-foreground hover:underline"
                          >
                            {r.name}
                          </Link>
                        </TD>
                        <TD>
                          <EventTypeTag typeKey={r.typeKey}>{typeName(r)}</EventTypeTag>
                        </TD>
                        <TD className="max-w-64 truncate" title={r.venueName}>
                          {r.venueName}
                        </TD>
                        <TD>
                          <EventStatusBadge status={r.status} />
                        </TD>
                        <TD>
                          <HealthSummary health={r.health} />
                        </TD>
                        {isModuleVisible("estimates") && (
                          <TD className="tabular text-right text-muted-foreground">–</TD>
                        )}
                        <TD className="w-20">
                          <RowActions>
                            <Link
                              href={peek as never}
                              scroll={false}
                              tabIndex={-1}
                              aria-label={t("preview", { name: r.name })}
                              className="grid size-7 place-items-center rounded-md hover:bg-hover"
                            >
                              <Eye className="size-4" />
                            </Link>
                          </RowActions>
                        </TD>
                      </TR>
                    );
                  })}
                </tbody>
              </Table>
            </KeyboardRows>
          )}
        </Panel>
      ) : (
        <Panel className="overflow-hidden">
          <CalendarView sp={sp} month={month} rows={rows} today={today} locale={locale} />
        </Panel>
      )}

      <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-muted-foreground text-tiny">
        <span>
          {t("legend", { dims: HEALTH_DIMS.map((d) => tHealth(`dims.${d}`)).join(" · ") })}
        </span>
        <span>{t("keys")}</span>
      </p>

      {vorschauId && (
        <EventVorschau id={vorschauId} closeHref={hrefWith(PATH, sp, { vorschau: undefined })} />
      )}
      {generating && (
        <GenerateSheet
          presets={await listPresetsForGeneration()}
          initialPresetId={param(sp.vorlage)}
          closeHref={hrefWith(PATH, sp, { erzeugen: undefined, vorlage: undefined })}
        />
      )}
    </Page>
  );
}

async function CalendarView({
  sp,
  month,
  rows,
  today,
  locale,
}: {
  sp: Record<string, string | string[] | undefined>;
  month: string;
  rows: Awaited<ReturnType<typeof listEvents>>;
  today: string;
  locale: string;
}) {
  const t = await getTranslations("events");
  const tCal = await getTranslations("calendar");
  const [y, m] = month.split("-").map(Number) as [number, number];
  const prev = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  const first = isoDate(y, m, 1);
  const holidays = new Map(
    [...holidaysBetween(addDays(first, -7), addDays(first, 42))].map(([d, h]) => [
      d,
      locale === "en" ? h.nameEn : h.nameDe,
    ]),
  );
  const perWeekend = new Map<string, number>();
  for (const r of rows) {
    if (r.status === "cancelled") continue;
    for (const s of weekendsTouched(r.startsOn, r.endsOn))
      perWeekend.set(s, (perWeekend.get(s) ?? 0) + 1);
  }
  const flagged = new Set([...perWeekend].filter(([, n]) => n >= 4).map(([s]) => s));
  const entries = rows.flatMap((r) => {
    const days: string[] = [];
    for (let d = r.startsOn; d <= r.endsOn; d = addDays(d, 1)) days.push(d);
    return days.map((date) => ({
      key: `${r.id}-${date}`,
      date,
      node: (
        <EventChip
          href={hrefWith(PATH, sp, { vorschau: r.id })}
          typeKey={r.typeKey}
          name={r.name}
          cancelled={r.status === "cancelled"}
        />
      ),
    }));
  });
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 border-border-subtle border-b px-4 py-3">
        <Link
          href={hrefWith(PATH, sp, { monat: prev }) as never}
          className="inline-flex min-h-8 items-center rounded-lg border border-input px-3 hover:bg-hover"
          aria-label={tCal("prev")}
        >
          ‹
        </Link>
        <Link
          href={hrefWith(PATH, sp, { monat: today.slice(0, 7) }) as never}
          className="inline-flex min-h-8 items-center rounded-lg border border-input px-3 hover:bg-hover"
        >
          {tCal("today")}
        </Link>
        <Link
          href={hrefWith(PATH, sp, { monat: next }) as never}
          className="inline-flex min-h-8 items-center rounded-lg border border-input px-3 hover:bg-hover"
          aria-label={tCal("next")}
        >
          ›
        </Link>
        <h2 className="font-semibold text-[15px]">{formatMonth(first, locale)}</h2>
        {flagged.size > 0 && (
          <span className="ml-auto inline-flex items-center gap-1 text-status-warn text-tiny">
            <TriangleAlert aria-hidden className="size-3.5" /> {t("weekendFlag")}
          </span>
        )}
      </div>
      <MonthGrid
        month={month}
        weekdays={tCal("weekdays").split(",")}
        weekLabel={tCal("week")}
        today={today}
        holidays={holidays}
        entries={entries}
        flaggedSaturdays={flagged}
        flagLabel={t("weekendFlag")}
        moreLabel={(n) => tCal("more", { n })}
      />
    </div>
  );
}
