"use client";

import type { TaskStatusKey } from "@marktwerk/core";
import { useTaskActions } from "@/components/board/use-task-actions";
import { TaskTick } from "./task-tick";

/**
 * The tick of an Übersicht row. The task leaves the list, so it asks first (decision D1), then applies with
 * an undo toast; a task that still needs evidence opens its drawer instead (same path as the board).
 */
export function TaskDoneButton({
  task,
}: {
  task: { id: string; title: string; status: TaskStatusKey };
}) {
  const actions = useTaskActions({ staff: [], confirmDone: true });
  return (
    <TaskTick
      task={task}
      disabled={actions.pending}
      onToggle={(next) => actions.setStatus(task, next)}
    />
  );
}
