import type { BoardColumn } from "./board";

/*
 * Drag and drop on the kanban board (ADR 0020), pure part: what does dropping a card here mean?
 * The UI layer (dnd-kit) only reports *where* the pointer is; this turns it into the same two
 * operations the "⋯" menu uses: `moveCard(column, {after})` and `assignCard(staffMember)`.
 */

/** The dragged card. */
export type DropCard = { id: string; column: BoardColumn; assigneeId: string | null };

/**
 * What the pointer is over. `lane` is the swimlane's assignee (null = unassigned lane); `undefined`
 * means the board has no lanes ("Spalten" view).
 */
export type DropTarget =
  /** Another card; `half` = whether the pointer is in its upper ("before") or lower ("after") half. */
  | {
      kind: "card";
      id: string;
      column: BoardColumn;
      lane?: string | null;
      half: "before" | "after";
    }
  /** The free space of a column (or of a column inside a lane): the card goes to the end of the list. */
  | { kind: "cell"; column: BoardColumn; lane?: string | null }
  /** The name block of a swimlane: assigns without changing the column. */
  | { kind: "lane"; lane: string | null }
  /** A person in the people rail (null = the "Nicht zugewiesen" row). */
  | { kind: "person"; id: string | null };

/** Where the drop marker is drawn. */
export type DropIndicator =
  | { kind: "card"; id: string; edge: "before" | "after" }
  | { kind: "cell"; column: BoardColumn; lane?: string | null }
  | { kind: "lane"; lane: string | null }
  | { kind: "person"; id: string | null };

export type DropPlan = {
  /** Move to `column`, after the card `afterId` (null = top). Null: the card stays where it is. */
  move: { column: BoardColumn; afterId: string | null } | null;
  /** Assign to this staff member (null = unassign). Null: the assignee stays. */
  assign: { assigneeId: string | null } | null;
  indicator: DropIndicator;
  /** Where the card ends up in the target list, for the screen reader (1-based). */
  position: { column: BoardColumn; index: number; total: number };
};

export type PlanInput = {
  card: DropCard;
  target: DropTarget;
  /** Ids of the cards shown in a column (of a lane), in display order, including the dragged card. */
  cards: (column: BoardColumn, lane?: string | null) => string[];
  /** The role may assign (`task:assign`); without it nothing moves between lanes or onto people. */
  canAssign: boolean;
};

/**
 * Turns a hover target into what a drop would do, or `null` when dropping here changes nothing or is
 * not allowed (drop onto the card itself, same place, no `task:assign`, reordering inside "Erledigt").
 */
export function planDrop({ card, target, cards, canAssign }: PlanInput): DropPlan | null {
  if (target.kind === "lane" || target.kind === "person") {
    const assigneeId = target.kind === "lane" ? target.lane : target.id;
    if (!canAssign || assigneeId === card.assigneeId) return null;
    const column = card.column;
    const list = cards(column, undefined);
    return {
      move: null,
      assign: { assigneeId },
      indicator: target,
      position: { column, index: list.indexOf(card.id) + 1, total: list.length },
    };
  }

  if (target.kind === "card" && target.id === card.id) return null;
  const { column, lane } = target;
  const others = cards(column, lane).filter((id) => id !== card.id);

  let afterId: string | null;
  let indicator: DropIndicator;
  if (target.kind === "card") {
    const at = others.indexOf(target.id);
    if (at < 0) return null;
    afterId = target.half === "after" ? target.id : (others[at - 1] ?? null);
    indicator = { kind: "card", id: target.id, edge: target.half };
  } else {
    afterId = others.at(-1) ?? null;
    indicator =
      afterId === null
        ? { kind: "cell", column, lane }
        : { kind: "card", id: afterId, edge: "after" };
  }

  const laneChanges = lane !== undefined && lane !== card.assigneeId;
  if (laneChanges && !canAssign) return null;

  const home = cards(card.column, lane === undefined ? undefined : card.assigneeId);
  const before = home[home.indexOf(card.id) - 1] ?? null;
  const unchanged = column === card.column && !laneChanges && before === afterId;
  // Finished cards keep their order; moving within "Erledigt" is not a thing.
  const staysDone = column === "done" && card.column === "done";
  const move = unchanged || staysDone ? null : { column, afterId };
  const assign = laneChanges ? { assigneeId: lane as string | null } : null;
  if (!move && !assign) return null;

  const index = afterId === null ? 1 : others.indexOf(afterId) + 2;
  return { move, assign, indicator, position: { column, index, total: others.length + 1 } };
}
