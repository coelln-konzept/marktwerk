"use client";

import {
  type BoardColumn,
  derivedColumn,
  isAfterEvent,
  isFinishedStatus,
  openSubtaskCount,
  sortColumnByDue,
  subtaskProgress,
  type TaskStatusKey,
} from "@marktwerk/core";
import { Keyboard } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useOptimistic, useRef, useState } from "react";
import { useShell } from "@/components/shell/shell-context";
import { SnoozeDialog } from "@/components/task/snooze";
import { Avatar } from "@/components/ui/avatar";
import { Kbd } from "@/components/ui/kbd";
import { isModuleVisible } from "@/lib/modules";
import { COLUMN_ORDER, formatHours } from "@/lib/task-ui";
import { cn } from "@/lib/utils";
import type { BoardTask, PeopleRail, StaffOption } from "@/server/queries/tasks";
import { AblaufList } from "./ablauf-list";
import { type BoardActions, BoardProvider, type Lift } from "./board-context";
import { BoardDnd, useCellDrop, useLaneDrop } from "./board-dnd";
import { ParentDialog } from "./parent-dialog";
import { PeopleRailPanel } from "./people-rail";
import { ReasonDialog } from "./reason-dialog";
import { LoadBar } from "./task-bits";
import { CardPreview, RowPreview, TaskCard } from "./task-card";
import { type OptimisticPatch, useTaskActions } from "./use-task-actions";

/** Finished cards shown before "weitere anzeigen" (the column is a collapsed list). */
const DONE_COLLAPSED = 5;
/**
 * Cards shown per open column (and lane) before "weitere anzeigen": the whole season at "Alles" would
 * otherwise put over a thousand cards (55k DOM nodes) on the page.
 */
const COLUMN_CAP = 30;
/** Rows of the keyboard help that are single-key shortcuts (hidden while those are off). */
const SINGLE_KEY_ROWS = new Set(["e", "a", "c"]);
const MORE_BUTTON =
  "cursor-pointer rounded-md px-1.5 py-1 text-left font-medium text-muted-foreground text-small hover:bg-hover focus-visible:outline-2 focus-visible:outline-ring";

/** The cards of a column (or of one person's lane in it) in display order. */
function cardsIn(
  tasks: BoardTask[],
  column: BoardColumn,
  lane: string | null | undefined,
  eventEndsOn: string | null,
): BoardTask[] {
  const list = tasks.filter(
    (task) => task.column === column && (lane === undefined || (task.assigneeId ?? null) === lane),
  );
  return column === "done"
    ? list
    : sortColumnByDue(list, column === "preparation" ? eventEndsOn : null);
}

type Live = ReturnType<typeof useTaskActions>;

/**
 * Applies a change to the cards at once, before the server confirms it. Moving a card places it after
 * the given card (or at the top of the column), like the service does.
 */
function applyPatch(state: BoardTask[], patch: OptimisticPatch, today: string): BoardTask[] {
  const task = state.find((t) => t.id === patch.id);
  if (!task) return state;
  if (patch.kind === "remove") return state.filter((t) => t.id !== patch.id);
  if (patch.kind === "parent") {
    // To the end, so a task nested just now shows last under its new parent.
    return [...state.filter((t) => t.id !== patch.id), { ...task, parentId: patch.parentId }];
  }
  if (patch.kind === "assign") {
    return state.map((t) =>
      t.id === patch.id
        ? { ...t, assigneeId: patch.assigneeId, assigneeName: patch.assigneeName }
        : t,
    );
  }
  if (patch.kind === "snooze") {
    return state.map((t) => (t.id === patch.id ? { ...t, snoozedUntil: patch.until } : t));
  }
  if (patch.kind === "status") {
    const finished = isFinishedStatus(patch.status);
    const column: BoardColumn = finished
      ? "done"
      : task.column === "done"
        ? derivedColumn(task.dueOn, today)
        : task.column;
    // completedOn too, so the Checkliste keeps a row ticked off today in place (core `ablaufPhase`).
    const completedOn = finished ? (task.completedOn ?? today) : null;
    return state.map((t) =>
      t.id === patch.id ? { ...t, status: patch.status, column, completedOn } : t,
    );
  }
  const status: TaskStatusKey =
    patch.column === "done" ? "done" : isFinishedStatus(task.status) ? "todo" : task.status;
  const moved: BoardTask = {
    ...task,
    column: patch.column,
    boardColumn: patch.column === "done" ? null : patch.column,
    status,
  };
  const rest = state.filter((t) => t.id !== patch.id);
  let at: number;
  if (patch.afterId) {
    const i = rest.findIndex((t) => t.id === patch.afterId);
    at = i < 0 ? rest.length : i + 1;
  } else {
    const i = rest.findIndex((t) => t.column === patch.column);
    at = i < 0 ? rest.length : i;
  }
  return [...rest.slice(0, at), moved, ...rest.slice(at)];
}

