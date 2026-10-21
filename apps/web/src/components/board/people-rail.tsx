"use client";

import { UserRound } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Avatar } from "@/components/ui/avatar";
import { formatHours } from "@/lib/task-ui";
import type { PeopleRail } from "@/server/queries/tasks";
import { LoadBar } from "./task-bits";

/**
 * People rail: duty holders and assignees with their load this week (estimated open hours against
 * capacity), plus the unassigned work. The load bar is a `meter` with the figures as text.
 */
export function PeopleRailPanel({
  rail,
  weekLabel,
  eventBoard,
}: {
  rail: PeopleRail;
  weekLabel: string;
  eventBoard: boolean;
}) {
  const t = useTranslations("board.rail");
  const locale = useLocale();
  return (
    <aside
      aria-label={t("title")}
      className="flex w-full min-w-0 flex-col rounded-xl border bg-card lg:w-[300px] lg:shrink-0"
    >
      <div className="flex items-baseline justify-between gap-2 border-border-subtle border-b px-4 py-3">
        <h2 className="font-semibold text-[15px]">{t("title")}</h2>
        <span className="text-muted-foreground text-tiny">{t("week", { week: weekLabel })}</span>
      </div>
      {rail.people.length === 0 ? (
        <p className="px-4 py-3 text-muted-foreground text-small">
          {eventBoard ? t("emptyEvent") : t("empty")}
        </p>
      ) : (
        <ul className="flex flex-col gap-1 p-2">
          {rail.people.map((p) => (
            <li key={p.id} className="flex flex-col gap-1.5 rounded-lg px-2 py-2">
              <div className="flex items-center gap-2.5">
                <Avatar name={p.name} size="lg" />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-semibold text-small">{p.name}</span>
                  <span className="truncate text-muted-foreground text-tiny">
                    {p.roles.length > 0
                      ? p.roles.map((r) => (locale === "en" ? r.en : r.de)).join(" · ")
                      : t("tasks", { count: p.openTasks })}
                  </span>
                </div>
                {p.roles.length > 0 && (
                  <span className="tabular text-muted-foreground text-tiny">
                    {t("tasks", { count: p.openTasks })}
                  </span>
                )}
              </div>
              <LoadBar
                hours={p.hoursThisWeek}
                capacity={p.capacityHours}
                level={p.level}
                label={t("load", { name: p.name })}
              />
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-center gap-2.5 border-border-subtle border-t px-4 py-3 text-small">
        <span className="grid size-8 place-items-center rounded-full border border-input border-dashed text-faint-foreground">
          <UserRound aria-hidden className="size-4" />
        </span>
        <span>
          {t("unassigned")}:{" "}
          <b className="tabular font-semibold">
            {t("tasks", { count: rail.unassigned.tasks })}
            {rail.unassigned.tasks > 0 && ` · ${formatHours(rail.unassigned.hours, locale)}`}
          </b>
        </span>
      </div>
      <p className="border-border-subtle border-t px-4 py-2 text-faint-foreground text-tiny">
        {t("capacityNote")}
      </p>
    </aside>
  );
}
