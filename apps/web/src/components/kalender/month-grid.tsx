import { addDays, daysInMonth, isoDate, isoWeek, mondayOf, weekday } from "@marktwerk/core";
import Link from "next/link";
import { cn } from "@/lib/utils";

export type CalendarEntry = {
  key: string;
  date: string;
  node: React.ReactNode;
};

/**
 * Month grid with a KW column, weeks starting Monday (UX concept §8). Days outside the month are
 * dimmed, holidays tinted, today outlined, weekends with 4+ events flagged. Saturday and Sunday get
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
  moreHref,
  maxPerDay = 4,
}: {
  /** "YYYY-MM" */
  month: string;
  weekdays: string[];
  weekLabel: string;
  today: string;
  holidays: Map<string, string>;
  entries: CalendarEntry[];
  flaggedSaturdays?: Set<string>;
  flagLabel?: string;
  moreLabel: (n: number) => string;
  /** Accessible name of the "weitere" link, which names the day ("3 weitere am 7. Dezember"). */
  moreAria: (n: number, day: string) => string;
  /** The list starting at that day: where "+ N weitere" leads. */
  moreHref: (day: string) => string;
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
    <div className="overflow-x-auto">
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
                const items = byDay.get(day) ?? [];
                const flagged = weekday(day) === 6 && flaggedSaturdays.has(day);
                return (
                  <td
                    key={day}
                    className={cn(
                      "h-28 border-b border-l px-1.5 py-1 align-top",
                      !inMonth && "bg-surface-2 text-faint-foreground",
                      holiday && inMonth && "bg-status-critical-bg/60",
                      day === today && "outline-2 outline-primary -outline-offset-2",
                    )}
                  >
                    <div className="mb-1 flex items-center gap-1 text-small">
                      <span
                        className={cn("tabular font-semibold", holiday && "text-status-critical")}
                      >
                        {Number(day.slice(8, 10))}
                      </span>
                      {holiday && (
                        <span className="truncate text-status-critical text-tiny">{holiday}</span>
                      )}
                      {flagged && (
                        <span className="ml-auto text-status-warn text-tiny" title={flagLabel}>
                          ⚑
                        </span>
                      )}
                    </div>
                    <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
                      {items.slice(0, maxPerDay).map((item) => (
                        <li key={item.key}>{item.node}</li>
                      ))}
                      {items.length > maxPerDay && (
                        <li>
                          <Link
                            href={moreHref(day) as never}
                            aria-label={moreAria(items.length - maxPerDay, day)}
                            scroll={false}
                            className="block rounded-md px-1 py-0.5 font-medium text-accent-soft-foreground text-tiny hover:underline"
                          >
                            {moreLabel(items.length - maxPerDay)}
                          </Link>
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
