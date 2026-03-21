import { integer, serial, text, pgTable, real, timestamp } from "drizzle-orm/pg-core";

export const parkingSpot = pgTable("parking_spot", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  totalAbility: integer("total_ability").notNull(),
  imageUrl: text("image_url"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  lat: real("lat").notNull().default(0),
  long: real("long").notNull().default(0),
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

export const issueReport = pgTable("issue_report", {
  id: serial("id").primaryKey(),
  parkingSpotId: integer("parking_spot_id")
    .notNull()
    .references(() => parkingSpot.id),
  reason: text("reason"),
  notes: text("notes"),
  status: text("status").notNull().default("open"),
  source: text("source").notNull().default("mobile"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
