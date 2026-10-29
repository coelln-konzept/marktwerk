import {
  CalendarCheck,
  CircleCheck,
  Clock,
  type LucideIcon,
  ShieldCheck,
  Truck,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import { TaskDoneButton } from "@/components/task/done-button";
import { SnoozeMenu } from "@/components/task/snooze";
import { DueBadge, dueLook } from "@/components/ui/due-badge";
import { KeyTaskMark } from "@/components/ui/key-task-mark";
import { Panel, PanelHeader, PanelTitle } from "@/components/ui/panel";
import { EmptyState } from "@/components/ui/states";
import { StatusBadge } from "@/components/ui/status-badge";
import { isModuleVisible } from "@/lib/modules";
import { cn } from "@/lib/utils";
import type { DueItem, DueKind } from "@/server/queries/due";
import type { OverviewDue } from "@/server/queries/overview";
import { itemHref, itemPeek } from "./links";

const KIND_ICONS: Record<DueKind, LucideIcon> = {
  permit: ShieldCheck,
  installment: Wallet,
  task: CircleCheck,
  hours: Clock,
  obligation: Truck,
};

/**
 * One overdue or due-today item. Narrow cards (container below 28 rem) stack: title, then market and
 * due badge; wide ones keep a single line. The Erledigt button and the title never move when a row has
 * the Kernaufgaben star (the slot is reserved for the whole list).
 */
function TodayRow({
  item,
  today,
  canSnooze,
  reserveStar,
}: {
  item: DueItem;
  today: string;
  canSnooze: boolean;
  reserveStar: boolean;
}) {
  const t = useTranslations("overview.due");
  const href = itemHref(item);
  const Icon = KIND_ICONS[item.kind];
  const editable = item.kind === "task" && canSnooze;
  const assignee =
    item.assigneeName && isModuleVisible("team")
      ? t("assignee", { name: item.assigneeName })
      : null;
  return (
    <li
      data-row
      data-href={href}
      data-peek={itemPeek(item)}
      // biome-ignore lint/a11y/noNoninteractiveTabindex: rows are focusable for J/K/Enter/Space (KeyboardRows)
      tabIndex={0}
      className="grid cursor-pointer grid-cols-[1.75rem_minmax(0,1fr)] items-start gap-x-3 gap-y-1 border-border-subtle border-b px-4 py-2 last:border-b-0 hover:bg-hover focus-visible:bg-selected @md:flex @md:items-center"
    >
      {editable ? (
        <TaskDoneButton task={{ id: item.id, title: item.title, status: "todo" }} />
      ) : (
        <span
          title={t(`kind.${item.kind}`)}
          className="grid size-7 shrink-0 place-items-center rounded-lg bg-status-neutral-bg text-foreground-2"
        >
          <Icon aria-hidden className="size-4" />
          <span className="sr-only">{t(`kind.${item.kind}`)}</span>
        </span>
      )}
      <div className="min-w-0 @md:flex-1">
        <div className="flex items-start gap-1.5">
          {reserveStar && (
            <span className="mt-[3px] inline-flex w-4 shrink-0 justify-center">
              {item.isKey && <KeyTaskMark label={t("keyTask")} />}
            </span>
          )}
          <Link
            href={href as never}
            scroll={item.kind !== "task"}
            aria-label={t("openItem", { title: item.title })}
            className="min-w-0 break-words font-medium hover:underline"
          >
            {item.title}
          </Link>
        </div>
        {(item.meta || assignee) && (
          <span
            className={cn(
              "block break-words text-muted-foreground text-small",
              reserveStar && "pl-[22px]",
            )}
          >
            {item.meta && item.metaHref ? (
              <Link href={item.metaHref as never} className="hover:underline">
                {item.meta}
              </Link>
            ) : (
              item.meta
            )}
            {assignee && (
              <>
                {item.meta && " · "}
                {assignee}
              </>
            )}
          </span>
        )}
      </div>
      <div className="col-start-2 flex items-center gap-2 @md:col-auto @md:shrink-0">
        <DueBadge dueOn={item.dueOn} today={today} />
        {editable && (
          <SnoozeMenu task={{ id: item.id, title: item.title, status: "todo" }} today={today} />
        )}
      </div>
    </li>
  );
}

/**
 * "Heute & überfällig", the second question ("what is due today?"): the top of the existing ranking
 * (`rankDue`: Kernaufgaben first, soonest market first) with one-click Erledigt, Zurückstellen and the due
 * badge, capped at five rows. The full list is the notification center ("Alle N in Benachrichtigungen").
 */
export async function TodayCard({
  due,
  today,
  canSnooze,
}: {
  due: OverviewDue;
  today: string;
  canSnooze: boolean;
}) {
  const t = await getTranslations("overview.due");
  const reserveStar = due.items.some((i) => i.isKey);
  const overdue = dueLook("overdue");
  const dueToday = dueLook("today");
  return (
    <Panel aria-labelledby="due-title" className="@container flex min-w-0 flex-col">
      <PanelHeader>
        <PanelTitle id="due-title">{t("title")}</PanelTitle>
        {due.total > 0 && (
          <ul className="m-0 flex list-none flex-wrap items-center gap-1.5 p-0">
            {due.overdue > 0 && (
              <li>
                <StatusBadge tone={overdue.tone} icon={overdue.icon}>
                  <span className="tabular">{t("overdueCount", { count: due.overdue })}</span>
                </StatusBadge>
              </li>
            )}
            {due.dueToday > 0 && (
              <li>
                <StatusBadge tone={dueToday.tone} icon={dueToday.icon}>
                  <span className="tabular">{t("todayCount", { count: due.dueToday })}</span>
                </StatusBadge>
              </li>
            )}
          </ul>
        )}
      </PanelHeader>
      {due.items.length === 0 ? (
        <EmptyState icon={CalendarCheck} title={t("emptyTitle")} hint={t("emptyHint")} />
      ) : (
        <ul className="m-0 flex list-none flex-col p-0">
          {due.items.map((item) => (
            <TodayRow
              key={`${item.kind}-${item.id}`}
              item={item}
              today={today}
              canSnooze={canSnooze}
              reserveStar={reserveStar}
            />
          ))}
        </ul>
      )}
      {isModuleVisible("notifications") && due.total > 0 && (
        <div className="mt-auto border-border-subtle border-t px-2 py-1.5">
          <Link
            href="/benachrichtigungen"
            className="inline-flex min-h-8 items-center rounded-lg px-2 font-medium hover:bg-hover"
          >
            {due.total > due.items.length
              ? t("allInCenter", { count: due.total })
              : t("openCenter")}
          </Link>
        </div>
      )}
    </Panel>
  );
}
