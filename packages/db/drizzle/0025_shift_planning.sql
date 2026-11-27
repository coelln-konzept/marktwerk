CREATE TYPE "app"."schedule_kind" AS ENUM('setup', 'open', 'teardown');--> statement-breakpoint
CREATE TABLE "app"."shift_need" (
	"id" uuid PRIMARY KEY NOT NULL,
	"event_id" uuid NOT NULL,
	"work_date" date NOT NULL,
	"duty_role_id" uuid NOT NULL,
	"schedule_kind" "app"."schedule_kind" NOT NULL,
	"headcount" integer NOT NULL,
	"planned_start" time,
	"planned_end" time,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shift_need_eventId_workDate_dutyRoleId_scheduleKind_unique" UNIQUE("event_id","work_date","duty_role_id","schedule_kind"),
	CONSTRAINT "shift_need_headcount" CHECK ("app"."shift_need"."headcount" between 0 and 30),
	CONSTRAINT "shift_need_times" CHECK (("app"."shift_need"."planned_start" is null) = ("app"."shift_need"."planned_end" is null))
);
--> statement-breakpoint
CREATE TABLE "app"."staff_unavailability" (
	"id" uuid PRIMARY KEY NOT NULL,
	"staff_member_id" uuid NOT NULL,
	"date" date NOT NULL,
	"note" text,
	"created_by_staff_member_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_unavailability_staffMemberId_date_unique" UNIQUE("staff_member_id","date")
);
--> statement-breakpoint
ALTER TABLE "app"."employment_contract" DROP CONSTRAINT "employment_contract_amounts";--> statement-breakpoint
ALTER TABLE "app"."event" ADD COLUMN "staffing" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "app"."event_preset" ADD COLUMN "staffing" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "app"."settings" ADD COLUMN "default_monthly_hour_budget" numeric(5, 2) DEFAULT 40 NOT NULL;--> statement-breakpoint
ALTER TABLE "app"."employment_contract" ADD COLUMN "monthly_hour_budget" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "app"."shift" ADD COLUMN "need_id" uuid;--> statement-breakpoint
ALTER TABLE "app"."shift_need" ADD CONSTRAINT "shift_need_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "app"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."shift_need" ADD CONSTRAINT "shift_need_duty_role_id_duty_role_id_fk" FOREIGN KEY ("duty_role_id") REFERENCES "app"."duty_role"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."staff_unavailability" ADD CONSTRAINT "staff_unavailability_staff_member_id_staff_member_id_fk" FOREIGN KEY ("staff_member_id") REFERENCES "app"."staff_member"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."staff_unavailability" ADD CONSTRAINT "staff_unavailability_created_by_staff_member_id_staff_member_id_fk" FOREIGN KEY ("created_by_staff_member_id") REFERENCES "app"."staff_member"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "shift_need_work_date_index" ON "app"."shift_need" USING btree ("work_date");--> statement-breakpoint
CREATE INDEX "staff_unavailability_date_index" ON "app"."staff_unavailability" USING btree ("date");--> statement-breakpoint
ALTER TABLE "app"."shift" ADD CONSTRAINT "shift_need_id_shift_need_id_fk" FOREIGN KEY ("need_id") REFERENCES "app"."shift_need"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "shift_need_id_index" ON "app"."shift" USING btree ("need_id");--> statement-breakpoint
ALTER TABLE "app"."settings" ADD CONSTRAINT "settings_hour_budget_range" CHECK ("app"."settings"."default_monthly_hour_budget" between 0 and 200);--> statement-breakpoint
ALTER TABLE "app"."employment_contract" ADD CONSTRAINT "employment_contract_amounts" CHECK (("app"."employment_contract"."hourly_rate_cents" is null or "app"."employment_contract"."hourly_rate_cents" > 0)
        and ("app"."employment_contract"."fixed_monthly_pay_cents" is null or "app"."employment_contract"."fixed_monthly_pay_cents" >= 0)
        and ("app"."employment_contract"."contracted_hours_per_week" is null or "app"."employment_contract"."contracted_hours_per_week" >= 0)
        and ("app"."employment_contract"."monthly_hour_budget" is null or "app"."employment_contract"."monthly_hour_budget" >= 0));