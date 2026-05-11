"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { v4 as uuid } from "uuid";
import { db as defaultDb, type LedgrDb } from "@/db";
import { savedReports } from "@/db/schema";
import { scopedQuery } from "@/lib/scoped-query";
import { nowISO } from "@/lib/date-utils";
import { getHouseholdId, getSession } from "@/lib/auth/session";
import { guardDemoMode } from "@/lib/demo-mode";
import { getTransactions, type TransactionRow } from "@/queries/transactions";

const saveReportSchema = z.object({
  name: z.string().min(1).max(100),
  reportType: z.enum(["spending", "income-expense", "trends", "net-worth", "cash-flow"]),
  filters: z.object({
    dateFrom: z.string(),
    dateTo: z.string(),
    accountIds: z.array(z.string()).optional(),
    categoryIds: z.array(z.string()).optional(),
  }),
});

export async function saveReport(
  input: z.infer<typeof saveReportSchema>,
  db: LedgrDb = defaultDb,
): Promise<{ success: true; id: string } | { error: string }> {
  const parsed = saveReportSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Invalid input" };
  }

  const householdId = await getHouseholdId();
  const session = await getSession();
  const blocked = guardDemoMode(session!.user.id);
  if (blocked) return blocked;

  const id = uuid();
  const now = nowISO();

  db.insert(savedReports)
    .values({
      id,
      householdId,
      name: parsed.data.name,
      reportType: parsed.data.reportType,
      filters: JSON.stringify(parsed.data.filters),
      createdAt: now,
      updatedAt: now,
    })
    .run();

  revalidatePath("/reports");
  return { success: true, id };
}

export async function deleteReport(
  reportId: string,
  db: LedgrDb = defaultDb,
): Promise<{ success: true } | { error: string }> {
  const parsed = z.string().min(1).safeParse(reportId);
  if (!parsed.success) {
    return { error: "Invalid report ID" };
  }

  const householdId = await getHouseholdId();
  const session = await getSession();
  const blocked = guardDemoMode(session!.user.id);
  if (blocked) return blocked;

  const scoped = scopedQuery(householdId, db);

  const result = db
    .delete(savedReports)
    .where(scoped.where(savedReports, eq(savedReports.id, reportId)))
    .run();

  if (result.changes === 0) {
    return { error: "Report not found" };
  }

  revalidatePath("/reports");
  return { success: true };
}

const DRILL_DOWN_LIMIT = 50;

export async function getDrillDownTransactions(filters: {
  categoryId?: string;
  dateFrom: string;
  dateTo: string;
  type?: "income" | "expense";
}): Promise<{ rows: TransactionRow[]; hasMore: boolean }> {
  const householdId = await getHouseholdId();

  const page = getTransactions(householdId, {
    categoryId: filters.categoryId ?? undefined,
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
  }, DRILL_DOWN_LIMIT);

  return { rows: page.rows, hasMore: page.nextCursor !== null };
}
