import { Check, SearchX } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { TagList } from "@/components/people/duty-tags";
import { VendorVorschau } from "@/components/people/vendor-vorschau";
import { Page, PageHeader } from "@/components/shell/page";
import { FilterBar, FilterChip, FilterChips, FilterGroup } from "@/components/ui/filter-bar";
import { KeyboardRows } from "@/components/ui/keyboard-rows";
import { Panel } from "@/components/ui/panel";
import { EmptyState } from "@/components/ui/states";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { formatNumber } from "@/lib/format";
import { hrefWith, param } from "@/lib/url";
import { cn } from "@/lib/utils";
import {
  countByCategory,
  countVendors,
  listVendors,
  VENDOR_CATEGORIES,
  VENDOR_PAGE_SIZE,
} from "@/server/queries/vendors";
import { requirePermission } from "@/server/session";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("nav"))("vendors") };
}

const PATH = "/aussteller";

export default async function VendorsPage({ searchParams }: PageProps<"/aussteller">) {
  await requirePermission("vendor", "read");
  const sp = await searchParams;
  const [t, tNav, tCat, locale] = await Promise.all([
    getTranslations("vendors"),
    getTranslations("nav"),
    getTranslations("vendors.category"),
    getLocale(),
  ]);

  const q = param(sp.q)?.slice(0, 100);
  const categoryParam = param(sp.kategorie);
  const category = (VENDOR_CATEGORIES as readonly string[]).includes(categoryParam ?? "")
    ? categoryParam
    : undefined;
  const regular = param(sp.stamm) === "1";
  const car = param(sp.auto) === "1";
  const filters = { q, category, regular, car };
  const requestedPage = Math.max(1, Math.floor(Number(param(sp.seite))) || 1);

  const [{ rows: first, total }, counts, imported] = await Promise.all([
    listVendors(filters, requestedPage),
    countByCategory(filters),
    countVendors(),
  ]);
  const pages = Math.max(1, Math.ceil(total / VENDOR_PAGE_SIZE));
  const page = Math.min(requestedPage, pages);
  // A page number beyond the end (stale link): show the last page.
  const rows = page === requestedPage ? first : (await listVendors(filters, page)).rows;
  const vorschauId = param(sp.vorschau);
  const closeHref = hrefWith(PATH, sp, { vorschau: undefined });
  const from = total === 0 ? 0 : (page - 1) * VENDOR_PAGE_SIZE + 1;
  const to = Math.min(page * VENDOR_PAGE_SIZE, total);
  // Filters reset the page; opening a Vorschau keeps it.
  const withFilter = (patch: Record<string, string | number | undefined>) =>
    hrefWith(PATH, sp, { seite: undefined, vorschau: undefined, ...patch });
  const pageHref = (n: number) =>
    hrefWith(PATH, sp, { seite: n === 1 ? undefined : n, vorschau: undefined });
  const none = <span className="text-faint-foreground">{t("noValue")}</span>;

  return (
    <Page crumbs={[{ label: tNav("vendors") }]}>
      <PageHeader
        title={t("title")}
        subtitle={t("subtitle", { count: formatNumber(imported, locale, 0) })}
      />

      <form method="get" action={PATH} className="flex flex-wrap items-center gap-2">
        {category && <input type="hidden" name="kategorie" value={category} />}
        {regular && <input type="hidden" name="stamm" value="1" />}
        {car && <input type="hidden" name="auto" value="1" />}
        <label className="sr-only" htmlFor="q">
          {t("search")}
        </label>
        <input
          id="q"
          name="q"
          type="search"
          defaultValue={q}
          placeholder={t("search")}
          className="min-h-(--control-h) w-full rounded-lg border border-input bg-card px-3 sm:w-80"
        />
      </form>

      <FilterBar>
        <FilterGroup label={t("categories")} wide>
          <FilterChips>
            <FilterChip
              href={withFilter({ kategorie: undefined })}
              active={!category}
              count={counts.total}
            >
              {t("all")}
            </FilterChip>
            {VENDOR_CATEGORIES.map((c) => (
              <FilterChip
                key={c}
                href={withFilter({ kategorie: c })}
                active={category === c}
                count={counts.byCategory[c] ?? 0}
              >
                {tCat(c)}
              </FilterChip>
            ))}
          </FilterChips>
        </FilterGroup>
        <FilterGroup label={t("filters")}>
          <FilterChips>
            <FilterChip href={withFilter({ stamm: regular ? undefined : 1 })} active={regular}>
              {t("regular")}
            </FilterChip>
            <FilterChip href={withFilter({ auto: car ? undefined : 1 })} active={car}>
              {t("withCar")}
            </FilterChip>
          </FilterChips>
        </FilterGroup>
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
              <caption className="sr-only">{t("caption", { page, pages })}</caption>
              <THead>
                <tr>
                  <TH>{t("cols.name")}</TH>
                  <TH>{t("cols.categories")}</TH>
                  <TH>{t("cols.city")}</TH>
                  <TH>{t("cols.regular")}</TH>
                </tr>
              </THead>
              <tbody>
                {rows.map((v) => {
                  const peek = hrefWith(PATH, sp, { vorschau: v.id });
                  return (
                    <TR
                      key={v.id}
                      tabIndex={0}
                      data-row
                      data-href={peek}
                      data-peek={peek}
                      aria-selected={vorschauId === v.id}
                      className="outline-hidden focus-visible:bg-selected"
                    >
                      <TD className="min-w-44">
                        <Link
                          href={peek as never}
                          scroll={false}
                          tabIndex={-1}
                          className="block font-semibold text-accent-soft-foreground hover:underline"
                        >
                          {v.displayName}
                        </Link>
                        {v.companyName && v.companyName !== v.displayName && (
                          <span className="block text-muted-foreground text-small">
                            {v.companyName}
                          </span>
                        )}
                      </TD>
                      <TD>
                        <TagList
                          items={v.categories.map((c) => tCat(c as never))}
                          empty={t("noValue")}
                        />
                      </TD>
                      <TD className="whitespace-nowrap">{v.city ?? none}</TD>
                      <TD>
                        {v.isRegular ? (
                          <span className="inline-flex flex-col items-start gap-0.5 whitespace-nowrap">
                            <StatusBadge tone="info" icon={Check}>
                              {t("regularBadge")}
                            </StatusBadge>
                            {v.regularSpot && (
                              <span className="text-muted-foreground text-tiny">
                                {v.regularSpot}
                              </span>
                            )}
                          </span>
                        ) : (
                          none
                        )}
                      </TD>
                    </TR>
                  );
                })}
              </tbody>
            </Table>
          </KeyboardRows>
        )}
        {total > 0 && (
          <nav
            aria-label={t("pagination.label")}
            className="flex flex-wrap items-center justify-between gap-3 border-border-subtle border-t px-4 py-3 text-small"
          >
            <span className="tabular text-muted-foreground">
              {t("pagination.range", {
                from: formatNumber(from, locale, 0),
                to: formatNumber(to, locale, 0),
                total: formatNumber(total, locale, 0),
              })}
            </span>
            <span className="inline-flex items-center gap-2">
              <PageLink href={page > 1 ? pageHref(page - 1) : undefined} rel="prev">
                ‹ {t("pagination.prev")}
              </PageLink>
              <span aria-current="page" className="tabular px-1 font-medium">
                {t("pagination.status", { page, pages })}
              </span>
              <PageLink href={page < pages ? pageHref(page + 1) : undefined} rel="next">
                {t("pagination.next")} ›
              </PageLink>
            </span>
          </nav>
        )}
      </Panel>

      <p className="hidden text-muted-foreground text-tiny md:block">{t("keys")}</p>

      {vorschauId && <VendorVorschau id={vorschauId} closeHref={closeHref} />}
    </Page>
  );
}

/** Previous/next link; a disabled one stays in the layout as plain muted text. */
function PageLink({
  href,
  rel,
  children,
}: {
  href?: string;
  rel: "prev" | "next";
  children: React.ReactNode;
}) {
  const cls = "inline-flex min-h-8 items-center rounded-lg px-3 font-medium";
  if (!href)
    return (
      <span aria-disabled="true" className={cn(cls, "text-faint-foreground")}>
        {children}
      </span>
    );
  return (
    <Link
      href={href as never}
      rel={rel}
      scroll={false}
      className={cn(cls, "border border-input bg-card hover:bg-hover")}
    >
      {children}
    </Link>
  );
}
