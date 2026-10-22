import { isoWeek, weekday } from "@marktwerk/core";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Avatar } from "@/components/ui/avatar";
import { KeyboardRows } from "@/components/ui/keyboard-rows";
import { Panel, PanelFooter, PanelHeader, PanelTitle } from "@/components/ui/panel";
import { formatHours, formatMoney, formatNumber } from "@/lib/format";
import { hrefWith } from "@/lib/url";
import { cn } from "@/lib/utils";
import { type MonthFigures, monthDays } from "@/server/queries/hours";
import { PersonStatusBadge, personLevel } from "./month-status";

const WEEKDAYS_DE = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
const WEEKDAYS_EN = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

/**
 * People × days of one month (hours per day), with hours, pay, the Minijob allowance, overrun months
 * and a status per person. A cell opens the shifts of that person and day; the status opens the
 * Vorschau with the justification.
 */
export async function MonthGrid({
  figures,
  path,
  sp,
}: {
  figures: MonthFigures;
  path: string;
  sp: Record<string, string | string[] | undefined>;
}) {
  const [t, tContract, locale] = await Promise.all([
    getTranslations("hours.grid"),
    getTranslations("hours.contract"),
    getLocale(),
  ]);
  const days = monthDays(figures.month);
  const names = locale === "en" ? WEEKDAYS_EN : WEEKDAYS_DE;
  const month = figures.month.slice(0, 7);
  const personId = typeof sp.person === "string" ? sp.person : undefined;
  const params = figures.params;
  const totalMinutes = figures.rows.reduce((sum, r) => sum + r.month.totalMinutes, 0);
  const totalCents = figures.rows.reduce((sum, r) => sum + r.month.grossCents, 0);
  const cellHours = (minutes: number) => formatNumber(minutes / 60, locale, 2);

  return (
    <Panel aria-labelledby="grid-title" className="overflow-hidden">
      <PanelHeader>
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <PanelTitle id="grid-title">{t("title")}</PanelTitle>
          <span className="text-faint-foreground text-tiny">{t("hint")}</span>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-muted-foreground text-tiny">
          <span className="flex items-center gap-1">
            <span className="size-3.5 rounded-sm bg-sunken shadow-[inset_0_0_0_1px_var(--border)]" />
            {t("legend.weekend")}
          </span>
          <span className="flex items-center gap-1">
            <span className="size-3.5 rounded-sm bg-status-warn-bg" />
            {t("legend.holiday")}
          </span>
          <span className="flex items-center gap-1">
            <span className="size-3.5 rounded-sm bg-status-critical-bg shadow-[inset_0_0_0_1px_var(--status-critical)]" />
            {t("legend.overTen")}
          </span>
        </div>
      </PanelHeader>
      {figures.rows.length === 0 ? (
        <p className="m-0 px-4 py-8 text-center text-muted-foreground">{t("empty")}</p>
      ) : (
        <KeyboardRows>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1500px] border-collapse text-left">
              <caption className="sr-only">{t("caption")}</caption>
              <thead className="bg-surface-2">
                <tr>
                  <th
                    scope="col"
                    className="sticky left-0 z-[2] bg-surface-2 px-3 py-1 text-tiny text-faint-foreground"
                  >
                    <span className="sr-only">{t("cols.kw")}</span>
                  </th>
                  {days.map((d) => {
                    const monday = weekday(d.date) === 1 || d.date === days[0]?.date;
                    return (
                      <th
                        key={d.date}
                        scope="col"
                        className="tabular border-l px-0 py-0.5 text-center font-normal text-faint-foreground text-[10px]"
                      >
                        {monday ? `${locale === "en" ? "CW" : "KW"} ${isoWeek(d.date).week}` : ""}
                      </th>
                    );
                  })}
                  <th colSpan={6} />
                </tr>
                <tr className="border-b">
                  <th
                    scope="col"
                    className="sticky left-0 z-[2] bg-surface-2 px-3 py-1 font-semibold text-muted-foreground text-tiny"
                  >
                    {t("cols.person")}
                  </th>
                  {days.map((d) => {
                    const dow = weekday(d.date);
                    const weekend = dow === 0 || dow === 6;
                    return (
                      <th
                        key={d.date}
                        scope="col"
                        title={d.holiday ?? undefined}
                        className={cn(
                          "tabular w-9 min-w-9 px-0 py-1 text-center font-normal text-tiny leading-tight",
                          weekend && "bg-sunken",
                          d.holiday && "bg-status-warn-bg text-status-warn",
                        )}
                      >
                        <span className="block text-[10px] text-muted-foreground">
                          {names[dow]}
                        </span>
                        {Number(d.date.slice(8, 10))}
                      </th>
                    );
                  })}
                  <th
                    scope="col"
                    className="px-3 py-1 text-right font-semibold text-muted-foreground text-tiny"
                  >
                    {t("cols.hours")}
                  </th>
                  <th
                    scope="col"
                    className="px-3 py-1 text-right font-semibold text-muted-foreground text-tiny"
                  >
                    {t("cols.earnings")}
                  </th>
                  <th
                    scope="col"
                    className="px-3 py-1 text-right font-semibold text-muted-foreground text-tiny"
                  >
                    {t("cols.ytd")}
                  </th>
                  <th
                    scope="col"
                    className="min-w-44 px-3 py-1 font-semibold text-muted-foreground text-tiny"
                  >
                    {params
                      ? t("cols.limit", { limit: formatMoney(params.limitCents, locale) })
                      : t("cols.limitPlain")}
                  </th>
                  <th
                    scope="col"
                    className="px-3 py-1 text-right font-semibold text-muted-foreground text-tiny"
                  >
                    {t("cols.overruns")}
                  </th>
                  <th
                    scope="col"
                    className="min-w-36 px-3 py-1 font-semibold text-muted-foreground text-tiny"
                  >
                    {t("cols.status")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {figures.rows.map((row) => {
                  const level = personLevel(row);
                  const mj = row.minijob;
                  const peek = hrefWith(path, sp, { person: row.staffMemberId, month });
                  const overTen = new Set(
                    row.arbzg.filter((w) => w.code === "daily_max").map((w) => w.date),
                  );
                  const pct = mj
                    ? Math.min(100, (mj.status.earnedCents / mj.params.limitCents) * 100)
                    : 0;
                  const money =
                    level === "illegal"
                      ? "text-status-critical"
                      : level === "over"
                        ? "text-status-warn"
                        : "";
                  const rateLabel =
                    row.month.fixedPayCents > 0
                      ? t("salary")
                      : row.month.lastRateCents !== null
                        ? `${formatMoney(row.month.lastRateCents, locale)}${t("perHour")}`
                        : "";
                  return (
                    <tr
                      key={row.staffMemberId}
                      tabIndex={0}
                      data-row
                      data-peek={peek}
                      data-href={peek}
                      aria-selected={personId === row.staffMemberId}
                      className={cn(
                        "group/row border-border-subtle border-b outline-none hover:bg-hover focus-visible:bg-selected aria-selected:bg-selected",
                        !row.active && "text-muted-foreground",
                      )}
                    >
                      <th
                        scope="row"
                        className="sticky left-0 z-[1] min-w-48 bg-card px-3 py-1.5 text-left font-normal group-hover/row:bg-hover group-aria-selected/row:bg-selected"
                      >
                        <Link
                          href={peek as never}
                          scroll={false}
                          tabIndex={-1}
                          className="flex items-center gap-2"
                        >
                          <Avatar name={row.displayName} />
                          <span className="flex min-w-0 flex-col">
                            <span className="truncate font-semibold text-accent-soft-foreground">
                              {row.displayName}
                            </span>
                            <span className="truncate text-faint-foreground text-tiny">
                              {row.contractType
                                ? tContract(`types.${row.contractType}`)
                                : t("noContract")}
                              {rateLabel ? ` · ${rateLabel}` : ""}
                            </span>
                          </span>
                        </Link>
                      </th>
                      {days.map((d) => {
                        const minutes = row.month.dayMinutes[d.date] ?? 0;
                        const dow = weekday(d.date);
                        const weekend = dow === 0 || dow === 6;
                        const over = overTen.has(d.date);
                        return (
                          <td
                            key={d.date}
                            className={cn(
                              "tabular h-9 p-0 text-center text-small",
                              weekend && "bg-sunken",
                              d.holiday && "bg-status-warn-bg",
                              over &&
                                "bg-status-critical-bg font-semibold text-status-critical shadow-[inset_0_0_0_1px_var(--status-critical)]",
                            )}
                          >
                            {minutes > 0 && (
                              <Link
                                href={
                                  hrefWith(
                                    "/team/schichten",
                                    {},
                                    {
                                      month,
                                      person: row.staffMemberId,
                                      day: d.date,
                                    },
                                  ) as never
                                }
                                title={
                                  over
                                    ? t("overTenTitle", { hours: formatHours(minutes, locale) })
                                    : formatHours(minutes, locale)
                                }
                                className="grid h-full min-h-9 place-items-center hover:underline"
                              >
                                {cellHours(minutes)}
                              </Link>
                            )}
                          </td>
                        );
                      })}
                      <td className="tabular px-3 text-right font-semibold">
                        {formatNumber(row.month.totalMinutes / 60, locale, 2)}
                      </td>
                      <td className={cn("tabular px-3 text-right font-semibold", money)}>
                        {formatMoney(row.month.grossCents, locale)}
                      </td>
                      <td className="tabular px-3 text-right text-muted-foreground">
                        {mj ? formatMoney(mj.ytdCents, locale) : "–"}
                      </td>
                      <td className="px-3">
                        {mj ? (
                          <div className="flex flex-col gap-1">
                            {/* biome-ignore lint/a11y/useSemanticElements: styled bar, a native <meter> cannot be themed */}
                            <div
                              role="meter"
                              aria-valuenow={Math.round(pct)}
                              aria-valuemin={0}
                              aria-valuemax={100}
                              aria-label={t("meter", { name: row.displayName })}
                              className="h-2 overflow-hidden rounded-full bg-sunken"
                            >
                              <i
                                className={cn(
                                  "block h-full rounded-full",
                                  level === "illegal"
                                    ? "bg-status-critical-dot"
                                    : level === "over" || level === "near"
                                      ? "bg-status-warn-dot"
                                      : "bg-status-ok-dot",
                                )}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <span
                              className={cn(
                                "tabular text-tiny",
                                level === "over" || level === "illegal"
                                  ? "font-semibold text-status-warn"
                                  : "text-muted-foreground",
                              )}
                            >
                              {mj.status.earnedCents > mj.params.limitCents
                                ? t("overLimit", {
                                    amount: formatMoney(
                                      mj.status.earnedCents - mj.params.limitCents,
                                      locale,
                                    ),
                                  })
                                : t("remaining", {
                                    hours: formatNumber(mj.status.remainingMinutes / 60, locale, 1),
                                  })}
                            </span>
                          </div>
                        ) : (
                          <span className="text-faint-foreground text-tiny">
                            {row.contractType ? tContract(`types.${row.contractType}`) : "–"}
                          </span>
                        )}
                      </td>
                      <td
                        className={cn(
                          "tabular px-3 text-right",
                          mj &&
                            mj.overrunMonths > mj.params.maxOverrunMonths &&
                            "font-semibold text-status-critical",
                        )}
                      >
                        {mj ? `${mj.overrunMonths}/${mj.params.maxOverrunMonths}` : "–"}
                      </td>
                      <td className="px-3 py-1.5">
                        <div className="flex flex-col items-start gap-0.5">
                          <PersonStatusBadge level={level} />
                          <Link
                            href={peek as never}
                            scroll={false}
                            tabIndex={-1}
                            className="font-semibold text-accent-soft-foreground text-tiny hover:underline"
                          >
                            {mj && mj.status.earnedCents > mj.params.limitCents
                              ? row.justification
                                ? t("justified")
                                : t("justify")
                              : t("details")}
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-surface-2 font-semibold">
                  <th
                    scope="row"
                    className="sticky left-0 z-[1] bg-surface-2 px-3 py-1.5 text-left text-small"
                  >
                    {t("total", { count: figures.rows.length })}
                  </th>
                  <td colSpan={days.length} />
                  <td className="tabular px-3 text-right">
                    {formatNumber(totalMinutes / 60, locale, 2)}
                  </td>
                  <td className="tabular px-3 text-right">{formatMoney(totalCents, locale)}</td>
                  <td colSpan={4} />
                </tr>
              </tfoot>
            </table>
          </div>
        </KeyboardRows>
      )}
      <PanelFooter className="justify-between text-faint-foreground text-tiny">
        <span>
          {params
            ? t("legal", {
                limit: formatMoney(params.limitCents, locale),
                wage:
                  figures.minimumWageCents !== null
                    ? formatMoney(figures.minimumWageCents, locale)
                    : "–",
                months: params.maxOverrunMonths,
                ceiling: formatMoney(params.limitCents * params.overrunCeilingFactor, locale),
              })
            : t("legalMissing")}
        </span>
        <span>{t("keys")}</span>
      </PanelFooter>
    </Panel>
  );
}
