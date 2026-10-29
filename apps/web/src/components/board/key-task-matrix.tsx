import type { MatrixCellState } from "@marktwerk/core";
import { AlarmClockOff, CalendarX, CircleCheck, CircleDashed, Star } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { dueLook, useDueText } from "@/components/ui/due-badge";
import { KeyboardRows } from "@/components/ui/keyboard-rows";
import { MarketMarker } from "@/components/ui/market-marker";
import { EmptyState } from "@/components/ui/states";
import { formatDateRangeYear, formatDateShortYear, todayIn } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { KeyTaskMatrix } from "@/server/queries/board-overview";
import { MatrixScroll } from "./matrix-scroll";

type CellState = Exclude<MatrixCellState, "absent">;
type Cell = KeyTaskMatrix["cells"][string][string];

// Overdue, soon and waiting look exactly like the DueBadge of the same state elsewhere (red circle "!",
// amber clock, neutral hourglass); done, open and snoozed only exist in the matrix.
const STATE_ICON = {
  done: CircleCheck,
  open: CircleDashed,
  soon: dueLook("today").icon,
  overdue: dueLook("overdue").icon,
  waiting: dueLook("waiting").icon,
  snoozed: AlarmClockOff,
} as const;

const STATE_TONE: Record<CellState, string> = {
  done: "text-status-ok",
  open: "text-foreground-2",
  soon: "text-status-warn",
  overdue: "text-status-critical",
  waiting: "text-foreground-2",
  snoozed: "text-muted-foreground",
};

const LEGEND: CellState[] = ["done", "open", "soon", "overdue", "waiting", "snoozed"];

/** Sticky cells are opaque, so a row's hover tint has to be set on them, too (`group/row` on the `tr`). */
const MARKET_CELL =
  "sticky left-0 z-[1] min-w-32 max-w-36 bg-card px-2 py-2 text-left font-normal shadow-[inset_-1px_0_0_var(--border)] group-hover/row:bg-hover sm:max-w-none sm:min-w-44 sm:px-3";

/**
 * "Matrix": markets (rows) x Kernaufgaben (columns). A cell is the market's state of that task; every
 * cell with a task opens its drawer. The header row and the market column stick while the table scrolls
 * inside its own box (a fade and a line of text say there is more to the right). State is icon + colour +
 * text (visible date, tooltip, screen-reader label, legend).
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
  const today = todayIn();

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
      <KeyboardRows className="overflow-hidden rounded-xl border bg-card">
        <MatrixScroll hint={t("scrollHint")} label={t("caption")}>
          <table className="w-full border-collapse text-left">
            <caption className="sr-only">{t("caption")}</caption>
            <thead>
              <tr>
                <th
                  scope="col"
                  className="sticky top-0 left-0 z-[3] h-[4.5rem] min-w-32 max-w-36 bg-surface-2 px-2 py-1 font-semibold text-muted-foreground text-tiny shadow-[inset_-1px_-1px_0_var(--border)] sm:max-w-none sm:min-w-44 sm:px-3"
                >
                  {t("market")}
                </th>
                {matrix.columns.map((col) => (
                  <th
                    key={col.key}
                    scope="col"
                    className="sticky top-0 z-[2] h-[4.5rem] w-36 min-w-36 hyphens-none bg-surface-2 px-2 py-1 text-center align-bottom font-semibold text-muted-foreground text-tiny shadow-[inset_0_-1px_0_var(--border)]"
                  >
                    <span title={col.title} className="line-clamp-3 text-balance leading-tight">
                      {col.title}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {matrix.events.map((event) => (
                <tr
                  key={event.id}
                  data-href={`/veranstaltungen/${event.id}`}
                  className="group/row cursor-pointer border-border-subtle border-b last:border-b-0 hover:bg-hover"
                >
                  <th scope="row" className={MARKET_CELL}>
                    <Link
                      href={`/veranstaltungen/${event.id}`}
                      className="inline-flex items-start gap-2 rounded-sm font-semibold hover:underline"
                    >
                      <MarketMarker color={event.color} typeKey={event.typeKey} />
                      {event.name}
                    </Link>
                    <div className="pl-3 text-muted-foreground text-tiny">
                      {formatDateRangeYear(event.startsOn, event.endsOn, locale, today)}
                    </div>
                  </th>
                  {matrix.columns.map((col) => (
                    <MatrixCell
                      key={col.key}
                      eventName={event.name}
                      columnTitle={col.title}
                      cell={matrix.cells[event.id]?.[col.key]}
                      taskHref={taskHref}
                      today={today}
                      locale={locale}
                    />
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </MatrixScroll>
      </KeyboardRows>
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

/**
 * One cell: the state icon, the due date (with the year when it is not this year) and, for overdue /
 * soon / waiting, the compact distance ("3 T"). The tooltip and the screen-reader label spell it out.
 */
function MatrixCell({
  eventName,
  columnTitle,
  cell,
  taskHref,
  today,
  locale,
}: {
  eventName: string;
  columnTitle: string;
  cell: Cell | undefined;
  taskHref: (taskId: string) => string;
  today: string;
  locale: string;
}) {
  const t = useTranslations("board.matrix");
  const dueText = useDueText();
  if (!cell)
    return (
      <td className="px-2 py-2 text-center text-muted-foreground" title={t("state.absent")}>
        <span aria-hidden>–</span>
        <span className="sr-only">{t("absentCell", { task: columnTitle, event: eventName })}</span>
      </td>
    );
  const cellState = cell.state as CellState;
  const Icon = STATE_ICON[cellState];
  const state = t(`state.${cellState}`);
  const waiting = cellState === "waiting";
  const showDue = cell.dueOn !== null && cellState !== "done";
  const words = showDue && cell.dueOn ? dueText(cell.dueOn, today, { waiting }) : null;
  const distance =
    showDue && cell.dueOn && (waiting || cellState === "overdue" || cellState === "soon")
      ? dueText(cell.dueOn, today, { waiting, compact: true })
      : null;
  return (
    <td className="p-1 text-center">
      <Link
        href={taskHref(cell.taskId) as never}
        scroll={false}
        title={words ? `${columnTitle}: ${state} · ${words}` : `${columnTitle}: ${state}`}
        className={cn(
          "mx-auto flex min-h-11 w-full flex-col items-center justify-center gap-0.5 rounded-md px-1 py-1 hover:bg-hover",
          STATE_TONE[cellState],
        )}
      >
        <Icon aria-hidden className="size-4" strokeWidth={2.25} />
        {showDue && cell.dueOn && (
          <span className="tabular font-medium text-[11px] leading-tight">
            {formatDateShortYear(cell.dueOn, locale, today)}
            {distance && <span className="block">{distance}</span>}
          </span>
        )}
        <span className="sr-only">
          {t("cell", { task: columnTitle, event: eventName, state })}
          {words ? `, ${words}` : ""}
        </span>
      </Link>
    </td>
  );
}
