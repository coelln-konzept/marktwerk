import { can } from "@marktwerk/core";
import { CalendarPlus, History, SearchX } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { EventRows } from "@/components/events/event-rows";
import { EventVorschau } from "@/components/events/event-vorschau";
import { FilterToggle } from "@/components/events/filter-toggle";
import { GenerateSheet } from "@/components/events/generate-sheet";
import { LiveSearchInput } from "@/components/events/live-search-input";
import { SearchHotkey } from "@/components/events/search-hotkey";
import { Page, PageHeader } from "@/components/shell/page";
import { AutoSubmitSelect } from "@/components/ui/auto-submit";
import { EventTypeTag } from "@/components/ui/event-type-tag";
import { FilterBar, FilterChip, FilterChips, FilterGroup } from "@/components/ui/filter-bar";
import { KeyboardRows } from "@/components/ui/keyboard-rows";
import { Panel } from "@/components/ui/panel";
import { EmptyState } from "@/components/ui/states";
import { Table, TH, THead } from "@/components/ui/table";
import { todayIn } from "@/lib/format";
import { isModuleHidden, isModuleVisible } from "@/lib/modules";
import { EVENT_STATUS, EVENT_STATUSES } from "@/lib/status";
import { hrefWith, param } from "@/lib/url";
import { getActor } from "@/server/actor";
import { listEventTypeOptions } from "@/server/queries/event-form";
import {
  countEvents,
  type EventStatusKey,
  eventSearchMode,
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
const CancelledIcon = EVENT_STATUS.cancelled.icon;

/** Sortable columns (`?sortierung=`; Datum is the default and the only one with month headers). */
const SORT_KEYS = ["datum", "name", "art", "ort", "status"] as const;
type SortKey = (typeof SORT_KEYS)[number];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/**
 * Rows per page (`?anzahl=` shows more): a season with its row menus made the page 1.8 MB of HTML
 * (UX-069). Counts, chips and month headers still cover every match.
 */
const PAGE_SIZE = 50;
const MAX_ROWS = 1000;

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
  // `?saison=alle`: every season (the "Alle Treffer" link of a search; "Alle Saisons" in the select).
  const allSeasons = !seasonPicked && param(sp.saison) === "alle";
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
  const season =
    upcomingOnly || allSeasons
      ? seasonPicked
      : (seasonPicked ??
        (seasons.includes(currentYear) ? currentYear : (seasons[0] ?? currentYear)));
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
  // "Aktuell & kommend" and "Alle außer abgesagt" leave cancelled events out; the "N abgesagt" chip
  // (`?abgesagte=1`) brings them back into the same view (UX-049).
  const hidesCancelled = (upcomingOnly || statusKey === "aktiv") && !openPermits && !justCreated;
  const withCancelled = hidesCancelled && param(sp.abgesagte) === "1";
  // Same matching as the command palette (word starts, umlauts, typos), so its counts fit (UX-066).
  const qMode = q && !justCreated ? await eventSearchMode(actor, q) : undefined;
  const filters = {
    season: openPermits || justCreated ? undefined : season,
    status: justCreated
      ? undefined
      : openPermits
        ? ("planned" as const)
        : upcomingOnly || statusKey === "aktiv"
          ? withCancelled
            ? undefined
            : ("active" as const)
          : statusKey === "alle" || overFilter
            ? undefined
            : statusKey,
    from: justCreated || (upcomingOnly && !openPermits) ? today : undefined,
    q: justCreated ? undefined : q,
    qMode,
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
  const anzahl = Number(param(sp.anzahl));
  const limit =
    Number.isInteger(anzahl) && anzahl > PAGE_SIZE ? Math.min(anzahl, MAX_ROWS) : PAGE_SIZE;
  const pageRows = rows.slice(0, limit);
  // What the view leaves out: cancelled events (chip) and, for a search, matches in the past, in other
  // seasons or with another status ("Auch passend: …", with a link to all of them).
  const narrowing = { typeKey, venueId, q: filters.q, qMode };
  const hints = !justCreated && !openPermits;
  const [cancelledCount, allMatches, pastMatches] = await Promise.all([
    !hidesCancelled
      ? 0
      : withCancelled
        ? rows.filter((r) => r.status === "cancelled").length
        : countEvents(actor, { ...filters, ...narrowing, status: "cancelled" }),
    hints && q ? countEvents(actor, narrowing) : 0,
    hints && q && upcomingOnly && !seasonPicked
      ? countEvents(actor, { ...narrowing, endedBefore: today })
      : 0,
  ]);
  const hiddenMatches = Math.max(0, allMatches - rows.length);
  const hiddenCancelled = withCancelled ? 0 : cancelledCount;
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
    season ? t("seasonOption", { season }) : allSeasons ? t("seasonAny") : null,
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
    withCancelled ? t("cancelled.shown") : null,
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
  // Row links keep the page's filters (string params only, as `hrefWith` reads them).
  const rowQuery = Object.fromEntries(
    Object.entries(sp).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  );

  return (
    <Page crumbs={[{ label: tNav("events") }]}>
      <PageHeader
        title={tNav("events")}
        subtitle={
          season
            ? t("subtitle", { season, count: total, planned })
            : allSeasons && !upcomingOnly
              ? t("subtitleAll", { count: total, planned })
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
        {withCancelled && <input type="hidden" name="abgesagte" value="1" />}
        {sortParam && <input type="hidden" name="sortierung" value={sortParam} />}
        {sortDir === "desc" && <input type="hidden" name="richtung" value="ab" />}
        <label className="sr-only" htmlFor="q">
          {t("search")}
        </label>
        <LiveSearchInput
          id="q"
          name="q"
          defaultValue={q}
          placeholder={t("search")}
          maxLength={100}
          autoComplete="off"
          aria-keyshortcuts="/"
          className="min-h-(--control-h) w-64 rounded-lg border border-input bg-card px-3 max-sm:w-full"
        />
        <FilterToggle label={t("filter")} summary={filterSummary || null}>
          <label className="sr-only" htmlFor="saison">
            {t("season")}
          </label>
          <AutoSubmitSelect
            id="saison"
            name="saison"
            defaultValue={season ? String(season) : allSeasons && !upcomingOnly ? "alle" : ""}
          >
            <option value={upcomingOnly ? "" : "alle"}>{t("seasonAny")}</option>
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
            {cancelledCount > 0 && (
              <FilterGroup label={t("cancelled.label")}>
                <FilterChips>
                  <FilterChip
                    href={hrefWith(PATH, sp, {
                      abgesagte: withCancelled ? undefined : 1,
                      anzahl: undefined,
                      vorschau: undefined,
                    })}
                    active={withCancelled}
                    title={withCancelled ? t("cancelled.hide") : t("cancelled.show")}
                  >
                    <CancelledIcon aria-hidden className="size-3.5 shrink-0" />
                    {t("cancelled.chip", { count: cancelledCount })}
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

      {q && hints && (hiddenMatches > 0 || qMode === "typos") && (
        <p
          role="status"
          className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-status-info-bg px-3 py-2 text-status-info"
        >
          <History aria-hidden className="size-4 shrink-0" />
          {qMode === "typos" && <span>{t("alsoMatching.typos", { q })}</span>}
          {hiddenMatches > 0 && (
            <>
              <span>
                {upcomingOnly && !seasonPicked
                  ? pastMatches > 0 && hiddenCancelled > 0
                    ? t("alsoMatching.pastCancelled", {
                        past: pastMatches,
                        cancelled: hiddenCancelled,
                      })
                    : pastMatches > 0
                      ? t("alsoMatching.past", { count: pastMatches })
                      : t("alsoMatching.cancelled", { count: hiddenCancelled })
                  : t("alsoMatching.other", { count: hiddenMatches })}
              </span>
              <Link
                href={
                  hrefWith(PATH, sp, {
                    status: "alle",
                    saison: "alle",
                    abgesagte: undefined,
                    anzahl: undefined,
                    vorschau: undefined,
                  }) as never
                }
                scroll={false}
                className="font-medium underline underline-offset-2 hover:no-underline"
              >
                {t("alsoMatching.showAll", { count: allMatches })}
              </Link>
            </>
          )}
        </p>
      )}

      <Panel className="overflow-hidden">
        {rows.length === 0 ? (
          <EmptyState icon={SearchX} title={q ? t("emptySearch", { q }) : t("emptyFiltered")}>
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
                <EventRows
                  rows={pageRows.map((r) => ({
                    id: r.id,
                    name: r.name,
                    startsOn: r.startsOn,
                    endsOn: r.endsOn,
                    status: r.status,
                    typeKey: r.typeKey,
                    typeName: typeName(r),
                    color: r.color,
                    venueId: r.venueId,
                    venueName: r.venueName,
                    eventTypeId: r.eventTypeId,
                  }))}
                  query={rowQuery}
                  monthHeaders={sortKey === "datum"}
                  perMonth={Object.fromEntries(perMonth)}
                  today={today}
                  vorschauId={vorschauId}
                  actions={
                    canWrite
                      ? {
                          canDelete: can(actor.role, "event", "delete"),
                          venues: venueOptions,
                          types: typeChoices,
                        }
                      : undefined
                  }
                />
              </tbody>
            </Table>
          </KeyboardRows>
        )}
      </Panel>

      {rows.length > pageRows.length && (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground text-small">
          <span className="tabular">
            {t("paging.shown", { shown: pageRows.length, total: rows.length })}
          </span>
          <Link
            href={hrefWith(PATH, sp, { anzahl: limit + PAGE_SIZE, vorschau: undefined }) as never}
            scroll={false}
            className="inline-flex min-h-8 items-center rounded-lg border border-input bg-card px-3 font-medium text-foreground hover:bg-hover"
          >
            {t("paging.more", { count: Math.min(PAGE_SIZE, rows.length - pageRows.length) })}
          </Link>
        </p>
      )}

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
