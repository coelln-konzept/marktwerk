DROP TABLE "app"."task_check_item" CASCADE;--> statement-breakpoint
DROP TABLE "app"."task_dependency" CASCADE;--> statement-breakpoint
ALTER TABLE "app"."template_item" DROP COLUMN "check_items";--> statement-breakpoint
ALTER TABLE "app"."template_item" DROP COLUMN "depends_on_keys";