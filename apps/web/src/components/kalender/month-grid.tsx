import { addDays, daysInMonth, isoDate, isoWeek, mondayOf, weekday } from "@marktwerk/core";
import { Plus, TriangleAlert } from "lucide-react";
import Link from "next/link";
import type { CalendarHoliday } from "@/lib/holidays";
import { cn } from "@/lib/utils";
import { DayMore } from "./day-more";
import { MonthGridKeys } from "./month-grid-keys";

export type CalendarEntry = {
  key: string;
  date: string;
  node: React.ReactNode;
  /** A small dot or icon for the phone layout, where a day shows one per entry instead of the chips. */
  marker?: React.ReactNode;
};

/** Dots a phone day cell shows before it says "+N". */
const PHONE_MARKERS = 3;

/**
 * Month grid with a KW column, weeks starting Monday (UX concept §8). Days outside the month are
 * dimmed, holidays tinted (their names in the cell; stille Feiertage with an amber warning), today marked
 * with a filled day number and `aria-current="date"` (UX-072), weekends with 4+ events flagged. Saturday
 * and Sunday get wider columns (that is where the markets are). From `md` the grid shrinks to the available
 * width (768 px tablets show Sunday). Below `md` all seven days fit the phone (UX-003): each day shows a dot
 * per entry and opens its entries, "Besprechung anlegen" and the list in a popover.
 * The grid is one tab stop with arrow keys between the days (UX-036, `MonthGridKeys`).
 */
