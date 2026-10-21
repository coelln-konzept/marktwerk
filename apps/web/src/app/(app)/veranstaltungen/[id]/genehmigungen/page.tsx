import { LaterTab } from "@/components/event-detail/later-tab";
import { requirePermission } from "@/server/session";

export default async function EventPermitsPage() {
  await requirePermission("event", "read");
  return <LaterTab kind="permits" />;
}
