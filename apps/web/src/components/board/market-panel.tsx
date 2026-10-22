import { daysBetween } from "@marktwerk/core";
import {
  ArrowRight,
  CalendarCheck,
  CircleCheck,
  Clock,
  FileWarning,
  OctagonAlert,
} from "lucide-react";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { TaskQuickActions } from "@/components/event-detail/overview-task-actions";
import { KeyTaskMark } from "@/components/ui/key-task-mark";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatDateShort } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { EventOverview } from "@/server/queries/event-overview";

/** Items shown in the panel before "+ N weitere im Überblick". */
const PANEL_ROWS = 6;

/**
 * The market panel under a Bereitschaft row ("event manager"): the market's most important open items —
 * the same "Was fehlt" selection as its Überblick (overdue, blocked, waiting, due within 7 days;
 * Kernaufgaben first) plus missing permits — with quick "Erledigt" and snooze. Everything else is one
 * click away in the Überblick.
 */
export async function MarketPanel({
  event,
  overview,
  today,
  canWrite,
  taskHref,
}: {
  event: { id: string; name: string };
  overview: EventOverview;
  today: string;
  canWrite: boolean;
  taskHref: (taskId: string) => string;
}) {
  const t = await getTranslations("board.readiness.panel");
  const tReason = await getTranslations("eventDetail.overview.missing");
  const locale = await getLocale();
  const tasks = overview.tasks?.missing ?? [];
  const permits = overview.permits?.missing ?? [];
  const shown = tasks.slice(0, PANEL_ROWS);
  const more = tasks.length - shown.length;
  const overviewHref = `/veranstaltungen/${event.id}`;

  return (
    <section
      aria-label={t("title", { name: event.name })}
      className="flex flex-col gap-2 border-border-subtle border-t bg-surface-2 px-3 py-3 sm:px-4"
    >
      {tasks.length === 0 && permits.length === 0 ? (
        <p className="m-0 flex items-center gap-2 text-small">
          <CircleCheck aria-hidden className="size-4 text-status-ok" />
          {t("allOk")}
        </p>
      ) : (
        <ul className="m-0 flex list-none flex-col p-0">
          {shown.map((task) => {
            const days = task.dueOn ? daysBetween(today, task.dueOn) : 0;
            const tone =
              task.reason === "overdue" ? "critical" : task.reason === "soon" ? "neutral" : "warn";
            const icon =
              task.reason === "overdue"
                ? OctagonAlert
                : task.reason === "soon"
                  ? CalendarCheck
                  : Clock;
            return (
              <li
                key={task.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg px-2 py-1 hover:bg-hover"
              >
                <span className="flex min-w-0 flex-1 basis-60 items-center gap-1.5">
                  {task.isKey && <KeyTaskMark />}
                  <Link
                    href={taskHref(task.id) as never}
                    scroll={false}
                    className="min-w-0 font-medium hover:underline"
                  >
                    {task.title}
                  </Link>
                </span>
                <StatusBadge tone={tone} icon={icon}>
                  {tReason(`reason.${task.reason}`, { n: Math.abs(days) })}
                </StatusBadge>
                {task.dueOn && (
                  <span className="tabular text-muted-foreground text-small">
                    {formatDateShort(task.dueOn, locale)}
                  </span>
                )}
                {canWrite && (
                  <TaskQuickActions
                    task={{ id: task.id, title: task.title, status: task.status }}
                    today={today}
                  />
                )}
              </li>
            );
          })}
          {permits.map((permit) => (
            <li
              key={permit.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg px-2 py-1 hover:bg-hover"
            >
              <span className="flex min-w-0 flex-1 basis-60 items-center gap-1.5">
                <FileWarning aria-hidden className="size-4 shrink-0 text-status-warn" />
                <Link
                  href={`/genehmigungen?genehmigung=${permit.id}` as never}
                  className="min-w-0 font-medium hover:underline"
                >
                  {permit.title}
                </Link>
              </span>
              <StatusBadge tone="warn" icon={FileWarning}>
                {t("permitMissing")}
              </StatusBadge>
            </li>
          ))}
        </ul>
      )}
      <div className={cn("flex flex-wrap items-center gap-x-4 gap-y-1 px-2 text-small")}>
        {more > 0 && <span className="text-muted-foreground">{t("more", { count: more })}</span>}
        <Link
          href={overviewHref as never}
          className="inline-flex items-center gap-1 font-medium hover:underline"
        >
          {t("openOverview")}
          <ArrowRight aria-hidden className="size-3.5" />
        </Link>
      </div>
    </section>
  );
}
