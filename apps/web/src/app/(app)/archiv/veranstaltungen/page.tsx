import { can } from "@marktwerk/core";
import { Eye, SearchX } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { ArchiveFrame } from "@/components/archive/archive-frame";
import { LiveSearch } from "@/components/archive/live-search";
import { SaveAsPreset } from "@/components/archive/save-as-preset";
import { EventStatusBadge } from "@/components/events/event-status";
import { EventVorschau } from "@/components/events/event-vorschau";
import { AutoSubmitSelect } from "@/components/ui/auto-submit";
import { EventTypeTag } from "@/components/ui/event-type-tag";
import { FilterBar, FilterChip, FilterChips, FilterGroup } from "@/components/ui/filter-bar";
import { KeyboardRows } from "@/components/ui/keyboard-rows";
import { MarketMarker } from "@/components/ui/market-marker";
import { PAGE_SIZE, Pager, pageOf } from "@/components/ui/pager";
import { Panel } from "@/components/ui/panel";
import { LinkRow } from "@/components/ui/row-link";
import { EmptyState } from "@/components/ui/states";
import { RowActions, rowFocus, Table, TD, TH, THead } from "@/components/ui/table";
import { formatDateRangeYear, todayIn } from "@/lib/format";
import { hrefWith, param } from "@/lib/url";
import { getActor } from "@/server/actor";
import { listEventTypeOptions } from "@/server/queries/event-form";
import { getPresetSource, listEvents, listEventTypes, listSeasons } from "@/server/queries/events";
import { getMarketColorChoices } from "@/server/queries/market-colors";
import { listVenueOptions } from "@/server/queries/venues";
import { requirePermission } from "@/server/session";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("archive"))("sections.events") };
}

const PATH = "/archiv/veranstaltungen";

/**
 * Archiv › Vergangene Veranstaltungen: every event that is over (finished or cancelled), newest first, by year,
 * type and a search. Each row opens the event; "Als Vorlage speichern" (`?vorlage=<id>`) turns it into a new
 * market with the event's data and its market's tasks (handwritten notes HN-13, decision 2026-11-03).
 */
