-- ADR 0022: nothing reads the four fixed times any more; the Zeitplan (`schedule`, filled in 0017) replaces them.
ALTER TABLE "app"."event" DROP COLUMN "times";--> statement-breakpoint
ALTER TABLE "app"."event_preset" DROP COLUMN "default_times";