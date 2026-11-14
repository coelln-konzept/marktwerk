import { berlinDay, can, canMoveEvent, daysBetween, isHappening } from "@marktwerk/core";
import { allowedTransitions } from "@marktwerk/core/events/lifecycle";
import { CalendarDays, CircleX, MapPin } from "lucide-react";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { EventStatusBadge } from "@/components/events/event-status";
import { formatVisitorHours } from "@/components/schedule/schedule-format";
import { EventTypeTag } from "@/components/ui/event-type-tag";
import { MarketMarker } from "@/components/ui/market-marker";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatDate, formatDateWithWeekday, formatWeek, todayIn } from "@/lib/format";
import { isModuleVisible } from "@/lib/modules";
import { BOOKING_FLAG_ICONS } from "@/lib/status";
import type { Actor } from "@/server/actor";
import { listLinkedDocuments } from "@/server/queries/documents";
import { listEventTypeOptions } from "@/server/queries/event-form";
import { countOpenEventTasks } from "@/server/queries/event-overview";
import type { EventDetail } from "@/server/queries/events";
import { getEventMoney } from "@/server/queries/finance";
import { listEventPermits } from "@/server/queries/permits";
import { eventTaskSummary } from "@/server/queries/tasks";
import { listVenueOptions } from "@/server/queries/venues";
import { type EventCancellation, getEventCancellation } from "@/server/services/event-lifecycle";
import { BookingMenu } from "./booking-menu";
import { EventActions } from "./event-actions";
import { type EventTab, EventTabs } from "./event-tabs";
import { RestoreCancelledButton } from "./status-menu";

/**
 * "Abgesagt" on every tab of a cancelled event (UX-049): when and why, how many tasks went with it, and
 * "Absage aufheben", which leads back to the status before the cancellation (also after the toast is gone).
 */
async function CancelledBanner({
  eventId,
  reason,
  cancellation,
  canRestore,
  locale,
}: {
  eventId: string;
  reason: string | null;
  cancellation: EventCancellation;
  canRestore: boolean;
  locale: string;
}) {
  const t = await getTranslations("eventDetail.cancelled");
  const tStatus = await getTranslations("status.event");
  return (
    <section
      aria-labelledby="cancelled-title"
      className="flex flex-col gap-2 rounded-xl border border-border bg-status-neutral-bg px-4 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4"
    >
      <div className="flex min-w-0 gap-2.5">
        <CircleX aria-hidden className="mt-0.5 size-5 shrink-0 text-status-neutral" />
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 id="cancelled-title" className="font-semibold">
            {cancellation.at
              ? t("titleOn", { date: formatDate(berlinDay(cancellation.at), locale) })
              : t("title")}
          </h2>
          {reason && (
            <p className="break-words text-foreground-2 text-small">{t("reason", { reason })}</p>
          )}
          <p className="text-muted-foreground text-small">
            {cancellation.tasks > 0 ? t("tasks", { count: cancellation.tasks }) : t("noTasks")}
            {canRestore && ` ${t("restoreHint", { status: tStatus(cancellation.restoresTo) })}`}
          </p>
        </div>
      </div>
      {canRestore && <RestoreCancelledButton eventId={eventId} label={t("restore")} />}
    </section>
  );
}

/**
 * Header of the event page: name, type, status and the "…" menu · date and venue · tabs. Health is shown
 * once, on the Überblick (UX pass 2026-10-22); the preset sits in Eckdaten, the setup time in Termine, and
 * the booking menu and flags stay hidden while `HIDDEN_MODULES.booking` is on.
 */
