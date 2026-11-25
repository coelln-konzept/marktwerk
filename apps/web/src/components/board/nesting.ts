"use client";

import { isOpenStatus, type NestingProblem, nestingProblem } from "@marktwerk/core";
import { useTranslations } from "next-intl";
import { useCallback } from "react";
import type { BoardTask } from "@/server/queries/tasks";

/*
 * Nesting a task under another one on the board (ADR 0021, UT2-14): the client side of `setTaskParent`. The
 * board checks the same pure rule (`nestingProblem`) before it calls the server, so a refused drop or menu
 * pick says why at once and changes nothing; the server checks again and has the last word.
 */

type NestTask = Pick<BoardTask, "id" | "eventId" | "parentId" | "status">;

/** Why `task` can't become a subtask of `parent` (null = it can). `hasSubtasks`: the task has subtasks. */
export function nestProblemOf(
  task: NestTask,
  parent: NestTask,
  hasSubtasks: boolean,
): NestingProblem | null {
  return nestingProblem({
    taskId: task.id,
    taskEventId: task.eventId,
    taskHasSubtasks: hasSubtasks,
    taskOpen: isOpenStatus(task.status),
    parent: {
      id: parent.id,
      eventId: parent.eventId,
      parentTaskId: parent.parentId,
      status: parent.status,
    },
  });
}

const PROBLEMS = [
  "self",
  "parent_is_subtask",
  "has_subtasks",
  "other_event",
  "parent_cancelled",
  "parent_closed",
  "not_found",
] as const;

/**
 * The reason a nesting is refused, in words: `problem` is a `NestingProblem` or the server's `invalid_parent`
 * detail (also `not_found`); anything else gets the general text.
 */
export function useNestProblemText() {
  const t = useTranslations("board.nest");
  return useCallback(
    (problem: string | undefined, title: string, parent: string) => {
      const known = PROBLEMS.find((p) => p === problem);
      const reason = known ? t(`problems.${known}`, { title, parent }) : t("problems.other");
      return t("refused", { title, reason });
    },
    [t],
  );
}
