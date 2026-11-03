import { can } from "@marktwerk/core";
import { Eye, Plus, SearchX } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { VenueVorschau } from "@/components/catalogue/venue-vorschau";
import { Page, PageHeader } from "@/components/shell/page";
import { buttonVariants } from "@/components/ui/button";
import { KeyboardRows } from "@/components/ui/keyboard-rows";
import { Panel } from "@/components/ui/panel";
import { EmptyState } from "@/components/ui/states";
import { RowActions, Table, TD, TH, THead, TR } from "@/components/ui/table";
import { todayIn } from "@/lib/format";
import { hrefWith, param } from "@/lib/url";
import { cn } from "@/lib/utils";
import { getActor } from "@/server/actor";
import { listVenues } from "@/server/queries/venues";
import { requirePermission } from "@/server/session";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("nav"))("venues") };
}

const PATH = "/orte";

export default async function VenuesPage({ searchParams }: PageProps<"/orte">) {
  await requirePermission("venue", "read");
  const actor = await getActor();
  const sp = await searchParams;
  const t = await getTranslations("venues");
  const tm = await getTranslations("venues.manage");
  const q = param(sp.q)?.slice(0, 100);
  const vorschauId = param(sp.vorschau);
  const rows = await listVenues(actor, todayIn(), q);
  const showUpcoming = rows.some((r) => r.upcoming !== null);

  return (
    <Page crumbs={[{ label: t("title") }]}>
      <PageHeader
        title={t("title")}
        subtitle={
          q ? (
            // A search says what it found ("0 Treffer für …") and offers the way back, instead of "0 Orte".
            <>
              {t("subtitleSearch", { count: rows.length, query: q })}
              {" · "}
              <Link
                href={hrefWith(PATH, sp, { q: undefined, vorschau: undefined }) as never}
                className="font-medium text-accent-soft-foreground hover:underline"
              >
                {t("resetSearch")}
              </Link>
            </>
          ) : (
            t("subtitle", { count: rows.length })
          )
        }
        actions={
          can(actor.role, "venue", "write") ? (
            <Link href={"/orte/neu" as never} className={buttonVariants({ variant: "default" })}>
              <Plus aria-hidden />
              {tm("new")}
            </Link>
          ) : undefined
        }
      />

      <form method="get" action={PATH} className="flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor="q">
          {t("search")}
        </label>
        <input
          id="q"
          name="q"
          type="search"
          defaultValue={q}
          placeholder={t("search")}
          className="min-h-(--control-h) w-72 max-w-full rounded-lg border border-input bg-card px-3"
        />
      </form>

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
                  <TH>{t("cols.name")}</TH>
                  <TH>{t("cols.city")}</TH>
                  {showUpcoming && (
                    <TH className="text-right" title={t("upcomingTitle")}>
                      {t("cols.upcoming")}
                    </TH>
                  )}
                  <TH>
                    <span className="sr-only">{t("cols.actions")}</span>
                  </TH>
                </tr>
              </THead>
              <tbody>
                {rows.map((r) => {
                  const href = `${PATH}/${r.id}`;
                  const peek = hrefWith(PATH, sp, { vorschau: r.id });
                  return (
                    <TR
                      key={r.id}
                      tabIndex={0}
                      data-row
                      data-href={href}
                      data-peek={peek}
                      aria-selected={vorschauId === r.id}
                      className={cn("outline-hidden focus-visible:bg-selected")}
                    >
                      <TD className="max-w-72 truncate" title={r.name}>
                        <Link
                          href={href as never}
                          tabIndex={-1}
                          className="font-semibold text-accent-soft-foreground hover:underline"
                        >
                          {r.name}
                        </Link>
                      </TD>
                      <TD className="whitespace-nowrap">{r.city}</TD>
                      {showUpcoming && (
                        <TD className="tabular text-right">{r.upcoming ?? t("none")}</TD>
                      )}
                      <TD className="w-12">
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

      <p className="touch:hidden text-muted-foreground text-tiny">{t("keys")}</p>

      {vorschauId && (
        <VenueVorschau id={vorschauId} closeHref={hrefWith(PATH, sp, { vorschau: undefined })} />
      )}
    </Page>
  );
}
