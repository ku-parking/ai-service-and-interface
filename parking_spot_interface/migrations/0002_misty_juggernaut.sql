CREATE TABLE "issue_report" (
	"id" serial PRIMARY KEY NOT NULL,
	"parking_spot_id" integer NOT NULL,
	"reason" text,
	"notes" text,
	"status" text DEFAULT 'open' NOT NULL,
	"source" text DEFAULT 'mobile' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "issue_report" ADD CONSTRAINT "issue_report_parking_spot_id_parking_spot_id_fk" FOREIGN KEY ("parking_spot_id") REFERENCES "public"."parking_spot"("id") ON DELETE no action ON UPDATE no action;