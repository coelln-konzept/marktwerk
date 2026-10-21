"use client";

import {
  type BoardColumn,
  derivedColumn,
  isFinishedStatus,
  type TaskStatusKey,
} from "@marktwerk/core";
import { Keyboard } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useOptimistic, useRef, useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Kbd } from "@/components/ui/kbd";
import { COLUMN_ORDER, formatHours } from "@/lib/task-ui";
import { cn } from "@/lib/utils";
import type { BoardTask, PeopleRail, StaffOption } from "@/server/queries/tasks";
import { BoardProvider, type Lift } from "./board-context";
import { GroupedCards } from "./grouped-cards";
import { PeopleRailPanel } from "./people-rail";
import { ReasonDialog } from "./reason-dialog";
import { LoadBar } from "./task-bits";
import { TaskCard } from "./task-card";
import { type OptimisticPatch, useTaskActions } from "./use-task-actions";

/** Finished cards shown before "weitere anzeigen" (the column is a collapsed list). */
const DONE_COLLAPSED = 5;

/**
 * Applies a change to the cards at once, before the server confirms it. Moving a card places it after
 * the given card (or at the top of the column), like the service does.
 */
function applyPatch(state: BoardTask[], patch: OptimisticPatch, today: string): BoardTask[] {
  const task = state.find((t) => t.id === patch.id);
  if (!task) return state;
  if (patch.kind === "assign") {
    return state.map((t) =>
      t.id === patch.id
        ? { ...t, assigneeId: patch.assigneeId, assigneeName: patch.assigneeName }
        : t,
    );
  }
  if (patch.kind === "status") {
    const finished = isFinishedStatus(patch.status);
    const column: BoardColumn = finished
      ? "done"
      : task.column === "done"
        ? derivedColumn(task.dueOn, today)
        : task.column;
    return state.map((t) => (t.id === patch.id ? { ...t, status: patch.status, column } : t));
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

export type BoardLayout = "columns" | "person" | "groups";

type Props = {
  tasks: BoardTask[];
  staff: StaffOption[];
  rail: PeopleRail;
  today: string;
  weekLabel: string;
  canWrite: boolean;
  canAssign: boolean;
  /** Event board: its id (card order is kept per event). Across events: null. */
  scopeEventId: string | null;
  layout: BoardLayout;
  /** For the grouped list: group by event or by due day. */
  groupBy?: "event" | "day";
  /** True when filters are active (changes the empty text). */
  filtered: boolean;
  /** More tasks exist than the page loaded. */
  truncated: boolean;
};

/**
 * The kanban board: four columns (Vorbereitung · Diese Woche · Heute · Erledigt) or one swimlane per
 * person, and the people rail. Cards move through the "⋯" menu or the keyboard; both end in
 * `moveCard(taskId, column, position)` so a drag-and-drop library can be added on top later without
 * changing the server path (the columns and cards are components with explicit ids and positions).
 */
export function BoardView(props: Props) {
  const t = useTranslations("board");
  const locale = useLocale();
  const { today, staff } = props;
  const [tasks, apply] = useOptimistic(props.tasks, (state, patch: OptimisticPatch) =>
    applyPatch(state, patch, today),
  );
  const actions = useTaskActions({ staff, scopeEventId: props.scopeEventId, apply });
  const [lift, setLift] = useState<Lift | null>(null);
  const [live, setLive] = useState("");
  const [reasonFor, setReasonFor] = useState<{ task: BoardTask; status: TaskStatusKey } | null>(
    null,
  );
  const focusAfter = useRef<string | null>(null);

  const cardsOf = useCallback(
    (column: BoardColumn, lane?: string | null) =>
      tasks.filter(
        (task) =>
          task.column === column && (lane === undefined || (task.assigneeId ?? null) === lane),
      ),
    [tasks],
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
      const list = cardsOf(task.column, lane);
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
    [cardsOf, props.layout, t, columnName],
  );

  const moveLift = useCallback(
    (dx: number, dy: number) => {
      if (!lift) return;
      const task = tasks.find((c) => c.id === lift.id);
      if (!task) return;
      let column = lift.column;
      let index = lift.index;
      if (dx !== 0) {
        const at = COLUMN_ORDER.indexOf(column) + dx;
        column = COLUMN_ORDER[Math.min(COLUMN_ORDER.length - 1, Math.max(0, at))] as BoardColumn;
      }
      const others = cardsOf(column, lift.lane).filter((c) => c.id !== lift.id);
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
    [lift, tasks, cardsOf, t, columnName],
  );

  const cancelLift = useCallback(() => {
    if (!lift) return;
    focusAfter.current = lift.id;
    setLift(null);
    setLive(t("keys.cancelled"));
  }, [lift, t]);

  const drop = useCallback(() => {
    if (!lift) return;
    const task = tasks.find((c) => c.id === lift.id);
    setLift(null);
    if (!task) return;
    focusAfter.current = task.id;
    const others = cardsOf(lift.column, lift.lane).filter((c) => c.id !== lift.id);
    const afterId = lift.index > 0 ? (others[lift.index - 1]?.id ?? null) : null;
    const original = cardsOf(task.column, lift.lane).findIndex((c) => c.id === task.id);
    if (lift.column === task.column && lift.index === original) {
      setLive(t("keys.cancelled"));
      return;
    }
    actions.move(task, lift.column, afterId);
    setLive(t("keys.dropped", { title: task.title, column: columnName(lift.column) }));
  }, [lift, tasks, cardsOf, actions, t, columnName]);

  const askReason = useCallback(
    (task: BoardTask, status: TaskStatusKey) => setReasonFor({ task, status }),
    [],
  );

  const value = useMemo(
    () => ({
      today,
      staff,
      canWrite: props.canWrite,
      canAssign: props.canAssign,
      showEvent: props.scopeEventId === null,
      liftable: props.layout !== "groups" && props.canWrite,
      actions,
      lift,
      pick,
      moveLift,
      drop,
      cancelLift,
      askReason,
    }),
    [
      today,
      staff,
      props.canWrite,
      props.canAssign,
      props.scopeEventId,
      props.layout,
      actions,
      lift,
      pick,
      moveLift,
      drop,
      cancelLift,
      askReason,
    ],
  );

  const liftedTask = lift ? tasks.find((c) => c.id === lift.id) : undefined;
  const sums = useMemo(() => {
    const open = tasks.filter((c) => !isFinishedStatus(c.status));
    const total = open.reduce((n, c) => n + c.estimateMinutes, 0);
    return { open: open.length, hours: total / 60 };
  }, [tasks]);

  return (
    <BoardProvider value={value}>
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
          <div className="min-w-0 flex-1 overflow-x-auto pb-2">
            {props.layout === "columns" ? (
              <div className="grid min-w-[880px] grid-cols-4 items-start gap-3">
                {COLUMN_ORDER.map((column) => (
                  <ColumnPanel key={column} column={column} cards={cardsOf(column)} lift={lift} />
                ))}
              </div>
            ) : props.layout === "person" ? (
              <Swimlanes tasks={tasks} rail={props.rail} lift={lift} cardsOf={cardsOf} />
            ) : (
              <GroupedCards tasks={tasks} groupBy={props.groupBy ?? "event"} today={today} />
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
          <PeopleRailPanel
            rail={props.rail}
            weekLabel={props.weekLabel}
            eventBoard={props.scopeEventId !== null}
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3 text-small">
          <span className="tabular">
            <b className="font-semibold">
              {t("sum.open", { count: sums.open })} · {formatHours(sums.hours, locale)}
            </b>
          </span>
          <details className="text-muted-foreground">
            <summary className="inline-flex cursor-pointer items-center gap-1.5 rounded-md px-1 outline-none focus-visible:outline-2 focus-visible:outline-ring">
              <Keyboard aria-hidden className="size-4" />
              {t("keys.title")}
            </summary>
            <dl className="mt-2 grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1">
              {(
                [
                  ["grip", t("keys.pickUp"), <Kbd key="k1">{t("keys.space")}</Kbd>],
                  ["arrows", t("keys.moveArrows"), <Kbd key="k2">← → ↑ ↓</Kbd>],
                  ["drop", t("keys.dropShort"), <Kbd key="k3">{t("keys.space")}</Kbd>],
                  ["esc", t("keys.cancelShort"), <Kbd key="k4">Esc</Kbd>],
                  ["e", t("keys.markDone"), <Kbd key="k5">E</Kbd>],
                  ["a", t("keys.openMenu"), <Kbd key="k6">A</Kbd>],
                  ["c", t("keys.newTask"), <Kbd key="k7">C</Kbd>],
                ] as const
              ).map(([key, label, kbd]) => (
                <div key={key} className="contents">
                  <dd className="m-0 text-right">{kbd}</dd>
                  <dt>{label}</dt>
                </div>
              ))}
            </dl>
          </details>
        </div>
      </div>
      <ReasonDialog
        status={reasonFor?.status ?? null}
        taskTitle={reasonFor?.task.title ?? ""}
        onCancel={() => setReasonFor(null)}
        onSubmit={(reason) => {
          if (reasonFor) actions.setStatus(reasonFor.task, reasonFor.status, { reason });
          setReasonFor(null);
        }}
      />
    </BoardProvider>
  );
}

/** One column with its header (title, count, estimated hours) and its cards. */
function ColumnPanel({
  column,
  cards,
  lift,
}: {
  column: BoardColumn;
  cards: BoardTask[];
  lift: Lift | null;
}) {
  const t = useTranslations("board");
  const locale = useLocale();
  const hours =
    cards.reduce((n, c) => n + (isFinishedStatus(c.status) ? 0 : c.estimateMinutes), 0) / 60;
  return (
    <section
      aria-label={t(`columns.${column}`)}
      className="flex min-w-0 flex-col gap-2 rounded-xl bg-sunken p-2"
    >
      <header className="flex items-center justify-between gap-2 px-1.5 pt-1">
        <h3 className="flex items-center gap-2 font-semibold text-small">
          {t(`columns.${column}`)}
          <span className="tabular inline-grid h-5 min-w-5 place-items-center rounded-full bg-status-neutral-bg px-1 font-semibold text-[11.5px] text-foreground-2">
            {cards.length}
          </span>
        </h3>
        <span className="tabular text-muted-foreground text-tiny">
          {column === "done" ? t("doneRange") : hours > 0 ? formatHours(hours, locale) : ""}
        </span>
      </header>
      <CardList column={column} cards={cards} lift={lift} />
    </section>
  );
}

/** Cards of one column (or of one person's lane in it), with the drop marker while a card is lifted. */
function CardList({
  column,
  cards,
  lift,
  lane,
}: {
  column: BoardColumn;
  cards: BoardTask[];
  lift: Lift | null;
  lane?: string | null;
}) {
  const t = useTranslations("board");
  const [expanded, setExpanded] = useState(false);
  const collapsed = column === "done" && !expanded && cards.length > DONE_COLLAPSED;
  const shown = collapsed ? cards.slice(0, DONE_COLLAPSED) : cards;
  const marker = lift && lift.column === column && lift.lane === lane ? lift : null;
  const items: React.ReactNode[] = [];
  const others = shown.filter((c) => c.id !== marker?.id);
  let slot = 0;
  for (const card of shown) {
    if (marker && card.id !== marker.id && slot === marker.index) {
      items.push(<DropMarker key="marker" />);
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
      {column === "done" && cards.length > DONE_COLLAPSED && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="cursor-pointer rounded-md px-1.5 py-1 text-left font-medium text-muted-foreground text-small outline-none hover:bg-hover focus-visible:outline-2 focus-visible:outline-ring"
        >
          {expanded ? t("showLess") : t("showMore", { count: cards.length - DONE_COLLAPSED })}
        </button>
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
            <div className={cn("flex flex-col gap-2 p-1")}>
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
            </div>
            {COLUMN_ORDER.map((column) => (
              <section
                key={column}
                aria-label={`${name ?? t("lanes.unassigned")}: ${t(`columns.${column}`)}`}
                className="flex min-w-0 flex-col gap-2"
              >
                <CardList column={column} cards={cardsOf(column, id)} lift={lift} lane={id} />
              </section>
            ))}
          </div>
        );
      })}
    </div>
  );
}
