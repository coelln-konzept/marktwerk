ALTER TABLE "app"."event_preset" ADD COLUMN "color" text;--> statement-breakpoint
ALTER TABLE "app"."task" ADD COLUMN "is_key" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "app"."checklist_template" ADD COLUMN "is_master" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "app"."checklist_template" ADD COLUMN "owner_preset_id" uuid;--> statement-breakpoint
ALTER TABLE "app"."template_item" ADD COLUMN "is_key" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "app"."checklist_template" ADD CONSTRAINT "checklist_template_owner_preset_id_event_preset_id_fk" FOREIGN KEY ("owner_preset_id") REFERENCES "app"."event_preset"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "checklist_template_owner_preset_id_index" ON "app"."checklist_template" USING btree ("owner_preset_id");--> statement-breakpoint
CREATE UNIQUE INDEX "checklist_template_one_master" ON "app"."checklist_template" USING btree ("is_master") WHERE "app"."checklist_template"."is_master";