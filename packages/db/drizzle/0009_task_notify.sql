CREATE TYPE "app"."task_notify_timing" AS ENUM('on_create', 'due_day', 'before_1d', 'before_3d', 'before_7d', 'custom');--> statement-breakpoint
ALTER TABLE "app"."task" ADD COLUMN "notify_channels" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "app"."task" ADD COLUMN "notify_timing" "app"."task_notify_timing";--> statement-breakpoint
ALTER TABLE "app"."task" ADD COLUMN "notify_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "app"."task" ADD CONSTRAINT "task_notify_channels" CHECK ("app"."task"."notify_channels" <@ array['email','whatsapp']::text[]);--> statement-breakpoint
ALTER TABLE "app"."task" ADD CONSTRAINT "task_notify_custom" CHECK (coalesce("app"."task"."notify_timing" = 'custom', false) = ("app"."task"."notify_at" is not null));--> statement-breakpoint
ALTER TABLE "app"."task" ADD CONSTRAINT "task_notify_empty" CHECK (cardinality("app"."task"."notify_channels") > 0 or "app"."task"."notify_timing" is null);