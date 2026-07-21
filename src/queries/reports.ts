import { eq, gte, lt, lte, sql, and, inArray, notInArray, isNull, isNotNull } from "drizzle-orm";
import { db as defaultDb, type LedgrDb } from "@/db";
import {
  transactions,
  transactionSplits,
  categories,
  accounts,
  balanceHistory,
  recurringTransactions,
} from "@/db/schema";
import { scopedQuery } from "@/lib/scoped-query";
import { notDeleted, sumAbs } from "@/lib/query-helpers";
import { getIncomeCategoryIds, notIncome } from "@/queries/shared-conditions";
import { classifyAccountType } from "@/lib/account-utils";
import { resolvedCategoryLabel } from "@/lib/labels";
import {
  aggregateSpending,
  enrichSpendingMap,
} from "@/lib/spending-helpers";
import { getCurrentMonth, monthBounds } from "@/lib/date-utils";
import type { SankeyNode, SankeyLink } from "@/components/organisms/sankey-chart";

export interface ReportFilters {
  dateFrom: string;
  dateTo: string;
  accountIds?: string[];
  categoryIds?: string[];
}

export interface SpendingRow {
  categoryId: string | null;
  categoryName: string;
  groupName: string | null;
  groupId: string | null;
  categoryIcon: string | null;
  total: number;
  prevTotal: number;
}

export interface IncomeExpenseRow {
  period: string;
  income: number;
  expenses: number;
  net: number;
}

export interface CategoryTrendRow {
  period: string;
  categoryId: string;
  categoryName: string;
  total: number;
}

// ── Public query functions ──────────────────────────────────────────

export async function getSpendingByCategory(
  householdId: string,
  filters: ReportFilters,
  db: LedgrDb = defaultDb,
  comparisonPeriod?: { dateFrom: string; dateTo: string },
): Promise<SpendingRow[]> {
  const currentSpending = await aggregateSpending(householdId, filters, db);
  const enriched = await enrichSpendingMap(currentSpending, db);

  let prevMap = new Map<string, number>();
  if (comparisonPeriod) {
    prevMap = await aggregateSpending(householdId, { ...filters, ...comparisonPeriod }, db);
  }

  return enriched.map((row) => ({
    categoryId: row.id,
    categoryName: row.name,
    groupName: row.groupName,
    groupId: row.groupId,
    categoryIcon: row.categoryIcon,
    total: row.value,
    prevTotal: prevMap.get(row.id ?? "uncategorized") ?? 0,
  }));
}

export async function getIncomeVsExpense(
  householdId: string,
  filters: ReportFilters,
  db: LedgrDb = defaultDb,
): Promise<IncomeExpenseRow[]> {
  const scoped = scopedQuery(householdId, db);

  const conditions = [
    notDeleted(transactions),
    eq(transactions.pending, false),
    eq(transactions.isTransfer, false),
    isNull(transactions.transferPairId),
    gte(transactions.date, filters.dateFrom),
    lte(transactions.date, filters.dateTo),
  ];

  if (filters.accountIds?.length) {
    conditions.push(inArray(transactions.accountId, filters.accountIds));
  }
  if (filters.categoryIds?.length) {
    conditions.push(inArray(transactions.categoryId, filters.categoryIds));
  }

  const incomeCatIds = [...(await getIncomeCategoryIds(db))];

  // Income sums the raw (signed) amount of income-category txns; expenses sum
  // the absolute value of everything else. An uncategorized row (no
  // categoryId) falls back to its sign: a positive normalizedAmount (credit)
  // counts as income rather than defaulting to expense.
  const inIncomeCat =
    incomeCatIds.length > 0
      ? inArray(transactions.categoryId, incomeCatIds)
      : sql`false`;
  const isIncome = sql`(
    COALESCE(${inIncomeCat}, false)
    OR (${transactions.categoryId} IS NULL AND ${transactions.normalizedAmount} > 0)
  )`;
  const monthExpr = sql<string>`substring(${transactions.date}, 1, 7)`;

  const rows = await db
    .select({
      period: monthExpr,
      income: sql<number>`COALESCE(SUM(CASE WHEN ${isIncome} THEN ${transactions.normalizedAmount} ELSE 0 END), 0)`.mapWith(Number),
      expenses: sql<number>`COALESCE(SUM(CASE WHEN NOT (${isIncome}) THEN ABS(${transactions.normalizedAmount}) ELSE 0 END), 0)`.mapWith(Number),
    })
    .from(transactions)
    .where(scoped.where(transactions, ...conditions))
    .groupBy(monthExpr)
    .orderBy(monthExpr);

  return rows.map(({ period, income, expenses }) => ({
    period,
    income,
    expenses,
    net: income - expenses,
  }));
}

