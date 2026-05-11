import { desc } from "drizzle-orm";
import { db as defaultDb, type LedgrDb } from "@/db";
import { savedReports } from "@/db/schema";
import { scopedQuery } from "@/lib/scoped-query";

export function getSavedReportsByHousehold(
  householdId: string,
  db: LedgrDb = defaultDb,
) {
  const scoped = scopedQuery(householdId, db);
  return db
    .select()
    .from(savedReports)
    .where(scoped.where(savedReports))
    .orderBy(desc(savedReports.updatedAt))
    .all();
}
