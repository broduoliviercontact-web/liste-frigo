import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const shoppingLists = sqliteTable("shopping_lists", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
});

export const shoppingItems = sqliteTable("shopping_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  listId: integer("list_id").notNull().references(() => shoppingLists.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  checked: integer("checked", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
});

export const mealPlans = sqliteTable("meal_plans", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  date: text("date").notNull(),
  moment: text("moment").notNull().$type<"midi" | "soir">(),
  label: text("label").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
}, (table) => [
  uniqueIndex("meal_plans_date_moment_unique").on(table.date, table.moment),
  index("meal_plans_date_idx").on(table.date),
]);

export const agendaEvents = sqliteTable("agenda_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  date: text("date").notNull(),
  time: text("time"),
  title: text("title").notNull(),
  category: text("category").notNull().default("famille"),
  durationMinutes: integer("duration_minutes"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
}, (table) => [
  index("agenda_events_date_idx").on(table.date),
  index("agenda_events_date_time_idx").on(table.date, table.time),
]);

export const appSettings = sqliteTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const transitSnapshots = sqliteTable("transit_snapshots", {
  cacheKey: text("cache_key").primaryKey(),
  updatedAt: text("updated_at").notNull(),
  checkedAt: integer("checked_at").notNull(),
  payload: text("payload").notNull(),
});

export const listMutations = sqliteTable("list_mutations", {
  id: text("id").primaryKey(),
  requestHash: text("request_hash"),
  completed: integer("completed", { mode: "boolean" }).notNull().default(false),
  outcome: text("outcome").notNull().default("applied"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }),
});

// Shared across Workers; one bounded bucket for this family dashboard.
export const accessAttempts = sqliteTable("access_attempts", {
  key: text("key").primaryKey(),
  windowStart: integer("window_start").notNull(),
  count: integer("count").notNull(),
});

export const accessSessions = sqliteTable("access_sessions", {
  tokenHash: text("token_hash").primaryKey(),
  expiresAt: integer("expires_at").notNull(),
}, (table) => [index("access_sessions_expiry_idx").on(table.expiresAt)]);
