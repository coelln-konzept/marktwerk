"use client";

import { isFinishedStatus } from "@marktwerk/core";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useMemo } from "react";
import { EventTypeMarker } from "@/components/ui/event-type-tag";
import { formatDateWithWeekday } from "@/lib/format";
import { isModuleVisible } from "@/lib/modules";
import { formatHours } from "@/lib/task-ui";
import type { BoardTask } from "@/server/queries/tasks";
import { TaskCard } from "./task-card";

/** "Gruppiert": open tasks grouped by event or by due day (overdue first), same cards as the board. */
export function GroupedCards({
  tasks,
  groupBy,
  today,
}: {
  tasks: BoardTask[];
  groupBy: "event" | "day";
  today: string;
}) {
  const t = useTranslations("board");
  const locale = useLocale();
  const groups = useMemo(() => {
    const map = new Map<
      string,
      {
        key: string;
        label: string;
        href?: string;
        typeKey?: string | null;
        first: string;
        cards: BoardTask[];
      }
    >();
    for (const card of tasks) {
      if (isFinishedStatus(card.status)) continue;
      let key: string;
      let label: string;
      let href: string | undefined;
      let typeKey: string | null = null;
      if (groupBy === "event") {
        typeKey = card.eventTypeKey;
        key = card.eventId ?? "none";
        label = card.eventName ?? t("group.noEvent");
        href = card.eventId ? `/veranstaltungen/${card.eventId}/board` : undefined;
      } else if (card.dueOn === null) {
        key = "9999-none";
        label = t("group.noDate");
      } else if (card.dueOn < today) {
        key = "0000-overdue";
        label = t("group.overdue");
      } else {
        key = card.dueOn;
        label = `${formatDateWithWeekday(card.dueOn, locale)}${card.dueOn === today ? ` · ${t("group.today")}` : ""}`;
      }
      const group = map.get(key) ?? {
        key,
        label,
        href,
        typeKey,
        first: card.dueOn ?? "9999",
        cards: [],
      };
      if (card.dueOn && card.dueOn < group.first) group.first = card.dueOn;
      group.cards.push(card);
      map.set(key, group);
    }
    const list = [...map.values()];
    if (groupBy === "day") return list.sort((a, b) => (a.key < b.key ? -1 : 1));
    return list.sort((a, b) =>
      a.first < b.first ? -1 : a.first > b.first ? 1 : a.label.localeCompare(b.label, "de"),
    );
  }, [tasks, groupBy, today, t, locale]);

  return (
    <div className="flex flex-col gap-4">
      {groups.map((group) => {
        const hours = group.cards.reduce((n, c) => n + c.estimateMinutes, 0) / 60;
        return (
          <section
            key={group.key}
            aria-label={group.label}
            className="flex flex-col gap-3 rounded-xl border border-border bg-sunken p-3 sm:p-4"
          >
            <h3 className="flex items-center gap-2.5 font-semibold text-base leading-tight">
              <EventTypeMarker typeKey={group.typeKey} className="size-3" />
              {group.href ? (
                <Link href={group.href as never} className="hover:underline">
                  {group.label}
                </Link>
              ) : (
                group.label
              )}
              <span className="tabular inline-grid h-5 min-w-5 place-items-center rounded-full bg-status-neutral-bg px-1 font-semibold text-[11.5px] text-foreground-2">
                {group.cards.length}
              </span>
              {hours > 0 && isModuleVisible("estimates") && (
                <span className="tabular font-normal text-muted-foreground text-tiny">
                  {formatHours(hours, locale)}
                </span>
              )}
            </h3>
            <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {group.cards.map((card) => (
                <TaskCard key={card.id} task={card} hideEvent={groupBy === "event"} />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
