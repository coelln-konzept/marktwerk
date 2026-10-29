import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { KeyboardRows } from "@/components/ui/keyboard-rows";
import { Panel, PanelHeader, PanelTitle } from "@/components/ui/panel";
import { Table, TD, TGroup, TH, THead, TR } from "@/components/ui/table";
import { formatDate, formatDateShortYear, formatMoney, todayIn } from "@/lib/format";
import { hrefWith } from "@/lib/url";
import type { LogbookRow } from "@/server/queries/permits";
import { PermitStateBadge } from "./permit-state-badge";

const dash = <span className="text-faint-foreground">–</span>;

/**
 * The detailed view: per venue one table, grouped by category (Stadt / Extern), with the dates,
 * fee, stickers and who is responsible. A row opens the permit drawer (Enter) or previews it (Space).
 */
export async function LogbookList({
  rows,
  path,
  sp,
  selectedId,
}: {
  rows: LogbookRow[];
  path: string;
  sp: Record<string, string | string[] | undefined>;
  selectedId?: string;
}) {
  const t = await getTranslations("logbook");
  const tTypes = await getTranslations("permitTypes");
  const tCat = await getTranslations("permitCategories");
  const locale = await getLocale();
  const today = todayIn();

  const venues = [...new Set(rows.map((r) => r.venueId ?? ""))]
    .map((id) => ({
      id,
      name: rows.find((r) => (r.venueId ?? "") === id)?.venueName ?? "",
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "de"));

  return (
    <KeyboardRows className="flex flex-col gap-4">
      {venues.map((v) => {
        const own = rows.filter((r) => (r.venueId ?? "") === v.id);
        return (
          <Panel key={v.id || "none"} className="overflow-hidden">
            <PanelHeader className="py-2.5">
              <PanelTitle>
                {v.id ? (
                  <Link
                    href={`/orte/${v.id}` as never}
                    className="hover:text-accent-soft-foreground hover:underline"
                  >
                    {v.name}
                  </Link>
                ) : (
                  t("none")
                )}
              </PanelTitle>
              <span className="tabular text-muted-foreground text-small">
                {t("cellCount", { count: own.length })}
              </span>
            </PanelHeader>
            <Table>
              <caption className="sr-only">{t("listCaption")}</caption>
              <THead>
                <tr>
                  <TH>{t("cols.permit")}</TH>
                  <TH>{t("cols.status")}</TH>
                  <TH>{t("cols.applyBy")}</TH>
                  <TH>{t("cols.decision")}</TH>
                  <TH>{t("cols.validity")}</TH>
                  <TH className="text-right">{t("cols.fee")}</TH>
                  <TH className="text-right">{t("cols.stickers")}</TH>
                  <TH>{t("cols.responsible")}</TH>
                  <TH>{t("cols.events")}</TH>
                </tr>
              </THead>
              <tbody>
                {(["city", "external"] as const).flatMap((category) => {
                  const inCategory = own.filter((r) => r.category === category);
                  if (inCategory.length === 0) return [];
                  return [
                    <TGroup key={`g-${category}`} colSpan={9}>
                      {tCat(category)}
                    </TGroup>,
                    ...inCategory.map((r) => {
                      const peek = hrefWith(path, sp, { genehmigung: r.id });
                      return (
                        <TR
                          key={r.id}
                          tabIndex={0}
                          data-row
                          data-peek={peek}
                          data-href={peek}
                          aria-selected={selectedId === r.id}
                          className="outline-hidden focus-visible:bg-selected"
                        >
                          <TD className="max-w-64">
                            <Link
                              href={peek as never}
                              scroll={false}
                              tabIndex={-1}
                              className="font-semibold text-accent-soft-foreground hover:underline"
                            >
                              {r.title}
                            </Link>
                            <div className="text-muted-foreground text-tiny">
                              {tTypes(r.permitType)}
                              {r.season ? ` · ${t("season_label", { year: r.season })}` : ""}
                              {r.referenceNo ? ` · ${r.referenceNo}` : ""}
                            </div>
                          </TD>
                          <TD>
                            <PermitStateBadge state={r.state} />
                          </TD>
                          <TD className="tabular whitespace-nowrap">
                            {r.applyBy ? formatDateShortYear(r.applyBy, locale, today) : dash}
                          </TD>
                          <TD className="tabular whitespace-nowrap">
                            {r.expectedDecisionOn
                              ? formatDateShortYear(r.expectedDecisionOn, locale, today)
                              : dash}
                          </TD>
                          <TD className="tabular whitespace-nowrap">
                            {r.validFrom && r.validUntil
                              ? t("validity", {
                                  from: formatDate(r.validFrom, locale),
                                  until: formatDate(r.validUntil, locale),
                                })
                              : r.validUntil
                                ? t("validityUntil", { until: formatDate(r.validUntil, locale) })
                                : r.validFrom
                                  ? t("validityFrom", { from: formatDate(r.validFrom, locale) })
                                  : dash}
                          </TD>
                          <TD className="tabular whitespace-nowrap text-right">
                            {r.feeCents !== null ? (
                              formatMoney(r.feeCents, locale)
                            ) : r.typicalFeeCents !== null ? (
                              <span className="text-muted-foreground" title={t("feeTypicalHint")}>
                                {t("feeTypical", {
                                  amount: formatMoney(r.typicalFeeCents, locale),
                                })}
                              </span>
                            ) : (
                              dash
                            )}
                          </TD>
                          <TD className="tabular text-right">{r.stickers ?? dash}</TD>
                          <TD className="whitespace-nowrap">{r.responsibleName ?? dash}</TD>
                          <TD className="tabular whitespace-nowrap text-small">
                            {r.upcomingEvents > 0 ? (
                              <>
                                {t("eventsUpcoming", { count: r.upcomingEvents })}
                                {r.nextEventOn && (
                                  <span className="block text-muted-foreground text-tiny">
                                    {t("eventsNext", {
                                      date: formatDateShortYear(r.nextEventOn, locale, today),
                                    })}
                                  </span>
                                )}
                              </>
                            ) : (
                              <span className="text-muted-foreground">{t("eventsNone")}</span>
                            )}
                          </TD>
                        </TR>
                      );
                    }),
                  ];
                })}
              </tbody>
            </Table>
          </Panel>
        );
      })}
    </KeyboardRows>
  );
}
