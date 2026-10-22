import { can, daysBetween, endOfIsoWeek, isFinishedStatus } from "@marktwerk/core";
import { UserRoundX } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { TaskDrawer } from "@/components/task/task-drawer";
import { FilterChip } from "@/components/ui/chip";
import { Drawer } from "@/components/ui/drawer";
import { SegmentedLinks } from "@/components/ui/segmented-links";
import { EmptyState } from "@/components/ui/states";
import { formatWeek, todayIn } from "@/lib/format";
import { isModuleHidden } from "@/lib/modules";
import { TASK_CATEGORIES } from "@/lib/task-ui";
import { hrefWith, param } from "@/lib/url";
import type { Actor } from "@/server/actor";
import {
  type BoardTask,
  getPeopleRail,
  getTaskDetail,
  getWorkload,
  listBoardTasks,
  listStaffOptions,
  listTaskEventOptions,
} from "@/server/queries/tasks";
import { BoardView } from "./board-view";
import { ChipGroup } from "./chip-group";
import { NewTaskButton } from "./new-task-dialog";
import { WorkloadTable } from "./workload-table";

type SearchParams = Record<string, string | string[] | undefined>;
type ViewKey = "spalten" | "person" | "gruppen" | "arbeitslast";

/**
 * The board of one event (tab "Board") or across all events (`/board`): toolbar with views and
 * filters, the kanban / swimlanes / grouped list or the workload table, the people rail, and the task
 * drawer when `?aufgabe=<id>` is set. All state is in the URL, so every view is linkable.
 */