export async function getCategoryTrends(
  householdId: string,
  filters: ReportFilters,
  db: LedgrDb = defaultDb,
): Promise<CategoryTrendRow[]> {
  const scoped = scopedQuery(householdId, db);
  const conditions = [
    notDeleted(transactions),
    lt(transactions.normalizedAmount, 0),
    eq(transactions.pending, false),
    eq(transactions.isTransfer, false),
    isNull(transactions.transferPairId),
    gte(transactions.date, filters.dateFrom),
    lte(transactions.date, filters.dateTo),
    await notIncome(db),
  ];
  if (filters.accountIds?.length) {
    conditions.push(inArray(transactions.accountId, filters.accountIds));
  }
  if (filters.categoryIds?.length) {
    conditions.push(inArray(transactions.categoryId, filters.categoryIds));
  }

  const splitParentRows = await db
    .select({ transactionId: transactionSplits.transactionId })
    .from(transactionSplits)
    .innerJoin(transactions, eq(transactionSplits.transactionId, transactions.id))
    .where(scoped.where(transactions, ...conditions))
    .groupBy(transactionSplits.transactionId);
  const splitParentIds = splitParentRows.map((r) => r.transactionId);

  const nonSplitConditions =
    splitParentIds.length > 0
      ? [...conditions, notInArray(transactions.id, splitParentIds)]
      : conditions;

  const nonSplitRows = await db
    .select({
      month: sql<string>`substring(${transactions.date} from 1 for 7)`,
      categoryId: transactions.categoryId,
      total: sumAbs(transactions.normalizedAmount),
    })
    .from(transactions)
    .where(scoped.where(transactions, ...nonSplitConditions))
    .groupBy(sql`substring(${transactions.date} from 1 for 7)`, transactions.categoryId);

  const trendMap = new Map<string, number>(); // "YYYY-MM|catId" -> total

  for (const row of nonSplitRows) {
    if (!row.categoryId) continue;
    const key = `${row.month}|${row.categoryId}`;
    trendMap.set(key, (trendMap.get(key) ?? 0) + row.total);
  }

  // Split transactions: need date from parent
  if (splitParentIds.length > 0) {
    const parentDates = await db
      .select({ id: transactions.id, date: transactions.date })
      .from(transactions)
      .where(inArray(transactions.id, splitParentIds));

    const dateMap = new Map(parentDates.map((p) => [p.id, p.date.slice(0, 7)]));

    const splitRows = await db
      .select({
        transactionId: transactionSplits.transactionId,
        categoryId: transactionSplits.categoryId,
        amount: transactionSplits.amount,
      })
      .from(transactionSplits)
      .where(inArray(transactionSplits.transactionId, splitParentIds));

    for (const row of splitRows) {
      const month = dateMap.get(row.transactionId);
      if (!month) continue;
      if (filters.categoryIds?.length && !filters.categoryIds.includes(row.categoryId)) continue;
      const key = `${month}|${row.categoryId}`;
      trendMap.set(key, (trendMap.get(key) ?? 0) + row.amount);
    }
  }

  // Resolve category names
  const allCatIds = [...new Set([...trendMap.keys()].map((k) => k.split("|")[1]))];
  const catNames = new Map<string, string>();
  if (allCatIds.length > 0) {
    const cats = await db
      .select({ id: categories.id, name: categories.name })
      .from(categories)
      .where(inArray(categories.id, allCatIds));
    for (const c of cats) catNames.set(c.id, c.name);
  }

  const result: CategoryTrendRow[] = [];
  for (const [key, total] of trendMap.entries()) {
    const [period, categoryId] = key.split("|");
    result.push({
      period,
      categoryId,
      categoryName: resolvedCategoryLabel(catNames.get(categoryId)),
      total,
    });
  }

  return result.sort((a, b) => a.period.localeCompare(b.period) || b.total - a.total);
}

export interface IncomeExpenseCategoryRow {
  categoryId: string;
  categoryName: string;
  categoryIcon: string | null;
  isIncome: boolean;
  total: number;
  monthlyAverage: number;
  percentOfTotal: number;
}

