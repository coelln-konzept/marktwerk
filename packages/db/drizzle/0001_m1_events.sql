CREATE TYPE "app"."contact_kind" AS ENUM('authority', 'landowner', 'supplier', 'service', 'other');--> statement-breakpoint
CREATE TYPE "app"."venue_kind" AS ENUM('outdoor_public', 'outdoor_private', 'indoor');--> statement-breakpoint
CREATE TYPE "app"."event_status" AS ENUM('draft', 'planned', 'confirmed', 'live', 'completed', 'closed', 'cancelled');--> statement-breakpoint
CREATE TYPE "app"."density_preference" AS ENUM('standard', 'compact');--> statement-breakpoint
CREATE TYPE "app"."theme_preference" AS ENUM('system', 'light', 'dark');--> statement-breakpoint
CREATE TYPE "app"."vendor_kind" AS ENUM('private', 'commercial');--> statement-breakpoint
CREATE TABLE "app"."contact" (
	"id" uuid PRIMARY KEY NOT NULL,
	"kind" "app"."contact_kind" NOT NULL,
	"name" text NOT NULL,
	"contact_person" text,
	"email" text,
	"phone_e164" text,
	"street" text,
	"postal_code" text,
	"city" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "app"."event_type" (
	"id" uuid PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"name_de" text NOT NULL,
	"name_en" text NOT NULL,
	"rules" jsonb NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "event_type_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "app"."location_agreement" (
	"id" uuid PRIMARY KEY NOT NULL,
	"venue_id" uuid NOT NULL,
	"counterparty_contact_id" uuid,
	"valid_from" date NOT NULL,
	"valid_until" date NOT NULL,
	"fixed_dates" date[] DEFAULT '{}' NOT NULL,
	"terms" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "app"."venue" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"kind" "app"."venue_kind" NOT NULL,
	"street" text,
	"postal_code" text,
	"city" text NOT NULL,
	"bundesland" text DEFAULT 'NW' NOT NULL,
	"lat" double precision,
	"lng" double precision,
	"capacity_cm" integer,
	"access_info" text,
	"landowner_contact_id" uuid,
	"custom_fields" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "app"."row" (
	"id" uuid PRIMARY KEY NOT NULL,
	"zone_id" uuid NOT NULL,
	"label" text NOT NULL,
	"length_cm" integer NOT NULL,
	"depth_cm" integer NOT NULL,
	"car_allowed" boolean DEFAULT false NOT NULL,
	"car_slots" integer DEFAULT 0 NOT NULL,
	"power" boolean DEFAULT false NOT NULL,
	"water" boolean DEFAULT false NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."zone" (
	"id" uuid PRIMARY KEY NOT NULL,
	"venue_id" uuid NOT NULL,
	"name" text NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."event" (
	"id" uuid PRIMARY KEY NOT NULL,
	"preset_id" uuid,
	"location_agreement_id" uuid,
	"event_type_id" uuid NOT NULL,
	"venue_id" uuid NOT NULL,
	"name" text NOT NULL,
	"season" integer NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	"times" jsonb NOT NULL,
	"status" "app"."event_status" DEFAULT 'draft' NOT NULL,
	"booking_open" boolean DEFAULT false NOT NULL,
	"fully_booked" boolean DEFAULT false NOT NULL,
	"car_spaces_full" boolean DEFAULT false NOT NULL,
	"price_per_m_cents" integer NOT NULL,
	"booking_fee_cents" integer NOT NULL,
	"target_revenue_cents" integer,
	"health_override" text,
	"health_override_reason" text,
	"custom_fields" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"notes" text,
	"cancelled_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "event_dates" CHECK ("app"."event"."ends_on" >= "app"."event"."starts_on")
);
--> statement-breakpoint
CREATE TABLE "app"."event_anchor" (
	"id" uuid PRIMARY KEY NOT NULL,
	"event_id" uuid NOT NULL,
	"key" text NOT NULL,
	"date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_anchor_eventId_key_unique" UNIQUE("event_id","key")
);
--> statement-breakpoint
CREATE TABLE "app"."event_duty" (
	"event_id" uuid NOT NULL,
	"duty_role_id" uuid NOT NULL,
	"staff_member_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_duty_event_id_duty_role_id_pk" PRIMARY KEY("event_id","duty_role_id")
);
--> statement-breakpoint
CREATE TABLE "app"."event_preset" (
	"id" uuid PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"event_type_id" uuid NOT NULL,
	"venue_id" uuid NOT NULL,
	"name" text NOT NULL,
	"public_title" text,
	"public_text" text,
	"price_per_m_cents" integer NOT NULL,
	"booking_fee_cents" integer NOT NULL,
	"default_times" jsonb NOT NULL,
	"rrule" text,
	"duration_days" integer DEFAULT 1 NOT NULL,
	"default_duties" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "event_preset_key_unique" UNIQUE("key"),
	CONSTRAINT "event_preset_duration" CHECK ("app"."event_preset"."duration_days" between 1 and 14)
);
--> statement-breakpoint
CREATE TABLE "app"."legal_parameter" (
	"id" uuid PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"value" integer NOT NULL,
	"valid_from" date NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "legal_parameter_key_validFrom_unique" UNIQUE("key","valid_from")
);
--> statement-breakpoint
CREATE TABLE "app"."duty_role" (
	"id" uuid PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"name_de" text NOT NULL,
	"name_en" text NOT NULL,
	"default_staff_member_id" uuid,
	"sort" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "duty_role_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "app"."staff_member" (
	"id" uuid PRIMARY KEY NOT NULL,
	"display_name" text NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"phone_e164" text,
	"email" text,
	"user_id" text,
	"preferred_duty_role_ids" uuid[] DEFAULT '{}' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "staff_member_userId_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "app"."user_preference" (
	"user_id" text PRIMARY KEY NOT NULL,
	"theme" "app"."theme_preference" DEFAULT 'light' NOT NULL,
	"density" "app"."density_preference" DEFAULT 'standard' NOT NULL,
	"sidebar_collapsed" boolean DEFAULT false NOT NULL,
	"saved_views" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."vendor" (
	"id" uuid PRIMARY KEY NOT NULL,
	"legacy_id" integer,
	"kind" "app"."vendor_kind" NOT NULL,
	"display_name" text NOT NULL,
	"first_name" text,
	"last_name" text,
	"company_name" text,
	"email" text,
	"phone_e164" text,
	"street" text,
	"postal_code" text,
	"city" text,
	"categories" text[] DEFAULT '{}' NOT NULL,
	"is_regular" boolean DEFAULT false NOT NULL,
	"regular_spot" text,
	"default_length_cm" integer,
	"has_car" boolean DEFAULT false NOT NULL,
	"car_length_cm" integer,
	"newsletter_consent" text,
	"notes" text,
	"created_on" date,
	"imported_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vendor_legacyId_unique" UNIQUE("legacy_id")
);
--> statement-breakpoint
ALTER TABLE "app"."settings" ADD COLUMN "bundesland" text DEFAULT 'NW' NOT NULL;--> statement-breakpoint
ALTER TABLE "app"."location_agreement" ADD CONSTRAINT "location_agreement_venue_id_venue_id_fk" FOREIGN KEY ("venue_id") REFERENCES "app"."venue"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."location_agreement" ADD CONSTRAINT "location_agreement_counterparty_contact_id_contact_id_fk" FOREIGN KEY ("counterparty_contact_id") REFERENCES "app"."contact"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."venue" ADD CONSTRAINT "venue_landowner_contact_id_contact_id_fk" FOREIGN KEY ("landowner_contact_id") REFERENCES "app"."contact"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."row" ADD CONSTRAINT "row_zone_id_zone_id_fk" FOREIGN KEY ("zone_id") REFERENCES "app"."zone"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."zone" ADD CONSTRAINT "zone_venue_id_venue_id_fk" FOREIGN KEY ("venue_id") REFERENCES "app"."venue"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."event" ADD CONSTRAINT "event_preset_id_event_preset_id_fk" FOREIGN KEY ("preset_id") REFERENCES "app"."event_preset"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."event" ADD CONSTRAINT "event_location_agreement_id_location_agreement_id_fk" FOREIGN KEY ("location_agreement_id") REFERENCES "app"."location_agreement"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."event" ADD CONSTRAINT "event_event_type_id_event_type_id_fk" FOREIGN KEY ("event_type_id") REFERENCES "app"."event_type"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."event" ADD CONSTRAINT "event_venue_id_venue_id_fk" FOREIGN KEY ("venue_id") REFERENCES "app"."venue"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."event_anchor" ADD CONSTRAINT "event_anchor_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "app"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."event_duty" ADD CONSTRAINT "event_duty_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "app"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."event_duty" ADD CONSTRAINT "event_duty_duty_role_id_duty_role_id_fk" FOREIGN KEY ("duty_role_id") REFERENCES "app"."duty_role"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."event_duty" ADD CONSTRAINT "event_duty_staff_member_id_staff_member_id_fk" FOREIGN KEY ("staff_member_id") REFERENCES "app"."staff_member"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."event_preset" ADD CONSTRAINT "event_preset_event_type_id_event_type_id_fk" FOREIGN KEY ("event_type_id") REFERENCES "app"."event_type"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."event_preset" ADD CONSTRAINT "event_preset_venue_id_venue_id_fk" FOREIGN KEY ("venue_id") REFERENCES "app"."venue"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."duty_role" ADD CONSTRAINT "duty_role_default_staff_member_id_staff_member_id_fk" FOREIGN KEY ("default_staff_member_id") REFERENCES "app"."staff_member"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."staff_member" ADD CONSTRAINT "staff_member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "app"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."user_preference" ADD CONSTRAINT "user_preference_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "app"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contact_kind_index" ON "app"."contact" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "location_agreement_venue_id_index" ON "app"."location_agreement" USING btree ("venue_id");--> statement-breakpoint
CREATE INDEX "row_zone_id_index" ON "app"."row" USING btree ("zone_id");--> statement-breakpoint
CREATE INDEX "zone_venue_id_index" ON "app"."zone" USING btree ("venue_id");--> statement-breakpoint
CREATE INDEX "event_starts_on_index" ON "app"."event" USING btree ("starts_on");--> statement-breakpoint
CREATE INDEX "event_venue_id_starts_on_index" ON "app"."event" USING btree ("venue_id","starts_on");--> statement-breakpoint
CREATE INDEX "event_preset_id_index" ON "app"."event" USING btree ("preset_id");--> statement-breakpoint
CREATE INDEX "event_status_index" ON "app"."event" USING btree ("status");--> statement-breakpoint
CREATE INDEX "event_duty_staff_member_id_index" ON "app"."event_duty" USING btree ("staff_member_id");--> statement-breakpoint
CREATE INDEX "event_preset_event_type_id_index" ON "app"."event_preset" USING btree ("event_type_id");--> statement-breakpoint
CREATE INDEX "event_preset_venue_id_index" ON "app"."event_preset" USING btree ("venue_id");--> statement-breakpoint
CREATE INDEX "staff_member_active_index" ON "app"."staff_member" USING btree ("active");--> statement-breakpoint
CREATE INDEX "vendor_display_name_index" ON "app"."vendor" USING btree ("display_name");--> statement-breakpoint
CREATE INDEX "vendor_city_index" ON "app"."vendor" USING btree ("city");