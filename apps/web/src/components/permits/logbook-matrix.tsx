import { DISPLAY_STATE_SEVERITY, isHeld, isUnfiled } from "@marktwerk/core";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useDueText } from "@/components/ui/due-badge";
import { Panel } from "@/components/ui/panel";
import { ScrollX } from "@/components/ui/scroll-x";
import { TH, THead, TR } from "@/components/ui/table";
import { formatDateShortYear, todayIn } from "@/lib/format";
import { PERMIT_TYPE_KEYS } from "@/lib/permit-status";
import { hrefWith } from "@/lib/url";
import { cn } from "@/lib/utils";
import type { LogbookRow } from "@/server/queries/permits";
import { PermitStateBadge } from "./permit-state-badge";

type Category = LogbookRow["category"];

/** The most urgent permit of a cell: worst state first, then the earliest deadline. */
function worst(rows: LogbookRow[]): LogbookRow {
  return [...rows].sort(
    (a, b) =>
      DISPLAY_STATE_SEVERITY[a.state] - DISPLAY_STATE_SEVERITY[b.state] ||
      (a.applyBy ?? "9999").localeCompare(b.applyBy ?? "9999"),
  )[0] as LogbookRow;
}

/** "04.03." / "04.03.2027": a date without weekday, the year only when it is not the current one. */
const dayMonth = (date: string, locale: string, today: string) =>
  formatDateShortYear(date, locale, today).replace(/^\S+\s/, "");

/**
 * What a cell says beyond the state: the earliest apply-by date of the permits still to be filed, and how
 * many of the upcoming events the permits of the cell cover ("7/7", granted ones count as covering).
 */
function cellFacts(cell: LogbookRow[]) {
  const dates = cell
    .filter((r) => isUnfiled(r.status) && r.applyBy)
    .map((r) => r.applyBy as string)
    .sort();
  const total = cell.reduce((sum, r) => sum + r.upcomingEvents, 0);
  const held = cell.reduce((sum, r) => sum + (isHeld(r.state) ? r.upcomingEvents : 0), 0);
  return { until: dates[0] ?? null, total, held };
}

/**
 * The status quo at a glance: venues × permit types, grouped Stadt | Extern. Each cell shows the most
 * urgent permit as icon + text (never colour alone) and opens it in the drawer; the matrix stays visible.
 * Open cells add the earliest "bis 04.03." (apply-by), granted ones and cells with several permits the
 * coverage "7/7"; the legend below explains both and the "–".
 */
