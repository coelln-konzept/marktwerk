import { can } from "@marktwerk/core";
import { notFound } from "next/navigation";
import { EventShifts } from "@/components/event-detail/event-shifts";
import { TeamTable } from "@/components/event-detail/team-table";
import { getActor } from "@/server/actor";
import { getEvent } from "@/server/queries/events";
import { listAssignableStaff } from "@/server/queries/team";
import { requirePermission } from "@/server/session";

/**
 * Tab "Team": duty roles and who fills them (reassignable with event:write), and below it the shift
 * records of this event (team:read; the office enters times with team:manage).
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
      {can(actor.role, "team", "read") && <EventShifts event={event} actor={actor} />}
    </>
  );
}
