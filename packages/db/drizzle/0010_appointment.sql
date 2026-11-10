CREATE TABLE "app"."appointment" (
	"id" uuid PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"on_date" date NOT NULL,
	"starts_at" time,
	"ends_at" time,
	"venue_id" uuid,
	"location_text" text,
	"notes" text,
	"contact_id" uuid,
	"contact_name" text,
	"contact_phone_e164" text,
	"contact_email" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "appointment_end_needs_start" CHECK ("app"."appointment"."ends_at" is null or "app"."appointment"."starts_at" is not null),
	CONSTRAINT "appointment_end_after_start" CHECK ("app"."appointment"."ends_at" is null or "app"."appointment"."ends_at" > "app"."appointment"."starts_at"),
	CONSTRAINT "appointment_one_location" CHECK (not ("app"."appointment"."venue_id" is not null and "app"."appointment"."location_text" is not null))
);
--> statement-breakpoint
ALTER TABLE "app"."appointment" ADD CONSTRAINT "appointment_venue_id_venue_id_fk" FOREIGN KEY ("venue_id") REFERENCES "app"."venue"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."appointment" ADD CONSTRAINT "appointment_contact_id_contact_id_fk" FOREIGN KEY ("contact_id") REFERENCES "app"."contact"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "appointment_on_date_index" ON "app"."appointment" USING btree ("on_date");