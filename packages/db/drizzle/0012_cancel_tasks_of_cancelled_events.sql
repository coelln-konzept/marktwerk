-- Data migration: events that are already "abgesagt" get their open tasks cancelled too (product owner,
-- 2026-11-04). One audit row per event records exactly which tasks were cancelled and their previous status
-- (`cancelledTasks`), so leaving "abgesagt" later reopens them (services/event-lifecycle.ts, reopenTasksOfEvent).
-- actor_id stays NULL: a system entry; ids use gen_random_uuid() (the app's uuidv7 is not in SQL). Open = todo, in_progress, waiting_external, blocked.
WITH cancelled_events AS (
	SELECT "id" FROM "app"."event" WHERE "status" = 'cancelled' AND "archived_at" IS NULL
),
open_tasks AS (
	SELECT t."id", t."event_id", t."status"::text AS "from_status"
	FROM "app"."task" t
	JOIN cancelled_events ce ON ce."id" = t."event_id"
	WHERE t."status" IN ('todo', 'in_progress', 'waiting_external', 'blocked')
),
cancel_them AS (
	UPDATE "app"."task" SET "status" = 'cancelled'
	WHERE "id" IN (SELECT "id" FROM open_tasks)
	RETURNING "id"
)
INSERT INTO "app"."audit_log" ("id", "action", "entity_type", "entity_id", "diff")
SELECT
	gen_random_uuid(),
	'event.status',
	'event',
	ce."id",
	jsonb_build_object(
		'backfill', true,
		'from', 'cancelled',
		'to', 'cancelled',
		'cancelledTasks', COALESCE(
			(SELECT jsonb_agg(jsonb_build_object('id', o."id", 'from', o."from_status") ORDER BY o."id")
			 FROM open_tasks o WHERE o."event_id" = ce."id"),
			'[]'::jsonb
		)
	)
FROM cancelled_events ce;
