import { can, isPermitSort, type PermitDisplayState } from "@marktwerk/core";
import { Building2, SearchX } from "lucide-react";
import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { FilterPanel } from "@/components/permits/filter-panel";
import { LogbookList } from "@/components/permits/logbook-list";
import { LogbookMatrix } from "@/components/permits/logbook-matrix";
import { NewPermitDialog } from "@/components/permits/new-permit-dialog";
import { PermitDrawer } from "@/components/permits/permit-drawer";
import { Page, PageHeader } from "@/components/shell/page";
import { AutoSubmitSelect } from "@/components/ui/auto-submit";
import { buttonVariants } from "@/components/ui/button";
import { FilterBar, FilterChip, FilterChips, FilterGroup } from "@/components/ui/filter-bar";
import { Panel } from "@/components/ui/panel";
import { SegmentedLinks } from "@/components/ui/segmented-links";
import { EmptyState } from "@/components/ui/states";
import { todayIn } from "@/lib/format";
import { PERMIT_STATE_ORDER } from "@/lib/permit-status";
import { hrefWith, param } from "@/lib/url";
import { getActor } from "@/server/actor";
import {
  isPermitId,
  LOGBOOK_FOCUS,
  type LogbookFocus,
  listLogbook,
} from "@/server/queries/permits";
import { requirePermission } from "@/server/session";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("nav"))("permits") };
}

const PATH = "/genehmigungen";

const isState = (value: string | undefined): value is PermitDisplayState =>
  PERMIT_STATE_ORDER.includes(value as PermitDisplayState);
const isFocus = (value: string | undefined): value is LogbookFocus =>
  (LOGBOOK_FOCUS as readonly string[]).includes(value ?? "");

/** A phone asks for the list: the matrix needs more width than 390 px have (R5 F9). */
async function isPhone(): Promise<boolean> {
  const h = await headers();
  if (h.get("sec-ch-ua-mobile") === "?1") return true;
  return /\b(Mobi|iPhone|Android.+Mobile)/i.test(h.get("user-agent") ?? "");
}

/**
 * Genehmigungen (was "Logbuch"): the status quo of the company's permits, per venue and category
 * (Stadt / Extern), as a matrix or a list. It opens on "Kommend": the permits that cover an upcoming
 * market, whatever their season. Filters (Ort, Kategorie, Zeitraum) and ONE status row (all states plus
 * "Jetzt zu tun", the number the sidebar badge shows) live in the URL; a permit opens in the drawer
 * (`?genehmigung=<id>`) next to the table, and a link to a permit the filters hide shows everything.
 */
