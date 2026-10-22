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
import { Panel, PanelHeader, PanelTitle } from "@/components/ui/panel";
import { EmptyState } from "@/components/ui/states";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatDateShort } from "@/lib/format";
import { isModuleVisible } from "@/lib/modules";
import { hrefWith } from "@/lib/url";
import type { DueItem, DueKind, DueUrgency } from "@/server/queries/due";
import type { OverviewDue } from "@/server/queries/overview";

const KIND_ICONS: Record<DueKind, LucideIcon> = {
  permit: ShieldCheck,
  installment: Wallet,
  task: CircleCheck,
  hours: Clock,
  obligation: Truck,
};

const GROUPS: DueUrgency[] = ["overdue", "today", "soon"];

/** Rows shown before "Alle anzeigen" (the list is long in a busy season). */
export const DUE_PREVIEW_ROWS = 20;

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

  return (
    <Panel aria-labelledby="due-title">
      <PanelHeader>
        <div className="flex flex-wrap items-baseline gap-x-3">
          <PanelTitle id="due-title">{t("title")}</PanelTitle>
          <span className="text-muted-foreground text-small">{t("subtitle")}</span>
        </div>
        {/* biome-ignore lint/a11y/useSemanticElements: a labelled group of filter links, not form controls */}
        <div role="group" aria-label={t("filters")} className="flex flex-wrap gap-2">
          {DUE_FILTERS.filter((key) => key === "all" || due.counts[key] > 0 || key === filter).map(
            (key) => (
              <Link
                key={key}
                href={chipHref(key) as never}
                scroll={false}
                aria-current={key === filter ? "true" : undefined}
                className="inline-flex min-h-8 items-center gap-2 whitespace-nowrap rounded-full border border-input bg-card px-3 font-medium text-small hover:bg-hover aria-[current=true]:border-foreground aria-[current=true]:bg-foreground aria-[current=true]:text-background"
              >
                {t(`filter.${key}`)}
                <span className="tabular inline-grid h-5 min-w-5 place-items-center rounded-full bg-status-neutral-bg px-1 font-semibold text-[11.5px] text-foreground-2 in-aria-[current=true]:bg-white/20 in-aria-[current=true]:text-inherit">
                  {due.counts[key]}
                </span>
              </Link>
            ),
          )}
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
                  {rows.map((item) => {
                    const Icon = KIND_ICONS[item.kind];
                    return (
                      <li
                        key={`${item.kind}-${item.id}`}
                        className="flex flex-wrap items-center gap-x-3 gap-y-1 border-border-subtle border-b px-4 py-2 last:border-b-0 hover:bg-hover"
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
                          <span className="block truncate text-muted-foreground text-small">
                            {item.meta && item.metaHref ? (
                              <Link href={item.metaHref as never} className="hover:underline">
                                {item.meta}
                              </Link>
                            ) : (
                              item.meta
                            )}
                            {item.assigneeName && isModuleVisible("team") && (
                              <>
                                {item.meta && " · "}
                                {t("assignee", { name: item.assigneeName })}
                              </>
                            )}
                          </span>
                        </div>
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
                                : CalendarCheck
                          }
                        >
                          <span className="sr-only">{t(`urgencyLabel.${item.urgency}`)}: </span>
                          <span className="tabular">
                            {formatDateShort(item.dueOn, locale)} · {relative(item)}
                          </span>
                        </StatusBadge>
                        {item.kind === "task" && canSnooze && (
                          <SnoozeMenu
                            task={{ id: item.id, title: item.title, status: "todo" }}
                            today={today}
                          />
                        )}
                        <Link
                          href={item.href as never}
                          tabIndex={-1}
                          className="inline-flex min-h-8 items-center rounded-lg border border-input bg-card px-3 font-medium hover:bg-hover"
                        >
                          {t("open")}
                        </Link>
                      </li>
                    );
                  })}
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
