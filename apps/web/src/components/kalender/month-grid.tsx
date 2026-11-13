import { addDays, daysInMonth, isoDate, isoWeek, mondayOf, weekday } from "@marktwerk/core";
import { Plus, TriangleAlert } from "lucide-react";
import Link from "next/link";
import type { CalendarHoliday } from "@/lib/holidays";
import { cn } from "@/lib/utils";
import { DayMore } from "./day-more";

export type CalendarEntry = {
  key: string;
  date: string;
  node: React.ReactNode;
};

/**
 * Month grid with a KW column, weeks starting Monday (UX concept §8). Days outside the month are
 * dimmed, holidays tinted (their names in the cell; stille Feiertage with an amber warning), today outlined, weekends with 4+ events flagged. Saturday and Sunday get
 * wider columns (that is where the markets are). From `md` the grid shrinks to the available width
 * (768 px tablets show Sunday); below it the grid scrolls sideways inside its panel.
 */
export function MonthGrid({
  month,
  weekdays,
  weekLabel,
  today,
  holidays,
  entries,
  flaggedSaturdays = new Set(),
  flagLabel,
  moreLabel,
  moreAria,
  dayTitle,
  moreHref,
  moreListLabel,
  addHref,
  addLabel,
  maxPerDay = 4,
}: {
  /** "YYYY-MM" */
  month: string;
  weekdays: string[];
  weekLabel: string;
  today: string;
  holidays: Map<string, CalendarHoliday>;
  entries: CalendarEntry[];
  flaggedSaturdays?: Set<string>;
  flagLabel?: string;
  moreLabel: (n: number) => string;
  /** Accessible name of the "weitere" button, which names the day ("3 weitere am 7. Dezember"). */
  moreAria: (n: number, day: string) => string;
  /** Heading of the day's popover ("Sa 07.11."). */
  dayTitle: (day: string) => string;
  /** The list starting at that day: the link at the bottom of the popover. */
  moreHref: (day: string) => string;
  moreListLabel: string;
  /** "Besprechung anlegen" on that day (only passed when the person may create appointments). */
  addHref?: (day: string) => string;
  /** Accessible name of that link, naming the day ("Besprechung am Mo 07.12. anlegen"). */
  addLabel?: (day: string) => string;
  maxPerDay?: number;
}) {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const first = isoDate(y, m, 1);
  const last = isoDate(y, m, daysInMonth(y, m));
  const start = mondayOf(first);
  const weeks: string[][] = [];
  for (let day = start; day <= last; day = addDays(day, 7)) {
    weeks.push(Array.from({ length: 7 }, (_, i) => addDays(day, i)));
  }
  const byDay = new Map<string, CalendarEntry[]>();
  for (const entry of entries) byDay.set(entry.date, [...(byDay.get(entry.date) ?? []), entry]);

  return (
    // relative: the chips' sr-only status spans are absolutely positioned and would otherwise escape the
    // scroller and widen the page on phones.
    <div className="relative overflow-x-auto">
      <table className="w-full min-w-[760px] table-fixed border-collapse md:min-w-[640px]">
        <colgroup>
          <col className="w-12" />
          {weekdays.map((d, i) => (
            <col key={d} className={i >= 5 ? "w-[17%]" : undefined} />
          ))}
        </colgroup>
        <thead>
          <tr className="bg-surface-2 text-left text-muted-foreground text-tiny">
            <th scope="col" className="w-12 border-b px-2 py-1.5 font-semibold">
              {weekLabel}
            </th>
            {weekdays.map((d) => (
              <th key={d} scope="col" className="border-b border-l px-2 py-1.5 font-semibold">
                {d}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((week) => (
            <tr key={week[0]}>
              <th
                scope="row"
                className="tabular border-b px-2 py-1.5 text-left align-top font-semibold text-muted-foreground text-tiny"
              >
                {isoWeek(week[0] as string).week}
              </th>
              {week.map((day) => {
                const inMonth = day >= first && day <= last;
                const holiday = holidays.get(day);
                const dayOff = holiday?.dayOff ?? false;
                const items = byDay.get(day) ?? [];
                const flagged = weekday(day) === 6 && flaggedSaturdays.has(day);
                const holidayTitle = holiday
                  ? [holiday.name, holiday.quiet].filter(Boolean).join(" · ")
                  : undefined;
                return (
                  <td
                    key={day}
                    className={cn(
                      "group/day h-28 border-b border-l px-1.5 py-1 align-top",
                      !inMonth && "bg-surface-2 text-faint-foreground",
                      dayOff && inMonth && "bg-status-critical-bg/60",
                      day === today && "outline-2 outline-primary -outline-offset-2",
                    )}
                  >
                    <div className="mb-1 flex items-center gap-1 text-small">
                      <span
                        className={cn("tabular font-semibold", dayOff && "text-status-critical")}
                      >
                        {Number(day.slice(8, 10))}
                      </span>
                      {holiday && (
                        // Stiller Feiertag: amber warning icon, the hours in the tooltip (FeiertG NW §6).
                        <span
                          title={holidayTitle}
                          className={cn(
                            "flex min-w-0 items-center gap-0.5 text-tiny",
                            dayOff ? "text-status-critical" : "text-status-warn",
                          )}
                        >
                          {holiday.quiet && (
                            <TriangleAlert
                              aria-hidden
                              className="size-3 shrink-0 text-status-warn"
                              strokeWidth={2.5}
                            />
                          )}
                          <span className="truncate">{holiday.name}</span>
                          {holiday.quiet && <span className="sr-only">: {holiday.quiet}</span>}
                        </span>
                      )}
                      <span className="ml-auto flex items-center gap-1">
                        {flagged && (
                          <span className="text-status-warn text-tiny" title={flagLabel}>
                            ⚑
                          </span>
                        )}
                        {addHref && addLabel && (
                          <Link
                            href={addHref(day) as never}
                            scroll={false}
                            aria-label={addLabel(day)}
                            title={addLabel(day)}
                            className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground opacity-0 hover:bg-hover hover:text-foreground focus-visible:opacity-100 group-focus-within/day:opacity-100 group-hover/day:opacity-100 touch:opacity-100"
                          >
                            <Plus aria-hidden className="size-3.5" />
                          </Link>
                        )}
                      </span>
                    </div>
                    <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
                      {items.slice(0, maxPerDay).map((item) => (
                        <li key={item.key}>{item.node}</li>
                      ))}
                      {items.length > maxPerDay && (
                        <li>
                          <DayMore
                            label={moreLabel(items.length - maxPerDay)}
                            aria={moreAria(items.length - maxPerDay, day)}
                            title={dayTitle(day)}
                            listHref={moreHref(day)}
                            listLabel={moreListLabel}
                          >
                            {items.map((item) => (
                              <li key={item.key}>{item.node}</li>
                            ))}
                          </DayMore>
                        </li>
                      )}
                    </ul>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