export function LogbookMatrix({
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
  const t = useTranslations("logbook");
  const tTypes = useTranslations("permitTypes");
  const tState = useTranslations("permitStatus");
  const tCat = useTranslations("permitCategories");
  const locale = useLocale();
  const dueText = useDueText();
  const today = todayIn();

  const venues = [
    ...new Map(
      rows.filter((r) => r.venueId).map((r) => [r.venueId as string, r.venueName ?? ""]),
    ).entries(),
  ].sort((a, b) => a[1].localeCompare(b[1], "de"));
  const columns = (category: Category) =>
    PERMIT_TYPE_KEYS.filter((type) =>
      rows.some((r) => r.category === category && r.permitType === type),
    );
  const groups = (["city", "external"] as const)
    .map((category) => ({ category, types: columns(category) }))
    .filter((g) => g.types.length > 0);
  const unassigned = rows.filter((r) => !r.venueId);

  return (
    <Panel className="overflow-hidden">
      <ScrollX hint={t("scrollHint")} label={t("matrixCaption")}>
        <table className="w-full border-collapse text-left">
          <caption className="sr-only">{t("matrixCaption")}</caption>
          <THead>
            <tr>
              <TH rowSpan={2} className="sticky left-0 z-[3] min-w-40 bg-surface-2">
                {t("venueCol")}
              </TH>
              {groups.map((g) => (
                <th
                  key={g.category}
                  scope="colgroup"
                  colSpan={g.types.length}
                  className="h-8 border-b border-l px-3 text-left font-semibold text-foreground-2 text-tiny"
                >
                  {tCat(g.category)}
                </th>
              ))}
            </tr>
            <tr>
              {groups.flatMap((g) =>
                g.types.map((type, index) => (
                  <TH
                    key={`${g.category}-${type}`}
                    className={cn(
                      "whitespace-normal px-2 align-bottom leading-tight",
                      index === 0 && "border-l",
                    )}
                  >
                    {tTypes(type)}
                  </TH>
                )),
              )}
            </tr>
          </THead>
          <tbody>
            {venues.map(([venueId, venueName]) => (
              <TR key={venueId}>
                <th
                  scope="row"
                  className="sticky left-0 z-[1] h-row min-w-40 max-w-56 bg-card px-3 py-(--cell-y) text-left font-semibold group-hover/row:bg-hover"
                >
                  <Link
                    href={`/orte/${venueId}` as never}
                    className="hover:text-accent-soft-foreground hover:underline"
                  >
                    {venueName}
                  </Link>
                </th>
                {groups.flatMap((g) =>
                  g.types.map((type, index) => {
                    const cell = rows.filter(
                      (r) =>
                        r.venueId === venueId && r.category === g.category && r.permitType === type,
                    );
                    const top = cell.length > 0 ? worst(cell) : null;
                    const facts = cellFacts(cell);
                    const showCoverage =
                      facts.total > 0 && top !== null && (cell.length > 1 || isHeld(top.state));
                    const overdue = facts.until !== null && facts.until < today;
                    // Tooltip and screen reader get the words the cell abbreviates.
                    const detail = [
                      facts.until
                        ? `${t("cellDetailUntil", { date: dayMonth(facts.until, locale, today) })} (${dueText(facts.until, today)})`
                        : null,
                      showCoverage
                        ? t("cellDetailCoverage", { held: facts.held, total: facts.total })
                        : null,
                      cell.length > 1 ? t("cellCount", { count: cell.length }) : null,
                    ]
                      .filter(Boolean)
                      .join(", ");
                    return (
                      <td
                        key={`${g.category}-${type}`}
                        className={`h-row px-2 py-(--cell-y) align-middle ${index === 0 ? "border-l" : ""}`}
                      >
                        {top === null ? (
                          <span className="text-faint-foreground" title={t("noPermit")}>
                            <span aria-hidden>{t("none")}</span>
                            <span className="sr-only">{t("noPermit")}</span>
                          </span>
                        ) : (
                          <Link
                            href={hrefWith(path, sp, { genehmigung: top.id }) as never}
                            scroll={false}
                            title={detail || undefined}
                            aria-label={
                              detail
                                ? t("cellOpenDetail", {
                                    venue: venueName,
                                    type: tTypes(type),
                                    state: tState(top.state),
                                    detail,
                                  })
                                : t("cellOpen", {
                                    venue: venueName,
                                    type: tTypes(type),
                                    state: tState(top.state),
                                  })
                            }
                            aria-current={
                              cell.some((c) => c.id === selectedId) ? "true" : undefined
                            }
                            className="inline-flex flex-col items-start gap-0.5 rounded-lg focus-visible:outline-2 focus-visible:outline-ring aria-[current=true]:ring-2 aria-[current=true]:ring-ring"
                          >
                            <PermitStateBadge state={top.state} />
                            {(facts.until || showCoverage) && (
                              <span
                                aria-hidden
                                className="tabular flex items-center gap-1.5 whitespace-nowrap px-1 text-tiny"
                              >
                                {facts.until && (
                                  <span
                                    className={
                                      overdue ? "text-status-critical" : "text-muted-foreground"
                                    }
                                  >
                                    {t("cellUntil", {
                                      date: dayMonth(facts.until, locale, today),
                                    })}
                                  </span>
                                )}
                                {showCoverage && (
                                  <span className="text-muted-foreground">
                                    {t("cellCoverage", { held: facts.held, total: facts.total })}
                                  </span>
                                )}
                              </span>
                            )}
                          </Link>
                        )}
                      </td>
                    );
                  }),
                )}
              </TR>
            ))}
          </tbody>
        </table>
      </ScrollX>
      {unassigned.length > 0 && (
        <p className="border-t px-4 py-2 text-muted-foreground text-small">
          {t("cellCount", { count: unassigned.length })} · {t("venueCol")}: {t("none")}
        </p>
      )}
      <div className="flex flex-col gap-1 border-t px-4 py-2 text-muted-foreground text-tiny">
        <p className="font-semibold text-foreground-2">{t("legendTitle")}</p>
        <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
          <li>{t("legendCell")}</li>
          <li>{t("legendUntil")}</li>
          <li>{t("legendCoverage")}</li>
          <li>{t("legendNone")}</li>
        </ul>
      </div>
    </Panel>
  );
}
