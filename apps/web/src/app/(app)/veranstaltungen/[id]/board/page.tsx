import { notFound } from "next/navigation";
import { BoardScreen } from "@/components/board/board-screen";
import { getActor } from "@/server/actor";
import { getEvent } from "@/server/queries/events";
import { requirePermission } from "@/server/session";

/** Tab "Board": the tasks of this event as a kanban, with the people rail and the task drawer. */
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
      path={`/veranstaltungen/${event.id}/board`}
      searchParams={await searchParams}
      actor={actor}
    />
  );
}