export default async function PermitsPage({ searchParams }: PageProps<"/genehmigungen">) {
  await requirePermission("permit", "read");
  const actor = await getActor();
  const sp = await searchParams;
  const t = await getTranslations("logbook");
  const tState = await getTranslations("permitStatus");
  const tCat = await getTranslations("permitCategories");
  const today = todayIn();
  const canWrite = can(actor.role, "permit", "write");

  const venueParam = param(sp.ort);
  const venueId = isPermitId(venueParam) ? venueParam : undefined;
  const categoryParam = param(sp.kategorie);
  const category =
    categoryParam === "city" || categoryParam === "external" ? categoryParam : undefined;
  const seasonParam = param(sp.saison);
  const season =
    seasonParam === "alle"
      ? null
      : seasonParam && /^\d{4}$/.test(seasonParam)
        ? Number(seasonParam)
        : ("upcoming" as const);
  const stateParam = param(sp.status);
  const state = isState(stateParam) ? stateParam : undefined;
  const focusParam = param(sp.fokus);
  const focus = isFocus(focusParam) ? focusParam : undefined;
  const viewParam = param(sp.ansicht);
  const view =
    viewParam === "liste" || viewParam === "matrix"
      ? viewParam
      : (await isPhone())
        ? "liste"
        : "matrix";
  const sortParam = param(sp.sort);
  const sort = isPermitSort(sortParam) ? sortParam : "antrag";
  const drawerParam = param(sp.genehmigung);
  const drawerId = isPermitId(drawerParam) ? drawerParam : undefined;

  const logbook = await listLogbook(
    actor,
    { venueId, category, season, state, focus, revealId: drawerId },
    today,
  );
  // A link to a permit the filters hide (Übersicht, Kalender, notification): show everything.
  if (logbook.drawerHidden) {
    redirect(
      hrefWith(PATH, sp, {
        saison: "alle",
        ort: undefined,
        kategorie: undefined,
        status: undefined,
        fokus: undefined,
      }) as never,
    );
  }
  const filtered = Boolean(venueId || category || state || focus || season !== "upcoming");
  const activeFilters =
    (venueId ? 1 : 0) +
    (category ? 1 : 0) +
    (season !== "upcoming" ? 1 : 0) +
    (state || focus ? 1 : 0);
  const seasons = [...new Set([Number(today.slice(0, 4)), ...logbook.seasons])].sort(
    (a, b) => b - a,
  );
  const venueCount = new Set(logbook.rows.map((r) => r.venueId)).size;
  const closeHref = hrefWith(PATH, sp, { genehmigung: undefined });
  const reset = hrefWith(PATH, {}, { ansicht: viewParam, sort: sortParam });
  // The season the next market that needs a permit falls into: what a new permit is most likely for.
  const nextMarket = logbook.rows
    .map((r) => r.nextEventOn)
    .filter((d): d is string => d !== null)
    .sort()[0];
  const defaultSeason = Number((nextMarket ?? today).slice(0, 4));

  const viewSwitch = (
    <SegmentedLinks
      label={t("view")}
      items={(
        [
          ["matrix", t("viewMatrix")],
          ["liste", t("viewList")],
        ] as const
      ).map(([key, label]) => ({
        key,
        label,
        href: hrefWith(PATH, sp, { ansicht: key }),
        active: view === key,
      }))}
    />
  );

  return (
    <Page crumbs={[{ label: t("title") }]}>
      <PageHeader
        title={t("title")}
        subtitle={t("subtitle", { count: logbook.rows.length, venues: venueCount })}
        actions={
          canWrite && <NewPermitDialog venues={logbook.venues} defaultSeason={defaultSeason} />
        }
      />

      <FilterPanel
        label={t("filtersButton")}
        activeLabel={activeFilters > 0 ? t("filtersActive", { count: activeFilters }) : null}
        viewSwitch={viewSwitch}
      >
        <div className="flex flex-col gap-3">
          <form method="get" action={PATH} className="flex flex-wrap items-center gap-2">
            {viewParam && <input type="hidden" name="ansicht" value={viewParam} />}
            {sortParam && <input type="hidden" name="sort" value={sortParam} />}
            {state && <input type="hidden" name="status" value={state} />}
            {focus && <input type="hidden" name="fokus" value={focus} />}
            <label className="sr-only" htmlFor="filter-ort">
              {t("venue")}
            </label>
            <AutoSubmitSelect id="filter-ort" name="ort" defaultValue={venueId ?? ""}>
              <option value="">{t("allVenues")}</option>
              {logbook.venues.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </AutoSubmitSelect>
            <label className="sr-only" htmlFor="filter-kategorie">
              {t("category")}
            </label>
            <AutoSubmitSelect id="filter-kategorie" name="kategorie" defaultValue={category ?? ""}>
              <option value="">{t("allCategories")}</option>
              <option value="city">{tCat("city")}</option>
              <option value="external">{tCat("external")}</option>
            </AutoSubmitSelect>
            <label className="sr-only" htmlFor="filter-saison">
              {t("season")}
            </label>
            <AutoSubmitSelect
              id="filter-saison"
              name="saison"
              defaultValue={
                season === null ? "alle" : season === "upcoming" ? "kommend" : String(season)
              }
            >
              <option value="kommend">{t("scopeUpcoming")}</option>
              <option value="alle">{t("allSeasons")}</option>
              {seasons.map((y) => (
                <option key={y} value={y}>
                  {t("season_label", { year: y })}
                </option>
              ))}
            </AutoSubmitSelect>
            {filtered && (
              <Link href={reset as never} className={buttonVariants({ variant: "ghost" })}>
                {t("resetFilters")}
              </Link>
            )}
          </form>

          <FilterBar>
            <FilterGroup label={t("statusFilter")} wide>
              <FilterChips>
                <FilterChip
                  href={hrefWith(PATH, sp, {
                    fokus: undefined,
                    status: undefined,
                    genehmigung: undefined,
                  })}
                  active={!focus && !state}
                  count={logbook.total}
                >
                  {t("filterAll")}
                </FilterChip>
                <FilterChip
                  href={hrefWith(PATH, sp, {
                    fokus: "fehlt",
                    status: undefined,
                    // The permits to act on all cover an upcoming market, whatever the season.
                    saison: undefined,
                    genehmigung: undefined,
                  })}
                  active={focus === "fehlt"}
                  count={logbook.needsAction}
                  title={t("needsActionHint", { days: logbook.horizonDays })}
                >
                  {t("needsAction")}
                </FilterChip>
                {PERMIT_STATE_ORDER.filter((s) => logbook.counts[s] > 0 || s === state).map((s) => (
                  <FilterChip
                    key={s}
                    href={hrefWith(PATH, sp, {
                      status: s,
                      fokus: undefined,
                      genehmigung: undefined,
                    })}
                    active={state === s}
                    count={logbook.counts[s]}
                  >
                    {tState(s)}
                  </FilterChip>
                ))}
              </FilterChips>
              <p className="text-muted-foreground text-tiny">
                {t("needsActionNote", { days: logbook.horizonDays, notDue: logbook.notDue })}
              </p>
            </FilterGroup>
          </FilterBar>
        </div>
      </FilterPanel>

      {logbook.total === 0 && !filtered ? (
        <Panel>
          <EmptyState icon={Building2} title={t("empty")} hint={t("emptyHint")}>
            <Link href={"/orte" as never} className={buttonVariants({ variant: "outline" })}>
              {t("emptyVenues")}
            </Link>
          </EmptyState>
        </Panel>
      ) : logbook.rows.length === 0 ? (
        <Panel>
          <EmptyState icon={SearchX} title={t("emptyFiltered")}>
            <Link href={reset as never} className={buttonVariants({ variant: "outline" })}>
              {t("resetFilters")}
            </Link>
          </EmptyState>
        </Panel>
      ) : view === "liste" ? (
        <LogbookList
          rows={logbook.rows}
          path={PATH}
          sp={sp}
          selectedId={drawerId}
          sort={sort}
          horizonDays={logbook.horizonDays}
        />
      ) : (
        <LogbookMatrix rows={logbook.rows} path={PATH} sp={sp} selectedId={drawerId} />
      )}

      {view === "liste" && logbook.rows.length > 0 && (
        <p className="text-muted-foreground text-tiny touch:hidden">{t("keys")}</p>
      )}

      {drawerId && <PermitDrawer id={drawerId} closeHref={closeHref} />}
    </Page>
  );
}
