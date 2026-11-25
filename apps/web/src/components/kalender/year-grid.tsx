import { type MonthWeek, weekday } from "@marktwerk/core";
import { TriangleAlert } from "lucide-react";
import Link from "next/link";
import { MarketMarker } from "@/components/ui/market-marker";
import type { CalendarHoliday } from "@/lib/holidays";
import { cn } from "@/lib/utils";
import { EventPopoverTrigger } from "./event-popover";

/** One dot of the Jahresübersicht: an event on one day. */
export type YearDotView = {
  key: string;
  eventId: string;
  /** The event page (middle-click, "open in new tab"); a plain click opens the event popover. */
  href: string;
  /** The market's Kürzel; none for an Einzeltermin (its type square stands alone). */
  code?: string;
  color: string | null;
  typeKey: string;
  cancelled: boolean;
  /** Spoken name and tooltip: "Altstadt (ALT), Sa 6. März", plus "Tag 2/3", "abgesagt", the holiday. */
  label: string;
};

export type YearMonthView = {
  /** "2027-03" */
  key: string;
  /** "März" */
  title: string;
  /** The month in the Monat view, and the accessible name of that link ("März 2027 in der Monatsansicht"). */
  href: string;
  hrefLabel: string;
  weeks: MonthWeek[];
};

/**
 * The Jahresübersicht (Fahrplan R22, research 13 G2): twelve compact month grids like the office's wall
 * calendar. Monday first with a KW column, Saturday and Sunday shaded (that is where the markets are). Every
 * event date is a dot in the market colour with the market's Kürzel; cancelled ones are faded and struck
 * through. NRW holidays are tinted like in Monat, stille Feiertage carry the amber warning. A dot opens the
 * Kalender's event popover; the month title opens that month in Monat. Prints on one A4 landscape page
 * (three months across, four down) with the legend.
 */
export function YearGrid({
  months,
  weekdays,
  weekLabel,
  today,
  holidays,
  dots,
}: {
  months: YearMonthView[];
  /** "Mo,Di,…,So" split. */
  weekdays: string[];
  weekLabel: string;
  today: string;
  holidays: Map<string, CalendarHoliday>;
  dots: Map<string, YearDotView[]>;
}) {
  return (
    <ol className="m-0 grid list-none grid-cols-1 gap-4 p-0 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 print:grid-cols-3 print:gap-x-[5mm] print:gap-y-[1.5mm]">
      {months.map((month) => (
        <li
          key={month.key}
          className="min-w-0 break-inside-avoid rounded-xl border bg-card p-2 shadow-card print:rounded-none print:border-0 print:p-0 print:shadow-none"
        >
          <table className="w-full table-fixed border-collapse text-tiny print:text-[6.5pt]">
            <caption className="px-1 pb-1 text-left print:px-0 print:pb-[0.5mm]">
              <Link
                href={month.href as never}
                aria-label={month.hrefLabel}
                className="inline-flex min-h-7 items-center rounded-md px-1 font-semibold text-[14px] hover:bg-hover focus-visible:outline-2 focus-visible:outline-ring print:min-h-0 print:px-0 print:text-[7.5pt]"
              >
                {month.title}
              </Link>
            </caption>
            <colgroup>
              <col className="w-7 print:w-[5mm]" />
              {weekdays.map((d) => (
                <col key={d} />
              ))}
            </colgroup>
            <thead>
              <tr className="text-muted-foreground">
                <th scope="col" className="px-0.5 pb-0.5 text-left font-semibold print:pb-0">
                  {weekLabel}
                </th>
                {weekdays.map((d) => (
                  <th
                    key={d}
                    scope="col"
                    className="px-0.5 pb-0.5 text-left font-semibold print:pb-0"
                  >
                    {d}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {month.weeks.map((week) => (
                <tr key={week.week}>
                  <th
                    scope="row"
                    className="tabular border-border-subtle border-t px-0.5 py-0.5 text-left align-top font-normal text-faint-foreground print:py-[0.2mm]"
                  >
                    {week.week}
                  </th>
                  {week.days.map((day, i) =>
                    day ? (
                      <DayCell
                        key={day}
                        day={day}
                        today={today}
                        holiday={holidays.get(day)}
                        dots={dots.get(day) ?? []}
                      />
                    ) : (
                      <td key={`pad-${weekdays[i]}`} className="border-border-subtle border-t" />
                    ),
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </li>
      ))}
    </ol>
  );
}

function DayCell({
  day,
  today,
  holiday,
  dots,
}: {
  day: string;
  today: string;
  holiday: CalendarHoliday | undefined;
  dots: YearDotView[];
}) {
  const dayOff = holiday?.dayOff ?? false;
  const dow = weekday(day);
  const weekend = dow === 0 || dow === 6;
  const holidayTitle = holiday
    ? [holiday.name, holiday.quiet].filter(Boolean).join(" · ")
    : undefined;
  return (
    <td
      className={cn(
        "h-10 border-border-subtle border-t border-l px-0.5 py-0.5 align-top print:h-[4.6mm] print:py-[0.2mm]",
        weekend && "bg-surface-2",
        dayOff && "bg-status-critical-bg/70",
        day === today && "outline-2 outline-primary -outline-offset-2",
      )}
    >
      <div className="flex flex-wrap items-center gap-x-1 gap-y-px leading-none">
        <span
          title={holidayTitle}
          className={cn(
            "tabular inline-flex items-center gap-px font-semibold",
            weekend ? "text-foreground" : "text-muted-foreground",
            holiday && (dayOff ? "text-status-critical" : "text-status-warn"),
          )}
        >
          {Number(day.slice(8, 10))}
          {holiday?.quiet && (
            <TriangleAlert
              aria-hidden
              className="size-2.5 shrink-0 text-status-warn print:size-[2mm]"
              strokeWidth={2.75}
            />
          )}
          {holiday && (
            <span className="sr-only">
              {`: ${holiday.name}`}
              {holiday.quiet ? `, ${holiday.quiet}` : ""}
            </span>
          )}
        </span>
        {dots.map((dot) => (
          <YearDot key={dot.key} dot={dot} />
        ))}
      </div>
    </td>
  );
}

function YearDot({ dot }: { dot: YearDotView }) {
  return (
    <EventPopoverTrigger
      eventId={dot.eventId}
      href={dot.href}
      title={dot.label}
      className="inline-flex cursor-pointer items-center gap-[2px] rounded-sm px-px font-semibold text-[10px] leading-none tracking-wide hover:bg-hover focus-visible:outline-2 focus-visible:outline-ring data-[popup-open]:outline-2 data-[popup-open]:outline-ring print:text-[6pt]"
    >
      <span
        aria-hidden
        className={cn(
          "inline-flex items-center gap-[2px]",
          dot.cancelled && "text-muted-foreground opacity-60",
        )}
      >
        <MarketMarker
          color={dot.color}
          typeKey={dot.typeKey}
          shape="dot"
          className="size-[7px] print:size-[1.8mm]"
        />
        {dot.code && <span className={cn(dot.cancelled && "line-through")}>{dot.code}</span>}
      </span>
      <span className="sr-only">{dot.label}</span>
    </EventPopoverTrigger>
  );
}
