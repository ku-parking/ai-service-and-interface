CREATE TABLE "coor_ability" (
	"id" serial PRIMARY KEY NOT NULL,
	"parking_spot_id" integer NOT NULL,
	"x1" real NOT NULL,
	"y1" real NOT NULL,
	"x2" real NOT NULL,
	"y2" real NOT NULL
);
--> statement-breakpoint
CREATE TABLE "parking_spot" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"total_ability" integer NOT NULL,
	"image_url" text
);
--> statement-breakpoint
ALTER TABLE "coor_ability" ADD CONSTRAINT "coor_ability_parking_spot_id_parking_spot_id_fk" FOREIGN KEY ("parking_spot_id") REFERENCES "public"."parking_spot"("id") ON DELETE no action ON UPDATE no action;