export async function BoardScreen({
  eventId,
  path,
  searchParams: sp,
  actor,
}: {
  eventId?: string;
  path: string;
  searchParams: SearchParams;
  actor: Actor;
}) {
  const t = await getTranslations("board");
  const tTasks = await getTranslations("tasks");
  const locale = await getLocale();
  const today = todayIn();
  const eventMode = eventId !== undefined;
  const canWrite = can(actor.role, "task", "write");
  // Team allocation is hidden for now (lib/modules.ts): no assignees, people rail, swimlanes or workload.
  const teamHidden = isModuleHidden("team");
  const canAssign = !teamHidden && can(actor.role, "task", "assign");
  const me = actor.staffMemberId;

  // ---- URL state
  const allViews: ViewKey[] = eventMode
    ? ["spalten", "person"]
    : ["gruppen", "spalten", "person", "arbeitslast"];
  const views = teamHidden
    ? allViews.filter((v) => v !== "person" && v !== "arbeitslast")
    : allViews;
  const viewParam = param(sp.ansicht);
  const view: ViewKey = views.find((v) => v === viewParam) ?? (views[0] as ViewKey);
  const scopeParam = eventMode ? param(sp.filter) : param(sp.tab);
  // "Meine" and "Nicht zugewiesen" are assignee filters: gone with the team module, only "alle" is left.
  const scopeKeys = teamHidden
    ? ["alle"]
    : eventMode
      ? ["alle", "meine", "offen"]
      : ["meine", "alle", "offen"];
  const defaultScope = teamHidden || eventMode ? "alle" : me ? "meine" : "alle";
  const scope = scopeParam && scopeKeys.includes(scopeParam) ? scopeParam : defaultScope;
  const scopeUrlKey = eventMode ? "filter" : "tab";
  const category = TASK_CATEGORIES.find((c) => c === param(sp.kategorie));
  const groupBy = param(sp.gruppe) === "tag" ? "day" : "event";
  const horizonParam = param(sp.zeitraum);
  const horizon = horizonParam === "woche" || horizonParam === "alle" ? horizonParam : "14";
  const horizonDays =
    eventMode || horizon === "alle"
      ? null
      : horizon === "woche"
        ? daysBetween(today, endOfIsoWeek(today))
        : 14;
  const taskParam = param(sp.aufgabe);
  const detailParam = param(sp.detail);
  const openTaskId =
    taskParam ?? (detailParam?.startsWith("task:") ? detailParam.slice(5) : undefined);
  const href = (patch: Record<string, string | undefined>) => hrefWith(path, sp, patch);
  const closeHref = hrefWith(path, sp, { aufgabe: undefined, detail: undefined });

  const staff = await listStaffOptions();
  const drawer = openTaskId ? await getTaskDetail(actor, openTaskId) : null;
  const drawerNode = openTaskId ? (
    drawer ? (
      <TaskDrawer
        task={drawer}
        staff={staff}
        canWrite={canWrite}
        canAssign={canAssign}
        today={today}
        closeHref={closeHref}
      />
    ) : (
      <Drawer kind={t("drawer.label")} title={t("drawer.notFound")} closeHref={closeHref}>
        <p className="text-muted-foreground text-small">{t("drawer.notFoundHint")}</p>
      </Drawer>
    )
  ) : null;

  const events = !eventMode && canWrite ? await listTaskEventOptions(actor, today) : [];
  const newTask = canWrite ? (
    <NewTaskButton eventId={eventId} events={events} staff={staff} canAssign={canAssign} />
  ) : null;

  const viewSwitch = views.length > 1 && (
    <SegmentedLinks
      label={t("view.label")}
      items={views.map((key) => ({
        key,
        label: t(`view.${key}`),
        href: href({ ansicht: key === views[0] ? undefined : key }),
        active: key === view,
      }))}
    />
  );

  // ---- workload table (across events)
  if (!eventMode && view === "arbeitslast") {
    const workload = await getWorkload(actor, today, 8);
    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {viewSwitch}
          {newTask}
        </div>
        <WorkloadTable workload={workload} />
        {drawerNode}
      </div>
    );
  }

  // ---- cards
  const [{ tasks: all, truncated }, rail] = await Promise.all([
    listBoardTasks(actor, { eventId, horizonDays }, today),
    teamHidden ? Promise.resolve(null) : getPeopleRail(actor, { eventId }, today),
  ]);
  const isMine = (c: BoardTask) => me !== null && c.assigneeId === me;
  const inScope = (c: BoardTask) =>
    scope === "meine" ? isMine(c) : scope === "offen" ? c.assigneeId === null : true;
  const open = (c: BoardTask) => !isFinishedStatus(c.status);
  const counts = {
    alle: all.filter(open).length,
    meine: all.filter((c) => open(c) && isMine(c)).length,
    offen: all.filter((c) => open(c) && c.assigneeId === null).length,
  };
  const scoped = all.filter(inScope);
  const byCategory = new Map<string, number>();
  for (const c of scoped)
    if (open(c)) byCategory.set(c.category, (byCategory.get(c.category) ?? 0) + 1);
  const tasks = category ? scoped.filter((c) => c.category === category) : scoped;
  const filtered = scope !== "alle" || category !== undefined;

  const scopeLabels: Record<string, string> = eventMode
    ? { alle: t("filter.all"), meine: t("filter.mine"), offen: t("filter.unassigned") }
    : { alle: t("tabs.all"), meine: t("tabs.mine"), offen: t("tabs.unassigned") };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          {scopeKeys.length > 1 && (
            <nav
              aria-label={eventMode ? t("filter.label") : t("tabs.label")}
              className="flex flex-wrap items-center gap-2"
            >
              {scopeKeys.map((key) => (
                <FilterChip
                  key={key}
                  href={href({ [scopeUrlKey]: key === defaultScope ? undefined : key })}
                  active={key === scope}
                  count={counts[key as keyof typeof counts]}
                >
                  {scopeLabels[key]}
                </FilterChip>
              ))}
            </nav>
          )}
          {viewSwitch}
        </div>
        {newTask}
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <ChipGroup label={t("filter.category")}>
          <FilterChip href={href({ kategorie: undefined })} active={category === undefined}>
            {t("filter.allCategories")}
          </FilterChip>
          {TASK_CATEGORIES.filter((c) => byCategory.has(c) || c === category).map((c) => (
            <FilterChip
              key={c}
              href={href({ kategorie: c })}
              active={category === c}
              count={byCategory.get(c) ?? 0}
            >
              {tTasks(`categories.${c}`)}
            </FilterChip>
          ))}
        </ChipGroup>
        {!eventMode && (
          <ChipGroup label={t("horizon.label")}>
            {(["woche", "14", "alle"] as const).map((key) => (
              <FilterChip
                key={key}
                href={href({ zeitraum: key === "14" ? undefined : key })}
                active={horizon === key}
              >
                {t(`horizon.${key}`)}
              </FilterChip>
            ))}
          </ChipGroup>
        )}
        {!eventMode && view === "gruppen" && (
          <ChipGroup label={t("group.label")}>
            {(["veranstaltung", "tag"] as const).map((key) => (
              <FilterChip
                key={key}
                href={href({ gruppe: key === "veranstaltung" ? undefined : key })}
                active={(key === "tag") === (groupBy === "day")}
              >
                {t(`group.by.${key}`)}
              </FilterChip>
            ))}
          </ChipGroup>
        )}
      </div>

      {!eventMode && scope === "meine" && !me ? (
        <div className="rounded-xl border bg-card">
          <EmptyState icon={UserRoundX} title={t("empty.noStaff")} hint={t("empty.noStaffHint")} />
        </div>
      ) : (
        <BoardView
          tasks={tasks}
          staff={staff}
          rail={rail}
          today={today}
          weekLabel={formatWeek(today, locale)}
          canWrite={canWrite}
          canAssign={canAssign}
          scopeEventId={eventId ?? null}
          layout={view === "spalten" ? "columns" : view === "person" ? "person" : "groups"}
          groupBy={groupBy}
          filtered={filtered}
          truncated={truncated}
        />
      )}
      {drawerNode}
    </div>
  );
}