export async function EventHeader({ event, actor }: { event: EventDetail; actor: Actor }) {
  const t = await getTranslations("eventDetail");
  const tHealth = await getTranslations("health");
  const tMoney = await getTranslations("eventMoney");
  const tBoard = await getTranslations("board");
  const tSchedule = await getTranslations("schedule");
  const locale = await getLocale();
  const base = `/veranstaltungen/${event.id}`;
  const multiDay = event.endsOn !== event.startsOn;
  const typeName = locale === "en" ? event.type.nameEn : event.type.nameDe;
  const assigned = event.duties.filter((d) => d.staffMemberId).length;
  const total = event.duties.length;
  const canWrite = can(actor.role, "event", "write");
  const venues = canWrite ? await listVenueOptions() : [];
  const types = canWrite
    ? (await listEventTypeOptions()).map((x) => ({
        id: x.id,
        name: locale === "en" ? x.nameEn : x.nameDe,
      }))
    : [];
  // Tab "Geld": rates paid of all rates, with the money health (only for roles that may read finance).
  const money =
    isModuleVisible("finance") && can(actor.role, "finance", "read")
      ? await getEventMoney(actor, event.id, todayIn())
      : null;
  const moneyCount = money?.summary.health
    ? {
        text:
          money.summary.installmentsTotal > 0
            ? `${money.summary.installmentsPaid}/${money.summary.installmentsTotal}`
            : "–",
        level: money.summary.health,
        sr: `${tMoney("tab.summary", { paid: money.summary.installmentsPaid, total: money.summary.installmentsTotal })}, ${tHealth(money.summary.health)}`,
      }
    : undefined;
  const tasks = await eventTaskSummary(actor, event.id, todayIn());
  const tPermits = await getTranslations("eventPermits");
  const permits = can(actor.role, "permit", "read")
    ? await listEventPermits(actor, event, todayIn())
    : null;
  const documentCount =
    (await listLinkedDocuments(actor, "eventId", [event.id])).get(event.id)?.length ?? 0;
  const cancelled = event.status === "cancelled";
  const cancellation = cancelled ? await getEventCancellation(event.id) : null;
  const openTasks =
    canWrite && allowedTransitions(event.status).includes("cancelled")
      ? await countOpenEventTasks(actor, event.id)
      : undefined;
  const BookingIcon = event.bookingOpen ? BOOKING_FLAG_ICONS.open : BOOKING_FLAG_ICONS.notOpen;

  const dateLine = multiDay
    ? t("header.dateLineRange", {
        from: formatDateWithWeekday(event.startsOn, locale),
        to: formatDateWithWeekday(event.endsOn, locale),
        hours: formatVisitorHours(event.schedule, tSchedule),
        week: formatWeek(event.startsOn, locale),
      })
    : t("header.dateLine", {
        date: formatDateWithWeekday(event.startsOn, locale),
        hours: formatVisitorHours(event.schedule, tSchedule),
        week: formatWeek(event.startsOn, locale),
      });

  const tabs: EventTab[] = [
    { key: "overview", href: base, label: t("tabs.overview") },
    {
      key: "board",
      href: `${base}/board`,
      label: t("tabs.board"),
      count: {
        text: tBoard("tab.openShort", { count: tasks.open }),
        // Phones get bare numbers, so the strip does not run off the screen (UX-039).
        short: String(tasks.open),
        alert: tasks.overdue > 0 ? tBoard("tab.overdue", { count: tasks.overdue }) : undefined,
        alertShort: tasks.overdue > 0 ? String(tasks.overdue) : undefined,
        sr:
          tasks.overdue > 0
            ? tBoard("tab.openOverdue", { open: tasks.open, overdue: tasks.overdue })
            : tBoard("tab.open", { count: tasks.open }),
      },
    },
    ...(permits
      ? [
          {
            key: "permits",
            href: `${base}/genehmigungen`,
            label: t("tabs.permits"),
            // A count only when something is missing; a complete "5/5" says nothing the status line doesn't.
            count:
              permits.required - permits.held > 0
                ? {
                    text: String(permits.required - permits.held),
                    level: permits.health ?? "none",
                    sr: `${tPermits("tabSummary", { held: permits.held, required: permits.required })}, ${tHealth(permits.health ?? "none")}`,
                  }
                : undefined,
          } satisfies EventTab,
        ]
      : []),
    ...(isModuleVisible("team")
      ? [
          {
            key: "team",
            href: `${base}/team`,
            label: t("tabs.team"),
            count: {
              text: `${assigned}/${total}`,
              level: event.health.team ?? "none",
              sr: `${t("overview.team.summary", { assigned, total })}, ${tHealth(event.health.team ?? "none")}`,
            },
          } satisfies EventTab,
        ]
      : []),
    ...(money
      ? [
          {
            key: "money",
            href: `${base}/geld`,
            label: t("tabs.money"),
            count: moneyCount,
          },
        ]
      : []),
    // Bescheide and Pläne are looked up often: a tab of its own with the count, not hidden in "Mehr" (UX-039).
    {
      key: "documents",
      href: `${base}/dokumente`,
      label: t("tabs.documents"),
      count:
        documentCount > 0
          ? { text: String(documentCount), sr: t("documents.count", { count: documentCount }) }
          : undefined,
    },
  ];

  const more: EventTab[] = [
    { key: "notes", href: `${base}/notizen`, label: t("tabs.notes") },
    ...(can(actor.role, "audit", "read")
      ? [{ key: "history", href: `${base}/verlauf`, label: t("tabs.history") }]
      : []),
  ];

  return (
    <header className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
          <h1 className="flex min-w-0 items-center gap-2.5 font-semibold text-[22px] tracking-tight">
            <MarketMarker
              color={event.preset?.color}
              typeKey={event.type.key}
              className={event.preset?.color ? "h-6" : "size-3"}
            />
            <span className="min-w-0 break-words">{event.name}</span>
          </h1>
          {/* "Flohmarkt Bilk" + chip "Flohmarkt" says the same twice. */}
          {!event.name.toLocaleLowerCase(locale).startsWith(typeName.toLocaleLowerCase(locale)) && (
            <EventTypeTag typeKey={event.type.key}>{typeName}</EventTypeTag>
          )}
          <EventStatusBadge status={event.status} />
        </div>
        {canWrite && (
          <div className="flex shrink-0 items-center gap-2">
            {isModuleVisible("booking") && (
              <BookingMenu
                eventId={event.id}
                flags={{
                  bookingOpen: event.bookingOpen,
                  fullyBooked: event.fullyBooked,
                  carSpacesFull: event.carSpacesFull,
                }}
                happening={isHappening(event, todayIn())}
              />
            )}
            <EventActions
              eventId={event.id}
              eventName={event.name}
              status={event.status}
              startsOn={event.startsOn}
              canMove={canMoveEvent(event.status)}
              canDelete={can(actor.role, "event", "delete")}
              openTasks={openTasks}
              venues={venues}
              types={types}
              basics={{
                name: event.name,
                durationDays: daysBetween(event.startsOn, event.endsOn) + 1,
                venueId: event.venueId,
                eventTypeId: event.eventTypeId,
              }}
            />
          </div>
        )}
      </div>

      <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-foreground-2 text-small">
        <li className="flex items-center gap-1.5">
          <CalendarDays aria-hidden className="size-4 shrink-0 text-muted-foreground" />
          {dateLine}
        </li>
        <li className="flex items-center gap-1.5">
          <MapPin aria-hidden className="size-4 shrink-0 text-muted-foreground" />
          <Link
            href={`/orte/${event.venue.id}` as never}
            className="underline-offset-2 hover:text-foreground hover:underline"
          >
            {event.venue.name}
          </Link>
        </li>
      </ul>

      {isModuleVisible("booking") && (
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
      )}

      {cancellation && (
        <CancelledBanner
          eventId={event.id}
          reason={event.cancelledReason}
          cancellation={cancellation}
          canRestore={canWrite}
          locale={locale}
        />
      )}

      <EventTabs tabs={tabs} more={more} moreLabel={t("tabs.more")} label={t("tabs.label")} />
    </header>
  );
}
