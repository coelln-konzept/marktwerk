import { notFound } from "next/navigation";
import { TeamTable } from "@/components/event-detail/team-table";
import { getActor } from "@/server/actor";
import { getEvent } from "@/server/queries/events";
import { requirePermission } from "@/server/session";

/** Tab "Team": duty roles and who fills them (read only in M1). */
export default async function EventTeamPage({ params }: PageProps<"/veranstaltungen/[id]/team">) {
  await requirePermission("event", "read");
  const { id } = await params;
  const event = await getEvent(await getActor(), id);
  if (!event) notFound();
  return <TeamTable event={event} />;
}
