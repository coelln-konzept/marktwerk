import { notFound } from "next/navigation";
import {
  DatesPanel,
  FactsPanel,
  HealthPanel,
  TeamSummaryPanel,
} from "@/components/event-detail/overview-panels";
import { todayIn } from "@/lib/format";
import { getActor } from "@/server/actor";
import { getEvent } from "@/server/queries/events";
import { requirePermission } from "@/server/session";

/** Tab "Überblick": dates, key facts, health and team at a glance. */
export default async function EventOverviewPage({ params }: PageProps<"/veranstaltungen/[id]">) {
  await requirePermission("event", "read");
  const { id } = await params;
  const event = await getEvent(await getActor(), id);
  if (!event) notFound();
  const today = todayIn();
  return (
    <div className="grid items-start gap-6 lg:grid-cols-2">
      <div className="flex flex-col gap-6">
        <DatesPanel event={event} today={today} />
        <FactsPanel event={event} />
      </div>
      <div className="flex flex-col gap-6">
        <HealthPanel event={event} />
        <TeamSummaryPanel event={event} />
      </div>
    </div>
  );
}
