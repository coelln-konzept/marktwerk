# 0020: Drag and drop on the board with dnd-kit

**Status:** accepted (2026-10-21, product owner, session 3). Builds on [ADR 0019](0019-classic-screens.md) ("every drag has a
menu/keyboard alternative"); resolves open question 17 of the handoff.

## Context
The M2 board moves cards through the "⋯" menu (*Verschieben nach…*, *Zuweisen an…*) and a keyboard mode on the grip
(Space lifts, arrows move, Space drops, Esc cancels, German `aria-live` announcements). Every move already ends in one
path: `moveCard` → `moveTask(actor, id, column, {index}|{after}, scope)`, assignments in `assignCard` → `assignTask`.
What was missing is direct manipulation: dragging a card into another column, within a column, onto a person's swimlane
or onto a person in the people rail (UX concept: "drop a card on a person → *Zugewiesen an Lars* [Rückgängig]").

Requirements for any drag library:
- **WCAG 2.2 · SC 2.5.7 Dragging Movements (AA):** every drag needs a single-pointer, non-drag alternative. The "⋯" menu
  provides it and stays; the library must not replace it.
- **Keyboard and screen reader are a hard requirement** (component inventory, UX concept §6): lifting, moving and dropping
  with the keyboard, spoken positions and targets in German, cancel with Esc.
- **Touch:** the office also uses tablets; scrolling the board with a finger must keep working.
- React 19 / Next.js 16 (client components only), small bundle, no change to the server path.
- Our drops are not a plain sortable list: a drop can mean *move*, *assign*, or both (another swimlane in another column),
  and the people rail is a drop target outside the columns.

## Decision
Use **dnd-kit** (`@dnd-kit/core` 6.3.1, exact version, in `apps/web` only).

1. **dnd-kit supplies the drag mechanics only:** `MouseSensor` (activation distance 6 px, so a click on the title, the
   tick-off button or the "⋯" menu is still a click), `TouchSensor` (press-and-hold 250 ms, so a finger can still scroll),
   `DragOverlay`, drop zones (`useDroppable`: a cell per column and lane, the name block of a swimlane, each person in the
   people rail), pointer-based collision (`pointerWithin`), and the accessibility layer (`announcements`,
   `screenReaderInstructions`, `roleDescription`) in German via `board.json`.
2. **What a drop means is ours and pure:** `planDrop()` in `packages/core/src/tasks/board-drop.ts` (unit-tested) turns "pointer
   is over X" into *move* (`column`, `afterId`) and/or *assign* (`assigneeId`) plus the drop marker and the spoken position. The UI
   then calls the existing `useTaskActions` (`move`, `assign`, and `moveAndAssign` for the combined drop). Same optimistic update, same
   undo toast, same service path, same audit entries as the menu. **No server change.**
3. **Keyboard: the existing index-based mode stays; dnd-kit's `KeyboardSensor` is not registered.** The hand-made mode is
   already identical to what the requirements describe (Space/Enter lifts, arrows change column and position, Space drops, Esc
   cancels, lane-aware, German announcements with "Position n von m") and is deterministic: it moves by list index. dnd-kit's
   `KeyboardSensor` with `sortableKeyboardCoordinates` moves by on-screen geometry, which in a board with collapsed lists, empty
   columns and swimlanes behaves less predictably, would add `@dnd-kit/sortable` and a second code path, and would lose the
   lane rule (arrows stay inside the person's lane). Replacing it would be more code for the same behaviour. The grip carries
   dnd-kit's `aria-roledescription` and `aria-describedby` (German instructions) so a screen-reader user hears how to use it.
   If the keyboard mode is ever replaced, dnd-kit's sensor can be added without touching the rest.
4. **Only `@dnd-kit/core` is added.** `@dnd-kit/sortable` (needed for `KeyboardSensor` coordinates and sibling displacement
   animation) and `@dnd-kit/utilities` are not used; the drop marker is a bar in the gap next to a card, so nothing shifts while
   dragging. Both can be added later.
5. **Scope:** columns view and "Nach Person" swimlanes (event Board tab and `/board`). The grouped view (by event/day) stays
   menu-only (cards there are not in columns). Without `task:write` there is no drag at all; without `task:assign` the
   people rail and other lanes are not drop targets, moving within the person's own lane still works as the service allows.
6. **Motion:** the drop animation of the overlay is switched off under `prefers-reduced-motion`; the global reduced-motion rule
   already neutralises transitions. Drop markers use design tokens (`primary`, `status-info-bg`).

## Alternatives considered
| Option | Why not |
|---|---|
| **Pragmatic drag and drop** (Atlassian) | Framework-agnostic, tiny core, native HTML5 drag; but no built-in keyboard or screen-reader support (Atlassian ships that as separate patterns we would have to build) and native drag has weak touch behaviour. Strong on performance, weaker on our hard requirement. |
| **react-aria `useDrag`/`useDrop`** | Best-in-class accessibility, keyboard drag and screen-reader messages built in; but it would pull a second component foundation next to Base UI, its collection-based drop model fits lists and grids rather than a board with lanes and a rail, and the drop targets we need (person in the rail) are not collection items. Possible later if we adopt React Aria widely. |
| **Native HTML5 drag and drop** | No touch support, no keyboard, no announcements, ghost image can't be styled; we would rebuild everything dnd-kit gives us. |
| **`@dnd-kit/react` (new rewrite)** | Pre-1.0 (0.x) at the time of writing; the API still moves. Revisit when it is stable. |
| **Menu and keyboard only** | Meets 2.5.7, but office staff expect to drag cards; the concept explicitly lists "drop a card on a person". |

## Consequences
- **Pro:** direct manipulation on mouse and touch with no server or schema change; one place (`planDrop`) holds the rules and is
  unit-tested; keyboard, menu and pointer share the same action path, undo toast and audit entries; German announcements for
  pointer/touch drags.
- **Pro:** React 19 works (peer dependencies `react >=16.8`); a fixed `DndContext id` avoids the SSR/hydration id mismatch.
- **Con:** `@dnd-kit/core` 6.3.1 was released in December 2024. The classic packages are stable and widely used, but the
  maintainers' active work is on `@dnd-kit/react`. We depend on a feature-complete, not actively evolving package; a migration is
  contained (`board-dnd.tsx` is the only file that imports it).
- **Con:** two input paths on the grip (pointer via dnd-kit, keyboard via our own handler). The hand-made keyboard code stays
  ours to maintain.
- A drop that both moves and assigns makes two server calls (move, then assign) inside one transition and one toast whose
  *Rückgängig* reverts both; if the second call fails the first stays and an error message is shown.
- Pointer drags are covered by unit tests of `planDrop` and by the click-through; the e2e smoke covers the keyboard drag only
  (browser pointer simulation of dnd-kit is flaky in CI).
