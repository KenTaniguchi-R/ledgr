import { eq, asc, like, or } from "drizzle-orm";
import { db as defaultDb, type LedgrDb } from "@/db";
import { recurringTransactions, merchants, categories } from "@/db/schema";
import { scopedQuery } from "@/lib/scoped-query";
import { deriveBillStatus, relativeDateLabel, type BillStatus } from "@/lib/date-utils";

export interface BillRow {
  id: string;
  name: string;
  merchantName: string | null;
  categoryName: string | null;
  categoryIcon: string | null;
  averageAmount: number | null;
  lastAmount: number | null;
  frequency: string | null;
  nextDate: string | null;
  lastDate: string | null;
  isIncome: boolean;
  status: BillStatus;
  relativeDateLabel: string | null;
}

export function getUpcomingBills(
  householdId: string,
  opts: { search?: string; limit?: number } = {},
  db: LedgrDb = defaultDb,
): BillRow[] {
  const scoped = scopedQuery(householdId, db);

  const conditions = [
    eq(recurringTransactions.isActive, true),
    eq(recurringTransactions.isIncome, false),
  ];

  if (opts.search) {
    const pattern = `%${opts.search}%`;
    conditions.push(
      or(
        like(recurringTransactions.name, pattern),
      )!,
    );
  }

  let query = db
    .select({
      id: recurringTransactions.id,
      name: recurringTransactions.name,
      merchantName: merchants.name,
      categoryName: categories.name,
      categoryIcon: categories.icon,
      averageAmount: recurringTransactions.averageAmount,
      lastAmount: recurringTransactions.lastAmount,
      frequency: recurringTransactions.frequency,
      nextDate: recurringTransactions.nextDate,
      lastDate: recurringTransactions.lastDate,
      isIncome: recurringTransactions.isIncome,
      isActive: recurringTransactions.isActive,
    })
    .from(recurringTransactions)
    .leftJoin(merchants, eq(recurringTransactions.merchantId, merchants.id))
    .leftJoin(categories, eq(recurringTransactions.categoryId, categories.id))
    .where(scoped.where(recurringTransactions, ...conditions))
    .orderBy(asc(recurringTransactions.nextDate))
    .all();

  if (opts.limit) {
    query = query.slice(0, opts.limit);
  }

  return query.map((row) => ({
    id: row.id,
    name: row.name,
    merchantName: row.merchantName,
    categoryName: row.categoryName,
    categoryIcon: row.categoryIcon,
    averageAmount: row.averageAmount ? Math.abs(row.averageAmount) : null,
    lastAmount: row.lastAmount ? Math.abs(row.lastAmount) : null,
    frequency: row.frequency,
    nextDate: row.nextDate,
    lastDate: row.lastDate,
    isIncome: Boolean(row.isIncome),
    status: deriveBillStatus(row.nextDate, Boolean(row.isActive)),
    relativeDateLabel: row.nextDate ? relativeDateLabel(row.nextDate) : null,
  }));
}

const MONTHLY_MULTIPLIER: Record<string, number> = {
  weekly: 52 / 12,
  biweekly: 26 / 12,
  semimonthly: 2,
  monthly: 1,
  yearly: 1 / 12,
};

export function getRecurringSummary(
  householdId: string,
  db: LedgrDb = defaultDb,
): { monthlyIncome: number; monthlyExpenses: number } {
  const scoped = scopedQuery(householdId, db);

  const rows = db
    .select({
      averageAmount: recurringTransactions.averageAmount,
      frequency: recurringTransactions.frequency,
      isIncome: recurringTransactions.isIncome,
    })
    .from(recurringTransactions)
    .where(
      scoped.where(recurringTransactions, eq(recurringTransactions.isActive, true)),
    )
    .all();

  let monthlyIncome = 0;
  let monthlyExpenses = 0;

  for (const row of rows) {
    if (!row.averageAmount || !row.frequency) continue;
    const multiplier = MONTHLY_MULTIPLIER[row.frequency] ?? 1;
    const monthly = Math.round(Math.abs(row.averageAmount) * multiplier);
    if (row.isIncome) {
      monthlyIncome += monthly;
    } else {
      monthlyExpenses += monthly;
    }
  }

  return { monthlyIncome, monthlyExpenses };
}
