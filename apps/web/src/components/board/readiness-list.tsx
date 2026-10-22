import { readinessAttention } from "@marktwerk/core";
import {
  CalendarX,
  ChevronDown,
  CircleCheck,
  FileWarning,
  Star,
  TriangleAlert,
} from "lucide-react";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Fragment, type ReactNode } from "react";
import { MarketMarker } from "@/components/ui/market-marker";
import { EmptyState } from "@/components/ui/states";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatDateRange, formatDateShort } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ReadinessRow } from "@/server/queries/board-overview";

/**
 * "Bereitschaft": one row per upcoming market. Columns: market, date, progress, what is missing (chips,
 * worst first, only non-zero) and the next deadline (opens the task drawer). Attention is shown by the
 * chips (colour + icon + text), never by row backgrounds.
 */
export async function ReadinessList({
  rows,
  today,
  taskHref,
  openId,
  panel,
  panelHref,
}: {
  rows: ReadinessRow[];
  today: string;
  /** Link that opens a task's drawer on this view. */
  taskHref: (taskId: string) => string;
  /** The market whose panel is open (`?markt=<id>`), and the panel itself. */
  openId?: string;
  panel?: ReactNode;
  /** Link that opens (id) or closes (null) a market's panel. */
  panelHref: (eventId: string | null) => string;
}) {
  const t = await getTranslations("board.readiness");
  const locale = await getLocale();

  if (rows.length === 0)
    return (
      <div className="rounded-xl border bg-card">
        <EmptyState icon={CalendarX} title={t("empty")} hint={t("emptyHint")} />
      </div>
    );

  return (
    <div className="relative overflow-x-auto rounded-xl border bg-card">
      {/* Phone: every row stacks (name, date, progress, what is missing, next deadline); from sm up it is a table. */}
      <table className="block w-full hyphens-none border-collapse text-left sm:table sm:min-w-[52rem]">
        <caption className="sr-only">{t("caption")}</caption>
        <thead className="sr-only sm:not-sr-only sm:table-header-group">
          <tr className="border-b bg-surface-2">
            {(["market", "date", "progress", "missing", "next", "panelColumn"] as const).map(
              (key) => (
                <th
                  key={key}
                  scope="col"
                  className="h-9 whitespace-nowrap px-3 py-1 font-semibold text-muted-foreground text-tiny"
                >
                  {t(key)}
                </th>
              ),
            )}
          </tr>
        </thead>
        <tbody className="block sm:table-row-group">
          {rows.map((row) => {
            const attention = readinessAttention(row, row.startsOn, today);
            const running = row.daysUntil < 0;
            const percent = row.total === 0 ? 0 : Math.round((row.done / row.total) * 100);
            const nothingMissing =
              row.overdue === 0 && row.missingPermits === 0 && row.openKey === 0;
            const open = row.id === openId;
            return (
              <Fragment key={row.id}>
                <tr
                  className={cn(
                    "block border-border-subtle border-b align-top last:border-b-0 sm:table-row",
                    open && "border-b-0",
                  )}
                >
                  <th
                    scope="row"
                    className="block px-3 pt-3 pb-1 text-left font-semibold sm:table-cell sm:min-w-40 sm:py-3"
                  >
                    <Link
                      href={`/veranstaltungen/${row.id}`}
                      className="inline-flex items-center gap-2 rounded-sm hover:underline"
                    >
                      <MarketMarker color={row.color} typeKey={row.typeKey} />
                      {row.name}
                    </Link>
                  </th>
                  <td className="block px-3 pb-1 text-small sm:table-cell sm:whitespace-nowrap sm:py-3">
                    <div>{formatDateRange(row.startsOn, row.endsOn, locale)}</div>
                    <div className="text-muted-foreground text-tiny">
                      {running ? t("running") : t("inDays", { days: row.daysUntil })}
                    </div>
                  </td>
                  <td className="block px-3 py-1 sm:table-cell sm:py-3">
                    {row.total === 0 ? (
                      <span className="text-muted-foreground text-small">{t("noTasks")}</span>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span
                          aria-hidden
                          className="h-1.5 w-24 overflow-hidden rounded-full bg-status-neutral-bg"
                        >
                          <span
                            className="block h-full rounded-full bg-status-ok-dot"
                            style={{ width: `${percent}%` }}
                          />
                        </span>
                        <span className="tabular text-small">
                          {row.done}/{row.total}
                          <span className="sr-only">
                            {" "}
                            {t("progressText", { done: row.done, total: row.total })}
                          </span>
                        </span>
                      </div>
                    )}
                  </td>
                  <td className="block px-3 py-1 sm:table-cell sm:py-3">
                    <ul className="flex flex-wrap gap-1.5">
                      {row.overdue > 0 && (
                        <li>
                          <StatusBadge tone="critical" icon={TriangleAlert}>
                            {t("overdue", { count: row.overdue })}
                          </StatusBadge>
                        </li>
                      )}
                      {row.missingPermits > 0 && (
                        <li>
                          <StatusBadge
                            tone={attention === "critical" ? "critical" : "warn"}
                            icon={FileWarning}
                          >
                            {t("permits", { count: row.missingPermits })}
                          </StatusBadge>
                        </li>
                      )}
                      {row.openKey > 0 && (
                        <li>
                          <StatusBadge tone="neutral" icon={Star}>
                            {t("key", { count: row.openKey })}
                          </StatusBadge>
                        </li>
                      )}
                      {nothingMissing && (
                        <li>
                          <StatusBadge tone="ok" icon={CircleCheck}>
                            {t("ok")}
                          </StatusBadge>
                        </li>
                      )}
                    </ul>
                  </td>
                  <td className="block px-3 pt-1 pb-3 text-small sm:table-cell sm:py-3">
                    {row.next ? (
                      <Link
                        href={taskHref(row.next.id) as never}
                        scroll={false}
                        className="block max-w-[22rem] rounded-sm hover:underline sm:min-w-44"
                      >
                        <span className="line-clamp-2 font-medium">{row.next.title}</span>
                        <span className="tabular text-muted-foreground text-tiny">
                          {t("dueOn", { date: formatDateShort(row.next.dueOn, locale) })}
                        </span>
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">{t("noDeadline")}</span>
                    )}
                  </td>
                  <td className="block px-3 pb-3 sm:table-cell sm:py-3 sm:text-right">
                    <Link
                      href={panelHref(open ? null : row.id) as never}
                      scroll={false}
                      aria-expanded={open}
                      aria-label={t(open ? "panel.hideLabel" : "panel.showLabel", {
                        name: row.name,
                      })}
                      className={cn(
                        "inline-flex min-h-8 items-center gap-1 whitespace-nowrap rounded-lg border px-2.5 font-medium text-small outline-none hover:bg-hover focus-visible:outline-2 focus-visible:outline-ring",
                        open ? "border-foreground bg-hover" : "border-input bg-card",
                      )}
                    >
                      {t("panel.toggle")}
                      <ChevronDown
                        aria-hidden
                        className={cn("size-4 transition-transform", open && "rotate-180")}
                      />
                    </Link>
                  </td>
                </tr>
                {open && panel && (
                  <tr className="block border-border-subtle border-b last:border-b-0 sm:table-row">
                    <td colSpan={6} className="block p-0 sm:table-cell">
                      {panel}
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
