# 0021: Subtasks replace task checklists and task dependencies

**Status:** accepted (2026-11-13, product owner, user test 2: [research 12](../../research/12-user-test-2026-11-13.md) UT2-14, D2-10…D2-14).

## Context
Tasks have three ways of structuring work today:
- **Check items** (`task_check_item`): small steps inside a task, ticked in the task drawer, counted on the card
  ("2/5"), blocking "done" while open; templates create them from "Teilschritte" (`template_item.check_items`).
- **Dependencies** (`task_dependency`, `template_item.depends_on_keys`): created only from templates, validated for
  cycles, but **shown nowhere and used by no logic** ("informational, does not move dates").
- **`task.parent_task_id`**: in the schema since phase 1, never used.

In user test 2 the product owner asked for subtasks as in most task managers: real tasks nested under a task,
nested and un-nested by dragging. Check items can't be assigned or dated; dependencies add complexity nobody sees.

## Decision
- A **subtask is a task** with `parent_task_id` set. **One level only**: a subtask has no subtasks, and a task that
  has subtasks can't become a subtask (service guard, plus a DB check that the parent itself has no parent).
- **Check items and dependencies are removed.** Migration: every `task_check_item` becomes a subtask (title, ticked →
  `done` with its `done_at` / `done_by`); `task_dependency` rows and `template_item.depends_on_keys` are dropped.
- **Templates:** `template_item.parent_key` makes an item a child of another item of the same template version;
  `check_items` migrate to child items. Instantiation and template apply create subtasks; children inherit the
  parent's role and due offset unless they set their own.
- **Visibility:** lists, the Übersicht, the Kalender and reminder jobs work on **top-level tasks**; each carries its
  subtask progress and whether a subtask is overdue (shown on the parent). Assignment notifications go to whoever a
  subtask is assigned to, and a person's own list shows subtasks assigned to them.
- **Done gate:** a parent can't be done while a subtask is open (`missingEvidence` reads subtasks where it read check
  items); after the last subtask is done the UI offers to complete the parent.
- **Deleting** a parent deletes (cancels) its subtasks with it; undo restores both.
- **Nesting UI:** drag a task onto another task to nest it, drag it out to lift it out (dnd-kit, [ADR 0020](0020-board-drag-and-drop.md)),
  with the menu alternative "Unteraufgabe von…" / "Aus Hauptaufgabe lösen" (ADR 0019: every drag has a menu
  alternative). One service path: `setTaskParent(actor, taskId, parentId | null)`, audited `task.parent`.

## Consequences
- Every query that lists or counts tasks needs a top-level filter and subtask aggregates (about 20 queries plus the
  jobs `deadline-sweep`, `daily-digest`, `task-rollover`, `company-notifications`). This is the main cost; it is done
  once, behind shared query helpers, with tests that subtasks are not counted twice.
- Template propagation compares child items by `stable_key` like any item; a removed child cancels its subtask.
- The synthetic dataset and seed produce subtasks instead of check items (research 12 §5).
- One level keeps lists and drop targets simple; deeper nesting would need a new ADR.