export type BoardLayout = "columns" | "person" | "ablauf";

const NO_TASKS: BoardTask[] = [];

type Props = {
  tasks: BoardTask[];
  /** Event board: the subtasks of `tasks`, shown under their parent (ADR 0021). */
  subtasks?: BoardTask[];
  staff: StaffOption[];
  /** People rail; null while the team module is hidden (lib/modules.ts). */
  rail: PeopleRail | null;
  today: string;
  weekLabel: string;
  canWrite: boolean;
  canAssign: boolean;
  /** "Löschen" in the card menu (UT2-13, `task:delete`). */
  canDelete?: boolean;
  /** Event board: its id (card order is kept per event). Across events: null. */
  scopeEventId: string | null;
  /** Event board: last day of the event; tasks due after it sit under "Nach der Veranstaltung". */
  eventEndsOn?: string | null;
  /** Event board: first day of the event (the "Ablauf" view groups by weeks before it). */
  eventStartsOn?: string | null;
  layout: BoardLayout;
  /** True when filters are active (changes the empty text). */
  filtered: boolean;
  /** More tasks exist than the page loaded. */
  truncated: boolean;
};

/**
 * The kanban board: four columns (Später · Diese Woche · Überfällig & heute · Erledigt) or one swimlane per
 * person, and the people rail. Cards move through the "⋯" menu, the keyboard (own index-based mode
 * below) or by dragging with mouse and finger (dnd-kit, `board-dnd.tsx`, ADR 0020); all of them end in
 * the same `useTaskActions` calls, so the server path is the same for every way of moving a card.
 */
