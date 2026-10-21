import { can, type PermitDisplayState } from "@marktwerk/core";
import { Building2, SearchX } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { LogbookList } from "@/components/permits/logbook-list";
import { LogbookMatrix } from "@/components/permits/logbook-matrix";
import { NewPermitDialog } from "@/components/permits/new-permit-dialog";
import { PermitDrawer } from "@/components/permits/permit-drawer";
import { Page, PageHeader } from "@/components/shell/page";
import { AutoSubmitSelect } from "@/components/ui/auto-submit";
import { buttonVariants } from "@/components/ui/button";
import { FilterChip } from "@/components/ui/chip";
import { Panel } from "@/components/ui/panel";
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
  return { title: (await getTranslations("nav"))("logbook") };
}

const PATH = "/logbuch";

const isState = (value: string | undefined): value is PermitDisplayState =>
  PERMIT_STATE_ORDER.includes(value as PermitDisplayState);
const isFocus = (value: string | undefined): value is LogbookFocus =>
  (LOGBOOK_FOCUS as readonly string[]).includes(value ?? "");

/**
 * Logbuch: the status quo of the company's permits, per venue and category (Stadt / Extern), as a
 * matrix or a list. Filters (Ort, Kategorie, Saison, Status) and the focus chips live in the URL; a
 * permit opens in the drawer (`?genehmigung=<id>`) next to the table.
 */
export default async function LogbuchPage({ searchParams }: PageProps<"/logbuch">) {
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
        : Number(today.slice(0, 4));
  const stateParam = param(sp.status);
  const state = isState(stateParam) ? stateParam : undefined;
  const focusParam = param(sp.fokus);
  const focus = isFocus(focusParam) ? focusParam : undefined;
  const view = param(sp.ansicht) === "liste" ? "liste" : "matrix";
  const drawerId = param(sp.genehmigung);

  const logbook = await listLogbook(actor, { venueId, category, season, state, focus }, today);
  const filtered = Boolean(venueId || category || state || focus || season === null);
  const seasons = [...new Set([Number(today.slice(0, 4)), ...logbook.seasons])].sort(
    (a, b) => b - a,
  );
  const venueCount = new Set(logbook.rows.map((r) => r.venueId)).size;
  const missing =
    logbook.counts.missing +
    logbook.counts.preparing +
    logbook.counts.rejected +
    logbook.counts.expired;
  const expiring = logbook.counts.expiring + logbook.counts.expired;
  const closeHref = hrefWith(PATH, sp, { genehmigung: undefined });
  const reset = view === "liste" ? `${PATH}?ansicht=liste` : PATH;

  return (
    <Page crumbs={[{ label: t("title") }]}>
      <PageHeader
        title={t("title")}
        subtitle={t("subtitle", { count: logbook.rows.length, venues: venueCount })}
        actions={canWrite && <NewPermitDialog venues={logbook.venues} />}
      />

      <form method="get" action={PATH} className="flex flex-wrap items-center gap-2">
        {view === "liste" && <input type="hidden" name="ansicht" value="liste" />}
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
          defaultValue={season === null ? "alle" : String(season)}
        >
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
        {/* biome-ignore lint/a11y/useSemanticElements: a labelled group of links, not form controls */}
        <span className="ml-auto flex gap-1" role="group" aria-label={t("view")}>
          <FilterChip href={hrefWith(PATH, sp, { ansicht: undefined })} active={view === "matrix"}>
            {t("viewMatrix")}
          </FilterChip>
          <FilterChip href={hrefWith(PATH, sp, { ansicht: "liste" })} active={view === "liste"}>
            {t("viewList")}
          </FilterChip>
        </span>
      </form>

      {/* biome-ignore lint/a11y/useSemanticElements: a labelled group of links, not form controls */}
      <div className="flex flex-wrap gap-2" role="group" aria-label={t("focus")}>
        <FilterChip
          href={hrefWith(PATH, sp, { fokus: undefined, status: undefined, genehmigung: undefined })}
          active={!focus && !state}
        >
          {t("focusAll")}
        </FilterChip>
        <FilterChip
          href={hrefWith(PATH, sp, { fokus: "fehlt", status: undefined, genehmigung: undefined })}
          active={focus === "fehlt"}
          count={missing}
        >
          {t("focusMissing")}
        </FilterChip>
        <FilterChip
          href={hrefWith(PATH, sp, {
            fokus: "ablaufend",
            status: undefined,
            genehmigung: undefined,
          })}
          active={focus === "ablaufend"}
          count={expiring}
        >
          {t("focusExpiring")}
        </FilterChip>
        <span aria-hidden className="mx-1 self-center text-faint-foreground">
          |
        </span>
        {PERMIT_STATE_ORDER.filter((s) => logbook.counts[s] > 0 || s === state).map((s) => (
          <FilterChip
            key={s}
            href={hrefWith(PATH, sp, { status: s, fokus: undefined, genehmigung: undefined })}
            active={state === s}
            count={logbook.counts[s]}
          >
            {tState(s)}
          </FilterChip>
        ))}
      </div>

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
        <LogbookList rows={logbook.rows} path={PATH} sp={sp} selectedId={drawerId} />
      ) : (
        <LogbookMatrix rows={logbook.rows} path={PATH} sp={sp} selectedId={drawerId} />
      )}

      {view === "liste" && logbook.rows.length > 0 && (
        <p className="text-muted-foreground text-tiny">{t("keys")}</p>
      )}

      {drawerId && <PermitDrawer id={drawerId} closeHref={closeHref} />}
    </Page>
  );
}
