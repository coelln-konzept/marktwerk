import { can } from "@marktwerk/core";
import { notFound } from "next/navigation";
import { EventShifts } from "@/components/event-detail/event-shifts";
import { TeamTable } from "@/components/event-detail/team-table";
import { EventPlanning } from "@/components/planning/event-planning";
import { todayIn } from "@/lib/format";
import { getActor } from "@/server/actor";
import { getEvent } from "@/server/queries/events";
import { listAssignableStaff } from "@/server/queries/team";
import { requirePermission } from "@/server/session";

/**
 * Tab "Team": duty roles and who fills them (reassignable with event:write); below it the shift planning
 * (team:read): one block per event day with its needs and people, "+ Person", need edits and "Weitere
 * Schichten" (all changes with team:manage). Once the event has started, the shift records follow for time
 * recording (the office enters the actual times with team:manage).
 */
export default async function EventTeamPage({ params }: PageProps<"/veranstaltungen/[id]/team">) {
  await requirePermission("event", "read");
  const { id } = await params;
  const actor = await getActor();
  const event = await getEvent(actor, id);
  if (!event) notFound();
  const staff = can(actor.role, "event", "write")
    ? await listAssignableStaff(event.id, event.startsOn, event.endsOn)
    : null;
  return (
    <>
      <TeamTable event={event} staff={staff} />
      {can(actor.role, "team", "read") && (
        <>
          <EventPlanning
            event={event}
            actor={actor}
            canManage={can(actor.role, "team", "manage")}
          />
          {/* Time recording stays here once the event has started (spec correction 3). */}
          {todayIn() >= event.startsOn && <EventShifts event={event} actor={actor} />}
        </>
      )}
    </>
  );
}