export function BoardView(props: Props) {
  const t = useTranslations("board");
  const locale = useLocale();
  const { singleKeys } = useShell();
  const { today, staff } = props;
  // Top-level tasks and subtasks in one optimistic list, so nesting, lifting out and ticking a subtask show at
  // once; the views get the top-level tasks and the subtasks per parent.
  const loaded = useMemo(
    () => (props.subtasks?.length ? [...props.tasks, ...props.subtasks] : props.tasks),
    [props.tasks, props.subtasks],
  );
  const [everything, apply] = useOptimistic(loaded, (state, patch: OptimisticPatch) =>
    applyPatch(state, patch, today),
  );
  const eventBoard = props.scopeEventId !== null;
  const { tasks, childrenOf, byId } = useMemo(() => {
    const children = new Map<string, BoardTask[]>();
    const top: BoardTask[] = [];
    for (const task of everything) {
      if (task.parentId === null) top.push(task);
      else children.set(task.parentId, [...(children.get(task.parentId) ?? []), task]);
    }
    const ids = new Map(everything.map((task) => [task.id, task]));
    // Across events the server's progress is all there is. On the event board the subtasks are here, so the
    // parent's "3/5", overdue flag and open count (its tick opens the drawer while any is open, R29) follow a
    // tick, a nesting or a lift-out at once.
    if (!eventBoard) return { tasks: top, childrenOf: children, byId: ids };
    const withProgress = top.map((task) => {
      const subs = children.get(task.id) ?? [];
      const p = subtaskProgress(subs, today);
      const open = openSubtaskCount(subs);
      return p.total === task.subtasksTotal &&
        p.done === task.subtasksDone &&
        p.overdue === task.subtasksOverdue &&
        open === task.openSubtasks
        ? task
        : {
            ...task,
            subtasksTotal: p.total,
            subtasksDone: p.done,
            subtasksOverdue: p.overdue,
            openSubtasks: open,
          };
    });
    return { tasks: withProgress, childrenOf: children, byId: ids };
  }, [everything, eventBoard, today]);
  // Across events done cards leave the open columns, so "Erledigt" asks first (decision D1); the
  // event's Checkliste keeps them in place and asks nothing.
  const current = useTaskActions({
    staff,
    scopeEventId: props.scopeEventId,
    apply,
    confirmDone: !props.scopeEventId,
  });
  // The cards (memoized) get a stable `actions` that calls the current ones, so a change to one card
  // re-renders that card and not all of them.
  const liveRef = useRef(current);
  liveRef.current = current;
  const actions = useMemo<BoardActions>(
    () => ({
      move: (...args: Parameters<Live["move"]>) => liveRef.current.move(...args),
      assign: (...args: Parameters<Live["assign"]>) => liveRef.current.assign(...args),
      moveAndAssign: (...args: Parameters<Live["moveAndAssign"]>) =>
        liveRef.current.moveAndAssign(...args),
      setStatus: (...args: Parameters<Live["setStatus"]>) => liveRef.current.setStatus(...args),
      snooze: (...args: Parameters<Live["snooze"]>) => liveRef.current.snooze(...args),
      unsnooze: (...args: Parameters<Live["unsnooze"]>) => liveRef.current.unsnooze(...args),
      remove: (...args: Parameters<Live["remove"]>) => liveRef.current.remove(...args),
      setParent: (...args: Parameters<Live["setParent"]>) => liveRef.current.setParent(...args),
      restore: (...args: Parameters<Live["restore"]>) => liveRef.current.restore(...args),
      errorText: (code: string) => liveRef.current.errorText(code),
      drawer: {
        open: (id: string) => liveRef.current.drawer.open(id),
        close: () => liveRef.current.drawer.close(),
      },
    }),
    [],
  );
  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;
  const [lift, setLift] = useState<Lift | null>(null);
  const [live, setLive] = useState("");
  const [reasonFor, setReasonFor] = useState<{ task: BoardTask; status: TaskStatusKey } | null>(
    null,
  );
  const [snoozeFor, setSnoozeFor] = useState<BoardTask | null>(null);
  const [parentFor, setParentFor] = useState<BoardTask | null>(null);
  const focusAfter = useRef<string | null>(null);

  const eventEndsOn = props.eventEndsOn ?? null;
  const cardsOf = useCallback(
    (column: BoardColumn, lane?: string | null) => cardsIn(tasks, column, lane, eventEndsOn),
    [tasks, eventEndsOn],
  );
  // The same for the keyboard handlers below: they read the latest cards, so they keep their identity.
  const cardsNow = useCallback(
    (column: BoardColumn, lane?: string | null) =>
      cardsIn(tasksRef.current, column, lane, eventEndsOn),
    [eventEndsOn],
  );
  // The kanban's column on phones (Columns): the first with open cards, fixed on the first render so the
  // view never jumps by itself when that column empties; then the switch, or where a lifted card ends up.
  const [phoneColumn, setPhoneColumn] = useState<BoardColumn>(
    () => COLUMN_ORDER.find((c) => c !== "done" && cardsOf(c).length > 0) ?? "today",
  );

  // After a drop the card sits in another list; give focus back to its grip.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs after every change of the cards
  useEffect(() => {
    const id = focusAfter.current;
    if (!id) return;
    focusAfter.current = null;
    document.querySelector<HTMLElement>(`[data-grip="${id}"]`)?.focus();
  }, [tasks]);

  const columnName = useCallback((column: BoardColumn) => t(`columns.${column}`), [t]);

  const pick = useCallback(
    (task: BoardTask) => {
      const lane = props.layout === "person" ? (task.assigneeId ?? null) : undefined;
      const list = cardsNow(task.column, lane);
      const index = Math.max(
        0,
        list.findIndex((c) => c.id === task.id),
      );
      setLift({ id: task.id, column: task.column, index, lane });
      setLive(
        t("keys.picked", {
          title: task.title,
          column: columnName(task.column),
          position: index + 1,
          total: list.length,
        }),
      );
    },
    [cardsNow, props.layout, t, columnName],
  );

  const moveLift = useCallback(
    (dx: number, dy: number) => {
      if (!lift) return;
      const task = tasksRef.current.find((c) => c.id === lift.id);
      if (!task) return;
      let column = lift.column;
      let index = lift.index;
      if (dx !== 0) {
        const at = COLUMN_ORDER.indexOf(column) + dx;
        column = COLUMN_ORDER[Math.min(COLUMN_ORDER.length - 1, Math.max(0, at))] as BoardColumn;
      }
      const others = cardsNow(column, lift.lane).filter((c) => c.id !== lift.id);
      index = Math.min(others.length, Math.max(0, dx !== 0 ? index : index + dy));
      setLift({ ...lift, column, index });
      setLive(
        t("keys.moved", {
          title: task.title,
          column: columnName(column),
          position: index + 1,
          total: others.length + 1,
        }),
      );
    },
    [lift, cardsNow, t, columnName],
  );

  const cancelLift = useCallback(() => {
    if (!lift) return;
    focusAfter.current = lift.id;
    const from = tasksRef.current.find((c) => c.id === lift.id)?.column;
    if (from) setPhoneColumn(from);
    setLift(null);
    setLive(t("keys.cancelled"));
  }, [lift, t]);

  const drop = useCallback(() => {
    if (!lift) return;
    const task = tasksRef.current.find((c) => c.id === lift.id);
    setLift(null);
    // On phones the column the card lands in shows, so its grip can take focus back.
    setPhoneColumn(lift.column);
    if (!task) return;
    const others = cardsNow(lift.column, lift.lane).filter((c) => c.id !== lift.id);
    const afterId = lift.index > 0 ? (others[lift.index - 1]?.id ?? null) : null;
    const original = cardsNow(task.column, lift.lane).findIndex((c) => c.id === task.id);
    const stayed = () => {
      setLive(t("keys.cancelled"));
      // After the card is back in its place (the lift's re-render), not on the next change of the cards.
      requestAnimationFrame(() =>
        document.querySelector<HTMLElement>(`[data-grip="${task.id}"]`)?.focus(),
      );
    };
    if (lift.column === task.column && lift.index === original) {
      stayed();
      return;
    }
    // Into "Erledigt" the move may ask first: announce it (and move the focus with the card) only once
    // it runs; "Abbrechen" leaves the card where it was and says so.
    const column = lift.column;
    void actions.move(task, column, afterId).then((moved) => {
      if (!moved) return stayed();
      focusAfter.current = task.id;
      setLive(t("keys.dropped", { title: task.title, column: columnName(column) }));
    });
  }, [lift, cardsNow, actions, t, columnName]);

  const askReason = useCallback(
    (task: BoardTask, status: TaskStatusKey) => setReasonFor({ task, status }),
    [],
  );

  const askSnoozeDate = useCallback((task: BoardTask) => setSnoozeFor(task), []);
  const askParent = useCallback((task: BoardTask) => setParentFor(task), []);
  const subtasksOf = useCallback(
    (parentId: string) => childrenOf.get(parentId) ?? NO_TASKS,
    [childrenOf],
  );
  const taskById = useCallback((id: string) => byId.get(id), [byId]);

  const value = useMemo(
    () => ({
      today,
      staff,
      canWrite: props.canWrite,
      canAssign: props.canAssign,
      canDelete: props.canDelete ?? false,
      showEvent: props.scopeEventId === null,
      liftable: props.canWrite && props.layout !== "ablauf",
      hasColumns: props.layout !== "ablauf",
      actions,
      lift,
      pick,
      moveLift,
      drop,
      cancelLift,
      askReason,
      askSnoozeDate,
      nestable: eventBoard && props.canWrite,
      subtasksOf,
      taskById,
      askParent,
    }),
    [
      eventBoard,
      subtasksOf,
      taskById,
      askParent,
      today,
      staff,
      props.canWrite,
      props.canAssign,
      props.canDelete,
      props.scopeEventId,
      props.layout,
      actions,
      lift,
      pick,
      moveLift,
      drop,
      cancelLift,
      askReason,
      askSnoozeDate,
    ],
  );

  const liftedTask = lift ? tasks.find((c) => c.id === lift.id) : undefined;
  const sums = useMemo(() => {
    const open = tasks.filter((c) => !isFinishedStatus(c.status));
    const total = open.reduce((n, c) => n + c.estimateMinutes, 0);
    return { open: open.length, hours: total / 60 };
  }, [tasks]);

  // The footer's "Tastatur": the Checkliste has rows, not cards with a grip, so it lists the keys that work
  // there (UX-036); ticking, the menu and a new task need `task:write`.
  const keyHints: [key: string, label: string, kbd: React.ReactNode][] =
    props.layout === "ablauf"
      ? [
          ["move", t("keys.rowMove"), <Kbd key="k1">J K ↑ ↓</Kbd>],
          [
            "open",
            t("keys.rowOpen"),
            <span key="k2" className="inline-flex gap-1">
              <Kbd>↵</Kbd>
              <Kbd>{t("keys.space")}</Kbd>
            </span>,
          ],
          ...(props.canWrite
            ? ([
                ["e", t("keys.rowTick"), <Kbd key="k3">E</Kbd>],
                ["a", t("keys.rowMenu"), <Kbd key="k4">A</Kbd>],
                ["c", t("keys.newTask"), <Kbd key="k5">C</Kbd>],
              ] satisfies [string, string, React.ReactNode][])
            : []),
        ]
      : [
          ["grip", t("keys.pickUp"), <Kbd key="k1">{t("keys.space")}</Kbd>],
          ["arrows", t("keys.moveArrows"), <Kbd key="k2">← → ↑ ↓</Kbd>],
          ["drop", t("keys.dropShort"), <Kbd key="k3">{t("keys.space")}</Kbd>],
          ["esc", t("keys.cancelShort"), <Kbd key="k4">Esc</Kbd>],
          ["e", t("keys.markDone"), <Kbd key="k5">E</Kbd>],
          ["a", t("keys.openMenu"), <Kbd key="k6">A</Kbd>],
          ["c", t("keys.newTask"), <Kbd key="k7">C</Kbd>],
        ];

  return (
    <BoardProvider value={value}>
      <BoardDnd
        tasks={everything}
        cardsOf={cardsOf}
        overlay={(task) =>
          props.layout === "ablauf" || task.parentId !== null ? (
            <RowPreview task={task} />
          ) : (
            <CardPreview task={task} />
          )
        }
      >
        <div className="flex flex-col gap-3">
          {liftedTask && (
            <div
              role="status"
              className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-status-info-bg px-3 py-2 text-small text-status-info"
            >
              <span className="font-semibold">{t("keys.banner", { title: liftedTask.title })}</span>
              <span className="inline-flex items-center gap-1">
                <Kbd>←</Kbd>
                <Kbd>→</Kbd> {t("keys.column")}
              </span>
              <span className="inline-flex items-center gap-1">
                <Kbd>↑</Kbd>
                <Kbd>↓</Kbd> {t("keys.position")}
              </span>
              <span className="inline-flex items-center gap-1">
                <Kbd>{t("keys.space")}</Kbd> {t("keys.drop")}
              </span>
              <span className="inline-flex items-center gap-1">
                <Kbd>Esc</Kbd> {t("keys.cancel")}
              </span>
            </div>
          )}
          <div aria-live="assertive" className="sr-only">
            {live}
          </div>

          <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
            <div
              className={cn(
                "min-w-0 flex-1 pb-2",
                // The Ablauf list never scrolls sideways; a scroll box here would pin its sticky headers to it.
                props.layout !== "ablauf" && "overflow-x-auto",
              )}
            >
              {props.layout === "ablauf" && props.eventStartsOn && eventEndsOn ? (
                <AblaufList tasks={tasks} startsOn={props.eventStartsOn} endsOn={eventEndsOn} />
              ) : props.layout === "columns" ? (
                <Columns
                  cardsOf={cardsOf}
                  lift={lift}
                  eventEndsOn={eventEndsOn}
                  picked={phoneColumn}
                  onPick={setPhoneColumn}
                />
              ) : (
                <Swimlanes
                  tasks={tasks}
                  rail={props.rail ?? { people: [], unassigned: { tasks: 0, hours: 0 } }}
                  lift={lift}
                  cardsOf={cardsOf}
                />
              )}
              {tasks.length === 0 && (
                <p className="rounded-xl border border-dashed px-4 py-8 text-center text-muted-foreground text-small">
                  {props.filtered ? t("empty.filtered") : t("empty.board")}
                </p>
              )}
              {props.truncated && (
                <p role="status" className="mt-2 text-muted-foreground text-small">
                  {t("truncated")}
                </p>
              )}
            </div>
            {props.rail && (
              <PeopleRailPanel
                rail={props.rail}
                weekLabel={props.weekLabel}
                eventBoard={props.scopeEventId !== null}
              />
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3 text-small">
            <span className="tabular">
              <b className="font-semibold">
                {t("sum.open", { count: sums.open })}
                {isModuleVisible("estimates") && <> · {formatHours(sums.hours, locale)}</>}
              </b>
            </span>
            <details className="text-muted-foreground">
              <summary className="inline-flex cursor-pointer items-center gap-1.5 rounded-md px-1 focus-visible:outline-2 focus-visible:outline-ring">
                <Keyboard aria-hidden className="size-4" />
                {t("keys.title")}
              </summary>
              <dl className="mt-2 grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1">
                {keyHints
                  // E, A and C are single keys: not listed while they are off (UX-054).
                  .filter(([key]) => singleKeys || !SINGLE_KEY_ROWS.has(key))
                  .map(([key, label, kbd]) => (
                    <div key={key} className="contents">
                      <dd className="m-0 text-right">{kbd}</dd>
                      <dt>{label}</dt>
                    </div>
                  ))}
              </dl>
            </details>
          </div>
        </div>
      </BoardDnd>
      <ReasonDialog
        status={reasonFor?.status ?? null}
        taskTitle={reasonFor?.task.title ?? ""}
        onCancel={() => setReasonFor(null)}
        onSubmit={(reason) => {
          if (reasonFor) actions.setStatus(reasonFor.task, reasonFor.status, { reason });
          setReasonFor(null);
        }}
      />
      <ParentDialog
        task={parentFor}
        tasks={tasks}
        hasSubtasks={(id) =>
          (childrenOf.get(id)?.length ?? 0) > 0 ||
          (!eventBoard && (byId.get(id)?.subtasksTotal ?? 0) > 0)
        }
        onCancel={() => setParentFor(null)}
        onPick={(parent) => {
          if (parentFor) actions.setParent(parentFor, parent);
          setParentFor(null);
        }}
      />
      <SnoozeDialog
        open={snoozeFor !== null}
        taskTitle={snoozeFor?.title ?? ""}
        today={today}
        onCancel={() => setSnoozeFor(null)}
        onSubmit={(until) => {
          if (snoozeFor) actions.snooze(snoozeFor, until);
          setSnoozeFor(null);
        }}
      />
    </BoardProvider>
  );
}

/**
 * The four columns side by side; on phones one column at a time behind a wrapping switch with the counts
 * (UX-003: the 880 px strip needed a sideways scroll). While a card is lifted, its own column (it stays
 * there until the drop, with the focused grip that takes the keys) and the target column both show; the
 * switch marks the target.
 */
function Columns({
  cardsOf,
  lift,
  eventEndsOn,
  picked,
  onPick,
}: {
  cardsOf: (column: BoardColumn) => BoardTask[];
  lift: Lift | null;
  eventEndsOn: string | null;
  picked: BoardColumn;
  onPick: (column: BoardColumn) => void;
}) {
  const t = useTranslations("board");
  const shown = lift?.column ?? picked;
  const from = lift
    ? COLUMN_ORDER.find((c) => cardsOf(c).some((task) => task.id === lift.id))
    : undefined;
  return (
    <div className="flex flex-col gap-3">
      {/* biome-ignore lint/a11y/useSemanticElements: a labelled group of toggle buttons, not a fieldset */}
      <div
        role="group"
        aria-label={t("mobileColumns")}
        className="flex max-w-full flex-wrap rounded-lg border border-input bg-sunken p-0.5 sm:hidden"
      >
        {COLUMN_ORDER.map((column) => {
          const active = column === shown;
          return (
            <button
              key={column}
              type="button"
              aria-pressed={active}
              onClick={() => onPick(column)}
              className={cn(
                "inline-flex min-h-9 grow cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 font-medium text-small focus-visible:outline-2 focus-visible:outline-ring",
                active
                  ? "bg-card font-semibold text-foreground shadow-card ring-1 ring-input"
                  : "text-foreground-2 hover:bg-hover",
              )}
            >
              {t(`columns.${column}`)}
              <span
                className={cn(
                  "tabular inline-grid h-5 min-w-5 place-items-center rounded-full px-1 font-semibold text-[11.5px]",
                  active
                    ? "bg-accent-soft text-accent-soft-foreground"
                    : "bg-status-neutral-bg text-foreground-2",
                )}
              >
                {cardsOf(column).length}
              </span>
            </button>
          );
        })}
      </div>
      <div className="grid grid-cols-1 items-start gap-3 sm:min-w-[880px] sm:grid-cols-4">
        {COLUMN_ORDER.map((column) => (
          <ColumnPanel
            key={column}
            column={column}
            cards={cardsOf(column)}
            lift={lift}
            eventEndsOn={eventEndsOn}
            className={column === shown || column === from ? undefined : "max-sm:hidden"}
          />
        ))}
      </div>
    </div>
  );
}

/** One column with its header (title, count, estimated hours) and its cards. */
function ColumnPanel({
  column,
  cards,
  lift,
  eventEndsOn,
  className,
}: {
  column: BoardColumn;
  cards: BoardTask[];
  lift: Lift | null;
  eventEndsOn?: string | null;
  className?: string;
}) {
  const t = useTranslations("board");
  const locale = useLocale();
  const hours =
    cards.reduce((n, c) => n + (isFinishedStatus(c.status) ? 0 : c.estimateMinutes), 0) / 60;
  const drop = useCellDrop(column);
  return (
    <section
      ref={drop.ref}
      data-cell={drop.key}
      aria-label={t(`columns.${column}`)}
      className={cn(
        "flex min-w-0 flex-col gap-2 rounded-xl bg-sunken p-2",
        drop.marked && "ring-2 ring-primary/60",
        className,
      )}
    >
      <header className="flex items-center justify-between gap-2 px-1.5 pt-1">
        <h2 className="flex items-center gap-2 font-semibold text-small">
          {t(`columns.${column}`)}
          <span className="tabular inline-grid h-5 min-w-5 place-items-center rounded-full bg-status-neutral-bg px-1 font-semibold text-[11.5px] text-foreground-2">
            {cards.length}
          </span>
        </h2>
        <span className="tabular text-muted-foreground text-tiny">
          {column === "done"
            ? t("doneRange")
            : hours > 0 && isModuleVisible("estimates")
              ? formatHours(hours, locale)
              : ""}
        </span>
      </header>
      <CardList
        column={column}
        cards={cards}
        lift={lift}
        eventEndsOn={column === "preparation" ? eventEndsOn : null}
      />
    </section>
  );
}

/** Cards of one column (or of one person's lane in it), with the drop marker while a card is lifted. */
function CardList({
  column,
  cards,
  lift,
  lane,
  eventEndsOn,
}: {
  column: BoardColumn;
  cards: BoardTask[];
  lift: Lift | null;
  lane?: string | null;
  eventEndsOn?: string | null;
}) {
  const t = useTranslations("board");
  const cap = column === "done" ? DONE_COLLAPSED : COLUMN_CAP;
  // Long columns show their first cards and grow by COLUMN_CAP per click, not all at once (1,300 cards
  // took seconds to render); a lifted card needs the whole list.
  const [limit, setLimit] = useState(cap);
  const marker = lift && lift.column === column && lift.lane === lane ? lift : null;
  const collapsed = !marker && cards.length > limit;
  const shown = collapsed ? cards.slice(0, limit) : cards;
  const left = cards.length - limit;
  const items: React.ReactNode[] = [];
  const others = shown.filter((c) => c.id !== marker?.id);
  let slot = 0;
  let postHeading = false;
  for (const card of shown) {
    if (marker && card.id !== marker.id && slot === marker.index) {
      items.push(<DropMarker key="marker" />);
    }
    // Follow-up tasks (due after the event) get their own small heading in the event board.
    if (!postHeading && isAfterEvent(card.dueOn, eventEndsOn)) {
      postHeading = true;
      items.push(
        <li
          key="post-event"
          className="px-1.5 pt-1 font-semibold text-muted-foreground text-tiny first:pt-0"
        >
          {t("afterEvent")}
        </li>,
      );
    }
    items.push(<TaskCard key={card.id} task={card} />);
    if (card.id !== marker?.id) slot += 1;
  }
  if (marker && marker.index >= others.length) items.push(<DropMarker key="marker" />);

  return (
    <>
      <ul className="flex min-h-10 flex-col gap-2" aria-label={t(`columns.${column}`)}>
        {items}
      </ul>
      {cards.length === 0 && !marker && (
        <p className="px-1.5 pb-1 text-faint-foreground text-tiny">{t("emptyColumn")}</p>
      )}
      {cards.length > cap && (
        <div className="flex flex-wrap gap-x-3">
          {left > 0 && (
            <button
              type="button"
              onClick={() => setLimit((v) => v + COLUMN_CAP)}
              className={MORE_BUTTON}
            >
              {left > COLUMN_CAP
                ? t("showMoreLeft", { count: COLUMN_CAP, left })
                : t("showMore", { count: left })}
            </button>
          )}
          {limit > cap && (
            <button type="button" onClick={() => setLimit(cap)} className={MORE_BUTTON}>
              {t("showLess")}
            </button>
          )}
        </div>
      )}
    </>
  );
}

function DropMarker() {
  const t = useTranslations("board");
  return (
    <li
      aria-hidden
      className="grid h-12 place-items-center rounded-lg border-2 border-primary/50 border-dashed text-primary text-tiny"
    >
      {t("keys.dropHere")}
    </li>
  );
}

/** The person block of a lane: a card dropped here is assigned to that person (column unchanged). */
function LaneHeader({ lane, children }: { lane: string | null; children: React.ReactNode }) {
  const drop = useLaneDrop(lane);
  return (
    <div
      ref={drop.ref}
      className={cn(
        "flex flex-col gap-2 rounded-lg p-1",
        drop.marked && "bg-status-info-bg ring-2 ring-primary/60",
      )}
    >
      {children}
    </div>
  );
}

/** One column inside a lane: a drop zone for moving and (in another lane) assigning. */
function LaneCell({
  column,
  lane,
  label,
  cards,
  lift,
}: {
  column: BoardColumn;
  lane: string | null;
  label: string;
  cards: BoardTask[];
  lift: Lift | null;
}) {
  const drop = useCellDrop(column, lane);
  return (
    <section
      ref={drop.ref}
      data-cell={drop.key}
      aria-label={label}
      className={cn(
        "flex min-w-0 flex-col gap-2 rounded-lg",
        drop.marked && "ring-2 ring-primary/60",
      )}
    >
      <CardList column={column} cards={cards} lift={lift} lane={lane} />
    </section>
  );
}

/** "Nach Person": one lane per person (and one for unassigned work), the four columns side by side. */
function Swimlanes({
  tasks,
  rail,
  lift,
  cardsOf,
}: {
  tasks: BoardTask[];
  rail: PeopleRail;
  lift: Lift | null;
  cardsOf: (column: BoardColumn, lane?: string | null) => BoardTask[];
}) {
  const t = useTranslations("board");
  const lanes = useMemo(() => {
    const seen = new Map<string | null, string | null>();
    for (const p of rail.people) seen.set(p.id, p.name);
    for (const task of tasks)
      if (task.assigneeId && !seen.has(task.assigneeId))
        seen.set(task.assigneeId, task.assigneeName);
    const people = [...seen.entries()].sort((a, b) => (a[1] ?? "").localeCompare(b[1] ?? "", "de"));
    return [...people, [null, null] as [string | null, string | null]];
  }, [tasks, rail.people]);
  const load = new Map(rail.people.map((p) => [p.id, p]));

  return (
    <div className="flex min-w-[960px] flex-col gap-2">
      <div
        className="grid gap-2 px-2 font-semibold text-muted-foreground text-tiny"
        style={{ gridTemplateColumns: "170px repeat(4, minmax(0, 1fr))" }}
        aria-hidden
      >
        <span>{t("lanes.person")}</span>
        {COLUMN_ORDER.map((c) => (
          <span key={c}>{t(`columns.${c}`)}</span>
        ))}
      </div>
      {lanes.map(([id, name]) => {
        const p = id ? load.get(id) : undefined;
        const count = COLUMN_ORDER.reduce((n, c) => n + cardsOf(c, id).length, 0);
        if (id === null && count === 0) return null;
        return (
          <div
            key={id ?? "nobody"}
            className="grid gap-2 rounded-xl bg-sunken p-2"
            style={{ gridTemplateColumns: "170px repeat(4, minmax(0, 1fr))" }}
          >
            <LaneHeader lane={id}>
              <div className="flex items-center gap-2">
                {name ? (
                  <Avatar name={name} size="lg" />
                ) : (
                  <span className="grid size-8 place-items-center rounded-full border border-input border-dashed text-faint-foreground">
                    ?
                  </span>
                )}
                <span className="font-semibold text-small">{name ?? t("lanes.unassigned")}</span>
              </div>
              {p && (
                <LoadBar
                  hours={p.hoursThisWeek}
                  capacity={p.capacityHours}
                  level={p.level}
                  label={t("rail.load", { name: p.name })}
                />
              )}
            </LaneHeader>
            {COLUMN_ORDER.map((column) => (
              <LaneCell
                key={column}
                column={column}
                lane={id}
                label={`${name ?? t("lanes.unassigned")}: ${t(`columns.${column}`)}`}
                cards={cardsOf(column, id)}
                lift={lift}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}
