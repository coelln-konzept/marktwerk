import { type MatrixCellState, shortLabel } from "@marktwerk/core";
import {
  BellOff,
  CalendarX,
  CircleCheck,
  CircleDashed,
  Clock,
  Star,
  TriangleAlert,
} from "lucide-react";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { MarketMarker } from "@/components/ui/market-marker";
import { EmptyState } from "@/components/ui/states";
import { formatDateRange, formatMonthDay } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { KeyTaskMatrix } from "@/server/queries/board-overview";

const STATE_ICON = {
  done: CircleCheck,
  open: CircleDashed,
  soon: Clock,
  overdue: TriangleAlert,
  snoozed: BellOff,
} as const;

const STATE_TONE: Record<Exclude<MatrixCellState, "absent">, string> = {
  done: "text-status-ok",
  open: "text-foreground-2",
  soon: "text-status-warn",
  overdue: "text-status-critical",
  snoozed: "text-status-waiting",
};

const LEGEND: Exclude<MatrixCellState, "absent">[] = ["done", "open", "soon", "overdue", "snoozed"];

/**
 * "Matrix": markets (rows) x Kernaufgaben (columns). A cell is the market's state of that task; every
 * cell with a task opens its drawer. The first column sticks while the table scrolls sideways inside its
 * own container. State is icon + colour + text (visible date, tooltip, screen-reader label, legend).
 */
export async function KeyTaskMatrixView({
  matrix,
  taskHref,
}: {
  matrix: KeyTaskMatrix;
  taskHref: (taskId: string) => string;
}) {
  const t = await getTranslations("board.matrix");
  const locale = await getLocale();

  if (matrix.events.length === 0)
    return (
      <div className="rounded-xl border bg-card">
        <EmptyState icon={CalendarX} title={t("empty")} hint={t("emptyHint")} />
      </div>
    );
  if (matrix.columns.length === 0)
    return (
      <div className="rounded-xl border bg-card">
        <EmptyState icon={Star} title={t("noKeyTasks")} hint={t("noKeyTasksHint")} />
      </div>
    );

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full border-collapse text-left">
          <caption className="sr-only">{t("caption")}</caption>
          <thead>
            <tr className="border-b bg-surface-2">
              <th
                scope="col"
                className="sticky left-0 z-[1] h-12 min-w-44 border-r bg-surface-2 px-3 py-1 font-semibold text-muted-foreground text-tiny"
              >
                {t("market")}
              </th>
              {matrix.columns.map((col) => (
                <th
                  key={col.key}
                  scope="col"
                  className="h-12 w-28 min-w-28 hyphens-none px-2 py-1 text-center align-bottom font-semibold text-muted-foreground text-tiny"
                >
                  <span title={col.title} className="line-clamp-2">
                    <span aria-hidden>{shortLabel(col.title)}</span>
                    <span className="sr-only">{col.title}</span>
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.events.map((event) => (
              <tr key={event.id} className="border-border-subtle border-b last:border-b-0">
                <th
                  scope="row"
                  className="sticky left-0 z-[1] border-r bg-card px-3 py-2 text-left font-normal"
                >
                  <Link
                    href={`/veranstaltungen/${event.id}/board`}
                    className="inline-flex items-center gap-2 rounded-sm font-semibold hover:underline"
                  >
                    <MarketMarker color={event.color} typeKey={event.typeKey} />
                    {event.name}
                  </Link>
                  <div className="pl-3 text-muted-foreground text-tiny">
                    {formatDateRange(event.startsOn, event.endsOn, locale)}
                  </div>
                </th>
                {matrix.columns.map((col) => {
                  const cell = matrix.cells[event.id]?.[col.key];
                  if (!cell)
                    return (
                      <td
                        key={col.key}
                        className="px-2 py-2 text-center text-muted-foreground"
                        title={t("state.absent")}
                      >
                        <span aria-hidden>–</span>
                        <span className="sr-only">
                          {t("absentCell", { task: col.title, event: event.name })}
                        </span>
                      </td>
                    );
                  const Icon = STATE_ICON[cell.state as keyof typeof STATE_ICON];
                  const state = t(`state.${cell.state}`);
                  return (
                    <td key={col.key} className="p-1 text-center">
                      <Link
                        href={taskHref(cell.taskId) as never}
                        scroll={false}
                        title={`${col.title}: ${state}`}
                        className={cn(
                          "mx-auto flex min-h-11 w-full flex-col items-center justify-center gap-0.5 rounded-md px-1 py-1 hover:bg-hover",
                          STATE_TONE[cell.state as keyof typeof STATE_TONE],
                        )}
                      >
                        <Icon aria-hidden className="size-4" strokeWidth={2.25} />
                        {cell.dueOn && cell.state !== "done" && (
                          <span className="tabular font-medium text-[11px] leading-none">
                            {formatMonthDay(cell.dueOn.slice(5), locale)}
                          </span>
                        )}
                        <span className="sr-only">
                          {t("cell", { task: col.title, event: event.name, state })}
                        </span>
                      </Link>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul
        aria-label={t("legend")}
        className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-small"
      >
        {LEGEND.map((state) => {
          const Icon = STATE_ICON[state];
          return (
            <li key={state} className={cn("inline-flex items-center gap-1.5", STATE_TONE[state])}>
              <Icon aria-hidden className="size-4" strokeWidth={2.25} />
              <span className="text-foreground-2">{t(`state.${state}`)}</span>
            </li>
          );
        })}
        <li className="inline-flex items-center gap-1.5 text-muted-foreground">
          <span aria-hidden className="grid size-4 place-items-center">
            –
          </span>
          <span className="text-foreground-2">{t("state.absent")}</span>
        </li>
      </ul>
      {matrix.truncatedColumns && (
        <p className="text-muted-foreground text-small">{t("truncated")}</p>
      )}
    </div>
  );
}
