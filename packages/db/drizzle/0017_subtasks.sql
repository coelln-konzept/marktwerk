-- Subtasks replace task checklists and dependencies (ADR 0021, user test 2 UT2-14).
-- Order: (A) generated: new template_item columns · (B) HAND-WRITTEN data migration and the one-level trigger ·
-- (C) generated: drop task_check_item, task_dependency, template_item.check_items / depends_on_keys.
-- When this migration is regenerated, keep (B) between the ADD and the DROP statements: it reads the old columns.

-- (A) generated ---------------------------------------------------------------------------------------------
ALTER TABLE "app"."template_item" ADD COLUMN "parent_key" text;--> statement-breakpoint
ALTER TABLE "app"."template_item" ADD COLUMN "own_due" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "app"."template_item" ADD CONSTRAINT "template_item_parent" FOREIGN KEY ("version_id","parent_key") REFERENCES "app"."template_item"("version_id","stable_key") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "template_item_version_id_parent_key_index" ON "app"."template_item" USING btree ("version_id","parent_key");--> statement-breakpoint
ALTER TABLE "app"."template_item" ADD CONSTRAINT "template_item_not_own_parent" CHECK ("app"."template_item"."parent_key" is null or "app"."template_item"."parent_key" <> "app"."template_item"."stable_key");--> statement-breakpoint

-- (B) HAND-WRITTEN BEGIN ----------------------------------------------------------------------------------
-- B1. Template "Teilschritte" (check_items) become child items of their item, in every version (published ones
-- too: instantiation and propagation read them). Key: <parent key>__teil_<n> (n = 1-based position; generated
-- keys never contain "__", so no clash). The child copies phase, category, priority and the schedule of its
-- parent; own_due = false and duty_role_id = null mean "the parent's" anyway.
INSERT INTO "app"."template_item" (
	"id", "version_id", "stable_key", "sort", "title", "phase", "category", "anchor_key", "offset_days",
	"day_mode", "due_time", "priority", "parent_key", "own_due", "created_at", "updated_at"
)
SELECT
	gen_random_uuid(), ti."version_id", ti."stable_key" || '__teil_' || ci."n", ci."n"::integer,
	left(btrim(ci."title"), 200), ti."phase", ti."category", ti."anchor_key", ti."offset_days", ti."day_mode",
	ti."due_time", ti."priority", ti."stable_key", false, ti."created_at", ti."updated_at"
FROM "app"."template_item" ti
CROSS JOIN LATERAL jsonb_array_elements_text(ti."check_items") WITH ORDINALITY AS ci("title", "n")
WHERE ti."parent_key" IS NULL AND btrim(ci."title") <> '';--> statement-breakpoint

-- B2. Children sit right below their parent: renumber `sort` in the versions that got children.
WITH ordered AS (
	SELECT
		c."id",
		row_number() OVER (
			PARTITION BY c."version_id"
			ORDER BY coalesce(p."sort", c."sort"), coalesce(p."id", c."id"), (c."parent_key" IS NOT NULL), c."sort", c."id"
		) - 1 AS "pos"
	FROM "app"."template_item" c
	LEFT JOIN "app"."template_item" p ON p."version_id" = c."version_id" AND p."stable_key" = c."parent_key"
	WHERE c."version_id" IN (SELECT "version_id" FROM "app"."template_item" WHERE "parent_key" IS NOT NULL)
)
UPDATE "app"."template_item" t SET "sort" = o."pos"
FROM ordered o
WHERE t."id" = o."id" AND t."sort" <> o."pos";--> statement-breakpoint

