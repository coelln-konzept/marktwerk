"use client";

import {
  type Active,
  type Announcements,
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
  planDrop,
} from "@marktwerk/core";
import { useTranslations } from "next-intl";
import {
  createContext,
  type ReactNode,
  use,
  useCallback,
  useState,
  useSyncExternalStore,
} from "react";
import type { BoardTask } from "@/server/queries/tasks";
import { useBoard } from "./board-context";

/*
 * Pointer and touch drag and drop for the board (ADR 0020), on top of dnd-kit.
 *
 * dnd-kit only reports which drop zone the pointer is in. Everything else is ours: the zones are the
 * columns (a "cell" per column and lane), the name block of a swimlane and the people in the rail;
 * the position inside a column comes from the cards' geometry; `planDrop` (core, tested) turns that
 * into "move" and/or "assign", and the drop ends in the same `useTaskActions` calls as the "⋯" menu
 * (optimistic update + undo toast). The keyboard keeps its own, index-based mode (board-view.tsx):
 * dnd-kit's KeyboardSensor is not registered, so only the pointer and touch listeners exist.
 */

type DropData =
  | { kind: "cell"; key: string; column: BoardColumn; lane?: string | null }
  | { kind: "lane"; lane: string | null }
  | { kind: "person"; id: string | null };

type DragState = { activeId: string | null; indicator: DropIndicator | null };

const DragStateContext = createContext<DragState>({ activeId: null, indicator: null });

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

/** Wraps the board: sensors, drop planning, announcements and the drag overlay. */
export function BoardDnd({
  tasks,
  cardsOf,
  overlay,
  children,
}: {
  tasks: BoardTask[];
  cardsOf: (column: BoardColumn, lane?: string | null) => BoardTask[];
  /** The card as shown under the pointer while it is dragged. */
  overlay: (task: BoardTask) => ReactNode;
  children: ReactNode;
}) {
  const t = useTranslations("board");
  const board = useBoard();
  const reducedMotion = usePrefersReducedMotion();
  const [state, setState] = useState<DragState>({ activeId: null, indicator: null });

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

  const planFor = useCallback(
    (active: Active, over: Over | null): DropPlan | null => {
      const task = taskOf(active);
      const data = over?.data.current as DropData | undefined;
      if (!task || !data) return null;
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
    onDragOver: ({ active, over }) => preview(taskOf(active)?.title ?? "", planFor(active, over)),
    onDragEnd: ({ active, over }) => {
      const plan = planFor(active, over);
      return plan ? result(taskOf(active)?.title ?? "", plan) : t("dnd.cancelled");
    },
    onDragCancel: () => t("dnd.cancelled"),
  };

  const onDragStart = ({ active }: DragStartEvent) =>
    setState({ activeId: String(active.id), indicator: null });

  const onDragMove = ({ active, over }: DragMoveEvent) => {
    const next = planFor(active, over)?.indicator ?? null;
    setState((s) => (sameIndicator(s.indicator, next) ? s : { ...s, indicator: next }));
  };

  const reset = () => setState({ activeId: null, indicator: null });

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    const task = taskOf(active);
    const plan = planFor(active, over);
    reset();
    if (!task || !plan) return;
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

  return (
    <DndContext
      id="board-dnd"
      sensors={sensors}
      collisionDetection={pointerWithin}
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
        {activeTask ? overlay(activeTask) : null}
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

/** Drag wiring of one card: pointer/touch listeners for the card, accessibility attributes for the grip. */
export function useCardDrag(task: BoardTask) {
  const board = useBoard();
  const t = useTranslations("board.dnd");
  const { indicator, activeId } = use(DragStateContext);
  const { attributes, listeners, setNodeRef } = useDraggable({
    id: task.id,
    disabled: !board.liftable,
    attributes: { roleDescription: t("roleDescription") },
  });
  const edge = indicator?.kind === "card" && indicator.id === task.id ? indicator.edge : null;
  return { attributes, listeners, setNodeRef, dragging: activeId === task.id, edge };
}

/** A column (inside a lane, if the board has lanes) as a drop zone. */
export function useCellDrop(column: BoardColumn, lane?: string | null) {
  const board = useBoard();
  const { indicator } = use(DragStateContext);
  const key = cellKey(column, lane);
  const { setNodeRef } = useDroppable({
    id: `cell:${key}`,
    disabled: !board.liftable,
    data: { kind: "cell", key, column, lane } satisfies DropData,
  });
  const marked = indicator?.kind === "cell" && cellKey(indicator.column, indicator.lane) === key;
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