export async function getIncomeExpenseByCategory(
  householdId: string,
  filters: ReportFilters,
  db: LedgrDb = defaultDb,
): Promise<IncomeExpenseCategoryRow[]> {
  const scoped = scopedQuery(householdId, db);
  const incomeCatIds = await getIncomeCategoryIds(db);

  const conditions = [
    notDeleted(transactions),
    eq(transactions.pending, false),
    eq(transactions.isTransfer, false),
    isNull(transactions.transferPairId),
    gte(transactions.date, filters.dateFrom),
    lte(transactions.date, filters.dateTo),
  ];

  if (filters.accountIds?.length) {
    conditions.push(inArray(transactions.accountId, filters.accountIds));
  }
  if (filters.categoryIds?.length) {
    conditions.push(inArray(transactions.categoryId, filters.categoryIds));
  }

  // Distinct-month divisor over ALL matching txns (including null-category ones,
  // which produce no output row but still count toward the month span). Matches
  // the prior `new Set(txns.map(...date.slice(0,7)))` over the full result set.
  const monthExpr = sql<string>`substring(${transactions.date}, 1, 7)`;
  const [monthRow] = await db
    .select({
      count: sql<number>`COUNT(DISTINCT ${monthExpr})`.mapWith(Number),
    })
    .from(transactions)
    .where(scoped.where(transactions, ...conditions));
  const monthCount = Math.max(monthRow?.count ?? 0, 1);

  // Per-category totals: income categories sum ABS(amount), everything else sums
  // the raw signed amount — pushed into SQL via SUM(CASE ...). Null-category rows
  // are excluded from the grouping (they never produced a row in the JS version).
  const isIncome =
    incomeCatIds.size > 0
      ? sql`COALESCE(${inArray(transactions.categoryId, [...incomeCatIds])}, false)`
      : sql`false`;

  const catRows = await db
    .select({
      categoryId: transactions.categoryId,
      categoryName: categories.name,
      categoryIcon: categories.icon,
      total: sql<number>`COALESCE(SUM(CASE WHEN ${isIncome} THEN ABS(${transactions.normalizedAmount}) ELSE ${transactions.normalizedAmount} END), 0)`.mapWith(Number),
    })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(scoped.where(transactions, ...conditions, isNotNull(transactions.categoryId)))
    .groupBy(transactions.categoryId, categories.name, categories.icon);

  let totalIncome = 0;
  let totalExpenses = 0;
  for (const row of catRows) {
    if (incomeCatIds.has(row.categoryId!)) totalIncome += row.total;
    else totalExpenses += row.total;
  }

  const result: IncomeExpenseCategoryRow[] = catRows.map((row) => {
    const rowIsIncome = incomeCatIds.has(row.categoryId!);
    const denominator = rowIsIncome ? totalIncome : totalExpenses;
    return {
      categoryId: row.categoryId!,
      categoryName: resolvedCategoryLabel(row.categoryName),
      categoryIcon: row.categoryIcon,
      isIncome: rowIsIncome,
      total: row.total,
      monthlyAverage: Math.round(row.total / monthCount),
      // A category total and its pool total share the same sign, so the ratio is
      // a positive share. Guard only against divide-by-zero — an empty (0) pool.
      percentOfTotal: denominator !== 0 ? (row.total / denominator) * 100 : 0,
    };
  });

  return result.sort((a, b) => b.total - a.total);
}

