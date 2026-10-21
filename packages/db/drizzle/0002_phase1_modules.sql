CREATE TYPE "app"."obligation_kind" AS ENUM('hu', 'uvv', 'service', 'tyres', 'insurance', 'vehicle_tax', 'licence_check', 'report', 'other');--> statement-breakpoint
CREATE TYPE "app"."obligation_scope" AS ENUM('company', 'vehicle', 'venue');--> statement-breakpoint
CREATE TYPE "app"."vehicle_issue_severity" AS ENUM('minor', 'major', 'critical');--> statement-breakpoint
CREATE TYPE "app"."vehicle_issue_status" AS ENUM('open', 'in_progress', 'resolved');--> statement-breakpoint
CREATE TYPE "app"."document_kind" AS ENUM('receipt', 'invoice', 'e_invoice_xml', 'contract', 'permit', 'photo', 'export', 'other');--> statement-breakpoint
CREATE TYPE "app"."installment_status" AS ENUM('open', 'partially_paid', 'paid', 'cancelled');--> statement-breakpoint
CREATE TYPE "app"."payable_category" AS ENUM('location', 'permit', 'water_power', 'equipment_rental', 'staff_external', 'security', 'cleaning_waste', 'toilets', 'marketing', 'gema', 'transport_fuel', 'vehicle', 'insurance', 'tax_fees', 'other');--> statement-breakpoint
CREATE TYPE "app"."payable_scope" AS ENUM('event', 'company', 'vehicle', 'venue_season');--> statement-breakpoint
CREATE TYPE "app"."payment_method" AS ENUM('bank_transfer', 'sepa_direct_debit', 'cash', 'card', 'other');--> statement-breakpoint
CREATE TYPE "app"."message_channel" AS ENUM('in_app', 'email', 'whatsapp_link', 'whatsapp_api');--> statement-breakpoint
CREATE TYPE "app"."message_status" AS ENUM('queued', 'ready', 'sent', 'delivered', 'read', 'failed');--> statement-breakpoint
CREATE TYPE "app"."notification_reason" AS ENUM('assigned', 'mentioned', 'due_soon', 'overdue', 'rolled_over', 'dates_shifted', 'permit_apply_by', 'permit_decision_due', 'installment_due', 'rental_return_due', 'obligation_due', 'shift_request', 'hours_missing', 'payroll_close', 'escalated');--> statement-breakpoint
CREATE TYPE "app"."notification_severity" AS ENUM('info', 'warning', 'critical');--> statement-breakpoint
CREATE TYPE "app"."notification_state" AS ENUM('unread', 'read', 'done', 'saved');--> statement-breakpoint
CREATE TYPE "app"."permit_cadence" AS ENUM('per_event', 'per_season', 'per_year', 'multi_year', 'standing');--> statement-breakpoint
CREATE TYPE "app"."permit_category" AS ENUM('city', 'external');--> statement-breakpoint
CREATE TYPE "app"."permit_status" AS ENUM('not_started', 'preparing', 'applied', 'granted', 'rejected', 'not_required', 'superseded');--> statement-breakpoint
CREATE TYPE "app"."permit_type" AS ENUM('market_permit', 'water', 'signage', 'no_parking', 'toilets', 'landowner_ok', 'gema', 'safety_concept', 'traffic_order', 'catering', 'insurance', 'other');--> statement-breakpoint
CREATE TYPE "app"."employment_type" AS ENUM('minijob', 'midijob', 'student', 'part_time', 'full_time', 'freelance');--> statement-breakpoint
CREATE TYPE "app"."payroll_period_status" AS ENUM('open', 'locked', 'approved', 'exported');--> statement-breakpoint
CREATE TYPE "app"."shift_status" AS ENUM('requested', 'confirmed', 'declined', 'worked', 'no_show', 'cancelled');--> statement-breakpoint
CREATE TYPE "app"."approval_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "app"."board_column" AS ENUM('preparation', 'this_week', 'today', 'done');--> statement-breakpoint
CREATE TYPE "app"."effort_feedback" AS ENUM('as_planned', 'longer', 'shorter');--> statement-breakpoint
CREATE TYPE "app"."task_source" AS ENUM('template', 'manual', 'permit', 'permit_condition', 'obligation', 'rental', 'email', 'system');--> statement-breakpoint
CREATE TYPE "app"."task_status" AS ENUM('todo', 'in_progress', 'waiting_external', 'blocked', 'done', 'skipped', 'cancelled');--> statement-breakpoint
CREATE TYPE "app"."day_mode" AS ENUM('calendar', 'business');--> statement-breakpoint
CREATE TYPE "app"."task_category" AS ENUM('general', 'permits', 'logistics', 'communication', 'finance', 'staff', 'office');--> statement-breakpoint
CREATE TYPE "app"."task_phase" AS ENUM('pre', 'live', 'post');--> statement-breakpoint
CREATE TYPE "app"."task_priority" AS ENUM('low', 'normal', 'high');--> statement-breakpoint
CREATE TYPE "app"."template_kind" AS ENUM('event', 'permit');--> statement-breakpoint
CREATE TYPE "app"."template_version_status" AS ENUM('draft', 'published', 'retired');--> statement-breakpoint
CREATE TABLE "app"."obligation" (
	"id" uuid PRIMARY KEY NOT NULL,
	"kind" "app"."obligation_kind" DEFAULT 'other' NOT NULL,
	"title" text NOT NULL,
	"scope" "app"."obligation_scope" NOT NULL,
	"vehicle_id" uuid,
	"venue_id" uuid,
	"interval_months" integer,
	"interval_km" integer,
	"next_due_on" date,
	"next_due_km" integer,
	"lead_days" integer DEFAULT 14 NOT NULL,
	"responsible_staff_member_id" uuid NOT NULL,
	"creates_payable" boolean DEFAULT false NOT NULL,
	"last_done_on" date,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "obligation_scope_target" CHECK (("app"."obligation"."scope" <> 'vehicle' or "app"."obligation"."vehicle_id" is not null)
        and ("app"."obligation"."scope" <> 'venue' or "app"."obligation"."venue_id" is not null)),
	CONSTRAINT "obligation_intervals" CHECK (("app"."obligation"."interval_months" is null or "app"."obligation"."interval_months" > 0)
        and ("app"."obligation"."interval_km" is null or "app"."obligation"."interval_km" > 0)
        and "app"."obligation"."lead_days" >= 0)
);
--> statement-breakpoint
CREATE TABLE "app"."obligation_completion" (
	"id" uuid PRIMARY KEY NOT NULL,
	"obligation_id" uuid NOT NULL,
	"done_on" date NOT NULL,
	"done_km" integer,
	"cost_cents" integer,
	"done_by_id" uuid,
	"checker_name" text,
	"notes" text,
	"next_due_on_after" date,
	"next_due_km_after" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "obligation_completion_obligationId_doneOn_unique" UNIQUE("obligation_id","done_on"),
	CONSTRAINT "obligation_completion_cost" CHECK ("app"."obligation_completion"."cost_cents" is null or "app"."obligation_completion"."cost_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "app"."vehicle" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"plate" text NOT NULL,
	"make" text,
	"model" text,
	"vin" text,
	"first_registration_on" date,
	"gross_weight_kg" integer,
	"odometer_km" integer,
	"odometer_recorded_on" date,
	"insurer" text,
	"policy_number" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "vehicle_plate_unique" UNIQUE("plate"),
	CONSTRAINT "vehicle_vin_unique" UNIQUE("vin"),
	CONSTRAINT "vehicle_weight" CHECK ("app"."vehicle"."gross_weight_kg" is null or "app"."vehicle"."gross_weight_kg" > 0),
	CONSTRAINT "vehicle_odometer" CHECK ("app"."vehicle"."odometer_km" is null or "app"."vehicle"."odometer_km" >= 0)
);
--> statement-breakpoint
CREATE TABLE "app"."vehicle_issue" (
	"id" uuid PRIMARY KEY NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"severity" "app"."vehicle_issue_severity" DEFAULT 'minor' NOT NULL,
	"status" "app"."vehicle_issue_status" DEFAULT 'open' NOT NULL,
	"reported_by_staff_member_id" uuid,
	"reported_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by_staff_member_id" uuid,
	"resolution_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vehicle_issue_resolved" CHECK (("app"."vehicle_issue"."status" <> 'resolved') or "app"."vehicle_issue"."resolved_at" is not null)
);
--> statement-breakpoint
CREATE TABLE "app"."document" (
	"id" uuid PRIMARY KEY NOT NULL,
	"kind" "app"."document_kind" DEFAULT 'other' NOT NULL,
	"file_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"sha256" text NOT NULL,
	"storage_key" text NOT NULL,
	"caption" text,
	"payable_id" uuid,
	"installment_id" uuid,
	"expense_id" uuid,
	"permit_id" uuid,
	"event_id" uuid,
	"venue_id" uuid,
	"location_agreement_id" uuid,
	"vehicle_id" uuid,
	"vehicle_issue_id" uuid,
	"obligation_completion_id" uuid,
	"task_id" uuid,
	"employment_contract_id" uuid,
	"payroll_period_id" uuid,
	"uploaded_by_staff_member_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	"archived_by_staff_member_id" uuid,
	"archive_reason" text,
	CONSTRAINT "document_storageKey_unique" UNIQUE("storage_key"),
	CONSTRAINT "document_size" CHECK ("app"."document"."size_bytes" >= 0),
	CONSTRAINT "document_sha256" CHECK ("app"."document"."sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "document_has_link" CHECK (num_nonnulls("app"."document"."payable_id", "app"."document"."installment_id", "app"."document"."expense_id", "app"."document"."permit_id", "app"."document"."event_id",
        "app"."document"."venue_id", "app"."document"."location_agreement_id", "app"."document"."vehicle_id", "app"."document"."vehicle_issue_id",
        "app"."document"."obligation_completion_id", "app"."document"."task_id", "app"."document"."employment_contract_id", "app"."document"."payroll_period_id") >= 1)
);
--> statement-breakpoint
CREATE TABLE "app"."event_budget_line" (
	"id" uuid PRIMARY KEY NOT NULL,
	"event_id" uuid NOT NULL,
	"category" "app"."payable_category" NOT NULL,
	"planned_cents" integer NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_budget_line_eventId_category_unique" UNIQUE("event_id","category"),
	CONSTRAINT "event_budget_line_planned" CHECK ("app"."event_budget_line"."planned_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "app"."event_income" (
	"id" uuid PRIMARY KEY NOT NULL,
	"event_id" uuid NOT NULL,
	"label" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"received_on" date,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "event_income_amount" CHECK ("app"."event_income"."amount_cents" > 0)
);
--> statement-breakpoint
CREATE TABLE "app"."expense" (
	"id" uuid PRIMARY KEY NOT NULL,
	"spent_on" date NOT NULL,
	"amount_cents" integer NOT NULL,
	"category" "app"."payable_category" DEFAULT 'other' NOT NULL,
	"description" text NOT NULL,
	"merchant" text,
	"event_id" uuid,
	"vehicle_id" uuid,
	"paid_by_staff_member_id" uuid,
	"method" "app"."payment_method",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "expense_amount" CHECK ("app"."expense"."amount_cents" > 0)
);
--> statement-breakpoint
CREATE TABLE "app"."installment" (
	"id" uuid PRIMARY KEY NOT NULL,
	"payable_id" uuid NOT NULL,
	"sort" integer DEFAULT 1 NOT NULL,
	"due_on" date NOT NULL,
	"amount_cents" integer NOT NULL,
	"status" "app"."installment_status" DEFAULT 'open' NOT NULL,
	"paid_on" date,
	"paid_amount_cents" integer,
	"paid_by_staff_member_id" uuid,
	"method" "app"."payment_method",
	"reference" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "installment_payableId_sort_unique" UNIQUE("payable_id","sort"),
	CONSTRAINT "installment_amount" CHECK ("app"."installment"."amount_cents" > 0),
	CONSTRAINT "installment_paid" CHECK ("app"."installment"."status" in ('open', 'cancelled')
        or ("app"."installment"."paid_on" is not null and "app"."installment"."paid_amount_cents" is not null and "app"."installment"."paid_amount_cents" >= 0))
);
--> statement-breakpoint
CREATE TABLE "app"."payable" (
	"id" uuid PRIMARY KEY NOT NULL,
	"counterparty_contact_id" uuid,
	"title" text NOT NULL,
	"scope" "app"."payable_scope" NOT NULL,
	"event_id" uuid,
	"venue_id" uuid,
	"season" integer,
	"vehicle_id" uuid,
	"permit_id" uuid,
	"obligation_id" uuid,
	"category" "app"."payable_category" NOT NULL,
	"total_gross_cents" integer NOT NULL,
	"vat_rate_bp" integer,
	"critical" boolean DEFAULT false NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "payable_total" CHECK ("app"."payable"."total_gross_cents" >= 0),
	CONSTRAINT "payable_vat" CHECK ("app"."payable"."vat_rate_bp" is null or "app"."payable"."vat_rate_bp" between 0 and 10000),
	CONSTRAINT "payable_scope_target" CHECK (("app"."payable"."scope" <> 'event' or "app"."payable"."event_id" is not null)
        and ("app"."payable"."scope" <> 'vehicle' or "app"."payable"."vehicle_id" is not null)
        and ("app"."payable"."scope" <> 'venue_season' or ("app"."payable"."venue_id" is not null and "app"."payable"."season" is not null)))
);
--> statement-breakpoint
CREATE TABLE "app"."escalation_log" (
	"id" uuid PRIMARY KEY NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" uuid NOT NULL,
	"level" integer DEFAULT 1 NOT NULL,
	"escalated_to_staff_member_id" uuid,
	"reason" text,
	"dedupe_key" text NOT NULL,
	"escalated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "escalation_log_dedupeKey_unique" UNIQUE("dedupe_key"),
	CONSTRAINT "escalation_level" CHECK ("app"."escalation_log"."level" >= 1)
);
--> statement-breakpoint
CREATE TABLE "app"."notification" (
	"id" uuid PRIMARY KEY NOT NULL,
	"recipient_staff_member_id" uuid NOT NULL,
	"reason" "app"."notification_reason" NOT NULL,
	"severity" "app"."notification_severity" DEFAULT 'info' NOT NULL,
	"subject_type" text,
	"subject_id" uuid,
	"title" text NOT NULL,
	"body" text,
	"link" text,
	"dedupe_key" text,
	"state" "app"."notification_state" DEFAULT 'unread' NOT NULL,
	"snoozed_until" timestamp with time zone,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_recipientStaffMemberId_dedupeKey_unique" UNIQUE("recipient_staff_member_id","dedupe_key")
);
--> statement-breakpoint
CREATE TABLE "app"."notification_preference" (
	"id" uuid PRIMARY KEY NOT NULL,
	"staff_member_id" uuid NOT NULL,
	"reason" "app"."notification_reason" NOT NULL,
	"channel" "app"."message_channel" NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_preference_staffMemberId_reason_channel_unique" UNIQUE("staff_member_id","reason","channel")
);
--> statement-breakpoint
CREATE TABLE "app"."outbound_message" (
	"id" uuid PRIMARY KEY NOT NULL,
	"channel" "app"."message_channel" NOT NULL,
	"recipient_staff_member_id" uuid,
	"recipient_address" text,
	"notification_id" uuid,
	"template_key" text NOT NULL,
	"subject" text,
	"rendered_text" text NOT NULL,
	"status" "app"."message_status" DEFAULT 'queued' NOT NULL,
	"send_after" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"error" text,
	"external_id" text,
	"dedupe_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "outbound_message_dedupeKey_unique" UNIQUE("dedupe_key"),
	CONSTRAINT "outbound_message_attempts" CHECK ("app"."outbound_message"."attempts" >= 0)
);
--> statement-breakpoint
CREATE TABLE "app"."event_permit" (
	"event_id" uuid NOT NULL,
	"permit_id" uuid NOT NULL,
	"required" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_permit_event_id_permit_id_pk" PRIMARY KEY("event_id","permit_id")
);
--> statement-breakpoint
CREATE TABLE "app"."permit" (
	"id" uuid PRIMARY KEY NOT NULL,
	"requirement_id" uuid,
	"venue_id" uuid,
	"season" integer,
	"category" "app"."permit_category" NOT NULL,
	"permit_type" "app"."permit_type" NOT NULL,
	"title" text NOT NULL,
	"authority_contact_id" uuid,
	"reference_no" text,
	"status" "app"."permit_status" DEFAULT 'not_started' NOT NULL,
	"apply_by" date,
	"applied_at" date,
	"expected_decision_on" date,
	"granted_at" date,
	"valid_from" date,
	"valid_until" date,
	"conditions" text[] DEFAULT '{}' NOT NULL,
	"deliverables_received" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"responsible_staff_member_id" uuid,
	"supersedes_id" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "permit_validity" CHECK ("app"."permit"."valid_from" is null or "app"."permit"."valid_until" is null or "app"."permit"."valid_until" >= "app"."permit"."valid_from")
);
--> statement-breakpoint
CREATE TABLE "app"."permit_requirement" (
	"id" uuid PRIMARY KEY NOT NULL,
	"venue_id" uuid NOT NULL,
	"event_type_id" uuid,
	"category" "app"."permit_category" NOT NULL,
	"permit_type" "app"."permit_type" NOT NULL,
	"title" text NOT NULL,
	"authority_contact_id" uuid,
	"cadence" "app"."permit_cadence" NOT NULL,
	"lead_time_days" integer DEFAULT 0 NOT NULL,
	"submission_window_start_md" text,
	"submission_window_end_md" text,
	"expected_decision_md" text,
	"typical_fee_cents" integer,
	"deliverables" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"prep_template_id" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "permit_requirement_lead_time" CHECK ("app"."permit_requirement"."lead_time_days" >= 0),
	CONSTRAINT "permit_requirement_fee" CHECK ("app"."permit_requirement"."typical_fee_cents" is null or "app"."permit_requirement"."typical_fee_cents" >= 0),
	CONSTRAINT "permit_requirement_month_days" CHECK (("app"."permit_requirement"."submission_window_start_md" is null or "app"."permit_requirement"."submission_window_start_md" ~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$')
        and ("app"."permit_requirement"."submission_window_end_md" is null or "app"."permit_requirement"."submission_window_end_md" ~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$')
        and ("app"."permit_requirement"."expected_decision_md" is null or "app"."permit_requirement"."expected_decision_md" ~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'))
);
--> statement-breakpoint
CREATE TABLE "app"."employment_contract" (
	"id" uuid PRIMARY KEY NOT NULL,
	"staff_member_id" uuid NOT NULL,
	"type" "app"."employment_type" NOT NULL,
	"hourly_rate_cents" integer,
	"contracted_hours_per_week" numeric(5, 2),
	"fixed_monthly_pay_cents" integer,
	"working_time_account" boolean DEFAULT false NOT NULL,
	"other_minijob_declared" boolean DEFAULT false NOT NULL,
	"valid_from" date NOT NULL,
	"valid_until" date,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "employment_contract_staffMemberId_validFrom_unique" UNIQUE("staff_member_id","valid_from"),
	CONSTRAINT "employment_contract_validity" CHECK ("app"."employment_contract"."valid_until" is null or "app"."employment_contract"."valid_until" >= "app"."employment_contract"."valid_from"),
	CONSTRAINT "employment_contract_amounts" CHECK (("app"."employment_contract"."hourly_rate_cents" is null or "app"."employment_contract"."hourly_rate_cents" > 0)
        and ("app"."employment_contract"."fixed_monthly_pay_cents" is null or "app"."employment_contract"."fixed_monthly_pay_cents" >= 0)
        and ("app"."employment_contract"."contracted_hours_per_week" is null or "app"."employment_contract"."contracted_hours_per_week" >= 0))
);
--> statement-breakpoint
CREATE TABLE "app"."overrun_justification" (
	"id" uuid PRIMARY KEY NOT NULL,
	"staff_member_id" uuid NOT NULL,
	"month" date NOT NULL,
	"reason" text NOT NULL,
	"recorded_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "overrun_justification_staffMemberId_month_unique" UNIQUE("staff_member_id","month"),
	CONSTRAINT "overrun_justification_month" CHECK (extract(day from "app"."overrun_justification"."month") = 1)
);
--> statement-breakpoint
CREATE TABLE "app"."payroll_period" (
	"id" uuid PRIMARY KEY NOT NULL,
	"month" date NOT NULL,
	"status" "app"."payroll_period_status" DEFAULT 'open' NOT NULL,
	"locked_at" timestamp with time zone,
	"locked_by_staff_member_id" uuid,
	"approved_at" timestamp with time zone,
	"approved_by_staff_member_id" uuid,
	"exported_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payroll_period_month_unique" UNIQUE("month"),
	CONSTRAINT "payroll_period_month" CHECK (extract(day from "app"."payroll_period"."month") = 1),
	CONSTRAINT "payroll_period_status_dates" CHECK (("app"."payroll_period"."status" = 'open' or "app"."payroll_period"."locked_at" is not null)
        and ("app"."payroll_period"."status" not in ('approved', 'exported') or "app"."payroll_period"."approved_at" is not null)
        and ("app"."payroll_period"."status" <> 'exported' or "app"."payroll_period"."exported_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "app"."shift" (
	"id" uuid PRIMARY KEY NOT NULL,
	"event_id" uuid,
	"staff_member_id" uuid NOT NULL,
	"duty_role_id" uuid,
	"work_date" date NOT NULL,
	"planned_start" time,
	"planned_end" time,
	"actual_start" time,
	"actual_end" time,
	"break_minutes" integer DEFAULT 0 NOT NULL,
	"status" "app"."shift_status" DEFAULT 'requested' NOT NULL,
	"recorded_by_staff_member_id" uuid,
	"recorded_at" timestamp with time zone,
	"approved_by_staff_member_id" uuid,
	"approved_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shift_break" CHECK ("app"."shift"."break_minutes" >= 0),
	CONSTRAINT "shift_version" CHECK ("app"."shift"."version" >= 1)
);
--> statement-breakpoint
CREATE TABLE "app"."shift_revision" (
	"id" uuid PRIMARY KEY NOT NULL,
	"shift_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"reason" text NOT NULL,
	"before" jsonb NOT NULL,
	"changed_by_staff_member_id" uuid,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shift_revision_shiftId_version_unique" UNIQUE("shift_id","version")
);
--> statement-breakpoint
CREATE TABLE "app"."checklist" (
	"id" uuid PRIMARY KEY NOT NULL,
	"event_id" uuid,
	"permit_id" uuid,
	"template_id" uuid,
	"template_version_id" uuid,
	"name" text NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "checklist_one_owner" CHECK (not ("app"."checklist"."event_id" is not null and "app"."checklist"."permit_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "app"."task" (
	"id" uuid PRIMARY KEY NOT NULL,
	"event_id" uuid,
	"checklist_id" uuid,
	"template_item_id" uuid,
	"template_stable_key" text,
	"permit_id" uuid,
	"payable_id" uuid,
	"obligation_id" uuid,
	"parent_task_id" uuid,
	"source" "app"."task_source" DEFAULT 'manual' NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"phase" "app"."task_phase",
	"category" "app"."task_category" DEFAULT 'general' NOT NULL,
	"priority" "app"."task_priority" DEFAULT 'normal' NOT NULL,
	"labels" text[] DEFAULT '{}' NOT NULL,
	"duty_role_id" uuid,
	"assignee_id" uuid,
	"assignee_overridden" boolean DEFAULT false NOT NULL,
	"anchor_key" text,
	"offset_days" integer,
	"day_mode" "app"."day_mode" DEFAULT 'calendar' NOT NULL,
	"due_at" timestamp with time zone,
	"due_overridden" boolean DEFAULT false NOT NULL,
	"estimate_minutes" integer DEFAULT 0 NOT NULL,
	"effort_feedback" "app"."effort_feedback",
	"requires_photo" boolean DEFAULT false NOT NULL,
	"requires_note" boolean DEFAULT false NOT NULL,
	"requires_attachment" boolean DEFAULT false NOT NULL,
	"status" "app"."task_status" DEFAULT 'todo' NOT NULL,
	"waiting_reason" text,
	"skipped_reason" text,
	"completed_at" timestamp with time zone,
	"completed_by_staff_member_id" uuid,
	"approver_staff_member_id" uuid,
	"approval_status" "app"."approval_status",
	"board_column" "app"."board_column",
	"board_sort" double precision DEFAULT 0 NOT NULL,
	"rollover_count" integer DEFAULT 0 NOT NULL,
	"last_rolled_at" timestamp with time zone,
	"customized" boolean DEFAULT false NOT NULL,
	"removed_from_template" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_estimate" CHECK ("app"."task"."estimate_minutes" >= 0),
	CONSTRAINT "task_rollover" CHECK ("app"."task"."rollover_count" >= 0),
	CONSTRAINT "task_done_completed" CHECK ("app"."task"."status" <> 'done' or "app"."task"."completed_at" is not null),
	CONSTRAINT "task_not_own_parent" CHECK ("app"."task"."parent_task_id" is null or "app"."task"."parent_task_id" <> "app"."task"."id")
);
--> statement-breakpoint
CREATE TABLE "app"."task_check_item" (
	"id" uuid PRIMARY KEY NOT NULL,
	"task_id" uuid NOT NULL,
	"title" text NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"done" boolean DEFAULT false NOT NULL,
	"done_at" timestamp with time zone,
	"done_by_staff_member_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_check_item_done" CHECK ("app"."task_check_item"."done" = ("app"."task_check_item"."done_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "app"."task_comment" (
	"id" uuid PRIMARY KEY NOT NULL,
	"task_id" uuid NOT NULL,
	"author_staff_member_id" uuid,
	"author_user_id" text,
	"body" text NOT NULL,
	"mentioned_staff_member_ids" uuid[] DEFAULT '{}' NOT NULL,
	"edited_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "app"."task_dependency" (
	"task_id" uuid NOT NULL,
	"depends_on_task_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_dependency_task_id_depends_on_task_id_pk" PRIMARY KEY("task_id","depends_on_task_id"),
	CONSTRAINT "task_dependency_not_self" CHECK ("app"."task_dependency"."task_id" <> "app"."task_dependency"."depends_on_task_id")
);
--> statement-breakpoint
CREATE TABLE "app"."task_watcher" (
	"task_id" uuid NOT NULL,
	"staff_member_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_watcher_task_id_staff_member_id_pk" PRIMARY KEY("task_id","staff_member_id")
);
--> statement-breakpoint
CREATE TABLE "app"."checklist_template" (
	"id" uuid PRIMARY KEY NOT NULL,
	"kind" "app"."template_kind" DEFAULT 'event' NOT NULL,
	"event_type_id" uuid,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "app"."event_preset_template" (
	"preset_id" uuid NOT NULL,
	"template_id" uuid NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_preset_template_preset_id_template_id_pk" PRIMARY KEY("preset_id","template_id")
);
--> statement-breakpoint
CREATE TABLE "app"."template_item" (
	"id" uuid PRIMARY KEY NOT NULL,
	"version_id" uuid NOT NULL,
	"stable_key" text NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"phase" "app"."task_phase" DEFAULT 'pre' NOT NULL,
	"category" "app"."task_category" DEFAULT 'general' NOT NULL,
	"anchor_key" text DEFAULT 'event_day' NOT NULL,
	"offset_days" integer DEFAULT 0 NOT NULL,
	"day_mode" "app"."day_mode" DEFAULT 'calendar' NOT NULL,
	"due_time" time,
	"duty_role_id" uuid,
	"priority" "app"."task_priority" DEFAULT 'normal' NOT NULL,
	"estimate_minutes" integer DEFAULT 0 NOT NULL,
	"requires_photo" boolean DEFAULT false NOT NULL,
	"requires_note" boolean DEFAULT false NOT NULL,
	"requires_attachment" boolean DEFAULT false NOT NULL,
	"check_items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"approver_duty_role_id" uuid,
	"depends_on_keys" text[] DEFAULT '{}' NOT NULL,
	"condition" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "template_item_versionId_stableKey_unique" UNIQUE("version_id","stable_key"),
	CONSTRAINT "template_item_estimate" CHECK ("app"."template_item"."estimate_minutes" >= 0)
);
--> statement-breakpoint
CREATE TABLE "app"."template_version" (
	"id" uuid PRIMARY KEY NOT NULL,
	"template_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"status" "app"."template_version_status" DEFAULT 'draft' NOT NULL,
	"published_at" timestamp with time zone,
	"published_by_id" uuid,
	"change_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "template_version_templateId_version_unique" UNIQUE("template_id","version"),
	CONSTRAINT "template_version_number" CHECK ("app"."template_version"."version" >= 1),
	CONSTRAINT "template_version_published_at" CHECK ("app"."template_version"."status" = 'draft' or "app"."template_version"."published_at" is not null)
);
--> statement-breakpoint
ALTER TABLE "app"."obligation" ADD CONSTRAINT "obligation_vehicle_id_vehicle_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "app"."vehicle"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."obligation" ADD CONSTRAINT "obligation_venue_id_venue_id_fk" FOREIGN KEY ("venue_id") REFERENCES "app"."venue"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."obligation" ADD CONSTRAINT "obligation_responsible_staff_member_id_staff_member_id_fk" FOREIGN KEY ("responsible_staff_member_id") REFERENCES "app"."staff_member"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."obligation_completion" ADD CONSTRAINT "obligation_completion_obligation_id_obligation_id_fk" FOREIGN KEY ("obligation_id") REFERENCES "app"."obligation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."obligation_completion" ADD CONSTRAINT "obligation_completion_done_by_id_staff_member_id_fk" FOREIGN KEY ("done_by_id") REFERENCES "app"."staff_member"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."vehicle_issue" ADD CONSTRAINT "vehicle_issue_vehicle_id_vehicle_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "app"."vehicle"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."vehicle_issue" ADD CONSTRAINT "vehicle_issue_reported_by_staff_member_id_staff_member_id_fk" FOREIGN KEY ("reported_by_staff_member_id") REFERENCES "app"."staff_member"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."vehicle_issue" ADD CONSTRAINT "vehicle_issue_resolved_by_staff_member_id_staff_member_id_fk" FOREIGN KEY ("resolved_by_staff_member_id") REFERENCES "app"."staff_member"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."document" ADD CONSTRAINT "document_payable_id_payable_id_fk" FOREIGN KEY ("payable_id") REFERENCES "app"."payable"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."document" ADD CONSTRAINT "document_installment_id_installment_id_fk" FOREIGN KEY ("installment_id") REFERENCES "app"."installment"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."document" ADD CONSTRAINT "document_expense_id_expense_id_fk" FOREIGN KEY ("expense_id") REFERENCES "app"."expense"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."document" ADD CONSTRAINT "document_permit_id_permit_id_fk" FOREIGN KEY ("permit_id") REFERENCES "app"."permit"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."document" ADD CONSTRAINT "document_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "app"."event"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."document" ADD CONSTRAINT "document_venue_id_venue_id_fk" FOREIGN KEY ("venue_id") REFERENCES "app"."venue"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."document" ADD CONSTRAINT "document_location_agreement_id_location_agreement_id_fk" FOREIGN KEY ("location_agreement_id") REFERENCES "app"."location_agreement"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."document" ADD CONSTRAINT "document_vehicle_id_vehicle_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "app"."vehicle"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."document" ADD CONSTRAINT "document_vehicle_issue_id_vehicle_issue_id_fk" FOREIGN KEY ("vehicle_issue_id") REFERENCES "app"."vehicle_issue"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."document" ADD CONSTRAINT "document_obligation_completion_id_obligation_completion_id_fk" FOREIGN KEY ("obligation_completion_id") REFERENCES "app"."obligation_completion"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."document" ADD CONSTRAINT "document_task_id_task_id_fk" FOREIGN KEY ("task_id") REFERENCES "app"."task"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."document" ADD CONSTRAINT "document_employment_contract_id_employment_contract_id_fk" FOREIGN KEY ("employment_contract_id") REFERENCES "app"."employment_contract"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."document" ADD CONSTRAINT "document_payroll_period_id_payroll_period_id_fk" FOREIGN KEY ("payroll_period_id") REFERENCES "app"."payroll_period"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."document" ADD CONSTRAINT "document_uploaded_by_staff_member_id_staff_member_id_fk" FOREIGN KEY ("uploaded_by_staff_member_id") REFERENCES "app"."staff_member"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."document" ADD CONSTRAINT "document_archived_by_staff_member_id_staff_member_id_fk" FOREIGN KEY ("archived_by_staff_member_id") REFERENCES "app"."staff_member"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."event_budget_line" ADD CONSTRAINT "event_budget_line_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "app"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."event_income" ADD CONSTRAINT "event_income_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "app"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."expense" ADD CONSTRAINT "expense_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "app"."event"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."expense" ADD CONSTRAINT "expense_vehicle_id_vehicle_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "app"."vehicle"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."expense" ADD CONSTRAINT "expense_paid_by_staff_member_id_staff_member_id_fk" FOREIGN KEY ("paid_by_staff_member_id") REFERENCES "app"."staff_member"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."installment" ADD CONSTRAINT "installment_payable_id_payable_id_fk" FOREIGN KEY ("payable_id") REFERENCES "app"."payable"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."installment" ADD CONSTRAINT "installment_paid_by_staff_member_id_staff_member_id_fk" FOREIGN KEY ("paid_by_staff_member_id") REFERENCES "app"."staff_member"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."payable" ADD CONSTRAINT "payable_counterparty_contact_id_contact_id_fk" FOREIGN KEY ("counterparty_contact_id") REFERENCES "app"."contact"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."payable" ADD CONSTRAINT "payable_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "app"."event"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."payable" ADD CONSTRAINT "payable_venue_id_venue_id_fk" FOREIGN KEY ("venue_id") REFERENCES "app"."venue"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."payable" ADD CONSTRAINT "payable_vehicle_id_vehicle_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "app"."vehicle"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."payable" ADD CONSTRAINT "payable_permit_id_permit_id_fk" FOREIGN KEY ("permit_id") REFERENCES "app"."permit"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."payable" ADD CONSTRAINT "payable_obligation_id_obligation_id_fk" FOREIGN KEY ("obligation_id") REFERENCES "app"."obligation"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."escalation_log" ADD CONSTRAINT "escalation_log_escalated_to_staff_member_id_staff_member_id_fk" FOREIGN KEY ("escalated_to_staff_member_id") REFERENCES "app"."staff_member"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."notification" ADD CONSTRAINT "notification_recipient_staff_member_id_staff_member_id_fk" FOREIGN KEY ("recipient_staff_member_id") REFERENCES "app"."staff_member"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."notification_preference" ADD CONSTRAINT "notification_preference_staff_member_id_staff_member_id_fk" FOREIGN KEY ("staff_member_id") REFERENCES "app"."staff_member"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."outbound_message" ADD CONSTRAINT "outbound_message_recipient_staff_member_id_staff_member_id_fk" FOREIGN KEY ("recipient_staff_member_id") REFERENCES "app"."staff_member"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."outbound_message" ADD CONSTRAINT "outbound_message_notification_id_notification_id_fk" FOREIGN KEY ("notification_id") REFERENCES "app"."notification"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."event_permit" ADD CONSTRAINT "event_permit_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "app"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."event_permit" ADD CONSTRAINT "event_permit_permit_id_permit_id_fk" FOREIGN KEY ("permit_id") REFERENCES "app"."permit"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."permit" ADD CONSTRAINT "permit_requirement_id_permit_requirement_id_fk" FOREIGN KEY ("requirement_id") REFERENCES "app"."permit_requirement"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."permit" ADD CONSTRAINT "permit_venue_id_venue_id_fk" FOREIGN KEY ("venue_id") REFERENCES "app"."venue"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."permit" ADD CONSTRAINT "permit_authority_contact_id_contact_id_fk" FOREIGN KEY ("authority_contact_id") REFERENCES "app"."contact"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."permit" ADD CONSTRAINT "permit_responsible_staff_member_id_staff_member_id_fk" FOREIGN KEY ("responsible_staff_member_id") REFERENCES "app"."staff_member"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."permit" ADD CONSTRAINT "permit_supersedes_id_permit_id_fk" FOREIGN KEY ("supersedes_id") REFERENCES "app"."permit"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."permit_requirement" ADD CONSTRAINT "permit_requirement_venue_id_venue_id_fk" FOREIGN KEY ("venue_id") REFERENCES "app"."venue"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."permit_requirement" ADD CONSTRAINT "permit_requirement_event_type_id_event_type_id_fk" FOREIGN KEY ("event_type_id") REFERENCES "app"."event_type"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."permit_requirement" ADD CONSTRAINT "permit_requirement_authority_contact_id_contact_id_fk" FOREIGN KEY ("authority_contact_id") REFERENCES "app"."contact"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."permit_requirement" ADD CONSTRAINT "permit_requirement_prep_template_id_checklist_template_id_fk" FOREIGN KEY ("prep_template_id") REFERENCES "app"."checklist_template"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."employment_contract" ADD CONSTRAINT "employment_contract_staff_member_id_staff_member_id_fk" FOREIGN KEY ("staff_member_id") REFERENCES "app"."staff_member"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."overrun_justification" ADD CONSTRAINT "overrun_justification_staff_member_id_staff_member_id_fk" FOREIGN KEY ("staff_member_id") REFERENCES "app"."staff_member"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."overrun_justification" ADD CONSTRAINT "overrun_justification_recorded_by_id_staff_member_id_fk" FOREIGN KEY ("recorded_by_id") REFERENCES "app"."staff_member"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."payroll_period" ADD CONSTRAINT "payroll_period_locked_by_staff_member_id_staff_member_id_fk" FOREIGN KEY ("locked_by_staff_member_id") REFERENCES "app"."staff_member"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."payroll_period" ADD CONSTRAINT "payroll_period_approved_by_staff_member_id_staff_member_id_fk" FOREIGN KEY ("approved_by_staff_member_id") REFERENCES "app"."staff_member"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."shift" ADD CONSTRAINT "shift_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "app"."event"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."shift" ADD CONSTRAINT "shift_staff_member_id_staff_member_id_fk" FOREIGN KEY ("staff_member_id") REFERENCES "app"."staff_member"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."shift" ADD CONSTRAINT "shift_duty_role_id_duty_role_id_fk" FOREIGN KEY ("duty_role_id") REFERENCES "app"."duty_role"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."shift" ADD CONSTRAINT "shift_recorded_by_staff_member_id_staff_member_id_fk" FOREIGN KEY ("recorded_by_staff_member_id") REFERENCES "app"."staff_member"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."shift" ADD CONSTRAINT "shift_approved_by_staff_member_id_staff_member_id_fk" FOREIGN KEY ("approved_by_staff_member_id") REFERENCES "app"."staff_member"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."shift_revision" ADD CONSTRAINT "shift_revision_shift_id_shift_id_fk" FOREIGN KEY ("shift_id") REFERENCES "app"."shift"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."shift_revision" ADD CONSTRAINT "shift_revision_changed_by_staff_member_id_staff_member_id_fk" FOREIGN KEY ("changed_by_staff_member_id") REFERENCES "app"."staff_member"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."checklist" ADD CONSTRAINT "checklist_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "app"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."checklist" ADD CONSTRAINT "checklist_permit_id_permit_id_fk" FOREIGN KEY ("permit_id") REFERENCES "app"."permit"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."checklist" ADD CONSTRAINT "checklist_template_id_checklist_template_id_fk" FOREIGN KEY ("template_id") REFERENCES "app"."checklist_template"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."checklist" ADD CONSTRAINT "checklist_template_version_id_template_version_id_fk" FOREIGN KEY ("template_version_id") REFERENCES "app"."template_version"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."task" ADD CONSTRAINT "task_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "app"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."task" ADD CONSTRAINT "task_checklist_id_checklist_id_fk" FOREIGN KEY ("checklist_id") REFERENCES "app"."checklist"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."task" ADD CONSTRAINT "task_template_item_id_template_item_id_fk" FOREIGN KEY ("template_item_id") REFERENCES "app"."template_item"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."task" ADD CONSTRAINT "task_permit_id_permit_id_fk" FOREIGN KEY ("permit_id") REFERENCES "app"."permit"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."task" ADD CONSTRAINT "task_payable_id_payable_id_fk" FOREIGN KEY ("payable_id") REFERENCES "app"."payable"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."task" ADD CONSTRAINT "task_obligation_id_obligation_id_fk" FOREIGN KEY ("obligation_id") REFERENCES "app"."obligation"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."task" ADD CONSTRAINT "task_parent_task_id_task_id_fk" FOREIGN KEY ("parent_task_id") REFERENCES "app"."task"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."task" ADD CONSTRAINT "task_duty_role_id_duty_role_id_fk" FOREIGN KEY ("duty_role_id") REFERENCES "app"."duty_role"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."task" ADD CONSTRAINT "task_assignee_id_staff_member_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "app"."staff_member"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."task" ADD CONSTRAINT "task_completed_by_staff_member_id_staff_member_id_fk" FOREIGN KEY ("completed_by_staff_member_id") REFERENCES "app"."staff_member"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."task" ADD CONSTRAINT "task_approver_staff_member_id_staff_member_id_fk" FOREIGN KEY ("approver_staff_member_id") REFERENCES "app"."staff_member"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."task_check_item" ADD CONSTRAINT "task_check_item_task_id_task_id_fk" FOREIGN KEY ("task_id") REFERENCES "app"."task"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."task_check_item" ADD CONSTRAINT "task_check_item_done_by_staff_member_id_staff_member_id_fk" FOREIGN KEY ("done_by_staff_member_id") REFERENCES "app"."staff_member"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."task_comment" ADD CONSTRAINT "task_comment_task_id_task_id_fk" FOREIGN KEY ("task_id") REFERENCES "app"."task"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."task_comment" ADD CONSTRAINT "task_comment_author_staff_member_id_staff_member_id_fk" FOREIGN KEY ("author_staff_member_id") REFERENCES "app"."staff_member"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."task_comment" ADD CONSTRAINT "task_comment_author_user_id_user_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "app"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."task_dependency" ADD CONSTRAINT "task_dependency_task_id_task_id_fk" FOREIGN KEY ("task_id") REFERENCES "app"."task"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."task_dependency" ADD CONSTRAINT "task_dependency_depends_on_task_id_task_id_fk" FOREIGN KEY ("depends_on_task_id") REFERENCES "app"."task"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."task_watcher" ADD CONSTRAINT "task_watcher_task_id_task_id_fk" FOREIGN KEY ("task_id") REFERENCES "app"."task"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."task_watcher" ADD CONSTRAINT "task_watcher_staff_member_id_staff_member_id_fk" FOREIGN KEY ("staff_member_id") REFERENCES "app"."staff_member"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."checklist_template" ADD CONSTRAINT "checklist_template_event_type_id_event_type_id_fk" FOREIGN KEY ("event_type_id") REFERENCES "app"."event_type"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."event_preset_template" ADD CONSTRAINT "event_preset_template_preset_id_event_preset_id_fk" FOREIGN KEY ("preset_id") REFERENCES "app"."event_preset"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."event_preset_template" ADD CONSTRAINT "event_preset_template_template_id_checklist_template_id_fk" FOREIGN KEY ("template_id") REFERENCES "app"."checklist_template"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."template_item" ADD CONSTRAINT "template_item_version_id_template_version_id_fk" FOREIGN KEY ("version_id") REFERENCES "app"."template_version"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."template_item" ADD CONSTRAINT "template_item_duty_role_id_duty_role_id_fk" FOREIGN KEY ("duty_role_id") REFERENCES "app"."duty_role"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."template_item" ADD CONSTRAINT "template_item_approver_duty_role_id_duty_role_id_fk" FOREIGN KEY ("approver_duty_role_id") REFERENCES "app"."duty_role"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."template_version" ADD CONSTRAINT "template_version_template_id_checklist_template_id_fk" FOREIGN KEY ("template_id") REFERENCES "app"."checklist_template"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."template_version" ADD CONSTRAINT "template_version_published_by_id_staff_member_id_fk" FOREIGN KEY ("published_by_id") REFERENCES "app"."staff_member"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "obligation_next_due_on_index" ON "app"."obligation" USING btree ("next_due_on");--> statement-breakpoint
CREATE INDEX "obligation_vehicle_id_index" ON "app"."obligation" USING btree ("vehicle_id");--> statement-breakpoint
CREATE INDEX "obligation_responsible_staff_member_id_index" ON "app"."obligation" USING btree ("responsible_staff_member_id");--> statement-breakpoint
CREATE INDEX "obligation_completion_obligation_id_done_on_index" ON "app"."obligation_completion" USING btree ("obligation_id","done_on");--> statement-breakpoint
CREATE INDEX "vehicle_issue_vehicle_id_status_index" ON "app"."vehicle_issue" USING btree ("vehicle_id","status");--> statement-breakpoint
CREATE INDEX "document_payable_id_index" ON "app"."document" USING btree ("payable_id");--> statement-breakpoint
CREATE INDEX "document_installment_id_index" ON "app"."document" USING btree ("installment_id");--> statement-breakpoint
CREATE INDEX "document_expense_id_index" ON "app"."document" USING btree ("expense_id");--> statement-breakpoint
CREATE INDEX "document_permit_id_index" ON "app"."document" USING btree ("permit_id");--> statement-breakpoint
CREATE INDEX "document_event_id_index" ON "app"."document" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "document_venue_id_index" ON "app"."document" USING btree ("venue_id");--> statement-breakpoint
CREATE INDEX "document_location_agreement_id_index" ON "app"."document" USING btree ("location_agreement_id");--> statement-breakpoint
CREATE INDEX "document_vehicle_id_index" ON "app"."document" USING btree ("vehicle_id");--> statement-breakpoint
CREATE INDEX "document_vehicle_issue_id_index" ON "app"."document" USING btree ("vehicle_issue_id");--> statement-breakpoint
CREATE INDEX "document_obligation_completion_id_index" ON "app"."document" USING btree ("obligation_completion_id");--> statement-breakpoint
CREATE INDEX "document_task_id_index" ON "app"."document" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "document_employment_contract_id_index" ON "app"."document" USING btree ("employment_contract_id");--> statement-breakpoint
CREATE INDEX "document_payroll_period_id_index" ON "app"."document" USING btree ("payroll_period_id");--> statement-breakpoint
CREATE INDEX "document_sha256_index" ON "app"."document" USING btree ("sha256");--> statement-breakpoint
CREATE INDEX "event_income_event_id_index" ON "app"."event_income" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "expense_spent_on_index" ON "app"."expense" USING btree ("spent_on");--> statement-breakpoint
CREATE INDEX "expense_event_id_index" ON "app"."expense" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "expense_vehicle_id_index" ON "app"."expense" USING btree ("vehicle_id");--> statement-breakpoint
CREATE INDEX "installment_due_on_status_index" ON "app"."installment" USING btree ("due_on","status");--> statement-breakpoint
CREATE INDEX "installment_status_index" ON "app"."installment" USING btree ("status");--> statement-breakpoint
CREATE INDEX "payable_event_id_index" ON "app"."payable" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "payable_venue_id_season_index" ON "app"."payable" USING btree ("venue_id","season");--> statement-breakpoint
CREATE INDEX "payable_vehicle_id_index" ON "app"."payable" USING btree ("vehicle_id");--> statement-breakpoint
CREATE INDEX "payable_permit_id_index" ON "app"."payable" USING btree ("permit_id");--> statement-breakpoint
CREATE INDEX "payable_counterparty_contact_id_index" ON "app"."payable" USING btree ("counterparty_contact_id");--> statement-breakpoint
CREATE INDEX "payable_category_index" ON "app"."payable" USING btree ("category");--> statement-breakpoint
CREATE INDEX "escalation_log_subject_type_subject_id_index" ON "app"."escalation_log" USING btree ("subject_type","subject_id");--> statement-breakpoint
CREATE INDEX "notification_recipient_staff_member_id_state_created_at_index" ON "app"."notification" USING btree ("recipient_staff_member_id","state","created_at");--> statement-breakpoint
CREATE INDEX "notification_subject_type_subject_id_index" ON "app"."notification" USING btree ("subject_type","subject_id");--> statement-breakpoint
CREATE INDEX "outbound_message_status_send_after_index" ON "app"."outbound_message" USING btree ("status","send_after");--> statement-breakpoint
CREATE INDEX "outbound_message_recipient_staff_member_id_index" ON "app"."outbound_message" USING btree ("recipient_staff_member_id");--> statement-breakpoint
CREATE INDEX "event_permit_permit_id_index" ON "app"."event_permit" USING btree ("permit_id");--> statement-breakpoint
CREATE INDEX "permit_venue_id_season_index" ON "app"."permit" USING btree ("venue_id","season");--> statement-breakpoint
CREATE INDEX "permit_requirement_id_index" ON "app"."permit" USING btree ("requirement_id");--> statement-breakpoint
CREATE INDEX "permit_status_apply_by_index" ON "app"."permit" USING btree ("status","apply_by");--> statement-breakpoint
CREATE INDEX "permit_responsible_staff_member_id_index" ON "app"."permit" USING btree ("responsible_staff_member_id");--> statement-breakpoint
CREATE INDEX "permit_valid_until_index" ON "app"."permit" USING btree ("valid_until");--> statement-breakpoint
CREATE INDEX "permit_requirement_venue_id_index" ON "app"."permit_requirement" USING btree ("venue_id");--> statement-breakpoint
CREATE INDEX "permit_requirement_event_type_id_index" ON "app"."permit_requirement" USING btree ("event_type_id");--> statement-breakpoint
CREATE INDEX "permit_requirement_authority_contact_id_index" ON "app"."permit_requirement" USING btree ("authority_contact_id");--> statement-breakpoint
CREATE INDEX "shift_staff_member_id_work_date_index" ON "app"."shift" USING btree ("staff_member_id","work_date");--> statement-breakpoint
CREATE INDEX "shift_event_id_index" ON "app"."shift" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "shift_work_date_status_index" ON "app"."shift" USING btree ("work_date","status");--> statement-breakpoint
CREATE INDEX "checklist_event_id_index" ON "app"."checklist" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "checklist_permit_id_index" ON "app"."checklist" USING btree ("permit_id");--> statement-breakpoint
CREATE INDEX "checklist_template_version_id_index" ON "app"."checklist" USING btree ("template_version_id");--> statement-breakpoint
CREATE INDEX "task_event_id_status_index" ON "app"."task" USING btree ("event_id","status");--> statement-breakpoint
CREATE INDEX "task_assignee_id_status_due_at_index" ON "app"."task" USING btree ("assignee_id","status","due_at");--> statement-breakpoint
CREATE INDEX "task_status_due_at_index" ON "app"."task" USING btree ("status","due_at");--> statement-breakpoint
CREATE INDEX "task_checklist_id_index" ON "app"."task" USING btree ("checklist_id");--> statement-breakpoint
CREATE INDEX "task_permit_id_index" ON "app"."task" USING btree ("permit_id");--> statement-breakpoint
CREATE INDEX "task_payable_id_index" ON "app"."task" USING btree ("payable_id");--> statement-breakpoint
CREATE INDEX "task_obligation_id_index" ON "app"."task" USING btree ("obligation_id");--> statement-breakpoint
CREATE INDEX "task_parent_task_id_index" ON "app"."task" USING btree ("parent_task_id");--> statement-breakpoint
CREATE INDEX "task_template_item_id_index" ON "app"."task" USING btree ("template_item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "task_checklist_stable_key" ON "app"."task" USING btree ("checklist_id","template_stable_key") WHERE "app"."task"."template_stable_key" is not null;--> statement-breakpoint
CREATE INDEX "task_check_item_task_id_sort_index" ON "app"."task_check_item" USING btree ("task_id","sort");--> statement-breakpoint
CREATE INDEX "task_comment_task_id_created_at_index" ON "app"."task_comment" USING btree ("task_id","created_at");--> statement-breakpoint
CREATE INDEX "task_dependency_depends_on_task_id_index" ON "app"."task_dependency" USING btree ("depends_on_task_id");--> statement-breakpoint
CREATE INDEX "task_watcher_staff_member_id_index" ON "app"."task_watcher" USING btree ("staff_member_id");--> statement-breakpoint
CREATE INDEX "checklist_template_event_type_id_index" ON "app"."checklist_template" USING btree ("event_type_id");--> statement-breakpoint
CREATE INDEX "checklist_template_kind_index" ON "app"."checklist_template" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "event_preset_template_template_id_index" ON "app"."event_preset_template" USING btree ("template_id");--> statement-breakpoint
CREATE INDEX "template_item_version_id_sort_index" ON "app"."template_item" USING btree ("version_id","sort");--> statement-breakpoint
CREATE INDEX "template_item_duty_role_id_index" ON "app"."template_item" USING btree ("duty_role_id");--> statement-breakpoint
CREATE UNIQUE INDEX "template_version_one_draft" ON "app"."template_version" USING btree ("template_id") WHERE "app"."template_version"."status" = 'draft';