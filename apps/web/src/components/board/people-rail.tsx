"use client";

import { UserRound } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Avatar } from "@/components/ui/avatar";
import { formatHours } from "@/lib/task-ui";
import { cn } from "@/lib/utils";
import type { PeopleRail } from "@/server/queries/tasks";
import { usePersonDrop } from "./board-dnd";
import { LoadBar } from "./task-bits";

/** While a card is dragged the people are drop targets: dashed hint, solid ring under the pointer. */
function dropClasses(drop: { marked: boolean; ready: boolean }) {
  return cn(
    drop.ready && "outline-1 outline-primary/40 outline-dashed -outline-offset-2",
    drop.marked && "bg-status-info-bg outline-2 outline-primary outline-solid",
  );
}

/** One person of the rail; dropping a card here assigns it ("Zugewiesen an …" with undo). */
function RailPerson({ id, children }: { id: string; children: React.ReactNode }) {
  const drop = usePersonDrop(id);
  return (
    <li
      ref={drop.ref}
      className={cn("flex flex-col gap-1.5 rounded-lg px-2 py-2", dropClasses(drop))}
    >
      {children}
    </li>
  );
}

/**
 * People rail: duty holders and assignees with their load this week (estimated open hours against
 * capacity), plus the unassigned work. The load bar is a `meter` with the figures as text. Cards
 * dragged onto a person (or onto "Nicht zugewiesen") are assigned to them.
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
  const unassignedDrop = usePersonDrop(null);
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
            <RailPerson key={p.id} id={p.id}>
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
            </RailPerson>
          ))}
        </ul>
      )}
      <div
        ref={unassignedDrop.ref}
        className={cn(
          "flex items-center gap-2.5 border-border-subtle border-t px-4 py-3 text-small",
          dropClasses(unassignedDrop),
        )}
      >
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
