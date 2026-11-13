import { can } from "@marktwerk/core";
import { HistoryTable } from "@/components/event-detail/history-table";
import { getActor } from "@/server/actor";
import { listEventHistory } from "@/server/queries/event-detail";
import { requirePermission } from "@/server/session";

/** Tab "Verlauf": the audit log of this event. */
export default async function EventHistoryPage({
  params,
}: PageProps<"/veranstaltungen/[id]/verlauf">) {
  await requirePermission("audit", "read");
  const { id } = await params;
  const actor = await getActor();
  const entries = await listEventHistory(actor, id);
  return (
    <HistoryTable
      entries={entries}
      canRestore={can(actor.role, "task", "write")}
      canRestoreDeleted={can(actor.role, "task", "delete")}
    />
  );
}
