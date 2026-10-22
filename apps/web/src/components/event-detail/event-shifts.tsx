import { getLocale, getTranslations } from "next-intl/server";
import { loadShiftScreen } from "@/components/team/shift-env";
import { toShiftView } from "@/components/team/shift-types";
import { ShiftsPanel } from "@/components/team/shifts-panel";
import { formatDateRange, todayIn } from "@/lib/format";
import type { Actor } from "@/server/actor";
import type { EventDetail } from "@/server/queries/events";

/**
 * "Schichten" on the Team tab, below the duty roles: who worked when at this event. The office types
 * the actual times from the paper / WhatsApp report (quick entry, warnings while typing).
 */
export async function EventShifts({ event, actor }: { event: EventDetail; actor: Actor }) {
  const [t, locale] = await Promise.all([getTranslations("hours.shift"), getLocale()]);
  const today = todayIn();
  const { list, env } = await loadShiftScreen(actor, { eventId: event.id }, today, locale, {
    months: [event.startsOn, event.endsOn],
    range: { from: event.startsOn, to: event.endsOn },
  });
  const inside = today >= event.startsOn && today <= event.endsOn;
  return (
    <ShiftsPanel
      id="shifts-title"
      title={t("title")}
      meta={t("eventMeta", { dates: formatDateRange(event.startsOn, event.endsOn, locale) })}
      shifts={list.rows.map((r) => toShiftView(r, locale))}
      env={env}
      fixedEventId={event.id}
      defaultDate={inside ? today : event.startsOn}
      showDates={event.startsOn !== event.endsOn}
    />
  );
}