export function MonthGrid({
  month,
  weekdays,
  weekLabel,
  today,
  todayLabel,
  holidays,
  entries,
  flaggedSaturdays = new Set(),
  flagLabel,
  moreLabel,
  moreAria,
  dayTitle,
  dayAria,
  moreHref,
  moreListLabel,
  addHref,
  addLabel,
  addText,
  emptyDayLabel,
  maxPerDay = 4,
}: {
  /** "YYYY-MM" */
  month: string;
  weekdays: string[];
  weekLabel: string;
  today: string;
  /** "Heute", spoken after today's date. */
  todayLabel: string;
  holidays: Map<string, CalendarHoliday>;
  entries: CalendarEntry[];
  flaggedSaturdays?: Set<string>;
  flagLabel?: string;
  moreLabel: (n: number) => string;
  /** Accessible name of the "weitere" button, which names the day ("3 weitere am 7. Dezember"). */
  moreAria: (n: number, day: string) => string;
  /** Heading of the day's popover ("Sa 07.11."); also the spoken name of a day cell. */
  dayTitle: (day: string) => string;
  /** Accessible name of a phone day ("Sa 07.11., 3 Einträge anzeigen"). */
  dayAria: (n: number, day: string) => string;
  /** The list starting at that day: the link at the bottom of the popover. */
  moreHref: (day: string) => string;
  moreListLabel: string;
  /** "Besprechung anlegen" on that day (only passed when the person may create appointments). */
  addHref?: (day: string) => string;
  /** Accessible name of that link, naming the day ("Besprechung am Mo 07.12. anlegen"). */
  addLabel?: (day: string) => string;
  /** Visible text of that link in the phone popover ("Besprechung anlegen"). */
  addText?: string;
  /** "Nichts eingetragen", in the phone popover of an empty day. */
  emptyDayLabel: string;
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
  const initial = today >= first && today <= last ? today : first;

  return (
    <MonthGridKeys initial={initial}>
      {/* relative: the chips' sr-only status spans are absolutely positioned and would otherwise escape the
          scroller and widen the page on phones. */}
      <div className="relative overflow-x-auto">
        <table className="w-full table-fixed border-collapse md:min-w-[640px]">
          <colgroup>
            <col className="w-8 md:w-12" />
            {weekdays.map((d, i) => (
              <col key={d} className={i >= 5 ? "md:w-[17%]" : undefined} />
            ))}
          </colgroup>
          <thead>
            <tr className="bg-surface-2 text-left text-muted-foreground text-tiny">
              <th scope="col" className="border-b px-1 py-1.5 font-semibold md:px-2">
                {weekLabel}
              </th>
              {weekdays.map((d) => (
                <th
                  key={d}
                  scope="col"
                  className="border-b border-l px-1 py-1.5 font-semibold md:px-2"
                >
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
                  className="tabular border-b px-1 py-1.5 text-left align-top font-semibold text-muted-foreground text-tiny md:px-2"
                >
                  {isoWeek(week[0] as string).week}
                </th>
                {week.map((day) => {
                  const inMonth = day >= first && day <= last;
                  const isToday = day === today;
                  const holiday = holidays.get(day);
                  const dayOff = holiday?.dayOff ?? false;
                  const items = byDay.get(day) ?? [];
                  const flagged = weekday(day) === 6 && flaggedSaturdays.has(day);
                  const holidayTitle = holiday
                    ? [holiday.name, holiday.quiet].filter(Boolean).join(" · ")
                    : undefined;
                  const markers = items.filter((item) => item.marker);
                  return (
                    <td
                      key={day}
                      data-day={day}
                      data-add-href={addHref?.(day)}
                      tabIndex={day === initial ? 0 : -1}
                      aria-current={isToday ? "date" : undefined}
                      className={cn(
                        "group/day h-16 border-b border-l px-0.5 py-1 align-top focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-2 md:h-28 md:px-1.5",
                        !inMonth && "bg-surface-2 text-faint-foreground",
                        dayOff && inMonth && "bg-status-critical-bg/60",
                      )}
                    >
                      <div className="mb-1 flex items-center gap-1 text-small">
                        {/* Today: a filled day number (not an outline only) and "Heute" for screen readers. */}
                        <span
                          className={cn(
                            "tabular inline-grid h-5 min-w-5 place-items-center rounded-full font-semibold",
                            dayOff && "text-status-critical",
                            isToday && "bg-primary px-1 text-primary-foreground",
                          )}
                        >
                          <span aria-hidden>{Number(day.slice(8, 10))}</span>
                          <span className="sr-only">
                            {dayTitle(day)}
                            {isToday ? `, ${todayLabel}` : ""}
                          </span>
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
                            <span className="truncate max-md:sr-only">{holiday.name}</span>
                            {holiday.quiet && <span className="sr-only">: {holiday.quiet}</span>}
                          </span>
                        )}
                        <span className="ml-auto flex items-center gap-1 max-md:hidden">
                          {flagged && (
                            <span className="text-status-warn text-tiny" title={flagLabel}>
                              ⚑
                            </span>
                          )}
                          {addHref && addLabel && (
                            // Out of the tab order (UX-036): N on the focused day does the same.
                            <Link
                              href={addHref(day) as never}
                              scroll={false}
                              tabIndex={-1}
                              data-add
                              aria-label={addLabel(day)}
                              title={addLabel(day)}
                              className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground opacity-0 hover:bg-hover hover:text-foreground focus-visible:opacity-100 group-focus-within/day:opacity-100 group-hover/day:opacity-100 touch:opacity-100"
                            >
                              <Plus aria-hidden className="size-3.5" />
                            </Link>
                          )}
                        </span>
                      </div>
                      {/* Phone: one dot per entry; the day opens its entries in a popover. */}
                      <div className="md:hidden">
                        {(items.length > 0 || (inMonth && addHref)) && (
                          <DayMore
                            aria={dayAria(items.length, day)}
                            title={dayTitle(day)}
                            listHref={moreHref(day)}
                            listLabel={moreListLabel}
                            addHref={addHref?.(day)}
                            addLabel={addText}
                            emptyLabel={emptyDayLabel}
                            triggerClassName="flex min-h-8 flex-wrap items-center gap-0.5 px-0.5 hover:no-underline"
                            trigger={
                              <>
                                {flagged && (
                                  <span aria-hidden className="text-status-warn text-tiny">
                                    ⚑
                                  </span>
                                )}
                                {markers.slice(0, PHONE_MARKERS).map((item) => (
                                  <span key={item.key} className="inline-flex">
                                    {item.marker}
                                  </span>
                                ))}
                                {markers.length > PHONE_MARKERS && (
                                  <span className="tabular font-semibold text-[10.5px] text-foreground-2">
                                    +{markers.length - PHONE_MARKERS}
                                  </span>
                                )}
                              </>
                            }
                          >
                            {items.map((item) => (
                              <li key={item.key}>{item.node}</li>
                            ))}
                          </DayMore>
                        )}
                      </div>
                      <ul className="m-0 flex list-none flex-col gap-0.5 p-0 max-md:hidden">
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
    </MonthGridKeys>
  );
}
