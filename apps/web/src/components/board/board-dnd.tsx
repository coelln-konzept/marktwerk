"use client";

import {
  type Active,
  type Announcements,
  type CollisionDetection,
  DndContext,
  type DragEndEvent,
  type DragMoveEvent,
  DragOverlay,
  type DragStartEvent,
  MouseSensor,
  type Over,
  pointerWithin,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  type BoardColumn,
  type DropIndicator,
  type DropPlan,
  type DropTarget,
  type NestingProblem,
  planDrop,
} from "@marktwerk/core";
import { CornerDownRight, Undo2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  createContext,
  type ReactNode,
  use,
  useCallback,
  useState,
  useSyncExternalStore,
} from "react";
import { useShell } from "@/components/shell/shell-context";
import { cn } from "@/lib/utils";
import type { BoardTask } from "@/server/queries/tasks";
import { useBoard } from "./board-context";
import { nestProblemOf, useNestProblemText } from "./nesting";

/*
 * Pointer and touch drag and drop for the board (ADR 0020), on top of dnd-kit.
 *
 * dnd-kit only reports which drop zone the pointer is in. Everything else is ours: the zones are the
 * columns (a "cell" per column and lane), the name block of a swimlane and the people in the rail;
 * the position inside a column comes from the cards' geometry; `planDrop` (core, tested) turns that
 * into "move" and/or "assign", and the drop ends in the same `useTaskActions` calls as the "⋯" menu
 * (optimistic update + undo toast). The keyboard keeps its own, index-based mode (board-view.tsx):
 * dnd-kit's KeyboardSensor is not registered, so only the pointer and touch listeners exist.
 *
 * Subtasks (ADR 0021, event board only): a task dropped on another task (a Checkliste row, or the middle
 * of a card) becomes its subtask; a subtask dropped anywhere else in the list or a column is lifted out.
 * Both end in `actions.setParent`, like "Unteraufgabe von …" / "Aus Hauptaufgabe lösen" in the menu. A
 * nesting the rules refuse (`nestingProblem`) is shown while dragging and gives an error toast on drop.
 */

type DropData =
  | { kind: "cell"; key: string; column: BoardColumn; lane?: string | null }
  | { kind: "lane"; lane: string | null }
  | { kind: "person"; id: string | null }
  /** A task (its row, card middle or subtask list): dropping nests the dragged task under it. */
  | { kind: "nest"; parentId: string }
  /** The Checkliste around the rows: dropping a subtask here lifts it out. */
  | { kind: "unnest" };

/** What a drop would do to the dragged task's parent. */
export type NestPreview =
  | { kind: "into"; parentId: string; problem: NestingProblem | null }
  /** Lifted out of `fromId`; `target` is the zone it would land in (cell key or "list"). */
  | { kind: "out"; fromId: string; target: string };

type DragState = {
  activeId: string | null;
  indicator: DropIndicator | null;
  nest: NestPreview | null;
};

const IDLE: DragState = { activeId: null, indicator: null, nest: null };

const DragStateContext = createContext<DragState>(IDLE);

const cellKey = (column: BoardColumn, lane: string | null | undefined) =>
  `${column}|${lane === undefined ? "" : (lane ?? "-")}`;

const sameIndicator = (a: DropIndicator | null, b: DropIndicator | null) =>
  JSON.stringify(a) === JSON.stringify(b);

function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const query = window.matchMedia("(prefers-reduced-motion: reduce)");
      query.addEventListener("change", onChange);
      return () => query.removeEventListener("change", onChange);
    },
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false,
  );
}

/**
 * `pointerWithin`, smallest zone first: a row or the middle of a card wins over the list or column around
 * it. A task is never a drop target for itself (its own row, card or subtask list).
 */
const collide: CollisionDetection = (args) => {
  const area = (id: string | number) => {
    const rect = args.droppableRects.get(id);
    return rect ? rect.width * rect.height : Number.POSITIVE_INFINITY;
  };
  return pointerWithin(args)
    .filter((hit) => {
      const data = args.droppableContainers.find((c) => c.id === hit.id)?.data.current as
        | DropData
        | undefined;
      return !(data?.kind === "nest" && data.parentId === args.active.id);
    })
    .sort((a, b) => area(a.id) - area(b.id));
};

