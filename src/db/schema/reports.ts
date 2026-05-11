import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { households } from "./households";

export const savedReports = pgTable(
  "saved_reports",
  {
    id: text("id").primaryKey(),
    householdId: text("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    reportType: text("report_type").notNull(),
    filters: text("filters").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_saved_reports_household").on(table.householdId),
  ]
);
