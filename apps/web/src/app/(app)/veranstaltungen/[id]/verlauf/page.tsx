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
  const entries = await listEventHistory(await getActor(), id);
  return <HistoryTable entries={entries} />;
}
