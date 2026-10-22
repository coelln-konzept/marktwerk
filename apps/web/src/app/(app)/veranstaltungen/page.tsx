import { can, isoWeek } from "@marktwerk/core";
import { CalendarPlus, Eye, SearchX } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { EventStatusBadge } from "@/components/events/event-status";
import { EventVorschau } from "@/components/events/event-vorschau";
import { GenerateSheet } from "@/components/events/generate-sheet";
import { Page, PageHeader } from "@/components/shell/page";
import { AutoSubmitSelect } from "@/components/ui/auto-submit";
import { EventTypeTag } from "@/components/ui/event-type-tag";
import { FilterBar, FilterChip, FilterChips, FilterGroup } from "@/components/ui/filter-bar";
import { KeyboardRows } from "@/components/ui/keyboard-rows";
import { MarketMarker } from "@/components/ui/market-marker";
import { Panel } from "@/components/ui/panel";
import { LinkRow } from "@/components/ui/row-link";
import { EmptyState } from "@/components/ui/states";
import { RowActions, Table, TD, TH, THead } from "@/components/ui/table";
import { formatDateRangeYear, todayIn } from "@/lib/format";
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
import { listPresetsForGeneration } from "@/server/queries/presets";
import { listVenueOptions } from "@/server/queries/venues";
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
  const tStatus = await getTranslations("status.event");
  const locale = await getLocale();
  const today = todayIn();

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
  const q = param(sp.q)?.slice(0, 100);
  // "Ohne Genehmigung" (from the Übersicht KPI): upcoming planned events whose permits are not all
  // granted. It looks across seasons, like the KPI does.
  const openPermits = param(sp.genehmigung) === "offen";
  // While finance is hidden "abgeschlossen" and "abgerechnet" are one state ("vorbei"): filter after the query.
  const overFilter = financeHidden && statusKey === "completed";
  const filters = {
    season: openPermits ? undefined : season,
    status: openPermits
      ? ("planned" as const)
      : upcomingOnly || statusKey === "aktiv"
        ? ("active" as const)
        : statusKey === "alle" || overFilter
          ? undefined
          : statusKey,
    from: upcomingOnly && !openPermits ? today : undefined,
    q,
  };

  // One query without the type filter: the type chips count from it, the table narrows it by type.
  const [fetched, types] = await Promise.all([listEvents(actor, filters), listEventTypes()]);
  const byStatus = overFilter
    ? fetched.filter((r) => r.status === "completed" || r.status === "closed")
    : fetched;
  const byPermit = openPermits
    ? byStatus.filter(
        (r) =>
          r.endsOn >= today && (r.health.permits === "warn" || r.health.permits === "critical"),
      )
    : byStatus;
  const counts: Record<string, number> = {};
  for (const r of byPermit) counts[r.typeKey] = (counts[r.typeKey] ?? 0) + 1;
  const rows = typeKey ? byPermit.filter((r) => r.typeKey === typeKey) : byPermit;
  const total = byPermit.length;
  const planned = rows.filter((r) => r.status === "planned").length;
  const vorschauId = param(sp.vorschau);
  const canWrite = can(actor.role, "event", "write");
  const generating = canWrite && param(sp.erzeugen) === "1";
  // "Neuen Markt anlegen" needs template:write on top of event:write.
  const canCreateMarket = generating && can(actor.role, "template", "write");
  const marketOptions = canCreateMarket
    ? { types: await listEventTypeOptions(), venues: await listVenueOptions() }
    : undefined;
  const typeName = (r: { typeNameDe: string; typeNameEn: string }) =>
    locale === "en" ? r.typeNameEn : r.typeNameDe;

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

      <form method="get" action={PATH} className="flex flex-wrap items-center gap-2">
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
              <caption className="sr-only">{t("caption")}</caption>
              <THead>
                <tr>
                  <TH className="w-14">{t("cols.week")}</TH>
                  <TH>{t("cols.date")}</TH>
                  <TH>{t("cols.event")}</TH>
                  <TH>{t("cols.type")}</TH>
                  <TH>{t("cols.venue")}</TH>
                  <TH>{t("cols.status")}</TH>
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
                    <LinkRow
                      key={r.id}
                      href={href}
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
                      <TD className="tabular text-muted-foreground">{isoWeek(r.startsOn).week}</TD>
                      <TD className="tabular whitespace-nowrap font-semibold">
                        {formatDateRangeYear(r.startsOn, r.endsOn, locale, today)}
                      </TD>
                      <TD>
                        <span className="inline-flex items-center gap-2">
                          <MarketMarker color={r.color} typeKey={r.typeKey} size="lg" />
                          <Link
                            href={href as never}
                            tabIndex={-1}
                            className="whitespace-nowrap font-semibold text-accent-soft-foreground hover:underline"
                          >
                            {r.name}
                          </Link>
                        </span>
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
                    </LinkRow>
                  );
                })}
              </tbody>
            </Table>
          </KeyboardRows>
        )}
      </Panel>

      <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-muted-foreground text-tiny">
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
