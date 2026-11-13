-- Marktregeln per market (UT2-12, decision D2-3): every preset gets its own copy of its event type's rules.
-- Added nullable, filled from the type, then made NOT NULL (the generated single statement fails on existing rows).
ALTER TABLE "app"."event_preset" ADD COLUMN "rules" jsonb;--> statement-breakpoint
UPDATE "app"."event_preset" p SET "rules" = t."rules" FROM "app"."event_type" t WHERE t."id" = p."event_type_id";--> statement-breakpoint
ALTER TABLE "app"."event_preset" ALTER COLUMN "rules" SET NOT NULL;
