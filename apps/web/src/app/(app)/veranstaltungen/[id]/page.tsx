import { can } from "@marktwerk/core";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import {
  DatesPanel,
  FactsPanel,
  KeyTasksPanel,
  MissingPanel,
  NotesExcerpt,
  RulesPanel,
  StatusLine,
  TeamSummaryPanel,
} from "@/components/event-detail/overview-panels";
import { PermitDrawer } from "@/components/permits/permit-drawer";
import { TaskDrawer } from "@/components/task/task-drawer";
import { Drawer } from "@/components/ui/drawer";
import { KeyboardRows } from "@/components/ui/keyboard-rows";
import { todayIn } from "@/lib/format";
import { isModuleVisible } from "@/lib/modules";
import { hrefWith, param } from "@/lib/url";
import { getActor } from "@/server/actor";
import { getEventOverview } from "@/server/queries/event-overview";
import { getEvent } from "@/server/queries/events";
import { getTaskDetail, listStaffOptions } from "@/server/queries/tasks";
import { requirePermission } from "@/server/session";

/**
 * Tab "Überblick": is this market on track, and what's missing? Status line, Was fehlt, Kernaufgaben,
 * Nächste Termine; Eckdaten and Regeln der Art stay collapsed. Task rows open the task drawer
 * (`?aufgabe=<id>`), permit rows the permit drawer (`?genehmigung=<id>`), both right here.
 */
export default async function EventOverviewPage({
  params,
  searchParams,
}: PageProps<"/veranstaltungen/[id]">) {
  await requirePermission("event", "read");
  const { id } = await params;
  const actor = await getActor();
  const event = await getEvent(actor, id);
  if (!event) notFound();
  const today = todayIn();
  const canWrite = can(actor.role, "event", "write");
  const canWriteTasks = can(actor.role, "task", "write");
  const overview = await getEventOverview(actor, event, today);

  const sp = await searchParams;
  const taskId = param(sp.aufgabe);
  const permitId = param(sp.genehmigung);
  const closeHref = `/veranstaltungen/${event.id}`;
  let drawer: React.ReactNode = null;
  if (permitId && can(actor.role, "permit", "read")) {
    drawer = (
      <PermitDrawer id={permitId} closeHref={hrefWith(closeHref, sp, { genehmigung: undefined })} />
    );
  } else if (taskId && can(actor.role, "task", "read")) {
    const t = await getTranslations("board");
    const detail = await getTaskDetail(actor, taskId, today);
    drawer = detail ? (
      <TaskDrawer
        task={detail}
        staff={await listStaffOptions()}
        canWrite={canWriteTasks}
        canAssign={false}
        today={today}
        closeHref={closeHref}
      />
    ) : (
      <Drawer kind={t("drawer.label")} title={t("drawer.notFound")} closeHref={closeHref}>
        <p className="text-muted-foreground text-small">{t("drawer.notFoundHint")}</p>
      </Drawer>
    );
  }

  return (
    <KeyboardRows className="flex flex-col gap-6">
      <StatusLine event={event} overview={overview} />
      <NotesExcerpt event={event} />
      <MissingPanel event={event} overview={overview} today={today} canWrite={canWriteTasks} />
      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 lg:grid-cols-2">
        <KeyTasksPanel event={event} overview={overview} today={today} canWrite={canWriteTasks} />
        <DatesPanel event={event} today={today} />
      </div>
      <div className="flex flex-col gap-3">
        <FactsPanel event={event} canWrite={canWrite} />
        <RulesPanel event={event} />
      </div>
      {isModuleVisible("team") && <TeamSummaryPanel event={event} />}
      {drawer}
    </KeyboardRows>
  );
}
