import { integer, serial, text, pgTable, real } from "drizzle-orm/pg-core";

export const parkingSpot = pgTable("parking_spot", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  totalAbility: integer("total_ability").notNull(),
  imageUrl: text("image_url"),
});

export const coorAbility = pgTable("coor_ability", {
  id: serial("id").primaryKey(),
  parkingSpotId: integer("parking_spot_id")
    .notNull()
    .references(() => parkingSpot.id),
  x1: real("x1").notNull(),
  y1: real("y1").notNull(),
  x2: real("x2").notNull(),
  y2: real("y2").notNull(),
});
