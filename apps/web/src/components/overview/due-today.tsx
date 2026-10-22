import { DUE_FILTERS, type DueFilter, daysBetween, dueFilterOf } from "@marktwerk/core";
import {
  CalendarCheck,
  CircleCheck,
  Clock,
  type LucideIcon,
  OctagonAlert,
  ShieldCheck,
  Truck,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { SnoozeMenu } from "@/components/task/snooze";
import { EventTypeMarker } from "@/components/ui/event-type-tag";
import { FilterChip, FilterChips } from "@/components/ui/filter-bar";
import { Panel, PanelHeader, PanelTitle } from "@/components/ui/panel";
import { EmptyState } from "@/components/ui/states";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatDateShort } from "@/lib/format";
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

const GROUPS: DueUrgency[] = ["overdue", "today", "soon", "upcoming"];

/** Rows shown before "Alle anzeigen" (the list is long in a busy season). */
export const DUE_PREVIEW_ROWS = 20;

type Cluster = {
  event: {
    id: string;
    name: string;
    href: string;
    typeKey: string | null;
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
          href: item.metaHref ?? `/veranstaltungen/${item.eventId}/board`,
          typeKey: item.eventTypeKey ?? null,
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
 * "Heute fällig": every module's due items, ranked (overdue · today · this week; within a group permits >
 * instalments > tasks > hours > obligations), with filter chips and counts. State lives in the URL
 * (`?faellig=geld&alle=1`), so the chips are plain links and work without JavaScript.
 */
export async function DueToday({
  due,
  filter,
  showAll,
  today,
  query,
  canSnooze,
}: {
  due: OverviewDue;
  filter: DueFilter;
  showAll: boolean;
  today: string;
  /** Current search params, so chips keep e.g. an open Vorschau. */
  query: Record<string, string | string[] | undefined>;
  /** May snooze tasks (`task:write`). */
  canSnooze: boolean;
}) {
  const t = await getTranslations("overview.due");
  const locale = await getLocale();
  const filtered =
    filter === "all" ? due.items : due.items.filter((i) => dueFilterOf(i.kind) === filter);
  const shown = showAll ? filtered : filtered.slice(0, DUE_PREVIEW_ROWS);
  const chipHref = (key: DueFilter) =>
    hrefWith("/", query, { faellig: key === "all" ? undefined : key, alle: undefined });
  const relative = (item: DueItem) => {
    const days = daysBetween(today, item.dueOn);
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
          "flex flex-wrap items-center gap-x-3 gap-y-1 px-4 hover:bg-hover",
          nested ? "py-1 pl-8" : "border-border-subtle border-b py-2 last:border-b-0",
        )}
      >
        <span
          title={t(`kind.${item.kind}`)}
          className="grid size-7 shrink-0 place-items-center rounded-lg bg-status-neutral-bg text-foreground-2"
        >
          <Icon aria-hidden className="size-4" />
          <span className="sr-only">{t(`kind.${item.kind}`)}</span>
        </span>
        <div className="min-w-0 flex-1">
          <Link
            href={item.href as never}
            aria-label={t("openItem", { title: item.title })}
            className="block truncate font-semibold hover:underline"
          >
            {item.title}
          </Link>
          {(meta || assignee) && (
            <span className="block truncate text-muted-foreground text-small">
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
        <StatusBadge
          tone={
            item.urgency === "overdue" ? "critical" : item.urgency === "today" ? "warn" : "neutral"
          }
          icon={
            item.urgency === "overdue"
              ? OctagonAlert
              : item.urgency === "today"
                ? Clock
                : CalendarCheck
          }
        >
          <span className="sr-only">{t(`urgencyLabel.${item.urgency}`)}: </span>
          <span className="tabular">
            {formatDateShort(item.dueOn, locale)} · {relative(item)}
          </span>
        </StatusBadge>
        {item.kind === "task" && canSnooze && (
          <SnoozeMenu task={{ id: item.id, title: item.title, status: "todo" }} today={today} />
        )}
      </li>
    );
  }

  return (
    <Panel aria-labelledby="due-title">
      <PanelHeader>
        <div className="flex flex-wrap items-baseline gap-x-3">
          <PanelTitle id="due-title">{t("title")}</PanelTitle>
          <span className="text-muted-foreground text-small">{t("subtitle")}</span>
        </div>
        {/* biome-ignore lint/a11y/useSemanticElements: a labelled group of filter links, not form controls */}
        <div role="group" aria-label={t("filters")}>
          <FilterChips>
            {DUE_FILTERS.filter(
              (key) => key === "all" || due.counts[key] > 0 || key === filter,
            ).map((key) => (
              <FilterChip
                key={key}
                href={chipHref(key)}
                active={key === filter}
                count={due.counts[key]}
              >
                {t(`filter.${key}`)}
              </FilterChip>
            ))}
          </FilterChips>
        </div>
      </PanelHeader>
      {filtered.length === 0 ? (
        <EmptyState
          icon={CalendarCheck}
          title={filter === "all" ? t("emptyTitle") : t("emptyFilter")}
          hint={filter === "all" ? t("emptyHint") : undefined}
        >
          {filter !== "all" && (
            <Link
              href={chipHref("all") as never}
              scroll={false}
              className="inline-flex min-h-8 items-center rounded-lg border border-input bg-card px-3 font-medium hover:bg-hover"
            >
              {t("emptyFilterReset")}
            </Link>
          )}
        </EmptyState>
      ) : (
        <div className="flex flex-col">
          {GROUPS.map((urgency) => {
            const rows = shown.filter((i) => i.urgency === urgency);
            if (rows.length === 0) return null;
            const total = filtered.filter((i) => i.urgency === urgency).length;
            return (
              <section key={urgency} aria-label={t(`groups.${urgency}`)}>
                <h3 className="flex items-center gap-2 border-border-subtle border-b bg-surface-2 px-4 py-1.5 font-semibold text-muted-foreground text-tiny uppercase tracking-wide">
                  {t(`groups.${urgency}`)}
                  <span className="tabular font-medium normal-case">{total}</span>
                </h3>
                <ul className="m-0 flex list-none flex-col p-0">
                  {clusters(rows).map((cluster) =>
                    cluster.event ? (
                      <li
                        key={`event-${cluster.event.id}`}
                        className="border-border-subtle border-b"
                      >
                        <div className="flex items-center gap-2 px-4 pt-3 pb-1 text-body">
                          <EventTypeMarker typeKey={cluster.event.typeKey} />
                          <Link
                            href={cluster.event.href as never}
                            className="truncate font-semibold hover:underline"
                          >
                            {cluster.event.name}
                          </Link>
                          {cluster.event.startsOn && (
                            <span className="tabular text-muted-foreground">
                              {formatDateShort(cluster.event.startsOn, locale)}
                            </span>
                          )}
                          <span className="tabular text-muted-foreground">
                            · {t("eventCount", { count: cluster.items.length })}
                          </span>
                        </div>
                        <ul className="m-0 flex list-none flex-col p-0 pb-1.5">
                          {cluster.items.map((item) => (
                            <DueRow key={`${item.kind}-${item.id}`} item={item} nested />
                          ))}
                        </ul>
                      </li>
                    ) : (
                      cluster.items.map((item) => (
                        <DueRow key={`${item.kind}-${item.id}`} item={item} />
                      ))
                    ),
                  )}
                </ul>
              </section>
            );
          })}
          {filtered.length > DUE_PREVIEW_ROWS && (
            <div className="border-border-subtle border-t px-4 py-2">
              <Link
                href={
                  hrefWith("/", query, {
                    faellig: filter === "all" ? undefined : filter,
                    alle: showAll ? undefined : "1",
                  }) as never
                }
                scroll={false}
                className="inline-flex min-h-8 items-center rounded-lg px-2 font-medium hover:bg-hover"
              >
                {showAll ? t("showLess") : t("showAll", { count: filtered.length })}
              </Link>
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}
