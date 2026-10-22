import { daysBetween } from "@marktwerk/core";
import {
  CalendarCheck,
  ChevronRight,
  CircleCheck,
  Clock,
  Hourglass,
  type LucideIcon,
  OctagonAlert,
  ShieldCheck,
  Truck,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { TaskDoneButton } from "@/components/task/done-button";
import { SnoozeMenu } from "@/components/task/snooze";
import { KeyTaskMark } from "@/components/ui/key-task-mark";
import { MarketMarker } from "@/components/ui/market-marker";
import { Panel, PanelHeader, PanelTitle } from "@/components/ui/panel";
import { EmptyState } from "@/components/ui/states";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatDateShortYear } from "@/lib/format";
import { isModuleVisible } from "@/lib/modules";
import { hrefWith } from "@/lib/url";
import { cn } from "@/lib/utils";
import type { DueItem, DueKind, DueUrgency } from "@/server/queries/due";
import type { OverviewDue } from "@/server/queries/overview";

const KIND_ICONS: Record<DueKind, LucideIcon> = {
  permit: ShieldCheck,
  installment: Wallet,
  task: CircleCheck,
  hours: Clock,
  obligation: Truck,
};

const GROUPS: DueUrgency[] = ["overdue", "today", "soon", "upcoming", "waiting"];

/**
 * Each urgency group opens with a band in its status colour (colour + icon + text), so the groups stand
 * apart from the market blocks inside them.
 */
const GROUP_UI: Record<DueUrgency, { icon: LucideIcon; band: string }> = {
  overdue: {
    icon: OctagonAlert,
    band: "border-status-critical-dot/30 bg-status-critical-bg text-status-critical",
  },
  today: { icon: Clock, band: "border-status-warn-dot/30 bg-status-warn-bg text-status-warn" },
  soon: { icon: CalendarCheck, band: "border-border bg-status-neutral-bg text-foreground" },
  upcoming: { icon: ShieldCheck, band: "border-border bg-status-info-bg text-status-info" },
  waiting: { icon: Hourglass, band: "border-border bg-status-neutral-bg text-foreground" },
};

/** Markets (and single items) shown per group before "+ N weitere" (the overdue group can be long). */
export const DUE_PREVIEW_CLUSTERS = 10;

/** Items shown per market before "+ N weitere bei …" (the rest is in the market's "Was fehlt"). */
export const DUE_PER_MARKET = 3;

type Cluster = {
  event: {
    id: string;
    name: string;
    href: string;
    typeKey: string | null;
    color: string | null;
    startsOn: string | null;
  } | null;
  items: DueItem[];
};

/**
 * Items of one urgency group, clustered by event in ranking order (an event appears where its first
 * item ranks); items without an event stay single rows.
 */
function clusters(rows: DueItem[]): Cluster[] {
  const out: Cluster[] = [];
  const byEvent = new Map<string, Cluster>();
  for (const item of rows) {
    if (!item.eventId || !item.meta) {
      out.push({ event: null, items: [item] });
      continue;
    }
    let cluster = byEvent.get(item.eventId);
    if (!cluster) {
      cluster = {
        event: {
          id: item.eventId,
          name: item.meta,
          // Every link to a market opens its Überblick.
          href: item.metaHref ?? `/veranstaltungen/${item.eventId}`,
          typeKey: item.eventTypeKey ?? null,
          color: item.eventColor ?? null,
          startsOn: item.eventStartsOn ?? null,
        },
        items: [],
      };
      byEvent.set(item.eventId, cluster);
      out.push(cluster);
    }
    cluster.items.push(item);
  }
  return out;
}

/**
 * "Heute fällig": every module's due items, ranked (overdue · today · this week · permits soon; within a
 * group permits > instalments > tasks > hours > obligations) and grouped by market. Only current
 * markets: tasks of past markets are handled by the "Aufräumen" line. Each group shows its first markets;
 * the rest sits behind `?alle=1` (a plain link, works without JavaScript).
 */
