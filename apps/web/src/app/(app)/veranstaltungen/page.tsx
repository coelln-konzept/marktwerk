import { can, canMoveEvent, daysBetween, isoWeek } from "@marktwerk/core";
import { CalendarPlus, Eye, MapPin, SearchX } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { Fragment } from "react";
import { EventActions } from "@/components/event-detail/event-actions";
import { EventStatusBadge } from "@/components/events/event-status";
import { EventVorschau } from "@/components/events/event-vorschau";
import { FilterToggle } from "@/components/events/filter-toggle";
import { GenerateSheet } from "@/components/events/generate-sheet";
import { SearchHotkey } from "@/components/events/search-hotkey";
import { Page, PageHeader } from "@/components/shell/page";
import { AutoSubmitSelect } from "@/components/ui/auto-submit";
import { EventTypeTag } from "@/components/ui/event-type-tag";
import { FilterBar, FilterChip, FilterChips, FilterGroup } from "@/components/ui/filter-bar";
import { KeyboardRows } from "@/components/ui/keyboard-rows";
import { MarketMarker, marketRowClass } from "@/components/ui/market-marker";
import { Panel } from "@/components/ui/panel";
import { LinkRow } from "@/components/ui/row-link";
import { EmptyState } from "@/components/ui/states";
import { RowActions, Table, TD, TGroup, TH, THead } from "@/components/ui/table";
import { formatDateRangeYear, formatMonth, todayIn } from "@/lib/format";
import { isModuleHidden, isModuleVisible } from "@/lib/modules";
import { EVENT_STATUSES } from "@/lib/status";
import { hrefWith, param } from "@/lib/url";
import { cn } from "@/lib/utils";
import { getActor } from "@/server/actor";
import { listEventTypeOptions } from "@/server/queries/event-form";
import {
  type EventStatusKey,
  listEvents,
  listEventTypes,
  listSeasons,
} from "@/server/queries/events";
import { getMarketColorChoices } from "@/server/queries/market-colors";
import { listPresetsForGeneration } from "@/server/queries/presets";
import { listVenueOptions } from "@/server/queries/venues";
import { requirePermission } from "@/server/session";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("nav"))("events") };
}

const PATH = "/veranstaltungen";

