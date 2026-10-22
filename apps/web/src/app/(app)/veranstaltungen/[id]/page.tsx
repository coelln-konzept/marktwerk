import { can } from "@marktwerk/core";
import { notFound } from "next/navigation";
import {
  DatesPanel,
  FactsPanel,
  HealthPanel,
  TeamSummaryPanel,
} from "@/components/event-detail/overview-panels";
import { todayIn } from "@/lib/format";
import { isModuleVisible } from "@/lib/modules";
import { getActor } from "@/server/actor";
import { getEvent } from "@/server/queries/events";
import { requirePermission } from "@/server/session";

/** Tab "Überblick": dates, key facts, health and team at a glance; dates and facts editable with event:write. */
export default async function EventOverviewPage({ params }: PageProps<"/veranstaltungen/[id]">) {
  await requirePermission("event", "read");
  const { id } = await params;
  const actor = await getActor();
  const event = await getEvent(actor, id);
  if (!event) notFound();
  const today = todayIn();
  const canWrite = can(actor.role, "event", "write");
  return (
    <div className="grid items-start gap-6 lg:grid-cols-2">
      <div className="flex flex-col gap-6">
        <DatesPanel event={event} today={today} canWrite={canWrite} />
        <FactsPanel event={event} canWrite={canWrite} />
      </div>
      <div className="flex flex-col gap-6">
        <HealthPanel event={event} />
        {isModuleVisible("team") && <TeamSummaryPanel event={event} />}
      </div>
    </div>
  );
}
