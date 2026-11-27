import { getLocale, getTranslations } from "next-intl/server";
import { loadShiftScreen } from "@/components/team/shift-env";
import { toShiftView } from "@/components/team/shift-types";
import { todayIn } from "@/lib/format";
import type { Actor } from "@/server/actor";
import type { EventDetail } from "@/server/queries/events";
import { getEventPlanning } from "@/server/queries/planning";
import { DayBlocks, type ShiftEditing } from "./day-blocks";

/**
 * "Schichtplanung" on the event's Team tab (team:read): the day blocks with their needs and people. With
 * `canManage` (team:manage) it also loads what "Zeiten ändern" needs (the shift dialog's environment and
 * the event's shifts); without it the blocks are read-only.
 */
export async function EventPlanning({
  event,
  actor,
  canManage,
}: {
  event: EventDetail;
  actor: Actor;
  canManage: boolean;
}) {
  const [t, locale, plan] = await Promise.all([
    getTranslations("planning.event"),
    getLocale(),
    getEventPlanning(event.id),
  ]);
  let editing: ShiftEditing | null = null;
  if (canManage) {
    const { list, env } = await loadShiftScreen(actor, { eventId: event.id }, todayIn(), locale, {
      months: [event.startsOn, event.endsOn],
      range: { from: event.startsOn, to: event.endsOn },
    });
    editing = {
      env,
      shifts: Object.fromEntries(list.rows.map((r) => [r.id, toShiftView(r, locale)])),
    };
  }
  return (
    <section aria-labelledby="planning-title" className="flex flex-col gap-4">
      <h2 id="planning-title" className="m-0 px-1 font-semibold text-[18px] leading-tight">
        {t("title")}
        {plan.days.length > 0 && (
          <>
            {" · "}
            <span className="font-normal text-muted-foreground">
              {t("openTotal", { count: plan.openTotal })}
            </span>
          </>
        )}
      </h2>
      <DayBlocks eventId={event.id} plan={plan} editing={editing} />
    </section>
  );
}