/** Wraps the board: sensors, drop planning, announcements and the drag overlay. */
export function BoardDnd({
  tasks,
  cardsOf,
  overlay,
  children,
}: {
  /** Every task on the board, subtasks included (to find the dragged one and a drop's parent). */
  tasks: BoardTask[];
  cardsOf: (column: BoardColumn, lane?: string | null) => BoardTask[];
  /** The card as shown under the pointer while it is dragged. */
  overlay: (task: BoardTask) => ReactNode;
  children: ReactNode;
}) {
  const t = useTranslations("board");
  const tNest = useTranslations("board.nest");
  const board = useBoard();
  const { showToast } = useShell();
  const problemText = useNestProblemText();
  const reducedMotion = usePrefersReducedMotion();
  const [state, setState] = useState<DragState>(IDLE);

  // A small distance keeps clicks on the title, the tick-off button and the "⋯" menu working; touch
  // needs a press-and-hold so scrolling the board with a finger still works on a tablet.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
  );

  const taskOf = useCallback(
    (active: Active) => tasks.find((c) => c.id === active.id) ?? null,
    [tasks],
  );

  /** Nesting first: a drop on a task, or a subtask dropped outside its parent. */
  const nestFor = useCallback(
    (active: Active, over: Over | null): NestPreview | null => {
      if (!board.nestable) return null;
      const task = taskOf(active);
      const data = over?.data.current as DropData | undefined;
      if (!task || !data) return null;
      if (data.kind === "nest") {
        // Back onto its own parent: nothing changes.
        if (data.parentId === task.parentId) return null;
        const parent = board.taskById(data.parentId);
        if (!parent) return null;
        const hasSubtasks = board.subtasksOf(task.id).length > 0;
        return {
          kind: "into",
          parentId: parent.id,
          problem: nestProblemOf(task, parent, hasSubtasks),
        };
      }
      if (task.parentId && (data.kind === "unnest" || data.kind === "cell")) {
        return {
          kind: "out",
          fromId: task.parentId,
          target: data.kind === "cell" ? data.key : "list",
        };
      }
      return null;
    },
    [board, taskOf],
  );

  const planFor = useCallback(
    (active: Active, over: Over | null): DropPlan | null => {
      const task = taskOf(active);
      const data = over?.data.current as DropData | undefined;
      // Subtasks only nest and lift out; a drop on a task never moves or assigns.
      if (!task || !data || task.parentId || data.kind === "nest" || data.kind === "unnest")
        return null;
      let target: DropTarget;
      if (data.kind === "cell") {
        target = positionIn(data, active, task.id);
      } else {
        target = data;
      }
      return planDrop({
        card: { id: task.id, column: task.column, assigneeId: task.assigneeId },
        target,
        cards: (column, lane) => cardsOf(column, lane).map((c) => c.id),
        canAssign: board.canAssign,
      });
    },
    [taskOf, cardsOf, board.canAssign],
  );

  const staffName = useCallback(
    (id: string | null) => board.staff.find((s) => s.id === id)?.displayName ?? "",
    [board.staff],
  );

  const titleOf = useCallback((id: string) => board.taskById(id)?.title ?? "", [board]);

  /** What a nesting drop would do, in words (announcements and the hint under the dragged card). */
  const nestText = useCallback(
    (title: string, nest: NestPreview) => {
      if (nest.kind === "out") return tNest("dropOut", { parent: titleOf(nest.fromId) });
      const parent = titleOf(nest.parentId);
      return nest.problem
        ? problemText(nest.problem, title, parent)
        : tNest("dropInto", { parent });
    },
    [tNest, titleOf, problemText],
  );

  const preview = useCallback(
    (title: string, plan: DropPlan | null) => {
      if (!plan) return t("dnd.noDrop", { title });
      const column = t(`columns.${plan.position.column}`);
      const { index: position, total } = plan.position;
      if (plan.assign && plan.move) {
        const name = staffName(plan.assign.assigneeId);
        return plan.assign.assigneeId
          ? t("dnd.assignMoveTo", { title, name, column, position, total })
          : t("dnd.unassignMoveTo", { title, column, position, total });
      }
      if (plan.assign) {
        return plan.assign.assigneeId
          ? t("dnd.assignTo", { title, name: staffName(plan.assign.assigneeId) })
          : t("dnd.unassignTo", { title });
      }
      return t("dnd.moveTo", { title, column, position, total });
    },
    [t, staffName],
  );

  const result = useCallback(
    (title: string, plan: DropPlan) => {
      const column = t(`columns.${plan.position.column}`);
      if (plan.assign && plan.move) {
        return plan.assign.assigneeId
          ? t("toast.assignedMoved", { title, name: staffName(plan.assign.assigneeId), column })
          : t("toast.unassignedMoved", { title, column });
      }
      if (plan.assign) {
        return plan.assign.assigneeId
          ? t("toast.assigned", { title, name: staffName(plan.assign.assigneeId) })
          : t("toast.unassigned", { title });
      }
      return plan.position.column === "done"
        ? t("toast.done", { title })
        : t("toast.moved", { title, column });
    },
    [t, staffName],
  );

  const announcements: Announcements = {
    onDragStart: ({ active }) => t("dnd.start", { title: taskOf(active)?.title ?? "" }),
    onDragOver: ({ active, over }) => {
      const title = taskOf(active)?.title ?? "";
      const nest = nestFor(active, over);
      return nest ? nestText(title, nest) : preview(title, planFor(active, over));
    },
    onDragEnd: ({ active, over }) => {
      const title = taskOf(active)?.title ?? "";
      const nest = nestFor(active, over);
      if (nest) return nestText(title, nest);
      const plan = planFor(active, over);
      return plan ? result(title, plan) : t("dnd.cancelled");
    },
    onDragCancel: () => t("dnd.cancelled"),
  };

  const onDragStart = ({ active }: DragStartEvent) =>
    setState({ activeId: String(active.id), indicator: null, nest: null });

  const onDragMove = ({ active, over }: DragMoveEvent) => {
    const nest = nestFor(active, over);
    const next = nest ? null : (planFor(active, over)?.indicator ?? null);
    setState((s) =>
      sameIndicator(s.indicator, next) && JSON.stringify(s.nest) === JSON.stringify(nest)
        ? s
        : { ...s, indicator: next, nest },
    );
  };

  const reset = () => setState(IDLE);

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    const task = taskOf(active);
    const nest = nestFor(active, over);
    const plan = nest ? null : planFor(active, over);
    reset();
    if (!task) return;
    if (nest?.kind === "into") {
      const parent = board.taskById(nest.parentId);
      if (!parent) return;
      if (nest.problem) {
        showToast({ message: problemText(nest.problem, task.title, parent.title), tone: "error" });
        return;
      }
      board.actions.setParent(task, parent);
      return;
    }
    if (nest?.kind === "out") {
      board.actions.setParent(task, null, board.taskById(nest.fromId) ?? null);
      return;
    }
    if (!plan) return;
    const { move, assign } = plan;
    if (move && assign) {
      board.actions.moveAndAssign(task, move.column, move.afterId, assign.assigneeId);
    } else if (move) {
      board.actions.move(task, move.column, move.afterId);
    } else if (assign) {
      board.actions.assign(task, assign.assigneeId);
    }
  };

  const activeTask = state.activeId ? tasks.find((c) => c.id === state.activeId) : undefined;
  const hint = activeTask && state.nest ? nestText(activeTask.title, state.nest) : null;
  const refused = state.nest?.kind === "into" && state.nest.problem !== null;
  const HintIcon = state.nest?.kind === "out" ? Undo2 : refused ? X : CornerDownRight;

  return (
    <DndContext
      id="board-dnd"
      sensors={sensors}
      collisionDetection={collide}
      accessibility={{
        announcements,
        screenReaderInstructions: { draggable: t("dnd.instructions") },
      }}
      onDragStart={onDragStart}
      onDragMove={onDragMove}
      onDragEnd={onDragEnd}
      onDragCancel={reset}
    >
      <DragStateContext value={state}>{children}</DragStateContext>
      <DragOverlay dropAnimation={reducedMotion ? null : undefined}>
        {activeTask ? (
          <div className="flex flex-col items-start gap-1">
            {overlay(activeTask)}
            {hint && (
              <span
                className={cn(
                  "inline-flex max-w-full items-center gap-1 rounded-full px-2 py-0.5 font-semibold text-tiny shadow-pop",
                  refused
                    ? "bg-status-critical-bg text-status-critical"
                    : "bg-status-info-bg text-status-info",
                )}
              >
                <HintIcon aria-hidden className="size-3.5 shrink-0" />
                <span className="truncate">{hint}</span>
              </span>
            )}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

/**
 * Where inside a column the dragged card is: before the first card whose middle is below it, or at the
 * end. Read from the rendered cards, so it always matches what the person sees.
 */
function positionIn(
  data: Extract<DropData, { kind: "cell" }>,
  active: Active,
  activeId: string,
): DropTarget {
  const rect = active.rect.current.translated ?? active.rect.current.initial;
  const middle = rect ? rect.top + rect.height / 2 : Number.POSITIVE_INFINITY;
  const cards = document.querySelectorAll<HTMLElement>(`[data-cell="${data.key}"] [data-card]`);
  for (const card of cards) {
    const id = card.dataset.card;
    if (!id || id === activeId) continue;
    const box = card.getBoundingClientRect();
    if (middle < box.top + box.height / 2) {
      return { kind: "card", id, column: data.column, lane: data.lane, half: "before" };
    }
  }
  return { kind: "cell", column: data.column, lane: data.lane };
}

// ---------------------------------------------------------------------------------------------
// hooks for the draggable cards and the drop zones

/**
 * Drag wiring of one card or row: pointer/touch listeners for it, accessibility attributes for the grip.
 * `enabled` defaults to the board's keyboard-liftable cards; Checkliste rows and subtasks pass `nestable`.
 */
export function useCardDrag(task: BoardTask, enabled?: boolean) {
  const board = useBoard();
  const t = useTranslations("board.dnd");
  const { indicator, activeId } = use(DragStateContext);
  const { attributes, listeners, setNodeRef } = useDraggable({
    id: task.id,
    disabled: !(enabled ?? board.liftable),
    attributes: { roleDescription: t("roleDescription") },
  });
  const edge = indicator?.kind === "card" && indicator.id === task.id ? indicator.edge : null;
  return { attributes, listeners, setNodeRef, dragging: activeId === task.id, edge };
}

/** A column (inside a lane, if the board has lanes) as a drop zone. */
export function useCellDrop(column: BoardColumn, lane?: string | null) {
  const board = useBoard();
  const { indicator, nest } = use(DragStateContext);
  const key = cellKey(column, lane);
  const { setNodeRef } = useDroppable({
    id: `cell:${key}`,
    disabled: !board.liftable,
    data: { kind: "cell", key, column, lane } satisfies DropData,
  });
  const marked =
    (indicator?.kind === "cell" && cellKey(indicator.column, indicator.lane) === key) ||
    (nest?.kind === "out" && nest.target === key);
  return { ref: setNodeRef, key, marked };
}

/** The name block of a swimlane: dropping assigns the card to that person. */
export function useLaneDrop(lane: string | null) {
  const board = useBoard();
  const { indicator } = use(DragStateContext);
  const { setNodeRef } = useDroppable({
    id: `lane:${lane ?? "-"}`,
    disabled: !board.liftable || !board.canAssign,
    data: { kind: "lane", lane } satisfies DropData,
  });
  return { ref: setNodeRef, marked: indicator?.kind === "lane" && indicator.lane === lane };
}

/** A person in the people rail (null = "Nicht zugewiesen"): dropping assigns the card. */
export function usePersonDrop(id: string | null) {
  const board = useBoard();
  const { indicator, activeId } = use(DragStateContext);
  const { setNodeRef } = useDroppable({
    id: `person:${id ?? "-"}`,
    disabled: !board.liftable || !board.canAssign,
    data: { kind: "person", id } satisfies DropData,
  });
  return {
    ref: setNodeRef,
    marked: indicator?.kind === "person" && indicator.id === id,
    /** A card is being dragged and this role may drop it on a person. */
    ready: activeId !== null && board.canAssign,
  };
}

/**
 * A task as a nesting target (`part`: which of its zones: row, card middle, a subtask row, …; each zone
 * needs its own id). `state`: "into" while the dragged task would become its subtask, "refused" while the
 * rules don't allow it.
 */
export function useNestDrop(parentId: string, part: string) {
  const board = useBoard();
  const { nest } = use(DragStateContext);
  const { setNodeRef } = useDroppable({
    id: `nest:${parentId}:${part}`,
    disabled: !board.nestable,
    data: { kind: "nest", parentId } satisfies DropData,
  });
  const state =
    nest?.kind === "into" && nest.parentId === parentId
      ? nest.problem
        ? ("refused" as const)
        : ("into" as const)
      : null;
  return { ref: setNodeRef, state };
}

/** The Checkliste around its rows: a subtask dropped here is lifted out of its parent. */
export function useUnnestDrop() {
  const board = useBoard();
  const { nest } = use(DragStateContext);
  const { setNodeRef } = useDroppable({
    id: "unnest:list",
    disabled: !board.nestable,
    data: { kind: "unnest" } satisfies DropData,
  });
  return { ref: setNodeRef, marked: nest?.kind === "out" && nest.target === "list" };
}

/** Classes for a nesting target: a ring in the info tone, or the critical tone when refused. */
export function nestTargetClass(state: "into" | "refused" | null): string | false {
  return (
    state !== null &&
    (state === "into"
      ? "bg-status-info-bg ring-2 ring-primary ring-inset"
      : "bg-status-critical-bg ring-2 ring-status-critical ring-inset")
  );
}
