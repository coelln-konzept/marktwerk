import { notFound } from "next/navigation";
import { BoardScreen } from "@/components/board/board-screen";
import { getActor } from "@/server/actor";
import { getEvent } from "@/server/queries/events";
import { requirePermission } from "@/server/session";

/** Tab "Board": the tasks of this event as a kanban ("Spalten") or one list by phase ("Ablauf"), with the task drawer. */
export default async function EventBoardPage({
  params,
  searchParams,
}: PageProps<"/veranstaltungen/[id]/board">) {
  await requirePermission("task", "read");
  const { id } = await params;
  const actor = await getActor();
  const event = await getEvent(actor, id);
  if (!event) notFound();
  return (
    <BoardScreen
      eventId={event.id}
      eventStartsOn={event.startsOn}
      eventEndsOn={event.endsOn}
      path={`/veranstaltungen/${event.id}/board`}
      searchParams={await searchParams}
      actor={actor}
    />
  );
}
