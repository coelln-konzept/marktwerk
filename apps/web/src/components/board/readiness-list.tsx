import { readinessAttention } from "@marktwerk/core";
import { CalendarX, CircleCheck, FileWarning, Star, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { MarketMarker } from "@/components/ui/market-marker";
import { EmptyState } from "@/components/ui/states";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatDateRange, formatDateShort } from "@/lib/format";
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
}: {
  rows: ReadinessRow[];
  today: string;
  /** Link that opens a task's drawer on this view. */
  taskHref: (taskId: string) => string;
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
    <div className="overflow-x-auto rounded-xl border bg-card">
      <table className="w-full min-w-[52rem] hyphens-none border-collapse text-left">
        <caption className="sr-only">{t("caption")}</caption>
        <thead>
          <tr className="border-b bg-surface-2">
            {(["market", "date", "progress", "missing", "next"] as const).map((key) => (
              <th
                key={key}
                scope="col"
                className="h-9 whitespace-nowrap px-3 py-1 font-semibold text-muted-foreground text-tiny"
              >
                {t(key)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const attention = readinessAttention(row, row.startsOn, today);
            const running = row.daysUntil < 0;
            const percent = row.total === 0 ? 0 : Math.round((row.done / row.total) * 100);
            const nothingMissing =
              row.overdue === 0 && row.missingPermits === 0 && row.openKey === 0;
            return (
              <tr key={row.id} className="border-border-subtle border-b align-top last:border-b-0">
                <th scope="row" className="min-w-40 px-3 py-3 text-left font-semibold">
                  <Link
                    href={`/veranstaltungen/${row.id}/board`}
                    className="inline-flex items-center gap-2 rounded-sm hover:underline"
                  >
                    <MarketMarker color={row.color} typeKey={row.typeKey} />
                    {row.name}
                  </Link>
                </th>
                <td className="whitespace-nowrap px-3 py-3 text-small">
                  <div>{formatDateRange(row.startsOn, row.endsOn, locale)}</div>
                  <div className="text-muted-foreground text-tiny">
                    {running ? t("running") : t("inDays", { days: row.daysUntil })}
                  </div>
                </td>
                <td className="px-3 py-3">
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
                <td className="px-3 py-3">
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
                <td className="px-3 py-3 text-small">
                  {row.next ? (
                    <Link
                      href={taskHref(row.next.id) as never}
                      scroll={false}
                      className="block min-w-44 max-w-[22rem] rounded-sm hover:underline"
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
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
