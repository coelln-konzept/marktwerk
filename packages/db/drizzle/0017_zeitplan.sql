-- Zeitplan (ADR 0022, user test 2 UT2-09/10): `event_preset.schedule` and `event.schedule` replace the four fixed
-- times. Every existing `times` / `default_times` becomes rows with the same rules as `scheduleFromTimes` in
-- @marktwerk/core (test/integration/schedule-migration.test.ts runs this function against it). The old columns
-- are dropped in 0018.
ALTER TABLE "app"."event" ADD COLUMN "schedule" jsonb;--> statement-breakpoint
ALTER TABLE "app"."event_preset" ADD COLUMN "schedule" jsonb;--> statement-breakpoint
CREATE FUNCTION "app"."schedule_from_times"(times jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $$
  -- A field that isn't "HH:mm" falls back to the default (06:00 / 08:00 / 16:00 / 18:00); "C" keeps the
  -- comparisons byte-wise like the string comparisons in JavaScript.
  WITH picked AS (
    SELECT
      (CASE WHEN times->>'setup' ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' THEN times->>'setup' ELSE '06:00' END) COLLATE "C" AS setup,
      (CASE WHEN times->>'open' ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' THEN times->>'open' ELSE '08:00' END) COLLATE "C" AS open,
      (CASE WHEN times->>'close' ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' THEN times->>'close' ELSE '16:00' END) COLLATE "C" AS close,
      (CASE WHEN times->>'teardown' ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' THEN times->>'teardown' ELSE '18:00' END) COLLATE "C" AS teardown
  ),
  -- No opening window (open ≥ close): both fall back to 08:00–16:00.
  win AS (
    SELECT
      setup,
      CASE WHEN open < close THEN open ELSE '08:00' END COLLATE "C" AS open,
      CASE WHEN open < close THEN close ELSE '16:00' END COLLATE "C" AS close,
      teardown
    FROM picked
  )
  SELECT
    -- Setup before opening: vendors set up on the first day until opening. A later setup meant "the day
    -- before" (multi-day markets): vendors set up the day before until the end of that day. Equal: no row.
    CASE
      WHEN setup < open THEN jsonb_build_array(jsonb_build_object(
        'audience', 'vendors', 'kind', 'setup', 'day', 'first', 'from', setup, 'to', open))
      WHEN setup > open AND setup < '23:59' THEN jsonb_build_array(jsonb_build_object(
        'audience', 'vendors', 'kind', 'setup', 'day', 'before', 'from', setup, 'to', '23:59'))
      ELSE '[]'::jsonb
    END
    || jsonb_build_array(jsonb_build_object(
      'audience', 'visitors', 'kind', 'open', 'day', 'each', 'from', open, 'to', close))
    || CASE
      WHEN teardown > close THEN jsonb_build_array(jsonb_build_object(
        'audience', 'vendors', 'kind', 'teardown', 'day', 'last', 'from', close, 'to', teardown))
      ELSE '[]'::jsonb
    END
  FROM win
$$;--> statement-breakpoint
UPDATE "app"."event_preset" SET "schedule" = "app"."schedule_from_times"("default_times");--> statement-breakpoint
UPDATE "app"."event" SET "schedule" = "app"."schedule_from_times"("times");--> statement-breakpoint
ALTER TABLE "app"."event" ALTER COLUMN "schedule" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "app"."event_preset" ALTER COLUMN "schedule" SET NOT NULL;--> statement-breakpoint
DROP FUNCTION "app"."schedule_from_times"(jsonb);
