import { sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const households = sqliteTable("households", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  createdAt: text("created_at").default(sql`(CURRENT_TIMESTAMP)`).notNull(),
  updatedAt: text("updated_at").default(sql`(CURRENT_TIMESTAMP)`).notNull(),
});

export const householdMembers = sqliteTable(
  "household_members",
  {
    id: text("id").primaryKey(),
    householdId: text("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    role: text("role", { enum: ["owner", "member", "advisor"] }).notNull(),
    createdAt: text("created_at").default(sql`(CURRENT_TIMESTAMP)`).notNull(),
  },
  (table) => [
    uniqueIndex("uq_household_user").on(table.householdId, table.userId),
  ]
);

export const userSettings = sqliteTable("user_settings", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  theme: text("theme").default("system"),
  currency: text("currency").default("USD"),
  aiProvider: text("ai_provider", {
    enum: ["openai", "anthropic", "google"],
  }),
  aiModel: text("ai_model"),
  aiApiKey: text("ai_api_key"),
  dashboardLayout: text("dashboard_layout"),
  createdAt: text("created_at").default(sql`(CURRENT_TIMESTAMP)`).notNull(),
  updatedAt: text("updated_at").default(sql`(CURRENT_TIMESTAMP)`).notNull(),
});
