import { pgTable, text, boolean, timestamp } from "drizzle-orm/pg-core";

export const userSettings = pgTable("user_settings", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  theme: text("theme").default("system"),
  currency: text("currency").default("USD"),
  mcpEnabled: boolean("mcp_enabled").notNull().default(false),
  dashboardLayout: text("dashboard_layout"),
  demoMode: boolean("demo_mode").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
