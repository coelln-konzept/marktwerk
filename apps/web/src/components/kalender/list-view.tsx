import { addDays, daysBetween, isoWeek, mondayOf } from "@marktwerk/core";
import { CalendarX, Check, Minus } from "lucide-react";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Fragment } from "react";
import { EventStatusBadge } from "@/components/events/event-status";
import { DueBadge } from "@/components/ui/due-badge";
import { EventTypeTag } from "@/components/ui/event-type-tag";
import { KeyboardRows } from "@/components/ui/keyboard-rows";
import { MarketMarker } from "@/components/ui/market-marker";
import { EmptyState } from "@/components/ui/states";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TD, TGroup, TH, THead, TR } from "@/components/ui/table";
import { WARNING_ICON } from "@/lib/due-ui";
import { formatDateShortYear } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { CalendarItem } from "@/server/queries/due";
import type { EventRow } from "@/server/queries/events";
import { LAYER_ICONS } from "./deadline-chip";

/** "Liste · 6 Wochen": the same entries as the month view, grouped by KW with one block per day. */
export async function CalendarList({
  from,
  to,
  today,
  rows,
  deadlines,
  holidays,
  hrefFor,
  resetHref,
}: {
  from: string;
  to: string;
  today: string;
  rows: EventRow[];
  /** Entries of the module layers (Aufgaben, Genehmigungen, …). */
  deadlines: CalendarItem[];
  holidays: Map<string, string>;
  /** Link to an event (its Überblick). */
  hrefFor: (id: string) => string;
  resetHref: string;
}) {
  const t = await getTranslations("kalenderPage");
  const locale = await getLocale();

  const byDay = new Map<string, EventRow[]>();
  for (const r of rows) {
    for (
      let d = r.startsOn < from ? from : r.startsOn;
      d <= r.endsOn && d <= to;
      d = addDays(d, 1)
    ) {
      byDay.set(d, [...(byDay.get(d) ?? []), r]);
    }
  }
  const itemsByDay = new Map<string, CalendarItem[]>();
  for (const item of deadlines)
    itemsByDay.set(item.date, [...(itemsByDay.get(item.date) ?? []), item]);
  const days: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    if (byDay.has(d) || itemsByDay.has(d) || holidays.has(d)) days.push(d);
  }
  if (days.length === 0) {
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

  const relative = (day: string) => {
    const n = daysBetween(today, day);
    if (n === 0) return t("relative.today");
    if (n === 1) return t("relative.tomorrow");
    return n > 0 ? t("relative.future", { n }) : t("relative.past", { n: -n });
  };

  return (
    <KeyboardRows>
      <Table>
        <caption className="sr-only">
          {t("listCaption", {
            from: formatDateShortYear(from, locale, today),
            to: formatDateShortYear(to, locale, today),
          })}
        </caption>
        <THead>
          <tr>
            <TH className="w-44">{t("cols.date")}</TH>
            <TH>{t("cols.entry")}</TH>
            <TH className="hidden sm:table-cell">{t("cols.venue")}</TH>
            <TH>{t("cols.status")}</TH>
            <TH className="hidden sm:table-cell">
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
                const items = itemsByDay.get(day) ?? [];
                const holiday = holidays.get(day);
                const dateCell = (
                  <TD
                    key="date"
                    rowSpan={Math.max(events.length + items.length, 1)}
                    className={cn(
                      "w-44 whitespace-nowrap align-top",
                      day === today && "bg-selected",
                      holiday && "text-status-critical",
                    )}
                  >
                    <span className="tabular font-semibold">
                      {formatDateShortYear(day, locale, today)}
                    </span>
                    <span className="block text-muted-foreground text-tiny">{relative(day)}</span>
                    {holiday && <span className="block font-semibold text-tiny">{holiday}</span>}
                  </TD>
                );
                if (events.length === 0 && items.length === 0) {
                  return (
                    <TR key={day}>
                      {dateCell}
                      <TD colSpan={4} className="text-muted-foreground">
                        {t("legend.holiday")}
                      </TD>
                    </TR>
                  );
                }
                const eventRows = events.map((r, i) => {
                  const href = hrefFor(r.id);
                  return (
                    <TR
                      key={`${day}-${r.id}`}
                      tabIndex={0}
                      data-row
                      data-href={href}
                      className={cn(
                        "cursor-pointer outline-none focus-visible:bg-selected",
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
                        <Link
                          href={href as never}
                          tabIndex={-1}
                          className={cn(
                            "mr-2 font-semibold hover:underline",
                            r.status === "cancelled" && "line-through",
                          )}
                        >
                          {r.name}
                        </Link>
                        <EventTypeTag typeKey={r.typeKey}>
                          {locale === "en" ? r.typeNameEn : r.typeNameDe}
                        </EventTypeTag>
                      </TD>
                      <TD className="hidden max-w-56 truncate sm:table-cell" title={r.venueName}>
                        {r.venueName}
                      </TD>
                      <TD>
                        <EventStatusBadge status={r.status} />
                      </TD>
                      <TD className="hidden w-20 text-right sm:table-cell">
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
                const itemRows = items.map((item, i) => {
                  const Icon = LAYER_ICONS[item.layer];
                  const tone = item.tone ?? "neutral";
                  return (
                    <TR
                      key={`${day}-${item.id}`}
                      tabIndex={0}
                      data-row
                      data-href={item.href}
                      className="cursor-pointer outline-none focus-visible:bg-selected"
                    >
                      {events.length + i === 0 && dateCell}
                      <TD>
                        <Link
                          href={item.href as never}
                          tabIndex={-1}
                          className="mr-2 inline-flex items-center gap-1.5 font-semibold hover:underline"
                        >
                          <Icon aria-hidden className="size-4 shrink-0 text-foreground-2" />
                          {item.title}
                        </Link>
                        <span className="text-muted-foreground text-tiny">
                          {t(`layers.deadline.${item.layer}`)}
                        </span>
                      </TD>
                      <TD className="hidden sm:table-cell" />
                      <TD>
                        {tone === "critical" ? (
                          <DueBadge dueOn={item.date} today={today} />
                        ) : (
                          <StatusBadge
                            tone={tone}
                            icon={tone === "warn" ? WARNING_ICON : tone === "ok" ? Check : Minus}
                          >
                            {t(`tone.${tone}`)}
                          </StatusBadge>
                        )}
                      </TD>
                      <TD className="hidden w-20 text-right sm:table-cell">
                        <Link
                          href={item.href as never}
                          tabIndex={-1}
                          className="inline-flex min-h-8 items-center rounded-lg border border-input px-3 font-medium hover:bg-hover"
                        >
                          {t("open")}
                        </Link>
                      </TD>
                    </TR>
                  );
                });
                return [...eventRows, ...itemRows];
              })}
            </Fragment>
          ))}
        </tbody>
      </Table>
    </KeyboardRows>
  );
}
