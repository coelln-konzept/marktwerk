import { addDays, dayDistance, daysBetween, isoWeek, mondayOf } from "@marktwerk/core";
import { CalendarClock, CalendarX, Clock, OctagonAlert, Plus, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Fragment } from "react";
import { EventStatusBadge } from "@/components/events/event-status";
import { EventTypeTag } from "@/components/ui/event-type-tag";
import { KeyboardRows } from "@/components/ui/keyboard-rows";
import { MarketMarker } from "@/components/ui/market-marker";
import { EmptyState } from "@/components/ui/states";
import { StatusBadge } from "@/components/ui/status-badge";
import { rowFocus, Table, TD, TGroup, TH, THead, TR } from "@/components/ui/table";
import { formatDateShortYear, formatDateWithWeekday } from "@/lib/format";
import type { CalendarHoliday } from "@/lib/holidays";
import { cn } from "@/lib/utils";
import type { AppointmentView } from "@/server/queries/appointments";
import type { EventRow } from "@/server/queries/events";
import { LAYER_ICONS } from "./deadline-chip";
import { DeadlineGroup } from "./deadline-group";
import { EventPopoverTrigger } from "./event-popover";
import type { DisplayItem } from "./group-deadlines";

/** "Liste · 6 Wochen": the same entries as the month view, grouped by KW with one block per day. */
export async function CalendarList({
  from,
  to,
  today,
  rows,
  deadlines,
  appointments = [],
  appointmentHref,
  holidays,
  hrefFor,
  resetHref,
  addHref,
  addLabel,
}: {
  from: string;
  to: string;
  today: string;
  rows: EventRow[];
  /** Entries of the module layers (Aufgaben, Genehmigungen, …). */
  deadlines: DisplayItem[];
  /** Besprechungen in the range (all-day first, then by time), shown before the deadlines of their day. */
  appointments?: AppointmentView[];
  /** Link to a Besprechung's Vorschau. */
  appointmentHref?: (id: string) => string;
  holidays: Map<string, CalendarHoliday>;
  /** Link to an event (its Überblick). */
  hrefFor: (id: string) => string;
  resetHref: string;
  /** "Besprechung anlegen" on that day (only passed when the person may create appointments). */
  addHref?: (day: string) => string;
  /** Accessible name of that link, naming the day. */
  addLabel?: (day: string) => string;
}) {
  const t = await getTranslations("kalenderPage");
  const locale = await getLocale();
  const tAppt = await getTranslations("appointments");

  // One row per event, on its first day in the range; a multi-day event says how long it runs (UT-11 #1).
  const byDay = new Map<string, EventRow[]>();
  for (const r of rows) {
    const d = r.startsOn < from ? from : r.startsOn;
    if (d > to || r.endsOn < from) continue;
    byDay.set(d, [...(byDay.get(d) ?? []), r]);
  }
  const itemsByDay = new Map<string, DisplayItem[]>();
  for (const item of deadlines)
    itemsByDay.set(item.date, [...(itemsByDay.get(item.date) ?? []), item]);
  const appointmentsByDay = new Map<string, AppointmentView[]>();
  for (const a of appointments)
    appointmentsByDay.set(a.onDate, [...(appointmentsByDay.get(a.onDate) ?? []), a]);
  const days: string[] = [];
  let hasEntries = false;
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const busy = byDay.has(d) || appointmentsByDay.has(d) || itemsByDay.has(d) || holidays.has(d);
    if (busy) hasEntries = true;
    // Today is always a row (even when nothing happens), so the list shows where "now" is.
    if (busy || d === today) days.push(d);
  }
  if (!hasEntries) {
    return (
      <EmptyState icon={CalendarX} title={t("emptyList")} hint={t("emptyListHint")}>
        <Link
          href={resetHref as never}
          className="inline-flex min-h-8 items-center rounded-lg border border-input bg-card px-3 font-medium hover:bg-hover"
        >
          {t("emptyReset")}
        </Link>
      </EmptyState>
    );
  }

  const weeks = new Map<string, string[]>();
  for (const d of days) weeks.set(mondayOf(d), [...(weeks.get(mondayOf(d)) ?? []), d]);

  // Words, not "in 47 T" (decision 2026-10-29): the due vocabulary for what is ahead, the same shape for the past.
  const tDue = await getTranslations("due");
  const relative = (day: string) => {
    const distance = dayDistance(day, today);
    if (distance.when === "today") return tDue("today");
    if (distance.when === "future") {
      if (distance.unit === "day" && distance.count === 1) return tDue("tomorrow");
      return tDue(
        distance.unit === "day" ? "inDays" : distance.unit === "week" ? "inWeeks" : "inMonths",
        { count: distance.count },
      );
    }
    if (distance.unit === "day" && distance.count === 1) return t("relative.yesterday");
    return t(
      distance.unit === "day"
        ? "relative.pastDays"
        : distance.unit === "week"
          ? "relative.pastWeeks"
          : "relative.pastMonths",
      { count: distance.count },
    );
  };

  return (
    <KeyboardRows>
      {/* Columns follow the list's own width (the Ebenen panel beside it takes 260 px), not the window's:
          Ort folds under the entry below 48 rem, the Öffnen button goes below 42 rem (UT-11 #5). */}
      <div className="@container">
        <Table>
          <caption className="sr-only">
            {t("listCaption", {
              from: formatDateShortYear(from, locale, today),
              to: formatDateShortYear(to, locale, today),
            })}
          </caption>
          <THead>
            <tr>
              <TH className="w-28 @3xl:w-44">{t("cols.date")}</TH>
              <TH>{t("cols.entry")}</TH>
              <TH className="hidden @3xl:table-cell">{t("cols.venue")}</TH>
              <TH>{t("cols.status")}</TH>
              <TH className="hidden @2xl:table-cell">
                <span className="sr-only">{t("open")}</span>
              </TH>
            </tr>
          </THead>
          <tbody>
            {[...weeks].map(([monday, weekDays]) => (
              <Fragment key={monday}>
                <TGroup colSpan={5}>
                  {t("week", {
                    week: isoWeek(monday).week,
                    from: formatDateShortYear(monday, locale, today),
                    to: formatDateShortYear(addDays(monday, 6), locale, today),
                  })}
                </TGroup>
                {weekDays.map((day) => {
                  const events = byDay.get(day) ?? [];
                  const dayAppointments = appointmentsByDay.get(day) ?? [];
                  const items = itemsByDay.get(day) ?? [];
                  const holiday = holidays.get(day);
                  const dateCell = (
                    <TD
                      key="date"
                      rowSpan={Math.max(events.length + dayAppointments.length + items.length, 1)}
                      className={cn(
                        "group/day w-20 align-top @md:w-28 @3xl:w-44 @3xl:whitespace-nowrap",
                        day === today && "bg-selected",
                        holiday?.dayOff && "text-status-critical",
                      )}
                    >
                      <span className="tabular font-semibold">
                        {formatDateShortYear(day, locale, today)}
                      </span>
                      {day === today ? (
                        <span className="mt-0.5 flex items-center gap-1 font-semibold text-accent-soft-foreground text-tiny">
                          <span aria-hidden className="size-1.5 rounded-full bg-primary" />
                          {t("todayMarker")}
                        </span>
                      ) : (
                        <span className="block text-muted-foreground text-tiny">
                          {relative(day)}
                        </span>
                      )}
                      {holiday && (
                        <span
                          className={cn(
                            "flex items-center gap-0.5 font-semibold text-tiny",
                            !holiday.dayOff && "text-status-warn",
                          )}
                        >
                          {holiday.quiet && (
                            <TriangleAlert
                              aria-hidden
                              className="size-3 shrink-0 text-status-warn"
                              strokeWidth={2.5}
                            />
                          )}
                          {holiday.name}
                        </span>
                      )}
                      {addHref && addLabel && (
                        <Link
                          href={addHref(day) as never}
                          scroll={false}
                          aria-label={addLabel(day)}
                          title={addLabel(day)}
                          className="mt-1 inline-flex size-6 items-center justify-center rounded-md text-muted-foreground opacity-0 hover:bg-hover hover:text-foreground focus-visible:opacity-100 group-focus-within/day:opacity-100 group-hover/day:opacity-100 touch:opacity-100"
                        >
                          <Plus aria-hidden className="size-3.5" />
                        </Link>
                      )}
                    </TD>
                  );
                  if (events.length === 0 && dayAppointments.length === 0 && items.length === 0) {
                    return (
                      <TR key={day}>
                        {dateCell}
                        <TD colSpan={4} className="text-muted-foreground">
                          {holiday?.quiet ?? (holiday ? t("legend.holiday") : t("nothingToday"))}
                        </TD>
                      </TR>
                    );
                  }
                  // A click anywhere in the row, Enter or Space opens the event popover (UT2-08, see
                  // EventPopoverProvider); the name stays a link for a new tab, "Öffnen" goes to the event.
                  const eventRows = events.map((r, i) => {
                    const href = hrefFor(r.id);
                    return (
                      <TR
                        key={`${day}-${r.id}`}
                        tabIndex={0}
                        data-row
                        data-event-row
                        className={cn(
                          "cursor-pointer",
                          rowFocus,
                          r.status === "cancelled" && "text-muted-foreground",
                        )}
                      >
                        {i === 0 && dateCell}
                        <TD>
                          <MarketMarker
                            color={r.color}
                            typeKey={r.typeKey}
                            className="mr-2 align-middle"
                          />
                          <EventPopoverTrigger
                            eventId={r.id}
                            href={href}
                            tabIndex={-1}
                            className={cn(
                              "mr-2 cursor-pointer font-semibold hover:underline",
                              r.status === "cancelled" && "line-through",
                            )}
                          >
                            {r.name}
                          </EventPopoverTrigger>
                          <EventTypeTag typeKey={r.typeKey} className="max-sm:hidden">
                            {locale === "en" ? r.typeNameEn : r.typeNameDe}
                          </EventTypeTag>
                          {r.venueName && (
                            <span className="block text-muted-foreground text-tiny @3xl:hidden">
                              {r.venueName}
                            </span>
                          )}
                          {r.endsOn > r.startsOn && (
                            <span className="tabular block text-muted-foreground text-tiny">
                              {t("spanRange", {
                                days: daysBetween(r.startsOn, r.endsOn) + 1,
                                to: formatDateWithWeekday(r.endsOn, locale),
                              })}
                            </span>
                          )}
                        </TD>
                        <TD
                          className="hidden max-w-56 truncate @3xl:table-cell"
                          title={r.venueName}
                        >
                          {r.venueName}
                        </TD>
                        <TD>
                          <EventStatusBadge status={r.status} />
                        </TD>
                        <TD className="hidden w-20 whitespace-nowrap text-right @2xl:table-cell">
                          <Link
                            href={href as never}
                            tabIndex={-1}
                            className="inline-flex min-h-8 items-center rounded-lg border border-input px-3 font-medium hover:bg-hover"
                          >
                            {t("open")}
                          </Link>
                        </TD>
                      </TR>
                    );
                  });
                  const appointmentRows = dayAppointments.map((a, i) => {
                    const href = appointmentHref?.(a.id) ?? "#";
                    const where = a.venueName ?? a.locationText;
                    return (
                      <TR
                        key={`${day}-appointment-${a.id}`}
                        tabIndex={0}
                        data-row
                        data-href={href}
                        data-peek={href}
                        className={`cursor-pointer ${rowFocus}`}
                      >
                        {events.length + i === 0 && dateCell}
                        <TD>
                          <Link
                            href={href as never}
                            scroll={false}
                            tabIndex={-1}
                            className="mr-2 inline-flex items-center gap-1.5 font-semibold hover:underline"
                          >
                            <CalendarClock
                              aria-hidden
                              className="size-4 shrink-0 text-foreground-2"
                            />
                            <span className="tabular">{a.startsAt ?? tAppt("chip.allDay")}</span>
                            {a.title}
                          </Link>
                          <span className="text-muted-foreground text-tiny">
                            {tAppt("chip.kind")}
                          </span>
                          {where && (
                            <span className="block text-muted-foreground text-tiny @3xl:hidden">
                              {where}
                            </span>
                          )}
                        </TD>
                        <TD
                          className="hidden max-w-56 truncate @3xl:table-cell"
                          title={where ?? undefined}
                        >
                          {where}
                        </TD>
                        <TD />
                        <TD className="hidden w-20 whitespace-nowrap text-right @2xl:table-cell">
                          <Link
                            href={href as never}
                            scroll={false}
                            tabIndex={-1}
                            className="inline-flex min-h-8 items-center rounded-lg border border-input px-3 font-medium hover:bg-hover"
                          >
                            {t("open")}
                          </Link>
                        </TD>
                      </TR>
                    );
                  });
                  const itemRows = items.map((item, i) => {
                    const Icon = LAYER_ICONS[item.layer];
                    const tone = item.tone ?? "neutral";
                    const label = (
                      <>
                        <Icon aria-hidden className="size-4 shrink-0 text-foreground-2" />
                        {item.text}
                      </>
                    );
                    // A summary opens its members in place instead of the whole module (UT-11 #2).
                    const summary = item.members ? (
                      <DeadlineGroup
                        aria={t("groupAria", { text: item.text })}
                        title={item.text}
                        items={item.members}
                        allHref={item.href}
                        allLabel={item.layer === "tasks" ? t("groupAllTasks") : t("groupAll")}
                        className="mr-2 inline-flex items-center gap-1.5 rounded-md font-semibold hover:underline"
                      >
                        {label}
                      </DeadlineGroup>
                    ) : null;
                    const badge = tone === "warn" || tone === "critical";
                    return (
                      <TR
                        key={`${day}-${item.id}`}
                        tabIndex={summary ? undefined : 0}
                        data-row={summary ? undefined : true}
                        data-href={summary ? undefined : item.href}
                        className={cn(rowFocus, !summary && "cursor-pointer")}
                      >
                        {events.length + dayAppointments.length + i === 0 && dateCell}
                        {/* A calm deadline has no badge: its text takes the empty status column (on a phone the
                            title was hyphenated over half a dozen lines), on wide screens the empty Ort column. */}
                        <TD colSpan={badge ? undefined : 2}>
                          {summary ?? (
                            <Link
                              href={item.href as never}
                              tabIndex={-1}
                              className="mr-2 inline-flex items-center gap-1.5 font-semibold hover:underline"
                            >
                              {label}
                            </Link>
                          )}
                          <span className="text-muted-foreground text-tiny">
                            {t(`layers.deadline.${item.layer}`)}
                            {item.kindLabel && !item.group ? ` · ${item.kindLabel}` : ""}
                          </span>
                        </TD>
                        {badge ? (
                          <>
                            <TD className="hidden @3xl:table-cell" />
                            <TD>
                              {/* Only urgent deadlines get a state; a calm one is no "Geplant" (UT-11 #3). */}
                              <StatusBadge
                                tone={tone}
                                icon={tone === "critical" ? OctagonAlert : Clock}
                              >
                                {t(`tone.${tone}`)}
                              </StatusBadge>
                            </TD>
                          </>
                        ) : (
                          <TD className="hidden @3xl:table-cell" />
                        )}
                        <TD className="hidden w-20 whitespace-nowrap text-right @2xl:table-cell">
                          {!summary && (
                            <Link
                              href={item.href as never}
                              tabIndex={-1}
                              className="inline-flex min-h-8 items-center rounded-lg border border-input px-3 font-medium hover:bg-hover"
                            >
                              {t("open")}
                            </Link>
                          )}
                        </TD>
                      </TR>
                    );
                  });
                  return [...eventRows, ...appointmentRows, ...itemRows];
                })}
              </Fragment>
            ))}
          </tbody>
        </Table>
      </div>
    </KeyboardRows>
  );
}
