ALTER TABLE "app"."notification" ALTER COLUMN "recipient_staff_member_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "app"."template_item" ADD COLUMN "permit_type" "app"."permit_type";--> statement-breakpoint
CREATE UNIQUE INDEX "notification_company_dedupe" ON "app"."notification" USING btree ("dedupe_key") WHERE "app"."notification"."recipient_staff_member_id" is null;