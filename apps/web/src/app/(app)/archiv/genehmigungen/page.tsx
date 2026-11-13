import { SearchX } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { ArchiveFrame } from "@/components/archive/archive-frame";
import { PermitDrawer } from "@/components/permits/permit-drawer";
import { PermitStateBadge } from "@/components/permits/permit-state-badge";
import { formatPermitTitle } from "@/components/permits/permit-title";
import { KeyboardRows } from "@/components/ui/keyboard-rows";
import { PAGE_SIZE, Pager, pageOf } from "@/components/ui/pager";
import { Panel } from "@/components/ui/panel";
import { EmptyState } from "@/components/ui/states";
import { rowFocus, Table, TD, TH, THead, TR } from "@/components/ui/table";
import { formatDate, todayIn } from "@/lib/format";
import { hrefWith, param } from "@/lib/url";
import { getActor } from "@/server/actor";
import { listOldPermits } from "@/server/queries/archive";
import { requirePermission } from "@/server/session";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("archive"))("sections.permits") };
}

const PATH = "/archiv/genehmigungen";

/**
 * Archiv › Alte Genehmigungen: superseded, not required and run-out permits, newest validity first, 50 per page,
 * searchable. A row opens the permit drawer here (`?genehmigung=<id>`), where "Ersetzt" can be taken back.
 */
export default async function ArchivePermitsPage({
  searchParams,
}: PageProps<"/archiv/genehmigungen">) {
  await requirePermission("permit", "read");
  const actor = await getActor();
  const sp = await searchParams;
  const t = await getTranslations("archive.permits");
  const tTypes = await getTranslations("permitTypes");
  const locale = await getLocale();
  const today = todayIn();
  const q = param(sp.q)?.slice(0, 100);
  const first = await listOldPermits(actor, today, { q, page: 1, size: PAGE_SIZE });
  const page = pageOf(param(sp.seite), first.total);
  const { rows, total } =
    page === 1 ? first : await listOldPermits(actor, today, { q, page, size: PAGE_SIZE });
  const drawerId = param(sp.genehmigung);
  const none = <span className="text-faint-foreground">–</span>;

  return (
    <ArchiveFrame section="permits">
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
          className="min-h-(--control-h) w-72 rounded-lg border border-input bg-card px-3 max-sm:w-full"
        />
      </form>

      <Panel className="overflow-hidden">
        {rows.length === 0 ? (
          <EmptyState icon={SearchX} title={t("empty")}>
            {q && (
              <Link
                href={PATH as never}
                className="inline-flex min-h-8 items-center rounded-lg border border-input bg-card px-3 font-medium hover:bg-hover"
              >
                {t("reset")}
              </Link>
            )}
          </EmptyState>
        ) : (
          <KeyboardRows>
            <Table>
              <caption className="sr-only">{t("caption")}</caption>
              <THead>
                <tr>
                  <TH>{t("cols.permit")}</TH>
                  <TH>{t("cols.venue")}</TH>
                  <TH>{t("cols.state")}</TH>
                  <TH>{t("cols.validUntil")}</TH>
                  <TH>{t("cols.season")}</TH>
                </tr>
              </THead>
              <tbody>
                {rows.map((r) => {
                  const peek = hrefWith(PATH, sp, { genehmigung: r.id });
                  return (
                    <TR
                      key={r.id}
                      data-row
                      data-href={peek}
                      tabIndex={0}
                      aria-current={drawerId === r.id}
                      className={`cursor-pointer ${rowFocus}`}
                    >
                      <TD className="max-w-72">
                        <Link
                          href={peek as never}
                          scroll={false}
                          tabIndex={-1}
                          className="font-semibold text-accent-soft-foreground hover:underline"
                        >
                          {formatPermitTitle(r.title, locale)}
                        </Link>
                        <div className="text-muted-foreground text-tiny">
                          {tTypes(r.permitType as never)}
                          {r.referenceNo ? ` · ${r.referenceNo}` : ""}
                        </div>
                      </TD>
                      <TD className="text-foreground-2 text-small">{r.venueName ?? none}</TD>
                      <TD>
                        <PermitStateBadge state={r.state} />
                      </TD>
                      <TD className="tabular text-small">
                        {r.validUntil ? formatDate(r.validUntil, locale) : none}
                      </TD>
                      <TD className="tabular text-small">{r.season ?? none}</TD>
                    </TR>
                  );
                })}
              </tbody>
            </Table>
          </KeyboardRows>
        )}
      </Panel>
      <Pager
        page={page}
        total={total}
        href={(n) => hrefWith(PATH, sp, { seite: n === 1 ? undefined : n, genehmigung: undefined })}
      />
      {drawerId && (
        <PermitDrawer id={drawerId} closeHref={hrefWith(PATH, sp, { genehmigung: undefined })} />
      )}
    </ArchiveFrame>
  );
}
