-- Ort types Städtisch / Privat only (user test 2, UT2-03, decision D2-4):
-- outdoor_public → municipal; outdoor_private and indoor → private. Template conditions on venue kinds follow.
ALTER TABLE "app"."venue" ALTER COLUMN "kind" SET DATA TYPE text;--> statement-breakpoint
UPDATE "app"."venue" SET "kind" = CASE "kind" WHEN 'outdoor_public' THEN 'municipal' ELSE 'private' END;--> statement-breakpoint
DROP TYPE "app"."venue_kind";--> statement-breakpoint
CREATE TYPE "app"."venue_kind" AS ENUM('municipal', 'private');--> statement-breakpoint
ALTER TABLE "app"."venue" ALTER COLUMN "kind" SET DATA TYPE "app"."venue_kind" USING "kind"::"app"."venue_kind";--> statement-breakpoint
UPDATE "app"."template_item" SET "condition" = jsonb_set(
  "condition",
  '{venueKinds}',
  (
    SELECT coalesce(jsonb_agg(DISTINCT CASE k WHEN 'outdoor_public' THEN 'municipal' WHEN 'municipal' THEN 'municipal' ELSE 'private' END), '[]'::jsonb)
    FROM jsonb_array_elements_text("condition"->'venueKinds') AS k
  )
)
WHERE jsonb_typeof("condition"->'venueKinds') = 'array';
