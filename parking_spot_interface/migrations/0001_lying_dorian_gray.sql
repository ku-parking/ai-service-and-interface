ALTER TABLE "parking_spot" ADD COLUMN "created_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "parking_spot" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "parking_spot" ADD COLUMN "lat" real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "parking_spot" ADD COLUMN "long" real DEFAULT 0 NOT NULL;