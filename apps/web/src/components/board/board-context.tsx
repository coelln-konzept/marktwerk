"use client";

import type { BoardColumn, TaskStatusKey } from "@marktwerk/core";
import { createContext, use } from "react";
import type { BoardTask, StaffOption } from "@/server/queries/tasks";
import type { useTaskActions } from "./use-task-actions";

/** A card picked up with the keyboard: where it would land if dropped now. */
export type Lift = {
  id: string;
  column: BoardColumn;
  /** Slot in the target column among the other cards of the same lane (zero-based). */
  index: number;
  /** Swimlane (assignee id, null = nobody); undefined = no lanes. */
  lane?: string | null;
};

export type BoardContextValue = {
  today: string;
  staff: StaffOption[];
  canWrite: boolean;
  canAssign: boolean;
  /** Show the event name on the card (boards across events). */
  showEvent: boolean;
  /** Cards can be lifted and moved with the keyboard (not in the grouped list). */
  liftable: boolean;
  actions: ReturnType<typeof useTaskActions>;
  lift: Lift | null;
  pick: (task: BoardTask) => void;
  moveLift: (dx: number, dy: number) => void;
  drop: () => void;
  cancelLift: () => void;
  /** Statuses that need a reason open a small dialog first. */
  askReason: (task: BoardTask, status: TaskStatusKey) => void;
};

const BoardContext = createContext<BoardContextValue | null>(null);

export const BoardProvider = BoardContext.Provider;

export function useBoard(): BoardContextValue {
  const value = use(BoardContext);
  if (!value) throw new Error("useBoard outside BoardProvider");
  return value;
}