-- B3. Every task_check_item becomes a subtask of its task: title; ticked → done with done_at / done_by as the
-- completion; unticked → todo, or skipped when the parent is already done or skipped (it was left open then).
-- The subtask takes event, checklist, phase, category, priority, duty role, anchor schedule and due date of the
-- parent, and no assignee. A check item that came from the template (same position and title as in the
-- parent's template item) is linked to the child item from B1, so template propagation matches it by key.
WITH items AS (
	SELECT
		ci.*,
		row_number() OVER (PARTITION BY ci."task_id", ci."sort" ORDER BY ci."created_at", ci."id") AS "dup"
	FROM "app"."task_check_item" ci
)
INSERT INTO "app"."task" (
	"id", "event_id", "checklist_id", "template_item_id", "template_stable_key", "parent_task_id", "source",
	"title", "phase", "category", "priority", "duty_role_id", "anchor_key", "offset_days", "day_mode", "due_at",
	"due_overridden", "status", "skipped_reason", "completed_at", "completed_by_staff_member_id", "board_sort",
	"created_at", "updated_at"
)
SELECT
	gen_random_uuid(), p."event_id", p."checklist_id", child."id", child."stable_key", p."id",
	(CASE WHEN child."id" IS NULL THEN 'manual' ELSE 'template' END)::"app"."task_source",
	i."title", p."phase", p."category", p."priority", p."duty_role_id", p."anchor_key", p."offset_days",
	p."day_mode", p."due_at", p."due_overridden",
	(CASE
		WHEN i."done" THEN 'done'
		WHEN p."status" IN ('done', 'skipped') THEN 'skipped'
		ELSE 'todo'
	END)::"app"."task_status",
	CASE WHEN NOT i."done" AND p."status" IN ('done', 'skipped') THEN 'Offen, als die Hauptaufgabe abgeschlossen wurde' END,
	i."done_at", i."done_by_staff_member_id", i."sort", i."created_at", i."updated_at"
FROM items i
JOIN "app"."task" p ON p."id" = i."task_id"
LEFT JOIN "app"."template_item" pi ON pi."id" = p."template_item_id"
LEFT JOIN "app"."template_item" child
	ON i."dup" = 1
	AND p."checklist_id" IS NOT NULL
	AND child."version_id" = pi."version_id"
	AND child."parent_key" = pi."stable_key"
	AND child."stable_key" = pi."stable_key" || '__teil_' || (i."sort" + 1)
	AND child."title" = left(btrim(i."title"), 200);--> statement-breakpoint

-- B4. One level of subtasks (ADR 0021): a subtask's parent is no subtask itself, and a task that has subtasks
-- does not become one. The services check this first (`nestingProblem`); the trigger is the last line.
CREATE FUNCTION "app"."task_one_level_subtasks"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	IF NEW."parent_task_id" IS NULL THEN
		RETURN NEW;
	END IF;
	IF EXISTS (SELECT 1 FROM "app"."task" WHERE "id" = NEW."parent_task_id" AND "parent_task_id" IS NOT NULL) THEN
		RAISE EXCEPTION 'task % cannot be a subtask of the subtask %', NEW."id", NEW."parent_task_id"
			USING ERRCODE = 'check_violation', CONSTRAINT = 'task_one_level_subtasks';
	END IF;
	IF EXISTS (SELECT 1 FROM "app"."task" WHERE "parent_task_id" = NEW."id") THEN
		RAISE EXCEPTION 'task % has subtasks and cannot become a subtask', NEW."id"
			USING ERRCODE = 'check_violation', CONSTRAINT = 'task_one_level_subtasks';
	END IF;
	RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "task_one_level_subtasks"
	BEFORE INSERT OR UPDATE OF "parent_task_id" ON "app"."task"
	FOR EACH ROW EXECUTE FUNCTION "app"."task_one_level_subtasks"();--> statement-breakpoint
-- (B) HAND-WRITTEN END ------------------------------------------------------------------------------------

-- (C) generated ---------------------------------------------------------------------------------------------
DROP TABLE "app"."task_check_item" CASCADE;--> statement-breakpoint
DROP TABLE "app"."task_dependency" CASCADE;--> statement-breakpoint
ALTER TABLE "app"."template_item" DROP COLUMN "check_items";--> statement-breakpoint
ALTER TABLE "app"."template_item" DROP COLUMN "depends_on_keys";
