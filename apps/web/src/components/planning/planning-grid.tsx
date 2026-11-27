"use client";

import { Menu } from "@base-ui/react/menu";
import { useLocale, useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { formatMinutesAsHours, formatMonth, formatWeekdayDayMonth } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { PlanningMonth, PlanningPerson } from "@/server/queries/planning";
import { BudgetBar } from "./budget-bar";
import { CellMenuItems, type CellPayload } from "./cell-menu";
import { DayHeader } from "./day-header";
import { usePlanningActions } from "./planning-toasts";
import { ShiftChip } from "./shift-chip";

const ARROWS: Record<string, [number, number]> = {
  ArrowUp: [-1, 0],
  ArrowDown: [1, 0],
  ArrowLeft: [0, -1],
  ArrowRight: [0, 1],
};

/** "Nicht verfügbar": a hatched cell (plus the text, so the pattern is never the only cue). */
const HATCHED =
  "bg-[repeating-linear-gradient(135deg,transparent_0_6px,var(--color-sunken)_6px_12px)]";

/**
 * Team › Planung (spec §6): people × market days of one month. Sticky first column with the month budget,
 * a "KW n" total after each week, day heads with the open slots. Each cell is a button that opens the cell
 * menu; the arrow keys move between cells (one tab stop for the whole grid), Enter/Space open the menu.
 */
export function PlanningGrid({ data }: { data: PlanningMonth }) {
  const t = useTranslations("planning");
  const locale = useLocale();
  const actions = usePlanningActions();
  const [handle] = useState(() => Menu.createHandle<CellPayload>());
  const [focus, setFocus] = useState<[number, number]>([0, 0]);
  const table = useRef<HTMLTableElement>(null);

  if (data.days.length === 0 || data.people.length === 0)
    return <p className="text-muted-foreground">{t("noDays")}</p>;

  const personById = new Map(data.people.map((p) => [p.staffMemberId, p]));
  // The one tab stop of the grid; clamped when a refresh shrinks the grid.
  const stop = [
    Math.min(focus[0], data.people.length - 1),
    Math.min(focus[1], data.days.length - 1),
  ];

  const move = (event: React.KeyboardEvent<HTMLElement>, row: number, col: number) => {
    const delta = ARROWS[event.key];
    if (!delta) return false;
    event.preventDefault();
    table.current
      ?.querySelector<HTMLElement>(`[data-row="${row + delta[0]}"][data-col="${col + delta[1]}"]`)
      ?.focus();
    return true;
  };

  const cell = (person: PlanningPerson, day: string, row: number, col: number) => {
    const shifts = (person.shiftsByDay[day] ?? []).filter((s) => s.status !== "cancelled");
    const away = day in person.unavailable;
    const note = person.unavailable[day] ?? null;
    return (
      <td key={day} className="border-input border-b p-0.5 align-top">
        <Menu.Trigger
          handle={handle}
          payload={{ staffMemberId: person.staffMemberId, day }}
          data-row={row}
          data-col={col}
          tabIndex={stop[0] === row && stop[1] === col ? 0 : -1}
          aria-busy={actions.pending || undefined}
          title={away && note ? note : undefined}
          onFocus={() => setFocus([row, col])}
          onKeyDown={(event) => {
            // The arrows move between cells; base-ui would open the menu on ArrowDown.
            if (move(event, row, col)) event.preventBaseUIHandler();
          }}
          className={cn(
            "flex min-h-11 w-full min-w-28 cursor-pointer flex-col items-start gap-0.5 rounded p-0.5 text-left hover:bg-hover focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-2 data-[popup-open]:bg-selected",
            away && HATCHED,
          )}
        >
          <span className="sr-only">
            {person.displayName}, {formatWeekdayDayMonth(day, locale)}
          </span>
          {shifts.map((s) => (
            <ShiftChip key={s.id} shift={s} />
          ))}
          {away && (
            <span className="max-w-full truncate text-muted-foreground text-tiny">
              {t("unavailable")}
              {note ? `: ${note}` : ""}
            </span>
          )}
        </Menu.Trigger>
      </td>
    );
  };

  return (
    <>
      <div className="overflow-x-auto rounded-xl border bg-card">
        <table ref={table} className="border-separate border-spacing-0 text-small">
          <caption className="sr-only">
            {t("caption", { month: formatMonth(data.month, locale) })}
          </caption>
          <thead>
            <tr>
              <th
                scope="col"
                className="sticky left-0 z-10 border-input border-b bg-card px-3 py-1 text-left align-bottom font-semibold"
              >
                {t("person")}
              </th>
              {data.weeks.flatMap((w) => [
                ...w.days.map((day) => (
                  <DayHeader key={day} day={day} needs={data.needsByDay[day] ?? []} />
                )),
                <th
                  key={w.key}
                  scope="col"
                  aria-label={t("weekTotalLabel", { week: w.week })}
                  className="border-input border-b border-l bg-sunken px-2 py-1 text-right align-bottom font-semibold text-muted-foreground text-tiny"
                >
                  {t("weekTotal", { week: w.week })}
                </th>,
              ])}
            </tr>
          </thead>
          <tbody>
            {data.people.map((person, row) => {
              let col = 0;
              return (
                <tr key={person.staffMemberId}>
                  <th
                    scope="row"
                    className="sticky left-0 z-10 border-input border-b bg-card px-3 py-1.5 text-left align-top font-semibold"
                  >
                    <div className="truncate">{person.displayName}</div>
                    <BudgetBar
                      usedMinutes={person.budgetMinutes - person.leftMinutes}
                      budgetMinutes={person.budgetMinutes}
                      requestedMinutes={person.usage.requestedMinutes}
                      level={person.level}
                      noContract={person.noContract}
                    />
                  </th>
                  {data.weeks.flatMap((w) => [
                    ...w.days.map((day) => cell(person, day, row, col++)),
                    <td
                      key={w.key}
                      className="tabular border-input border-b border-l bg-sunken px-2 text-right align-middle text-muted-foreground text-tiny"
                    >
                      {person.weeks[w.key]
                        ? formatMinutesAsHours(person.weeks[w.key] ?? 0, locale)
                        : ""}
                    </td>,
                  ])}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Menu.Root handle={handle}>
        {({ payload }) => {
          const person = payload ? personById.get(payload.staffMemberId) : undefined;
          return (
            <Menu.Portal>
              <Menu.Positioner side="bottom" align="start" sideOffset={4} className="z-50">
                <Menu.Popup
                  aria-label={
                    person && payload
                      ? t("menu.label", {
                          name: person.displayName,
                          date: formatWeekdayDayMonth(payload.day, locale),
                        })
                      : undefined
                  }
                  className="flex max-h-[min(420px,var(--available-height))] min-w-[240px] flex-col overflow-y-auto rounded-[10px] border bg-popover p-1 text-popover-foreground shadow-pop outline-hidden"
                >
                  {person && payload && (
                    <CellMenuItems
                      person={person}
                      day={payload.day}
                      needs={data.needsByDay[payload.day] ?? []}
                      actions={actions}
                    />
                  )}
                </Menu.Popup>
              </Menu.Positioner>
            </Menu.Portal>
          );
        }}
      </Menu.Root>
      {actions.dialog}
    </>
  );
}
