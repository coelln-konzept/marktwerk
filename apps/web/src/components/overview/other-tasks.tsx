import { ListTodo } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import { TaskDoneButton } from "@/components/task/done-button";
import { SnoozeMenu } from "@/components/task/snooze";
import { DueBadge, dueLook } from "@/components/ui/due-badge";
import { KeyTaskMark } from "@/components/ui/key-task-mark";
import { StatusBadge } from "@/components/ui/status-badge";
import { rowFocus } from "@/components/ui/table";
import { isModuleVisible } from "@/lib/modules";
import { cn } from "@/lib/utils";
import type { OtherTask } from "@/server/queries/overview";
import { GROUP_ROWS, MoreDisclosure } from "./due-groups";

/** One task of "Weitere Aufgaben": the same row as the due groups, with "Ohne Datum" for an undated one. */
function OtherTaskRow({
  task,
  today,
  canWrite,
  reserveStar,
}: {
  task: OtherTask;
  today: string;
  canWrite: boolean;
  reserveStar: boolean;
}) {
  const t = useTranslations("overview.due");
  const href = `/?aufgabe=${task.id}`;
  const assignee =
    task.assigneeName && isModuleVisible("team")
      ? t("assignee", { name: task.assigneeName })
      : null;
  const waitingFor = task.waiting?.reason ? t("waitingFor", { reason: task.waiting.reason }) : null;
  return (
    <li
      data-row
      data-href={href}
      data-peek={href}
      // biome-ignore lint/a11y/noNoninteractiveTabindex: rows are focusable for J/K/Enter/Space (KeyboardRows)
      tabIndex={0}
      className={cn(
        "grid cursor-pointer grid-cols-[1.75rem_minmax(0,1fr)] items-start gap-x-3 gap-y-1 border-border-subtle border-b py-2 pr-4 pl-4 last:border-b-0 hover:bg-hover @md:flex @md:items-center",
        rowFocus,
      )}
    >
      {canWrite ? (
        <TaskDoneButton task={{ id: task.id, title: task.title, status: "todo" }} />
      ) : (
        <span
          title={t("kind.task")}
          className="grid size-7 shrink-0 place-items-center rounded-lg bg-status-neutral-bg text-foreground-2"
        >
          <ListTodo aria-hidden className="size-4" />
          <span className="sr-only">{t("kind.task")}</span>
        </span>
      )}
      <div className="min-w-0 @md:flex-1">
        <div className="flex items-start gap-1.5">
          {reserveStar && (
            <span className="mt-[3px] inline-flex w-4 shrink-0 justify-center">
              {task.isKey && <KeyTaskMark label={t("keyTask")} />}
            </span>
          )}
          <Link
            href={href as never}
            scroll={false}
            aria-label={t("openItem", { title: task.title })}
            className="min-w-0 break-words font-medium hover:underline"
          >
            {task.title}
          </Link>
        </div>
        {(assignee || waitingFor) && (
          <span
            className={cn(
              "block break-words text-muted-foreground text-small",
              reserveStar && "pl-[22px]",
            )}
          >
            {assignee}
            {assignee && waitingFor && " · "}
            {waitingFor && <span className="font-medium text-foreground-2">{waitingFor}</span>}
          </span>
        )}
      </div>
      <div className="col-start-2 flex flex-wrap items-center gap-2 @md:col-auto @md:shrink-0">
        {task.waiting && (
          <StatusBadge tone="waiting" icon={dueLook("waiting").icon}>
            {t("waiting")}
          </StatusBadge>
        )}
        {task.dueOn ? (
          <DueBadge dueOn={task.dueOn} today={today} withDate />
        ) : (
          <span className="text-muted-foreground text-tiny">{t("other.noDate")}</span>
        )}
        {canWrite && (
          <SnoozeMenu task={{ id: task.id, title: task.title, status: "todo" }} today={today} />
        )}
      </div>
    </li>
  );
}

/**
 * "Weitere Aufgaben" (UX-013, default of UX audit round 1): the last group of "Heute & nächste Tage", with the
 * open tasks without a market or Saison that no other group shows: undated ones, and ones due after
 * "Nächste Tage". Without it such a task could only be found through search. A neutral band like "Nächste
 * Tage"; the first {@link GROUP_ROWS} rows, "+ N weitere" opens the rest in place. Left out when empty.
 */
export async function OtherTasks({
  tasks,
  today,
  canWrite,
}: {
  tasks: OtherTask[];
  today: string;
  canWrite: boolean;
}) {
  if (tasks.length === 0) return null;
  const t = await getTranslations("overview.due");
  const reserveStar = isModuleVisible("keyTasks") && tasks.some((task) => task.isKey);
  const row = (task: OtherTask) => (
    <OtherTaskRow
      key={task.id}
      task={task}
      today={today}
      canWrite={canWrite}
      reserveStar={reserveStar}
    />
  );
  const shown = tasks.slice(0, GROUP_ROWS);
  const hidden = tasks.slice(GROUP_ROWS);
  return (
    <section aria-labelledby="other-tasks-title" className="@container">
      <h3
        id="other-tasks-title"
        className="m-0 flex items-center gap-2 border-border border-y bg-status-neutral-bg px-4 py-2 font-semibold text-body text-foreground"
      >
        <ListTodo aria-hidden className="size-4 shrink-0" />
        {t("groups.other")}
        <span className="tabular inline-grid h-5 min-w-6 place-items-center rounded-full bg-card/80 px-1.5 font-semibold text-tiny">
          {tasks.length}
        </span>
      </h3>
      <p className="m-0 px-4 pt-2 text-muted-foreground text-small">{t("other.hint")}</p>
      <ul className="m-0 flex list-none flex-col p-0">
        {shown.map(row)}
        {hidden.length > 0 && (
          <li className="list-none border-border-subtle border-t px-3 py-1">
            <MoreDisclosure label={t("moreItems", { count: hidden.length })}>
              <ul className="m-0 -mx-3 flex list-none flex-col border-border-subtle border-t p-0">
                {hidden.map(row)}
              </ul>
            </MoreDisclosure>
          </li>
        )}
      </ul>
    </section>
  );
}
