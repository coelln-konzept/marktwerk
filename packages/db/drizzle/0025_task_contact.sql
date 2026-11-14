CREATE TYPE "app"."task_contact_role" AS ENUM('authority', 'landowner');--> statement-breakpoint
ALTER TABLE "app"."task" ADD COLUMN "contact_id" uuid;--> statement-breakpoint
ALTER TABLE "app"."template_item" ADD COLUMN "contact_role" "app"."task_contact_role";--> statement-breakpoint
ALTER TABLE "app"."task" ADD CONSTRAINT "task_contact_id_contact_id_fk" FOREIGN KEY ("contact_id") REFERENCES "app"."contact"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "task_contact_id_index" ON "app"."task" USING btree ("contact_id");