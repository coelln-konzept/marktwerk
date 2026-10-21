import { describe, expect, it } from "vitest";
import type { BoardColumn } from "./board";
import { type DropCard, type DropTarget, planDrop } from "./board-drop";

/** A board: card ids per column in display order, and who each card is assigned to. */
const columns: Record<BoardColumn, string[]> = {
  preparation: ["a", "b", "c"],
  this_week: ["d"],
  today: [],
  done: ["x", "y"],
};
const assignee: Record<string, string | null> = { a: "lars", b: "lars", c: null, d: "mia" };
const cards = (column: BoardColumn, lane?: string | null) =>
  columns[column].filter((id) => lane === undefined || (assignee[id] ?? null) === lane);

const card = (id: string, column: BoardColumn): DropCard => ({
  id,
  column,
  assigneeId: assignee[id] ?? null,
});
const plan = (c: DropCard, target: DropTarget, canAssign = true) =>
  planDrop({ card: c, target, cards, canAssign });

describe("planDrop in the column view", () => {
  it("drops after a card when the pointer is in its lower half", () => {
    const p = plan(card("a", "preparation"), {
      kind: "card",
      id: "c",
      column: "preparation",
      half: "after",
    });
    expect(p?.move).toEqual({ column: "preparation", afterId: "c" });
    expect(p?.assign).toBeNull();
    expect(p?.indicator).toEqual({ kind: "card", id: "c", edge: "after" });
    expect(p?.position).toEqual({ column: "preparation", index: 3, total: 3 });
  });

  it("drops before a card: after its predecessor, or at the top", () => {
    const upper = plan(card("c", "preparation"), {
      kind: "card",
      id: "b",
      column: "preparation",
      half: "before",
    });
    expect(upper?.move).toEqual({ column: "preparation", afterId: "a" });
    const top = plan(card("c", "preparation"), {
      kind: "card",
      id: "a",
      column: "preparation",
      half: "before",
    });
    expect(top?.move).toEqual({ column: "preparation", afterId: null });
    expect(top?.position.index).toBe(1);
  });

  it("does nothing when the card would stay where it is", () => {
    const over = (id: string, half: "before" | "after"): DropTarget => ({
      kind: "card",
      id,
      column: "preparation",
      half,
    });
    expect(plan(card("b", "preparation"), over("b", "after"))).toBeNull();
    // “after a” and “before c” are both where b already is
    expect(plan(card("b", "preparation"), over("a", "after"))).toBeNull();
    expect(plan(card("b", "preparation"), over("c", "before"))).toBeNull();
  });

  it("moves into another column: end of the list, top of the list, empty column", () => {
    const end = plan(card("a", "preparation"), { kind: "cell", column: "this_week" });
    expect(end?.move).toEqual({ column: "this_week", afterId: "d" });
    expect(end?.indicator).toEqual({ kind: "card", id: "d", edge: "after" });

    const top = plan(card("a", "preparation"), {
      kind: "card",
      id: "d",
      column: "this_week",
      half: "before",
    });
    expect(top?.move).toEqual({ column: "this_week", afterId: null });
    expect(top?.indicator).toEqual({ kind: "card", id: "d", edge: "before" });

    const empty = plan(card("a", "preparation"), { kind: "cell", column: "today" });
    expect(empty?.move).toEqual({ column: "today", afterId: null });
    expect(empty?.indicator).toEqual({ kind: "cell", column: "today", lane: undefined });
    expect(empty?.position).toEqual({ column: "today", index: 1, total: 1 });
  });

  it("dropping on the free space of the own column appends, unless the card is already last", () => {
    const own: DropTarget = { kind: "cell", column: "preparation" };
    expect(plan(card("a", "preparation"), own)?.move).toEqual({
      column: "preparation",
      afterId: "c",
    });
    expect(plan(card("c", "preparation"), own)).toBeNull();
  });

  it("does not reorder inside Erledigt but lets a card in", () => {
    expect(
      plan(card("x", "done"), { kind: "card", id: "y", column: "done", half: "after" }),
    ).toBeNull();
    expect(plan(card("a", "preparation"), { kind: "cell", column: "done" })?.move).toEqual({
      column: "done",
      afterId: "y",
    });
  });

  it("ignores a hovered card that is not in the list", () => {
    expect(
      plan(card("a", "preparation"), {
        kind: "card",
        id: "zzz",
        column: "this_week",
        half: "after",
      }),
    ).toBeNull();
  });
});

describe("planDrop in swimlanes and on the people rail", () => {
  it("moving inside the own lane only moves", () => {
    const p = plan(card("a", "preparation"), {
      kind: "card",
      id: "b",
      column: "preparation",
      lane: "lars",
      half: "after",
    });
    expect(p?.move).toEqual({ column: "preparation", afterId: "b" });
    expect(p?.assign).toBeNull();
  });

  it("another lane in the same column assigns and places the card", () => {
    const p = plan(card("a", "preparation"), {
      kind: "cell",
      column: "preparation",
      lane: null,
    });
    expect(p?.assign).toEqual({ assigneeId: null });
    expect(p?.move).toEqual({ column: "preparation", afterId: "c" });
  });

  it("another lane and another column assigns and moves in one drop", () => {
    const p = plan(card("a", "preparation"), {
      kind: "cell",
      column: "this_week",
      lane: "mia",
    });
    expect(p?.assign).toEqual({ assigneeId: "mia" });
    expect(p?.move).toEqual({ column: "this_week", afterId: "d" });
  });

  it("a lane change inside Erledigt only assigns", () => {
    const p = plan(card("x", "done"), { kind: "cell", column: "done", lane: "mia" });
    expect(p?.move).toBeNull();
    expect(p?.assign).toEqual({ assigneeId: "mia" });
  });

  it("the lane name block assigns without moving", () => {
    const p = plan(card("a", "preparation"), { kind: "lane", lane: "mia" });
    expect(p?.move).toBeNull();
    expect(p?.assign).toEqual({ assigneeId: "mia" });
    expect(p?.indicator).toEqual({ kind: "lane", lane: "mia" });
    expect(plan(card("a", "preparation"), { kind: "lane", lane: "lars" })).toBeNull();
  });

  it("a person in the rail assigns; the unassigned row unassigns; the current assignee is a no-op", () => {
    expect(plan(card("a", "preparation"), { kind: "person", id: "mia" })?.assign).toEqual({
      assigneeId: "mia",
    });
    expect(plan(card("a", "preparation"), { kind: "person", id: null })?.assign).toEqual({
      assigneeId: null,
    });
    expect(plan(card("a", "preparation"), { kind: "person", id: "lars" })).toBeNull();
  });

  it("without task:assign nothing changes the assignee", () => {
    expect(plan(card("a", "preparation"), { kind: "person", id: "mia" }, false)).toBeNull();
    expect(plan(card("a", "preparation"), { kind: "lane", lane: "mia" }, false)).toBeNull();
    expect(
      plan(card("a", "preparation"), { kind: "cell", column: "this_week", lane: "mia" }, false),
    ).toBeNull();
    // moving inside the own lane still works
    expect(
      plan(
        card("a", "preparation"),
        { kind: "card", id: "b", column: "preparation", lane: "lars", half: "after" },
        false,
      )?.move,
    ).toEqual({ column: "preparation", afterId: "b" });
  });
});