/** Sortable columns (`?sortierung=`; Datum is the default and the only one with month headers). */
const SORT_KEYS = ["datum", "name", "art", "ort", "status"] as const;
type SortKey = (typeof SORT_KEYS)[number];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function EventsPage({ searchParams }: PageProps<"/veranstaltungen">) {
  await requirePermission("event", "read");
  const actor = await getActor();
  const sp = await searchParams;
  const t = await getTranslations("events");
  const tNav = await getTranslations("nav");
  const tStatus = await getTranslations("status.event");
  const locale = await getLocale();
  const today = todayIn();
  const canWriteEvents = can(actor.role, "event", "write");

  // The Kalender page covers the month view; old `?ansicht=kalender` links go there.
  if (param(sp.ansicht) === "kalender") redirect("/kalender");

  const seasons = await listSeasons(actor);
  const currentYear = Number(today.slice(0, 4));
  const seasonParam = Number(param(sp.saison));
  const seasonPicked = seasons.includes(seasonParam) ? seasonParam : undefined;
  const financeHidden = isModuleHidden("finance");
  // Default "aktuell": markets that are running or still to come (all seasons). Past ones are one
  // select away ("Alle" or one status), so the list opens at the current week.
  const statusParam = param(sp.status);
  const statusKey: EventStatusKey | "aktuell" | "aktiv" | "alle" =
    statusParam === "alle" || statusParam === "aktiv"
      ? statusParam
      : statusParam && (EVENT_STATUSES as string[]).includes(statusParam)
        ? (statusParam as EventStatusKey)
        : "aktuell";
  const upcomingOnly = statusKey === "aktuell";
  const season = upcomingOnly
    ? seasonPicked
    : (seasonPicked ?? (seasons.includes(currentYear) ? currentYear : (seasons[0] ?? currentYear)));
  const typeKey = param(sp.art);
  // "Ort" chip in a row: only the events at that venue (handwritten notes HN-07).
  const venueParam = param(sp.ort);
  const venueId = venueParam && UUID.test(venueParam) ? venueParam : undefined;
  const sortParam = param(sp.sortierung);
  const sortKey: SortKey = (SORT_KEYS as readonly string[]).includes(sortParam ?? "")
    ? (sortParam as SortKey)
    : "datum";
  const sortDir: "asc" | "desc" = param(sp.richtung) === "ab" ? "desc" : "asc";
  const q = param(sp.q)?.slice(0, 100);
  // "Ohne Genehmigung" (from the Übersicht KPI): upcoming planned events whose permits are not all
  // granted. It looks across seasons, like the KPI does.
  const openPermits = param(sp.genehmigung) === "offen";
  // While finance is hidden "abgeschlossen" and "abgerechnet" are one state ("vorbei"): filter after the query.
  const overFilter = financeHidden && statusKey === "completed";
  // "Neu angelegt" (landing after "Markt planen" with several dates): only those events, whatever the
  // other filters say. New dates are in the future, so one query from today finds them.
  const createdIds = (param(sp.angelegt) ?? "")
    .split(",")
    .filter((id) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))
    .slice(0, 60);
  const justCreated = createdIds.length > 0;
  const filters = {
    season: openPermits || justCreated ? undefined : season,
    status: justCreated
      ? undefined
      : openPermits
        ? ("planned" as const)
        : upcomingOnly || statusKey === "aktiv"
          ? ("active" as const)
          : statusKey === "alle" || overFilter
            ? undefined
            : statusKey,
    from: justCreated || (upcomingOnly && !openPermits) ? today : undefined,
    q: justCreated ? undefined : q,
  };

  // One query without the type filter: the type chips count from it, the table narrows it by type.
  const [fetchedAll, types] = await Promise.all([listEvents(actor, filters), listEventTypes()]);
  const fetched = justCreated ? fetchedAll.filter((r) => createdIds.includes(r.id)) : fetchedAll;
  const byStatus =
    overFilter && !justCreated
      ? fetched.filter((r) => r.status === "completed" || r.status === "closed")
      : fetched;
  const byPermit =
    openPermits && !justCreated
      ? byStatus.filter(
          (r) =>
            r.endsOn >= today && (r.health.permits === "warn" || r.health.permits === "critical"),
        )
      : byStatus;
  const byVenue = venueId ? byPermit.filter((r) => r.venueId === venueId) : byPermit;
  const venueFilterName = venueId ? fetchedAll.find((r) => r.venueId === venueId)?.venueName : null;
  const counts: Record<string, number> = {};
  for (const r of byVenue) counts[r.typeKey] = (counts[r.typeKey] ?? 0) + 1;
  const typeName = (r: { typeNameDe: string; typeNameEn: string }) =>
    locale === "en" ? r.typeNameEn : r.typeNameDe;
  const byDate = (a: { startsOn: string; name: string }, b: { startsOn: string; name: string }) =>
    a.startsOn.localeCompare(b.startsOn) || a.name.localeCompare(b.name, locale);
  const compare: Record<
    SortKey,
    (a: (typeof byVenue)[number], b: (typeof byVenue)[number]) => number
  > = {
    datum: byDate,
    name: (a, b) => a.name.localeCompare(b.name, locale) || byDate(a, b),
    art: (a, b) => typeName(a).localeCompare(typeName(b), locale) || byDate(a, b),
    ort: (a, b) => a.venueName.localeCompare(b.venueName, locale) || byDate(a, b),
    status: (a, b) =>
      EVENT_STATUSES.indexOf(a.status) - EVENT_STATUSES.indexOf(b.status) || byDate(a, b),
  };
  const rows = (typeKey ? byVenue.filter((r) => r.typeKey === typeKey) : byVenue).toSorted(
    (a, b) => (sortDir === "desc" ? -1 : 1) * compare[sortKey](a, b),
  );
  const total = byVenue.length;
  const sortBy = (key: SortKey) => ({
    href: hrefWith(PATH, sp, {
      sortierung: key === "datum" ? undefined : key,
      richtung: key === sortKey && sortDir === "asc" ? "ab" : undefined,
      vorschau: undefined,
    }),
    dir: key === sortKey ? sortDir : null,
  });
  const [venueOptions, typeOptions] = canWriteEvents
    ? await Promise.all([listVenueOptions(), listEventTypeOptions()])
    : [[], []];
  const typeChoices = typeOptions.map((x) => ({
    id: x.id,
    name: locale === "en" ? x.nameEn : x.nameDe,
  }));
  const planned = rows.filter((r) => r.status === "planned").length;
  const vorschauId = param(sp.vorschau);
  const canWrite = canWriteEvents;
  const generating = canWrite && param(sp.erzeugen) === "1";
  // "Neuen Markt anlegen" needs template:write on top of event:write.
  const canCreateMarket = generating && can(actor.role, "template", "write");
  const marketOptions = canCreateMarket
    ? {
        types: await listEventTypeOptions(),
        venues: await listVenueOptions(),
        colors: await getMarketColorChoices(),
      }
    : undefined;
  // The active filters as text for the phone's "Filter" button (the search text is visible anyway).
  const activeType = typeKey ? types.find((x) => x.key === typeKey) : undefined;
  const filterSummary = [
    activeType ? (locale === "en" ? activeType.nameEn : activeType.nameDe) : null,
    season ? t("seasonOption", { season }) : null,
    statusKey === "aktuell"
      ? null
      : statusKey === "alle"
        ? t("statusAll")
        : statusKey === "aktiv"
          ? t("statusActiveShort")
          : t("statusOnly", {
              status:
                financeHidden && statusKey === "completed" ? t("statusOver") : tStatus(statusKey),
            }),
    openPermits ? t("permitFilter.open") : null,
    venueFilterName ?? null,
  ]
    .filter(Boolean)
    .join(" · ");
  // Month headers ("März 2027 · 12 Termine"): the rows are sorted by date, so a header opens each month.
  const perMonth = new Map<string, number>();
  for (const r of rows) {
    const key = r.startsOn.slice(0, 7);
    perMonth.set(key, (perMonth.get(key) ?? 0) + 1);
  }
  const columns = isModuleVisible("estimates") ? 8 : 7;
  let openMonth = "";

  return (
    <Page crumbs={[{ label: tNav("events") }]}>
      <PageHeader
        title={tNav("events")}
        subtitle={
          season
            ? t("subtitle", { season, count: total, planned })
            : t("subtitleUpcoming", { count: total, planned })
        }
        actions={
          canWrite && (
            <Link
              href={hrefWith(PATH, sp, { erzeugen: 1, vorschau: undefined }) as never}
              scroll={false}
              className="inline-flex min-h-8 items-center gap-2 rounded-lg border border-primary bg-primary px-3 font-medium text-primary-foreground hover:bg-primary-hover"
            >
              <CalendarPlus aria-hidden className="size-4" />
              {t("generate")}
            </Link>
          )
        }
      />

      {/* Phones: search stays visible, season/status and the type chips sit behind one "Filter" button. */}
      <form method="get" action={PATH} className="flex flex-wrap items-center gap-x-2 gap-y-3">
        {typeKey && <input type="hidden" name="art" value={typeKey} />}
        {venueId && <input type="hidden" name="ort" value={venueId} />}
        <label className="sr-only" htmlFor="q">
          {t("search")}
        </label>
        <input
          id="q"
          name="q"
          type="search"
          defaultValue={q}
          placeholder={t("search")}
          aria-keyshortcuts="/"
          className="min-h-(--control-h) w-64 rounded-lg border border-input bg-card px-3 max-sm:w-full"
        />
        <FilterToggle label={t("filter")} summary={filterSummary || null}>
          <label className="sr-only" htmlFor="saison">
            {t("season")}
          </label>
          <AutoSubmitSelect id="saison" name="saison" defaultValue={season ? String(season) : ""}>
            {upcomingOnly && <option value="">{t("seasonAny")}</option>}
            {seasons.map((s) => (
              <option key={s} value={s}>
                {t("seasonOption", { season: s })}
              </option>
            ))}
          </AutoSubmitSelect>
          <label className="sr-only" htmlFor="status">
            {t("status")}
          </label>
          <AutoSubmitSelect id="status" name="status" defaultValue={statusKey}>
            <option value="aktuell">{t("statusCurrent")}</option>
            <option value="aktiv">{t("statusActive")}</option>
            <option value="alle">{t("statusAll")}</option>
            {EVENT_STATUSES.filter((s) => !(financeHidden && s === "closed")).map((s) => (
              <option key={s} value={s}>
                {t("statusOnly", {
                  status: financeHidden && s === "completed" ? t("statusOver") : tStatus(s),
                })}
              </option>
            ))}
          </AutoSubmitSelect>
          <FilterBar className="basis-full">
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
                    <EventTypeTag
                      typeKey={type.key}
                      className="h-auto bg-transparent p-0 text-inherit"
                    >
                      {locale === "en" ? type.nameEn : type.nameDe}
                    </EventTypeTag>
                  </FilterChip>
                ))}
              </FilterChips>
            </FilterGroup>
            {venueId && (
              <FilterGroup label={t("cols.venue")}>
                <FilterChips>
                  <FilterChip
                    href={hrefWith(PATH, sp, { ort: undefined, vorschau: undefined })}
                    active
                  >
                    {venueFilterName ?? t("venueUnknown")}
                  </FilterChip>
                </FilterChips>
              </FilterGroup>
            )}
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
        </FilterToggle>
      </form>

      {justCreated && (
        <p
          role="status"
          className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-status-info-bg px-3 py-2 text-status-info"
        >
          <strong>{t("created.banner", { count: rows.length })}</strong>
          <Link
            href={PATH as never}
            className="font-medium underline underline-offset-2 hover:no-underline"
          >
            {t("created.showAll")}
          </Link>
        </p>
      )}

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
            {/* Below 640 px every row becomes a 2-line card: name + status, then date · KW · Ort. */}
            <Table className="max-sm:block">
              <caption className="sr-only">{t("caption")}</caption>
              <THead className="max-sm:sr-only">
                <tr>
                  <TH className="w-14">{t("cols.week")}</TH>
                  <TH sort={sortBy("datum")}>{t("cols.date")}</TH>
                  <TH sort={sortBy("name")}>{t("cols.event")}</TH>
                  <TH sort={sortBy("art")}>{t("cols.type")}</TH>
                  <TH sort={sortBy("ort")}>{t("cols.venue")}</TH>
                  <TH sort={sortBy("status")}>{t("cols.status")}</TH>
                  {isModuleVisible("estimates") && (
                    <TH className="text-right">{t("cols.effort")}</TH>
                  )}
                  <TH>
                    <span className="sr-only">{t("cols.actions")}</span>
                  </TH>
                </tr>
              </THead>
              <tbody className="max-sm:block">
                {rows.map((r) => {
                  const href = `${PATH}/${r.id}`;
                  const peek = hrefWith(PATH, sp, { vorschau: r.id, erzeugen: undefined });
                  const month = r.startsOn.slice(0, 7);
                  const header =
                    sortKey === "datum" && month !== openMonth ? (
                      <TGroup colSpan={columns}>
                        {formatMonth(r.startsOn, locale)} ·{" "}
                        {t("groupCount", { count: perMonth.get(month) ?? 0 })}
                      </TGroup>
                    ) : null;
                  openMonth = month;
                  // Cancelled markets stay untinted (muted text, no colour noise).
                  const tint = r.status !== "cancelled" ? marketRowClass(r.color) : undefined;
                  return (
                    <Fragment key={r.id}>
                      {header}
                      <LinkRow
                        href={href}
                        tabIndex={0}
                        data-row
                        data-href={href}
                        data-peek={peek}
                        aria-selected={vorschauId === r.id}
                        className={cn(
                          // Tinted rows: focus = the focus ring on top of the tint (globals.css .market-row).
                          tint ?? "outline-hidden focus-visible:bg-selected",
                          "max-sm:grid max-sm:grid-cols-[auto_auto_1fr_auto] max-sm:items-center max-sm:gap-x-2 max-sm:gap-y-0.5 max-sm:px-3 max-sm:py-2.5",
                          r.status === "cancelled" && "text-muted-foreground",
                        )}
                      >
                        <TD className="tabular text-muted-foreground max-sm:col-start-2 max-sm:row-start-2 max-sm:h-auto max-sm:p-0 max-sm:text-small">
                          <span className="sm:hidden">{t("cols.week")} </span>
                          {isoWeek(r.startsOn).week}
                        </TD>
                        <TD className="tabular whitespace-nowrap font-semibold max-sm:col-start-1 max-sm:row-start-2 max-sm:h-auto max-sm:p-0 max-sm:text-small">
                          {formatDateRangeYear(r.startsOn, r.endsOn, locale, today)}
                        </TD>
                        <TD className="max-sm:col-span-3 max-sm:col-start-1 max-sm:row-start-1 max-sm:h-auto max-sm:min-w-0 max-sm:p-0">
                          <span className="inline-flex items-center gap-2">
                            <MarketMarker color={r.color} typeKey={r.typeKey} size="lg" />
                            <Link
                              href={href as never}
                              tabIndex={-1}
                              className="whitespace-nowrap font-semibold text-accent-soft-foreground hover:underline max-sm:whitespace-normal"
                            >
                              {r.name}
                            </Link>
                          </span>
                        </TD>
                        <TD className="max-sm:hidden">
                          <EventTypeTag typeKey={r.typeKey}>{typeName(r)}</EventTypeTag>
                        </TD>
                        <TD
                          className="max-w-64 truncate max-sm:col-start-3 max-sm:row-start-2 max-sm:h-auto max-sm:min-w-0 max-sm:max-w-none max-sm:p-0 max-sm:text-small max-sm:text-muted-foreground max-sm:before:mr-2 max-sm:before:content-['·']"
                          title={r.venueName}
                        >
                          <Link
                            href={
                              hrefWith(PATH, sp, { ort: r.venueId, vorschau: undefined }) as never
                            }
                            scroll={false}
                            tabIndex={-1}
                            title={t("venueOnly", { name: r.venueName })}
                            className="inline-flex max-w-full items-center gap-1 rounded-md bg-surface-2 px-1.5 py-0.5 text-small hover:bg-hover hover:underline max-sm:bg-transparent max-sm:p-0"
                          >
                            <MapPin
                              aria-hidden
                              className="size-3.5 shrink-0 text-muted-foreground"
                            />
                            <span className="truncate">{r.venueName}</span>
                          </Link>
                        </TD>
                        <TD className="max-sm:col-start-4 max-sm:row-start-1 max-sm:h-auto max-sm:p-0">
                          <EventStatusBadge status={r.status} />
                        </TD>
                        {isModuleVisible("estimates") && (
                          <TD className="tabular text-right text-muted-foreground max-sm:hidden">
                            –
                          </TD>
                        )}
                        <TD className="w-24 max-sm:hidden">
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
                            {canWrite && (
                              <EventActions
                                eventId={r.id}
                                eventName={r.name}
                                status={r.status}
                                startsOn={r.startsOn}
                                canMove={canMoveEvent(r.status)}
                                venues={venueOptions}
                                types={typeChoices}
                                basics={{
                                  name: r.name,
                                  durationDays: daysBetween(r.startsOn, r.endsOn) + 1,
                                  venueId: r.venueId,
                                  eventTypeId: r.eventTypeId,
                                }}
                                triggerClassName="grid size-7 cursor-pointer place-items-center rounded-md text-foreground-2 hover:bg-hover focus-visible:outline-2 focus-visible:outline-ring data-[popup-open]:bg-hover"
                              />
                            )}
                          </RowActions>
                        </TD>
                      </LinkRow>
                    </Fragment>
                  );
                })}
              </tbody>
            </Table>
          </KeyboardRows>
        )}
      </Panel>

      <SearchHotkey inputId="q" />
      <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-muted-foreground text-tiny touch:hidden">
        <span>{t("keys")}</span>
      </p>

      {vorschauId && (
        <EventVorschau id={vorschauId} closeHref={hrefWith(PATH, sp, { vorschau: undefined })} />
      )}
      {generating && (
        <GenerateSheet
          presets={await listPresetsForGeneration(today)}
          initialPresetId={param(sp.vorlage)}
          closeHref={hrefWith(PATH, sp, {
            erzeugen: undefined,
            vorlage: undefined,
            neu: undefined,
          })}
          canCreateMarket={canCreateMarket}
          marketOptions={marketOptions}
          openNewMarket={param(sp.neu) === "1"}
        />
      )}
    </Page>
  );
}