export default async function ArchiveEventsPage({
  searchParams,
}: PageProps<"/archiv/veranstaltungen">) {
  await requirePermission("event", "read");
  const actor = await getActor();
  const sp = await searchParams;
  const t = await getTranslations("archive.events");
  const tEvents = await getTranslations("events");
  const locale = await getLocale();
  const today = todayIn();

  const seasons = (await listSeasons(actor)).filter((s) => s <= Number(today.slice(0, 4)));
  const yearParam = Number(param(sp.jahr));
  const year = seasons.includes(yearParam) ? yearParam : undefined;
  const typeKey = param(sp.art);
  const q = param(sp.q)?.slice(0, 100);
  const [fetched, types] = await Promise.all([
    listEvents(actor, { season: year, q, endedBefore: today }),
    listEventTypes(),
  ]);
  const counts: Record<string, number> = {};
  for (const r of fetched) counts[r.typeKey] = (counts[r.typeKey] ?? 0) + 1;
  // Newest first: the archive is looked back into.
  const rows = (typeKey ? fetched.filter((r) => r.typeKey === typeKey) : fetched).toReversed();
  const page = pageOf(param(sp.seite), rows.length);
  const shown = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const typeName = (r: { typeNameDe: string; typeNameEn: string }) =>
    locale === "en" ? r.typeNameEn : r.typeNameDe;

  const canPreset = can(actor.role, "template", "write");
  const presetId = canPreset ? param(sp.vorlage) : undefined;
  const source = presetId ? await getPresetSource(actor, presetId) : null;
  const [typeOptions, venueOptions, colors] = source
    ? await Promise.all([listEventTypeOptions(), listVenueOptions(), getMarketColorChoices()])
    : [[], [], null];
  const vorschauId = param(sp.vorschau);

  return (
    <ArchiveFrame section="events">
      <form method="get" action={PATH} className="flex flex-wrap items-center gap-x-2 gap-y-3">
        {typeKey && <input type="hidden" name="art" value={typeKey} />}
        <label className="sr-only" htmlFor="q">
          {t("search")}
        </label>
        <LiveSearch
          id="q"
          defaultValue={q}
          placeholder={t("search")}
          resetKeys={["seite", "vorschau", "vorlage"]}
          className="w-64 max-sm:w-full"
        />
        <label className="sr-only" htmlFor="jahr">
          {t("year")}
        </label>
        <AutoSubmitSelect id="jahr" name="jahr" defaultValue={year ? String(year) : ""}>
          <option value="">{t("yearAll")}</option>
          {seasons.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </AutoSubmitSelect>
        <FilterBar className="basis-full">
          <FilterGroup label={t("types")} wide>
            <FilterChips>
              <FilterChip
                href={hrefWith(PATH, sp, { art: undefined, vorschau: undefined, seite: undefined })}
                active={!typeKey}
                count={fetched.length}
              >
                {t("all")}
              </FilterChip>
              {types.map((type) => (
                <FilterChip
                  key={type.key}
                  href={hrefWith(PATH, sp, {
                    art: type.key,
                    vorschau: undefined,
                    seite: undefined,
                  })}
                  active={typeKey === type.key}
                  count={counts[type.key] ?? 0}
                >
                  {locale === "en" ? type.nameEn : type.nameDe}
                </FilterChip>
              ))}
            </FilterChips>
          </FilterGroup>
        </FilterBar>
      </form>

      <p className="text-muted-foreground text-small">{t("count", { count: rows.length })}</p>

      <Panel className="overflow-hidden">
        {rows.length === 0 ? (
          <EmptyState icon={SearchX} title={t("empty")}>
            <Link
              href={PATH as never}
              className="inline-flex min-h-8 items-center rounded-lg border border-input bg-card px-3 font-medium hover:bg-hover"
            >
              {t("reset")}
            </Link>
          </EmptyState>
        ) : (
          <KeyboardRows>
            <Table className="max-sm:block">
              <caption className="sr-only">{t("caption")}</caption>
              <THead className="max-sm:sr-only">
                <tr>
                  <TH>{t("cols.date")}</TH>
                  <TH>{t("cols.event")}</TH>
                  <TH>{t("cols.type")}</TH>
                  <TH>{t("cols.venue")}</TH>
                  <TH>{t("cols.status")}</TH>
                  <TH>
                    <span className="sr-only">{t("cols.actions")}</span>
                  </TH>
                </tr>
              </THead>
              <tbody className="max-sm:block">
                {shown.map((r) => {
                  const href = `/veranstaltungen/${r.id}`;
                  const peek = hrefWith(PATH, sp, { vorschau: r.id, vorlage: undefined });
                  return (
                    <LinkRow
                      key={r.id}
                      href={href}
                      tabIndex={0}
                      data-row
                      data-href={href}
                      data-peek={peek}
                      aria-current={vorschauId === r.id}
                      className={`${rowFocus} max-sm:flex max-sm:flex-wrap max-sm:items-center max-sm:gap-x-2 max-sm:gap-y-1 max-sm:px-3 max-sm:py-2.5`}
                    >
                      <TD className="tabular whitespace-nowrap font-semibold max-sm:h-auto max-sm:p-0 max-sm:text-small">
                        {formatDateRangeYear(r.startsOn, r.endsOn, locale, today)}
                      </TD>
                      <TD className="max-sm:h-auto max-sm:basis-full max-sm:p-0">
                        <span className="inline-flex items-center gap-2">
                          <MarketMarker color={r.color} typeKey={r.typeKey} size="lg" />
                          <Link
                            href={href as never}
                            tabIndex={-1}
                            className="font-semibold text-accent-soft-foreground hover:underline"
                          >
                            {r.name}
                          </Link>
                        </span>
                      </TD>
                      <TD className="max-sm:hidden">
                        <EventTypeTag typeKey={r.typeKey}>{typeName(r)}</EventTypeTag>
                      </TD>
                      <TD className="max-w-64 truncate text-foreground-2 max-sm:h-auto max-sm:p-0 max-sm:text-small">
                        {r.venueName}
                      </TD>
                      <TD className="max-sm:h-auto max-sm:p-0">
                        <EventStatusBadge status={r.status} />
                      </TD>
                      <TD className="whitespace-nowrap max-sm:h-auto max-sm:basis-full max-sm:p-0">
                        <RowActions className="opacity-100">
                          <Link
                            href={peek as never}
                            scroll={false}
                            tabIndex={-1}
                            aria-label={tEvents("preview", { name: r.name })}
                            className="grid size-7 place-items-center rounded-md hover:bg-hover"
                          >
                            <Eye className="size-4" />
                          </Link>
                          {canPreset && (
                            <Link
                              href={
                                hrefWith(PATH, sp, { vorlage: r.id, vorschau: undefined }) as never
                              }
                              scroll={false}
                              aria-label={t("saveAsPresetFor", { name: r.name })}
                              className="inline-flex min-h-7 items-center rounded-md border border-input bg-card px-2 font-medium text-small hover:bg-hover"
                            >
                              {t("saveAsPreset")}
                            </Link>
                          )}
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
      <Pager
        page={page}
        total={rows.length}
        href={(n) =>
          hrefWith(PATH, sp, {
            seite: n === 1 ? undefined : n,
            vorschau: undefined,
            vorlage: undefined,
          })
        }
      />

      {vorschauId && (
        <EventVorschau id={vorschauId} closeHref={hrefWith(PATH, sp, { vorschau: undefined })} />
      )}
      {source && colors && (
        <SaveAsPreset
          source={source}
          types={typeOptions}
          venues={venueOptions}
          colors={colors}
          closeHref={hrefWith(PATH, sp, { vorlage: undefined })}
        />
      )}
    </ArchiveFrame>
  );
}
