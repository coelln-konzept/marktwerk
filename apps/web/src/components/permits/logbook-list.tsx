import {
  isUnfiled,
  type PermitListGroup,
  type PermitSort,
  permitHorizonEnd,
  permitListGroup,
  sortPermits,
} from "@marktwerk/core";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { DueBadge } from "@/components/ui/due-badge";
import { KeyboardRows } from "@/components/ui/keyboard-rows";
import { Panel } from "@/components/ui/panel";
import { Segments } from "@/components/ui/segmented-links";
import { Table, TD, TGroup, TH, THead, TR } from "@/components/ui/table";
import { formatDate, formatDateShortYear, formatMoney, todayIn } from "@/lib/format";
import { hrefWith } from "@/lib/url";
import type { LogbookRow } from "@/server/queries/permits";
import { PermitStateBadge } from "./permit-state-badge";
import { formatPermitTitle } from "./permit-title";

const dash = <span className="text-faint-foreground">–</span>;

const SORT_LABELS = { antrag: "applyBy", ort: "venue", status: "status", markt: "events" } as const;

/**
 * The detailed view: one table, by default sorted by "Antrag bis" and split into "Jetzt beantragen (bis …)",
 * "Später beantragen" and "Beantragt und erledigt" (what to file next is the office's real question).
 * Other sorts are flat. A row opens the permit drawer (Enter) or previews it (Space). Below `md` only
 * the permit with its state and deadline is shown: the other columns need more room than a phone has.
 */
export async function LogbookList({
  rows,
  path,
  sp,
  selectedId,
  sort,
  horizonDays,
}: {
  rows: LogbookRow[];
  path: string;
  sp: Record<string, string | string[] | undefined>;
  selectedId?: string;
  sort: PermitSort;
  horizonDays: number;
}) {
  const t = await getTranslations("logbook");
  const tTypes = await getTranslations("permitTypes");
  const tCat = await getTranslations("permitCategories");
  const locale = await getLocale();
  const today = todayIn();

  const sorted = sortPermits(rows, sort);
  const groups: { key: PermitListGroup | "all"; rows: LogbookRow[] }[] =
    sort === "antrag"
      ? (["now", "later", "other"] as const)
          .map((key) => ({ key, rows: sorted.filter((r) => permitListGroup(r) === key) }))
          .filter((g) => g.rows.length > 0)
      : [{ key: "all", rows: sorted }];
  const groupLabel = (key: PermitListGroup | "all") =>
    key === "now"
      ? t("groups.now", {
          date: formatDateShortYear(permitHorizonEnd(today, horizonDays), locale, today),
        })
      : key === "later"
        ? t("groups.later")
        : t("groups.other");

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 text-small">
        <span className="font-medium text-muted-foreground text-tiny">{t("sortLabel")}</span>
        <Segments
          items={(Object.keys(SORT_LABELS) as PermitSort[]).map((key) => ({
            key,
            label: t(`cols.${SORT_LABELS[key]}`),
            href: hrefWith(path, sp, { sort: key === "antrag" ? undefined : key }),
            active: sort === key,
          }))}
        />
      </div>
      <KeyboardRows>
        <Panel className="overflow-hidden">
          <Table>
            <caption className="sr-only">
              {t("listCaption")} {t("sortedBy", { column: t(`cols.${SORT_LABELS[sort]}`) })}
            </caption>
            <THead>
              <tr>
                <TH>{t("cols.permit")}</TH>
                <TH className="max-md:hidden">{t("cols.status")}</TH>
                <TH className="max-md:hidden">{t("cols.applyBy")}</TH>
                <TH className="max-2xl:hidden">{t("cols.decision")}</TH>
                <TH className="max-md:hidden">{t("cols.validity")}</TH>
                <TH className="text-right max-md:hidden">{t("cols.fee")}</TH>
                <TH className="text-right max-2xl:hidden">{t("cols.stickers")}</TH>
                <TH className="max-md:hidden">{t("cols.responsible")}</TH>
                <TH className="max-md:hidden">{t("cols.events")}</TH>
              </tr>
            </THead>
            <tbody>
              {groups.flatMap((group) => [
                ...(group.key === "all"
                  ? []
                  : [
                      <TGroup key={`g-${group.key}`} colSpan={9}>
                        {groupLabel(group.key)} · {group.rows.length}
                      </TGroup>,
                    ]),
                ...group.rows.map((r) => {
                  const peek = hrefWith(path, sp, { genehmigung: r.id });
                  const unfiled = isUnfiled(r.status);
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
                          {formatPermitTitle(r.title, locale)}
                        </Link>
                        <div className="text-muted-foreground text-tiny">
                          {[
                            r.venueName,
                            `${tCat(r.category)} · ${tTypes(r.permitType)}`,
                            r.season ? t("season_label", { year: r.season }) : null,
                            r.referenceNo,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-2 md:hidden">
                          <PermitStateBadge state={r.state} />
                          {unfiled && r.applyBy && (
                            <span className="inline-flex items-center gap-1 text-tiny">
                              <span className="text-muted-foreground">{t("cols.applyBy")}</span>
                              <DueBadge dueOn={r.applyBy} today={today} withDate />
                            </span>
                          )}
                        </div>
                      </TD>
                      <TD className="max-md:hidden">
                        <PermitStateBadge state={r.state} />
                      </TD>
                      <TD className="tabular whitespace-nowrap max-md:hidden">
                        {r.applyBy ? (
                          unfiled ? (
                            <DueBadge dueOn={r.applyBy} today={today} withDate />
                          ) : (
                            <span className="text-muted-foreground">
                              {formatDateShortYear(r.applyBy, locale, today)}
                            </span>
                          )
                        ) : (
                          dash
                        )}
                      </TD>
                      <TD className="tabular whitespace-nowrap max-2xl:hidden">
                        {r.expectedDecisionOn
                          ? formatDateShortYear(r.expectedDecisionOn, locale, today)
                          : dash}
                      </TD>
                      {/* May wrap ("01.01.2027 bis / 31.12.2027"): nowrap made the table wider than its panel at 1440 px. */}
                      <TD className="tabular min-w-28 max-md:hidden">
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
                      <TD className="tabular whitespace-nowrap text-right max-md:hidden">
                        {r.feeCents !== null ? (
                          formatMoney(r.feeCents, locale)
                        ) : r.typicalFeeCents ? (
                          <span className="text-muted-foreground" title={t("feeTypicalHint")}>
                            {t("feeTypical", { amount: formatMoney(r.typicalFeeCents, locale) })}
                          </span>
                        ) : (
                          dash
                        )}
                      </TD>
                      <TD className="tabular text-right max-2xl:hidden">{r.stickers ?? dash}</TD>
                      <TD className="whitespace-nowrap max-md:hidden">
                        {r.responsibleName ?? dash}
                      </TD>
                      <TD className="tabular whitespace-nowrap text-small max-md:hidden">
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
              ])}
            </tbody>
          </Table>
        </Panel>
      </KeyboardRows>
    </div>
  );
}
