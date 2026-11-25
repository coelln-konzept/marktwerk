CREATE TABLE "app"."next_time_note" (
	"id" uuid PRIMARY KEY NOT NULL,
	"preset_id" uuid NOT NULL,
	"event_id" uuid,
	"task_id" uuid,
	"body" text NOT NULL,
	"created_by_id" text,
	"done_at" timestamp with time zone,
	"done_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "next_time_note_body" CHECK (char_length("app"."next_time_note"."body") between 1 and 500)
);
--> statement-breakpoint
ALTER TABLE "app"."next_time_note" ADD CONSTRAINT "next_time_note_preset_id_event_preset_id_fk" FOREIGN KEY ("preset_id") REFERENCES "app"."event_preset"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."next_time_note" ADD CONSTRAINT "next_time_note_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "app"."event"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."next_time_note" ADD CONSTRAINT "next_time_note_task_id_task_id_fk" FOREIGN KEY ("task_id") REFERENCES "app"."task"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."next_time_note" ADD CONSTRAINT "next_time_note_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "app"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."next_time_note" ADD CONSTRAINT "next_time_note_done_by_id_user_id_fk" FOREIGN KEY ("done_by_id") REFERENCES "app"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "next_time_note_preset_id_done_at_index" ON "app"."next_time_note" USING btree ("preset_id","done_at");--> statement-breakpoint
CREATE INDEX "next_time_note_event_id_index" ON "app"."next_time_note" USING btree ("event_id");