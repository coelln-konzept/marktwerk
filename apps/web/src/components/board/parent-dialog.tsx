"use client";

import { CornerDownRight, Search } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { formatDateShort } from "@/lib/format";
import type { BoardTask } from "@/server/queries/tasks";
import { nestProblemOf, useNestProblemText } from "./nesting";

/** More candidates than this get a search field. */
const SEARCH_FROM = 8;

const fold = (text: string) =>
  text
    .toLocaleLowerCase("de")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");

/**
 * "Unteraufgabe von …" (card and row menu; the keyboard and pointer-free way to nest, ADR 0021): the tasks of
 * the same event the task can go under, searchable when the list is long. Tasks the rules refuse
 * (`nestingProblem`) are not offered; when none is left the dialog says why.
 */
export function ParentDialog({
  task,
  tasks,
  hasSubtasks,
  onPick,
  onCancel,
}: {
  /** null = closed */
  task: BoardTask | null;
  /** The top-level tasks on the board. */
  tasks: BoardTask[];
  hasSubtasks: (id: string) => boolean;
  onPick: (parent: BoardTask) => void;
  onCancel: () => void;
}) {
  const t = useTranslations("board.nest");
  const locale = useLocale();
  const problemText = useNestProblemText();
  const [query, setQuery] = useState("");
  useEffect(() => {
    if (task) setQuery("");
  }, [task]);

  const own = task ? hasSubtasks(task.id) : false;
  const candidates = useMemo(() => {
    if (!task || own) return [];
    return tasks
      .filter((p) => p.id !== task.parentId && nestProblemOf(task, p, false) === null)
      .sort(
        (a, b) =>
          (a.dueOn ?? "9999").localeCompare(b.dueOn ?? "9999") ||
          a.title.localeCompare(b.title, "de"),
      );
  }, [task, tasks, own]);
  const needle = fold(query.trim());
  const shown = needle ? candidates.filter((p) => fold(p.title).includes(needle)) : candidates;

  return (
    <Modal
      open={task !== null}
      onOpenChange={(open) => !open && onCancel()}
      title={t("dialogTitle")}
      description={task ? t("dialogDescription", { title: task.title }) : undefined}
      closeLabel={t("cancel")}
    >
      {task && own ? (
        <p className="text-small">{problemText("has_subtasks", task.title, "")}</p>
      ) : task && candidates.length === 0 ? (
        <p className="text-muted-foreground text-small">
          {t("noCandidates", { title: task.title })}
        </p>
      ) : (
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            // Enter in the search field takes the first match.
            event.preventDefault();
            const first = shown[0];
            if (first) onPick(first);
          }}
        >
          {candidates.length > SEARCH_FROM && (
            <div className="relative">
              <Search
                aria-hidden
                className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-3 size-4 text-muted-foreground"
              />
              <Input
                type="search"
                autoFocus
                aria-label={t("search")}
                placeholder={t("searchPlaceholder")}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="pl-9"
              />
            </div>
          )}
          <ul
            aria-label={t("candidates")}
            className="m-0 flex max-h-[min(360px,50dvh)] list-none flex-col overflow-y-auto rounded-lg border p-1"
          >
            {shown.map((parent) => (
              <li key={parent.id}>
                <button
                  type="button"
                  data-task={parent.id}
                  onClick={() => onPick(parent)}
                  className="flex min-h-9 w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-left text-small hover:bg-hover focus-visible:outline-2 focus-visible:outline-ring"
                >
                  <CornerDownRight aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">{parent.title}</span>
                  {parent.dueOn && (
                    <span className="tabular shrink-0 text-muted-foreground text-tiny">
                      {formatDateShort(parent.dueOn, locale)}
                    </span>
                  )}
                </button>
              </li>
            ))}
            {shown.length === 0 && (
              <li className="px-2 py-2 text-muted-foreground text-small">{t("noMatch")}</li>
            )}
          </ul>
          <div className="flex justify-end">
            <Button type="button" onClick={onCancel}>
              {t("cancel")}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
