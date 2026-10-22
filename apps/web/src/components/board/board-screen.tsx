import { can, daysBetween, endOfIsoWeek, isFinishedStatus } from "@marktwerk/core";
import { UserRoundX } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { TaskDrawer } from "@/components/task/task-drawer";
import { Drawer } from "@/components/ui/drawer";
import {
  FilterBar,
  FilterChip,
  FilterChips,
  FilterGroup,
  Segments,
} from "@/components/ui/filter-bar";
import { EmptyState } from "@/components/ui/states";
import { formatWeek, todayIn } from "@/lib/format";
import { isModuleHidden } from "@/lib/modules";
import { TASK_CATEGORIES } from "@/lib/task-ui";
import { hrefWith, param } from "@/lib/url";
import type { Actor } from "@/server/actor";
import { getKeyTaskMatrix, getReadinessList } from "@/server/queries/board-overview";
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
import { KeyTaskMatrixView } from "./key-task-matrix";
import { NewTaskButton } from "./new-task-dialog";
import { ReadinessList } from "./readiness-list";
import { WorkloadTable } from "./workload-table";

type SearchParams = Record<string, string | string[] | undefined>;
type ViewKey = "bereitschaft" | "matrix" | "gruppiert" | "spalten" | "person" | "arbeitslast";

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
    : ["bereitschaft", "matrix", "gruppiert", "spalten", "person", "arbeitslast"];
  const views = teamHidden
    ? allViews.filter((v) => v !== "person" && v !== "arbeitslast")
    : allViews;
  // "gruppen" was the first name of the grouped view; old links keep working.
  const viewParam = param(sp.ansicht) === "gruppen" ? "gruppiert" : param(sp.ansicht);
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
  const drawer = openTaskId ? await getTaskDetail(actor, openTaskId, today) : null;
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
    <FilterGroup label={t("view.label")}>
      <Segments
        items={views.map((key) => ({
          key,
          label: t(`view.${key}`),
          href: href({ ansicht: key === views[0] ? undefined : key }),
          active: key === view,
        }))}
      />
    </FilterGroup>
  );

  const horizonSwitch = !eventMode && (
    <FilterGroup label={t("horizon.label")}>
      <Segments
        items={(["woche", "14", "alle"] as const).map((key) => ({
          key,
          label: t(`horizon.${key}`),
          href: href({ zeitraum: key === "14" ? undefined : key }),
          active: horizon === key,
        }))}
      />
    </FilterGroup>
  );

  // ---- workload table (across events)
  if (!eventMode && view === "arbeitslast") {
    const workload = await getWorkload(actor, today, 8);
    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <FilterBar>{viewSwitch}</FilterBar>
          {newTask}
        </div>
        <WorkloadTable workload={workload} />
        {drawerNode}
      </div>
    );
  }

  // ---- Bereitschaft / Matrix (one row per upcoming market)
  if (!eventMode && (view === "bereitschaft" || view === "matrix")) {
    const taskHref = (id: string) => href({ aufgabe: id, detail: undefined });
    const readiness =
      view === "bereitschaft"
        ? await getReadinessList(actor, { horizonDays, category }, today)
        : null;
    const matrix = view === "matrix" ? await getKeyTaskMatrix(actor, { horizonDays }, today) : null;
    const categoryCounts = readiness?.categoryCounts ?? {};
    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
          <FilterBar className="min-w-0 flex-1">
            {viewSwitch}
            {horizonSwitch}
            {readiness && (
              <FilterGroup label={t("filter.category")} wide>
                <FilterChips>
                  <FilterChip href={href({ kategorie: undefined })} active={category === undefined}>
                    {t("filter.allCategories")}
                  </FilterChip>
                  {TASK_CATEGORIES.filter((c) => categoryCounts[c] || c === category).map((c) => (
                    <FilterChip
                      key={c}
                      href={href({ kategorie: c })}
                      active={category === c}
                      count={categoryCounts[c] ?? 0}
                    >
                      {tTasks(`categories.${c}`)}
                    </FilterChip>
                  ))}
                </FilterChips>
              </FilterGroup>
            )}
          </FilterBar>
          {newTask}
        </div>
        {readiness && <ReadinessList rows={readiness.rows} today={today} taskHref={taskHref} />}
        {matrix && <KeyTaskMatrixView matrix={matrix} taskHref={taskHref} />}
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
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <FilterBar className="min-w-0 flex-1">
          {viewSwitch}
          {scopeKeys.length > 1 && (
            <FilterGroup label={t("tabs.label")}>
              <Segments
                items={scopeKeys.map((key) => ({
                  key,
                  label: scopeLabels[key] ?? key,
                  href: href({ [scopeUrlKey]: key === defaultScope ? undefined : key }),
                  active: key === scope,
                  count: counts[key as keyof typeof counts],
                }))}
              />
            </FilterGroup>
          )}
          {horizonSwitch}
          {!eventMode && view === "gruppiert" && (
            <FilterGroup label={t("group.label")}>
              <Segments
                items={(["veranstaltung", "tag"] as const).map((key) => ({
                  key,
                  label: t(`group.by.${key}`),
                  href: href({ gruppe: key === "veranstaltung" ? undefined : key }),
                  active: (key === "tag") === (groupBy === "day"),
                }))}
              />
            </FilterGroup>
          )}
          <FilterGroup label={t("filter.category")} wide>
            <FilterChips>
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
            </FilterChips>
          </FilterGroup>
        </FilterBar>
        {newTask}
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