export async function getReportNetWorthHistory(
  householdId: string,
  filters: ReportFilters,
  db: LedgrDb = defaultDb,
): Promise<{ date: string; assets: number; liabilities: number; netWorth: number }[]> {
  const scoped = scopedQuery(householdId, db);

  const allAccountRows = await db
    .select({ id: accounts.id, type: accounts.type, isHidden: accounts.isHidden })
    .from(accounts)
    .where(scoped.where(accounts, notDeleted(accounts)));
  const allAccounts = allAccountRows.filter((a) => !a.isHidden);

  const accountTypeMap = new Map(allAccounts.map((a) => [a.id, a.type]));

  let filteredAccountIds = allAccounts.map((a) => a.id);
  if (filters.accountIds?.length) {
    filteredAccountIds = filteredAccountIds.filter((id) => filters.accountIds!.includes(id));
  }

  if (filteredAccountIds.length === 0) return [];

  // Partition the in-scope accounts by type once, then sum each side in SQL via
  // SUM(CASE WHEN account_id IN (...)) grouped by date. Every filtered id is
  // classified as exactly one of asset/liability (classifyAccountType defaults
  // unknown types to asset), so the two lists together cover the whole set.
  const assetIds = filteredAccountIds.filter(
    (id) => classifyAccountType(accountTypeMap.get(id) ?? "other") === "asset",
  );
  const liabilityIds = filteredAccountIds.filter(
    (id) => classifyAccountType(accountTypeMap.get(id) ?? "other") === "liability",
  );

  const inAssets = assetIds.length > 0 ? inArray(balanceHistory.accountId, assetIds) : sql`false`;
  const inLiabilities =
    liabilityIds.length > 0 ? inArray(balanceHistory.accountId, liabilityIds) : sql`false`;

  const rows = await db
    .select({
      date: balanceHistory.date,
      assets: sql<number>`COALESCE(SUM(CASE WHEN ${inAssets} THEN ${balanceHistory.balance} ELSE 0 END), 0)`.mapWith(Number),
      liabilities: sql<number>`COALESCE(SUM(CASE WHEN ${inLiabilities} THEN ${balanceHistory.balance} ELSE 0 END), 0)`.mapWith(Number),
    })
    .from(balanceHistory)
    .where(
      and(
        inArray(balanceHistory.accountId, filteredAccountIds),
        gte(balanceHistory.date, filters.dateFrom),
        lte(balanceHistory.date, filters.dateTo),
      ),
    )
    .groupBy(balanceHistory.date)
    .orderBy(balanceHistory.date);

  return rows.map(({ date, assets, liabilities }) => ({
    date,
    assets,
    liabilities,
    netWorth: assets - liabilities,
  }));
}

export async function getCashFlowSankey(
  householdId: string,
  filters: ReportFilters,
  db: LedgrDb = defaultDb,
): Promise<{ nodes: SankeyNode[]; links: SankeyLink[] }> {
  const scoped = scopedQuery(householdId, db);
  const incomeCatIds = await getIncomeCategoryIds(db);

  const conditions = [
    notDeleted(transactions),
    eq(transactions.pending, false),
    eq(transactions.isTransfer, false),
    isNull(transactions.transferPairId),
    gte(transactions.date, filters.dateFrom),
    lte(transactions.date, filters.dateTo),
  ];

  if (filters.accountIds?.length) {
    conditions.push(inArray(transactions.accountId, filters.accountIds));
  }

  const incomeMap = new Map<string, { name: string; total: number }>();
  const expenseMap = new Map<string, { name: string; total: number }>();

  // Income side: income-category txns, SUM(ABS(amount)) grouped by category.
  if (incomeCatIds.size > 0) {
    const incomeRows = await db
      .select({
        categoryId: transactions.categoryId,
        categoryName: categories.name,
        total: sumAbs(transactions.normalizedAmount),
      })
      .from(transactions)
      .leftJoin(categories, eq(transactions.categoryId, categories.id))
      .where(scoped.where(transactions, ...conditions, inArray(transactions.categoryId, [...incomeCatIds])))
      .groupBy(transactions.categoryId, categories.name);

    for (const row of incomeRows) {
      incomeMap.set(row.categoryId!, { name: resolvedCategoryLabel(row.categoryName), total: row.total });
    }
  }

  // Expense side: non-income categories with a NEGATIVE normalizedAmount, summed
  // as ABS — matching the codebase's expense convention (getCashFlow, etc.).
  // Null categories are excluded.
  const expenseConditions = [
    ...conditions,
    isNotNull(transactions.categoryId),
    sql`${transactions.normalizedAmount} < 0`,
  ];
  if (incomeCatIds.size > 0) {
    expenseConditions.push(notInArray(transactions.categoryId, [...incomeCatIds]));
  }
  const expenseRows = await db
    .select({
      categoryId: transactions.categoryId,
      categoryName: categories.name,
      total: sumAbs(transactions.normalizedAmount),
    })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(scoped.where(transactions, ...expenseConditions))
    .groupBy(transactions.categoryId, categories.name);

  for (const row of expenseRows) {
    expenseMap.set(row.categoryId!, { name: resolvedCategoryLabel(row.categoryName), total: row.total });
  }

  const totalIncome = [...incomeMap.values()].reduce((s, v) => s + v.total, 0);
  const totalExpenses = [...expenseMap.values()].reduce((s, v) => s + v.total, 0);

  const nodes: SankeyNode[] = [];
  for (const [id, data] of incomeMap) {
    nodes.push({ id: `income-${id}`, name: data.name, type: "income" });
  }
  for (const [id, data] of expenseMap) {
    nodes.push({ id: `expense-${id}`, name: data.name, type: "expense" });
  }

  const surplus = totalIncome - totalExpenses;
  if (surplus > 0) {
    nodes.push({ id: "savings", name: "Savings", type: "savings" });
  }

  const links: SankeyLink[] = [];
  for (const [incomeId, incomeData] of incomeMap) {
    const incomeShare = totalIncome > 0 ? incomeData.total / totalIncome : 0;
    for (const [expenseId, expenseData] of expenseMap) {
      const linkValue = Math.round(expenseData.total * incomeShare);
      if (linkValue > 0) {
        links.push({
          source: `income-${incomeId}`,
          target: `expense-${expenseId}`,
          value: linkValue,
        });
      }
    }
    if (surplus > 0) {
      const savingsValue = Math.round(surplus * incomeShare);
      if (savingsValue > 0) {
        links.push({
          source: `income-${incomeId}`,
          target: "savings",
          value: savingsValue,
        });
      }
    }
  }

  return { nodes, links };
}

