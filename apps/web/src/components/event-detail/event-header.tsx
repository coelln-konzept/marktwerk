import { can } from "@marktwerk/core";
import { CalendarDays, MapPin, Truck } from "lucide-react";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { EventStatusBadge } from "@/components/events/event-status";
import { HealthSummary } from "@/components/events/health-summary";
import { EventTypeTag } from "@/components/ui/event-type-tag";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatDateShort, formatDateWithWeekday, formatWeek } from "@/lib/format";
import { BOOKING_FLAG_ICONS } from "@/lib/status";
import type { Actor } from "@/server/actor";
import type { EventDetail } from "@/server/queries/events";
import { type EventTab, EventTabs } from "./event-tabs";
import { StatusMenu } from "./status-menu";

/** Header of the event page: name, type, status, health · date, setup, venue, preset · booking flags · tabs. */
export async function EventHeader({ event, actor }: { event: EventDetail; actor: Actor }) {
  const t = await getTranslations("eventDetail");
  const tHealth = await getTranslations("health");
  const locale = await getLocale();
  const base = `/veranstaltungen/${event.id}`;
  const multiDay = event.endsOn !== event.startsOn;
  const setup = event.anchors.find((a) => a.key === "setup_day")?.date;
  const typeName = locale === "en" ? event.type.nameEn : event.type.nameDe;
  const assigned = event.duties.filter((d) => d.staffMemberId).length;
  const total = event.duties.length;
  const BookingIcon = event.bookingOpen ? BOOKING_FLAG_ICONS.open : BOOKING_FLAG_ICONS.notOpen;

  const dateLine = multiDay
    ? t("header.dateLineRange", {
        from: formatDateWithWeekday(event.startsOn, locale),
        to: formatDateWithWeekday(event.endsOn, locale),
        open: event.times.open,
        close: event.times.close,
        week: formatWeek(event.startsOn, locale),
      })
    : t("header.dateLine", {
        date: formatDateWithWeekday(event.startsOn, locale),
        open: event.times.open,
        close: event.times.close,
        week: formatWeek(event.startsOn, locale),
      });

  const milestone = (m: string) => ({
    text: t("tabs.milestone", { milestone: m }),
    sr: t("tabs.milestoneHint", { milestone: m }),
  });
  const tabs: EventTab[] = [
    { key: "overview", href: base, label: t("tabs.overview") },
    { key: "board", href: `${base}/board`, label: t("tabs.board"), hint: milestone("M2") },
    {
      key: "permits",
      href: `${base}/genehmigungen`,
      label: t("tabs.permits"),
      hint: milestone("M3"),
    },
    {
      key: "team",
      href: `${base}/team`,
      label: t("tabs.team"),
      count: {
        text: `${assigned}/${total}`,
        level: event.health.team ?? "none",
        sr: `${t("overview.team.summary", { assigned, total })}, ${tHealth(event.health.team ?? "none")}`,
      },
    },
    { key: "money", href: `${base}/geld`, label: t("tabs.money"), hint: milestone("M5") },
    {
      key: "documents",
      href: `${base}/dokumente`,
      label: t("tabs.documents"),
      hint: { text: t("tabs.later"), sr: t("tabs.laterHint") },
    },
    { key: "notes", href: `${base}/notizen`, label: t("tabs.notes") },
    ...(can(actor.role, "audit", "read")
      ? [{ key: "history", href: `${base}/verlauf`, label: t("tabs.history") }]
      : []),
  ];

  return (
    <header className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
          <h1 className="font-semibold text-[22px] tracking-tight">{event.name}</h1>
          <EventTypeTag typeKey={event.type.key}>{typeName}</EventTypeTag>
          <EventStatusBadge status={event.status} />
          <HealthSummary health={event.health} compact />
        </div>
        {can(actor.role, "event", "write") && (
          <StatusMenu eventId={event.id} eventName={event.name} status={event.status} />
        )}
      </div>

      <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-foreground-2 text-small">
        <li className="flex items-center gap-1.5">
          <CalendarDays aria-hidden className="size-4 text-muted-foreground" />
          {dateLine}
        </li>
        {setup && (
          <li className="flex items-center gap-1.5">
            <Truck aria-hidden className="size-4 text-muted-foreground" />
            {t("header.setup", { date: formatDateShort(setup, locale), time: event.times.setup })}
          </li>
        )}
        <li className="flex items-center gap-1.5">
          <MapPin aria-hidden className="size-4 text-muted-foreground" />
          <Link
            href={`/orte/${event.venue.id}` as never}
            className="underline-offset-2 hover:text-foreground hover:underline"
          >
            {event.venue.name}
          </Link>
        </li>
        <li className="text-muted-foreground">
          {event.preset ? (
            <Link
              href={`/vorlagen?vorschau=${event.preset.id}` as never}
              className="underline-offset-2 hover:text-foreground hover:underline"
            >
              {t("header.preset", { name: event.preset.name })}
            </Link>
          ) : (
            t("header.noPreset")
          )}
        </li>
      </ul>

      <ul className="flex flex-wrap items-center gap-2">
        <li>
          <StatusBadge tone={event.bookingOpen ? "ok" : "neutral"} icon={BookingIcon}>
            {event.bookingOpen ? t("header.booking.open") : t("header.booking.closed")}
          </StatusBadge>
        </li>
        {event.fullyBooked && (
          <li>
            <StatusBadge tone="warn" icon={BOOKING_FLAG_ICONS.full}>
              {t("header.booking.full")}
            </StatusBadge>
          </li>
        )}
        {event.carSpacesFull && (
          <li>
            <StatusBadge tone="warn" icon={BOOKING_FLAG_ICONS.carsFull}>
              {t("header.booking.carsFull")}
            </StatusBadge>
          </li>
        )}
      </ul>

      <EventTabs tabs={tabs} label={t("tabs.label")} />
    </header>
  );
}
