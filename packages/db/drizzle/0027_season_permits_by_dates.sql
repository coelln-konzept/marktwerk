-- Data migration (Fahrplan SAI8, product owner 2026-11-26): planning the dates creates the season permits; the
-- nightly job `season-permits` is gone. The permits it made for an Ort without any date of that season are archived
-- (like "Entfernen" in the logbook, so they can be restored) and their open "… beantragen" tasks cancelled. Only
-- untouched ones: made by the job (audit `permit.create` with source `season_job`), still `not_started`, no date
-- linked. One audit row per permit records the tasks it cancelled. actor_id stays NULL (a system entry); ids use
-- gen_random_uuid() (the app's uuidv7 is not in SQL). Open = todo, in_progress, waiting_external, blocked.
WITH job_permits AS (
	SELECT p."id", p."title"
	FROM "app"."permit" p
	WHERE p."archived_at" IS NULL
		AND p."status" = 'not_started'
		AND NOT EXISTS (SELECT 1 FROM "app"."event_permit" ep WHERE ep."permit_id" = p."id")
		AND EXISTS (
			SELECT 1 FROM "app"."audit_log" a
			WHERE a."entity_type" = 'permit' AND a."entity_id" = p."id" AND a."action" = 'permit.create'
				AND a."diff" ->> 'source' = 'season_job'
		)
),
archive_them AS (
	UPDATE "app"."permit" SET "archived_at" = now()
	WHERE "id" IN (SELECT "id" FROM job_permits)
	RETURNING "id"
),
open_tasks AS (
	SELECT t."id", t."permit_id", t."status"::text AS "from_status"
	FROM "app"."task" t
	JOIN job_permits jp ON jp."id" = t."permit_id"
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
	'permit.archive',
	'permit',
	jp."id",
	jsonb_build_object(
		'title', jp."title",
		'source', 'sai8_no_dates',
		'cancelledTasks', COALESCE(
			(SELECT jsonb_agg(jsonb_build_object('id', o."id", 'from', o."from_status") ORDER BY o."id")
			 FROM open_tasks o WHERE o."permit_id" = jp."id"),
			'[]'::jsonb
		)
	)
FROM job_permits jp;