export interface SafeToSpendResult {
  monthlyIncome: number;
  recurringExpenses: number;
  discretionarySpent: number;
  safeToSpend: number;
}

export async function getSafeToSpend(
  householdId: string,
  db: LedgrDb = defaultDb,
): Promise<SafeToSpendResult> {
  const scoped = scopedQuery(householdId, db);
  const incomeCatIds = await getIncomeCategoryIds(db);
  const { from: dateFrom, to: dateTo } = monthBounds(getCurrentMonth());

  // Monthly income (including pending — so paycheck shows immediately)
  const incomeTxns = await db
    .select({ normalizedAmount: transactions.normalizedAmount })
    .from(transactions)
    .where(
      scoped.where(
        transactions,
        notDeleted(transactions),
        gte(transactions.date, dateFrom),
        lte(transactions.date, dateTo),
        eq(transactions.isTransfer, false),
        isNull(transactions.transferPairId),
        incomeCatIds.size > 0
          ? inArray(transactions.categoryId, [...incomeCatIds])
          : sql`0`,
      ),
    );

  const monthlyIncome = incomeTxns.reduce((s, t) => s + Math.abs(t.normalizedAmount), 0);

  // Recurring expenses: use actual posted amounts when available, projected otherwise
  const activeRecurring = await db
    .select({
      id: recurringTransactions.id,
      averageAmount: recurringTransactions.averageAmount,
      lastAmount: recurringTransactions.lastAmount,
    })
    .from(recurringTransactions)
    .where(
      scoped.where(
        recurringTransactions,
        eq(recurringTransactions.isActive, true),
        eq(recurringTransactions.isIncome, false),
      ),
    );

  // Find which recurring transactions already posted this month
  const recurringIds = activeRecurring.map((r) => r.id);
  const postedRecurring = recurringIds.length > 0
    ? await db
        .select({
          recurringTransactionId: transactions.recurringTransactionId,
          total: sumAbs(transactions.normalizedAmount),
        })
        .from(transactions)
        .where(
          scoped.where(
            transactions,
            notDeleted(transactions),
            gte(transactions.date, dateFrom),
            lte(transactions.date, dateTo),
            inArray(transactions.recurringTransactionId, recurringIds),
          ),
        )
        .groupBy(transactions.recurringTransactionId)
    : [];

  const postedMap = new Map(
    postedRecurring.map((r) => [r.recurringTransactionId, r.total]),
  );

  let recurringExpenses = 0;
  for (const rec of activeRecurring) {
    const posted = postedMap.get(rec.id);
    if (posted !== undefined) {
      recurringExpenses += posted;
    } else {
      recurringExpenses += rec.averageAmount ?? rec.lastAmount ?? 0;
    }
  }

  // Discretionary spending: non-recurring expenses this month
  const notIncomeCondition = await notIncome(db);
  const discretionaryTxns = await db
    .select({ normalizedAmount: transactions.normalizedAmount })
    .from(transactions)
    .where(
      scoped.where(
        transactions,
        notDeleted(transactions),
        gte(transactions.date, dateFrom),
        lte(transactions.date, dateTo),
        eq(transactions.pending, false),
        eq(transactions.isTransfer, false),
        isNull(transactions.transferPairId),
        isNull(transactions.recurringTransactionId),
        sql`${transactions.normalizedAmount} > 0`,
        notIncomeCondition,
      ),
    );

  const discretionarySpent = discretionaryTxns.reduce((s, t) => s + t.normalizedAmount, 0);

  return {
    monthlyIncome,
    recurringExpenses,
    discretionarySpent,
    safeToSpend: monthlyIncome - recurringExpenses - discretionarySpent,
  };
}
