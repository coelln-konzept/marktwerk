ALTER TABLE "app"."permit" ADD COLUMN "fee_paid_on" date;--> statement-breakpoint
ALTER TABLE "app"."permit" ADD COLUMN "fee_paid_by_staff_member_id" uuid;--> statement-breakpoint
ALTER TABLE "app"."permit" ADD CONSTRAINT "permit_fee_paid_by_staff_member_id_staff_member_id_fk" FOREIGN KEY ("fee_paid_by_staff_member_id") REFERENCES "app"."staff_member"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."permit" ADD CONSTRAINT "permit_fee_paid_by" CHECK ("app"."permit"."fee_paid_by_staff_member_id" is null or "app"."permit"."fee_paid_on" is not null);