export async function DueToday({
  due,
  showAll,
  today,
  query,
  canSnooze,
}: {
  due: OverviewDue;
  showAll: boolean;
  today: string;
  /** Current search params, so "Alle anzeigen" keeps e.g. an open Vorschau. */
  query: Record<string, string | string[] | undefined>;
  /** May snooze tasks (`task:write`). */
  canSnooze: boolean;
}) {
  const t = await getTranslations("overview.due");
  const locale = await getLocale();
  const relative = (item: DueItem) => {
    const days = daysBetween(today, item.dueOn);
    if (item.urgency === "waiting")
      return t("relative.waiting", { date: formatDateShortYear(item.dueOn, locale, today) });
    if (item.urgency === "today" || days === 0) return t("relative.today");
    return item.urgency === "overdue"
      ? t("relative.overdue", { n: -days })
      : t("relative.soon", { n: days });
  };

  /** One due item; `nested` rows sit under their event's header and leave out the event name. */
  function DueRow({ item, nested = false }: { item: DueItem; nested?: boolean }) {
    const Icon = KIND_ICONS[item.kind];
    const meta = nested ? null : item.meta;
    const assignee =
      item.assigneeName && isModuleVisible("team")
        ? t("assignee", { name: item.assigneeName })
        : null;
    return (
      <li
        className={cn(
          // Phone: the title gets its own line, date and actions sit below it. From sm: one line.
          "grid grid-cols-[1.75rem_minmax(0,1fr)] items-start gap-x-3 gap-y-1 px-4 hover:bg-hover sm:flex sm:items-center",
          nested ? "py-1.5 pl-8" : "border-border-subtle border-b py-2 last:border-b-0",
        )}
      >
        {item.kind === "task" && canSnooze ? (
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
        <div className="min-w-0 sm:flex-1">
          <Link
            href={item.href as never}
            aria-label={t("openItem", { title: item.title })}
            className="block break-words font-semibold hover:underline sm:truncate"
          >
            {item.isKey && <KeyTaskMark label={t("keyTask")} className="mr-1.5 align-middle" />}
            {item.title}
          </Link>
          {(meta || assignee) && (
            <span className="block break-words text-muted-foreground text-small sm:truncate">
              {meta && item.metaHref ? (
                <Link href={item.metaHref as never} className="hover:underline">
                  {meta}
                </Link>
              ) : (
                meta
              )}
              {assignee && (
                <>
                  {meta && " · "}
                  {assignee}
                </>
              )}
            </span>
          )}
        </div>
        <div className="col-start-2 flex flex-wrap items-center gap-2 sm:col-auto sm:shrink-0">
          <StatusBadge
            tone={
              item.urgency === "overdue"
                ? "critical"
                : item.urgency === "today"
                  ? "warn"
                  : "neutral"
            }
            icon={
              item.urgency === "overdue"
                ? OctagonAlert
                : item.urgency === "today"
                  ? Clock
                  : item.urgency === "waiting"
                    ? Hourglass
                    : CalendarCheck
            }
          >
            <span className="sr-only">{t(`urgencyLabel.${item.urgency}`)}: </span>
            <span className="tabular">
              {item.urgency === "waiting"
                ? relative(item)
                : `${formatDateShortYear(item.dueOn, locale, today)} · ${relative(item)}`}
            </span>
          </StatusBadge>
          {item.kind === "task" && canSnooze && (
            <SnoozeMenu task={{ id: item.id, title: item.title, status: "todo" }} today={today} />
          )}
        </div>
      </li>
    );
  }

  const allHref = (open: boolean) =>
    hrefWith("/", query, { alle: open ? "1" : undefined, aufraeumen: undefined });

  return (
    <Panel aria-labelledby="due-title">
      <PanelHeader>
        <div className="flex flex-wrap items-baseline gap-x-3">
          <PanelTitle id="due-title">{t("title")}</PanelTitle>
          <span className="text-muted-foreground text-small">{t("subtitle")}</span>
        </div>
      </PanelHeader>
      {due.items.length === 0 ? (
        <EmptyState icon={CalendarCheck} title={t("emptyTitle")} hint={t("emptyHint")} />
      ) : (
        <div className="flex flex-col">
          {GROUPS.map((urgency) => {
            const GroupIcon = GROUP_UI[urgency].icon;
            const rows = due.items.filter((i) => i.urgency === urgency);
            if (rows.length === 0) return null;
            const all = clusters(rows);
            const shown = showAll ? all : all.slice(0, DUE_PREVIEW_CLUSTERS);
            const hidden = all.length - shown.length;
            return (
              <section
                key={urgency}
                id={`faellig-${urgency}`}
                aria-label={t(`groups.${urgency}`)}
                className="mt-4 scroll-mt-20 first:mt-0"
              >
                <h3
                  className={cn(
                    "flex items-center gap-2 border-y px-4 py-2.5 font-semibold text-body",
                    GROUP_UI[urgency].band,
                  )}
                >
                  <GroupIcon aria-hidden className="size-4 shrink-0" />
                  {t(`groups.${urgency}`)}
                  <span className="tabular inline-grid h-5 min-w-6 place-items-center rounded-full bg-card/80 px-1.5 font-semibold text-tiny">
                    {rows.length}
                  </span>
                </h3>
                <ul className="m-0 flex list-none flex-col p-0">
                  {shown.map((cluster) =>
                    cluster.event ? (
                      <li
                        key={`event-${cluster.event.id}`}
                        className="border-border-subtle border-b"
                      >
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 px-4 pt-3 pb-1 text-body">
                          <MarketMarker
                            color={cluster.event.color}
                            typeKey={cluster.event.typeKey}
                          />
                          <Link
                            href={cluster.event.href as never}
                            className="min-w-0 break-words font-semibold hover:underline"
                          >
                            {cluster.event.name}
                          </Link>
                          {cluster.event.startsOn && (
                            <span className="tabular text-muted-foreground">
                              {formatDateShortYear(cluster.event.startsOn, locale, today)}
                            </span>
                          )}
                          <span className="tabular text-muted-foreground">
                            · {t("eventCount", { count: cluster.items.length })}
                          </span>
                        </div>
                        <ul className="m-0 flex list-none flex-col p-0 pb-1.5">
                          {(showAll ? cluster.items : cluster.items.slice(0, DUE_PER_MARKET)).map(
                            (item) => (
                              <DueRow key={`${item.kind}-${item.id}`} item={item} nested />
                            ),
                          )}
                          {!showAll && cluster.items.length > DUE_PER_MARKET && (
                            <li className="pl-8">
                              <details className="group">
                                <summary className="inline-flex min-h-8 cursor-pointer list-none items-center gap-1.5 px-4 text-muted-foreground text-small outline-none hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
                                  <ChevronRight
                                    aria-hidden
                                    className="size-3.5 transition-transform group-open:rotate-90"
                                  />
                                  {t("moreAtMarket", {
                                    count: cluster.items.length - DUE_PER_MARKET,
                                    name: cluster.event.name,
                                  })}
                                </summary>
                                <ul className="m-0 -ml-8 flex list-none flex-col p-0">
                                  {cluster.items.slice(DUE_PER_MARKET).map((item) => (
                                    <DueRow key={`${item.kind}-${item.id}`} item={item} nested />
                                  ))}
                                </ul>
                              </details>
                            </li>
                          )}
                        </ul>
                      </li>
                    ) : (
                      cluster.items.map((item) => (
                        <DueRow key={`${item.kind}-${item.id}`} item={item} />
                      ))
                    ),
                  )}
                  {hidden > 0 && (
                    <li className="border-border-subtle border-b">
                      <Link
                        href={allHref(true) as never}
                        scroll={false}
                        className="inline-flex min-h-9 items-center px-4 font-medium text-muted-foreground hover:text-foreground hover:underline"
                      >
                        {t("more", { count: hidden })}
                      </Link>
                    </li>
                  )}
                </ul>
              </section>
            );
          })}
          {showAll && (
            <div className="border-border-subtle border-t px-4 py-2">
              <Link
                href={allHref(false) as never}
                scroll={false}
                className="inline-flex min-h-8 items-center rounded-lg px-2 font-medium hover:bg-hover"
              >
                {t("showLess")}
              </Link>
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}
