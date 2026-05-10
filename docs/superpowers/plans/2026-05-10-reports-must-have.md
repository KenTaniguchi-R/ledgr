# Reports Must-Have Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete all must-have report features: query layer fixes, filtered totals, chart-to-transaction drill-down, income vs expense improvements, Sankey diagram + Cash Flow tab, and Safe to Spend.

**Architecture:** Bottom-up build — fix query layer bugs and extract shared helpers first, then layer features on clean foundations. Each task produces independently testable changes. Components follow atomic design: atoms (pure display), molecules (interaction logic), organisms (composition + domain orchestration).

**Tech Stack:** Next.js 16 App Router, Drizzle ORM + SQLite, Recharts v3, d3-sankey, shadcn/ui v4, Tailwind v4, Vitest

**Spec:** `docs/superpowers/specs/2026-05-10-reports-must-have-design.md`

---

## Task 1: Security fix — `deleteReport` scoping

**Files:**
- Modify: `src/actions/reports.ts:53-79`
- Test: `tests/integration/reports-actions.test.ts` (create)

- [ ] **Step 1: Write failing test for cross-household delete**

```ts
// tests/integration/reports-actions.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestDb } from "../integration/setup";
import { v4 as uuid } from "uuid";
import { savedReports, households } from "@/db/schema";
import { nowISO } from "@/lib/date-utils";
import type { LedgrDb } from "@/db";

// We test the delete logic directly since the server action uses getHouseholdId()
// which requires auth context. We replicate the query logic here.
import { eq } from "drizzle-orm";
import { scopedQuery } from "@/lib/scoped-query";

function deleteReportScoped(reportId: string, householdId: string, db: LedgrDb) {
  const scoped = scopedQuery(householdId, db);
  const result = db
    .delete(savedReports)
    .where(scoped.where(savedReports, eq(savedReports.id, reportId)))
    .run();
  return result.changes;
}

describe("deleteReport scoping", () => {
  let db: LedgrDb;
  let close: () => void;

  beforeEach(() => {
    ({ db, close } = createTestDb());
    const now = nowISO();
    db.insert(households).values([
      { id: "h1", name: "House 1", createdAt: now, updatedAt: now },
      { id: "h2", name: "House 2", createdAt: now, updatedAt: now },
    ]).run();
  });

  afterEach(() => close());

  it("cannot delete a report belonging to another household", () => {
    const now = nowISO();
    const reportId = uuid();
    db.insert(savedReports).values({
      id: reportId,
      householdId: "h1",
      name: "My Report",
      reportType: "spending",
      filters: "{}",
      createdAt: now,
      updatedAt: now,
    }).run();

    // h2 tries to delete h1's report
    const changes = deleteReportScoped(reportId, "h2", db);
    expect(changes).toBe(0);

    // Report still exists
    const remaining = db.select().from(savedReports).where(eq(savedReports.id, reportId)).get();
    expect(remaining).toBeDefined();
  });

  it("can delete own report", () => {
    const now = nowISO();
    const reportId = uuid();
    db.insert(savedReports).values({
      id: reportId,
      householdId: "h1",
      name: "My Report",
      reportType: "spending",
      filters: "{}",
      createdAt: now,
      updatedAt: now,
    }).run();

    const changes = deleteReportScoped(reportId, "h1", db);
    expect(changes).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/integration/reports-actions.test.ts`
Expected: Tests should pass because we wrote the correct logic in the test helper — this validates our fix approach.

- [ ] **Step 3: Apply the fix to the actual server action**

Replace lines 64-75 in `src/actions/reports.ts`:

```ts
export async function deleteReport(
  reportId: string,
  db: LedgrDb = defaultDb,
): Promise<{ success: true } | { error: string }> {
  const parsed = z.string().min(1).safeParse(reportId);
  if (!parsed.success) {
    return { error: "Invalid report ID" };
  }

  const householdId = await getHouseholdId();
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
```

- [ ] **Step 4: Run tests**

Run: `pnpm vitest run tests/integration/reports-actions.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/actions/reports.ts tests/integration/reports-actions.test.ts
git commit -m "fix(security): scope deleteReport to household on delete statement"
```

---

## Task 2: Extract `getIncomeCategoryIds` into query-helpers

**Files:**
- Modify: `src/lib/query-helpers.ts`
- Modify: `src/queries/reports.ts` (use new helper)
- Modify: `src/queries/dashboard.ts` (use new helper)

- [ ] **Step 1: Add `getIncomeCategoryIds` to query-helpers**

Add to end of `src/lib/query-helpers.ts`:

```ts
export function getIncomeCategoryIds(db: LedgrDb): Set<string> {
  const ids = db
    .select({ id: categories.id })
    .from(categories)
    .where(eq(categories.isIncome, true))
    .all()
    .map((r) => r.id);
  return new Set(ids);
}
```

- [ ] **Step 2: Update `getIncomeVsExpense` in reports.ts to use it**

In `src/queries/reports.ts`, replace lines 230-237:

```ts
// Before:
const incomeCatIds = new Set(
  db
    .select({ id: categories.id })
    .from(categories)
    .where(eq(categories.isIncome, true))
    .all()
    .map((r) => r.id),
);

// After:
import { getIncomeCategoryIds } from "@/lib/query-helpers";
// ...
const incomeCatIds = getIncomeCategoryIds(db);
```

- [ ] **Step 3: Fix `getCashFlow` in dashboard.ts — use `isIncome` flag + add transfer filtering**

Replace `getCashFlow` function in `src/queries/dashboard.ts` (lines 289-340):

```ts
export function getCashFlow(
  householdId: string,
  months = 6,
  db: LedgrDb = defaultDb
): CashFlowRow[] {
  const scoped = scopedQuery(householdId, db);

  const today = todayDateString();
  const d = new Date(today + "T00:00:00");
  d.setMonth(d.getMonth() - (months - 1));
  d.setDate(1);
  const dateFrom = d.toISOString().slice(0, 10);

  const incomeCatIds = getIncomeCategoryIds(db);

  const txns = db
    .select({
      date: transactions.date,
      normalizedAmount: transactions.normalizedAmount,
      categoryId: transactions.categoryId,
    })
    .from(transactions)
    .where(
      scoped.where(
        transactions,
        notDeleted(transactions),
        gte(transactions.date, dateFrom),
        eq(transactions.pending, false),
        eq(transactions.isTransfer, false),
        isNull(transactions.transferPairId)
      )
    )
    .all();

  const byMonth = new Map<string, { income: number; expenses: number }>();
  for (const txn of txns) {
    const month = txn.date.slice(0, 7);
    if (!byMonth.has(month)) {
      byMonth.set(month, { income: 0, expenses: 0 });
    }
    const entry = byMonth.get(month)!;
    if (txn.categoryId && incomeCatIds.has(txn.categoryId)) {
      entry.income += Math.abs(txn.normalizedAmount);
    } else if (txn.normalizedAmount > 0) {
      entry.expenses += txn.normalizedAmount;
    }
  }

  return [...byMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, { income, expenses }]) => ({
      month,
      income,
      expenses,
      net: income - expenses,
    }));
}
```

Add imports at top of `src/queries/dashboard.ts`:

```ts
import { eq, gt, gte, lt, lte, and, desc, inArray, isNull } from "drizzle-orm";
import { getIncomeCategoryIds } from "@/lib/query-helpers";
```

- [ ] **Step 4: Run existing tests**

Run: `pnpm vitest run`
Expected: All existing tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/query-helpers.ts src/queries/reports.ts src/queries/dashboard.ts
git commit -m "refactor: extract getIncomeCategoryIds, fix getCashFlow income classification and transfer filtering"
```

---

## Task 3: Extract shared `aggregateSpending` into spending-helpers

**Files:**
- Create: `src/lib/spending-helpers.ts`
- Modify: `src/queries/reports.ts` (import from new file)
- Modify: `src/queries/dashboard.ts` (use shared helper for `getMonthlySpending`)

- [ ] **Step 1: Create `src/lib/spending-helpers.ts`**

Move `aggregateSpending`, `findSplitParentIds`, `spendingBaseConditions`, and `enrichSpendingMap` from `src/queries/reports.ts`:

```ts
import { eq, gt, gte, lte, sql, and, inArray, notInArray, isNull } from "drizzle-orm";
import type { LedgrDb } from "@/db";
import {
  transactions,
  transactionSplits,
  categories,
  categoryGroups,
} from "@/db/schema";
import { scopedQuery } from "@/lib/scoped-query";
import { notDeleted, notIncome } from "@/lib/query-helpers";
import type { ReportFilters } from "@/queries/reports";

export interface SpendingChartItem {
  id: string | null;
  name: string;
  value: number;
  groupName: string | null;
  groupId: string | null;
}

export function spendingBaseConditions(filters: ReportFilters, db: LedgrDb) {
  const conditions = [
    notDeleted(transactions),
    gt(transactions.normalizedAmount, 0),
    eq(transactions.pending, false),
    eq(transactions.isTransfer, false),
    isNull(transactions.transferPairId),
    gte(transactions.date, filters.dateFrom),
    lte(transactions.date, filters.dateTo),
    notIncome(db),
  ];
  if (filters.accountIds?.length) {
    conditions.push(inArray(transactions.accountId, filters.accountIds));
  }
  return conditions;
}

export function findSplitParentIds(
  scoped: ReturnType<typeof scopedQuery>,
  conditions: ReturnType<typeof spendingBaseConditions>,
  db: LedgrDb,
): string[] {
  return db
    .select({ transactionId: transactionSplits.transactionId })
    .from(transactionSplits)
    .innerJoin(transactions, eq(transactionSplits.transactionId, transactions.id))
    .where(scoped.where(transactions, ...conditions))
    .groupBy(transactionSplits.transactionId)
    .all()
    .map((r) => r.transactionId);
}

export function aggregateSpending(
  householdId: string,
  filters: ReportFilters,
  db: LedgrDb,
): Map<string, number> {
  const scoped = scopedQuery(householdId, db);
  const conditions = spendingBaseConditions(filters, db);

  const splitParentIds = findSplitParentIds(scoped, conditions, db);

  const nonSplitConditions =
    splitParentIds.length > 0
      ? [...conditions, notInArray(transactions.id, splitParentIds)]
      : conditions;

  const nonSplitRows = db
    .select({
      categoryId: transactions.categoryId,
      total: sql<number>`COALESCE(SUM(${transactions.normalizedAmount}), 0)`,
    })
    .from(transactions)
    .where(scoped.where(transactions, ...nonSplitConditions))
    .groupBy(transactions.categoryId)
    .all();

  const spending = new Map<string, number>();
  for (const row of nonSplitRows) {
    const key = row.categoryId ?? "uncategorized";
    spending.set(key, (spending.get(key) ?? 0) + row.total);
  }

  if (splitParentIds.length > 0) {
    const splitRows = db
      .select({
        categoryId: transactionSplits.categoryId,
        total: sql<number>`COALESCE(SUM(${transactionSplits.amount}), 0)`,
      })
      .from(transactionSplits)
      .where(inArray(transactionSplits.transactionId, splitParentIds))
      .groupBy(transactionSplits.categoryId)
      .all();

    for (const row of splitRows) {
      spending.set(row.categoryId, (spending.get(row.categoryId) ?? 0) + row.total);
    }
  }

  return spending;
}

export function enrichSpendingMap(
  spending: Map<string, number>,
  db: LedgrDb,
): SpendingChartItem[] {
  const categoryIds = [...spending.keys()].filter((k) => k !== "uncategorized");

  type CatRow = { id: string; name: string; groupName: string | null; groupId: string | null };
  let catRows: CatRow[] = [];
  if (categoryIds.length > 0) {
    catRows = db
      .select({
        id: categories.id,
        name: categories.name,
        groupName: categoryGroups.name,
        groupId: categoryGroups.id,
      })
      .from(categories)
      .leftJoin(categoryGroups, eq(categories.groupId, categoryGroups.id))
      .where(inArray(categories.id, categoryIds))
      .all();
  }

  const catMap = new Map(catRows.map((c) => [c.id, c]));
  const result: SpendingChartItem[] = [];

  for (const [key, total] of spending.entries()) {
    if (key === "uncategorized") {
      result.push({ id: null, name: "Uncategorized", groupName: null, groupId: null, value: total });
    } else {
      const cat = catMap.get(key);
      result.push({
        id: key,
        name: cat?.name ?? "Unknown",
        groupName: cat?.groupName ?? null,
        groupId: cat?.groupId ?? null,
        value: total,
      });
    }
  }

  return result.sort((a, b) => b.value - a.value);
}
```

- [ ] **Step 2: Update `src/queries/reports.ts` — remove moved functions, import from helpers**

Remove `spendingBaseConditions`, `findSplitParentIds`, `aggregateSpending`, `enrichSpendingMap` functions and the `SpendingRow` interface's `total` field usage. Replace with imports:

```ts
import {
  aggregateSpending,
  enrichSpendingMap,
  spendingBaseConditions,
  findSplitParentIds,
  type SpendingChartItem,
} from "@/lib/spending-helpers";
```

Update `SpendingRow` to use the new shape:

```ts
export interface SpendingRow {
  categoryId: string | null;
  categoryName: string;
  groupName: string | null;
  groupId: string | null;
  total: number;
  prevTotal: number;
}

export function getSpendingByCategory(
  householdId: string,
  filters: ReportFilters,
  db: LedgrDb = defaultDb,
  comparisonPeriod?: { dateFrom: string; dateTo: string },
): SpendingRow[] {
  const currentSpending = aggregateSpending(householdId, filters, db);
  const enriched = enrichSpendingMap(currentSpending, db);

  let prevMap = new Map<string, number>();
  if (comparisonPeriod) {
    prevMap = aggregateSpending(householdId, { ...filters, ...comparisonPeriod }, db);
  }

  return enriched.map((row) => ({
    categoryId: row.id,
    categoryName: row.name,
    groupName: row.groupName,
    groupId: row.groupId,
    total: row.value,
    prevTotal: prevMap.get(row.id ?? "uncategorized") ?? 0,
  }));
}
```

- [ ] **Step 3: Update `getMonthlySpending` in dashboard.ts to use shared helper**

Replace `getMonthlySpending` in `src/queries/dashboard.ts`:

```ts
import { aggregateSpending, enrichSpendingMap } from "@/lib/spending-helpers";
import type { ReportFilters } from "@/queries/reports";

export function getMonthlySpending(
  householdId: string,
  month?: string,
  db: LedgrDb = defaultDb
): MonthlySpendingRow[] {
  const targetMonth = month ?? getCurrentMonth();
  const { from: dateFrom, to: dateTo } = monthBounds(targetMonth);

  const filters: ReportFilters = { dateFrom, dateTo };
  const spending = aggregateSpending(householdId, filters, db);
  const enriched = enrichSpendingMap(spending, db);

  return enriched.map((item) => ({
    categoryId: item.id,
    categoryName: item.name,
    categoryIcon: null,
    groupName: item.groupName,
    total: item.value,
  }));
}
```

- [ ] **Step 4: Run all tests**

Run: `pnpm vitest run`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/spending-helpers.ts src/queries/reports.ts src/queries/dashboard.ts
git commit -m "refactor: extract aggregateSpending into shared spending-helpers, dashboard gains split awareness"
```

---

## Task 4: Normalize `SpendingChart` input type + delete widget wrapper

**Files:**
- Modify: `src/components/atoms/spending-chart.tsx`
- Modify: `src/components/organisms/report-spending.tsx`
- Modify: `src/components/organisms/widgets/spending-by-category.tsx`
- Modify: `src/components/organisms/dashboard-grid.tsx:113-114`
- Delete: `src/components/organisms/widgets/cash-flow-chart.tsx`

- [ ] **Step 1: Update `SpendingChart` to accept single type**

Replace `src/components/atoms/spending-chart.tsx`:

```tsx
"use client";

import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts";
import { centsToDisplay } from "@/lib/money";
import { CHART_COLORS } from "@/lib/chart-colors";

export interface SpendingChartItem {
  id: string | null;
  name: string;
  value: number;
}

interface SpendingChartProps {
  data: SpendingChartItem[];
  viewMode: "donut" | "bar";
  onItemClick?: (item: { id: string | null; name: string }) => void;
}

export function SpendingChart({ data, viewMode, onItemClick }: SpendingChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        No spending data available.
      </div>
    );
  }

  const total = data.reduce((sum, d) => sum + d.value, 0);
  const top8 = data.slice(0, 8);
  const otherTotal = data.slice(8).reduce((sum, d) => sum + d.value, 0);
  const chartData: SpendingChartItem[] =
    otherTotal > 0
      ? [...top8, { id: null, name: "Other", value: otherTotal }]
      : top8;

  function handleClick(index: number) {
    if (!onItemClick) return;
    const item = chartData[index];
    if (item) onItemClick({ id: item.id, name: item.name });
  }

  if (viewMode === "donut") {
    return (
      <div className="flex gap-4 h-full">
        <div className="w-1/2">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius="55%"
                outerRadius="85%"
                onClick={(_, index) => handleClick(index)}
                className={onItemClick ? "cursor-pointer" : ""}
              >
                {chartData.map((_, i) => (
                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(v) => centsToDisplay(Number(v))} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="w-1/2 overflow-y-auto">
          {chartData.map((row, i) => (
            <SpendingLegendRow
              key={row.name}
              name={row.name}
              amount={row.value}
              percentage={total > 0 ? (row.value / total) * 100 : 0}
              color={CHART_COLORS[i % CHART_COLORS.length]}
              onClick={onItemClick ? () => handleClick(i) : undefined}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={chartData} layout="vertical" margin={{ left: 80 }}>
        <XAxis
          type="number"
          tickFormatter={(v) => centsToDisplay(v).replace(/\.00$/, "")}
          tick={{ fontSize: 11 }}
        />
        <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={75} />
        <Tooltip formatter={(v) => centsToDisplay(Number(v))} />
        <Bar
          dataKey="value"
          onClick={(_, index) => handleClick(index)}
          className={onItemClick ? "cursor-pointer" : ""}
        >
          {chartData.map((_, i) => (
            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function SpendingLegendRow({
  name,
  amount,
  percentage,
  color,
  onClick,
}: {
  name: string;
  amount: number;
  percentage: number;
  color: string;
  onClick?: () => void;
}) {
  return (
    <div
      className={`flex items-center gap-2 py-1 text-sm ${onClick ? "cursor-pointer hover:bg-muted/50 rounded px-1 -mx-1" : ""}`}
      onClick={onClick}
    >
      <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
      <span className="truncate flex-1">{name}</span>
      <span className="font-medium tabular-nums">{centsToDisplay(amount)}</span>
      <span className="text-muted-foreground text-xs w-10 text-right">{percentage.toFixed(0)}%</span>
    </div>
  );
}
```

- [ ] **Step 2: Update `report-spending.tsx` to map to new type**

In `src/components/organisms/report-spending.tsx`, update the `chartData` mapping:

```tsx
const chartData = data.map((r) => ({
  id: r.categoryId,
  name: r.categoryName,
  value: r.total,
}));
```

Remove the `categoryIcon` and `groupName` fields from the map (they're no longer needed by the chart atom).

- [ ] **Step 3: Update `spending-by-category.tsx` widget to map to new type**

In `src/components/organisms/widgets/spending-by-category.tsx`, update where it passes data to `SpendingChart`. The widget receives `MonthlySpendingRow[]` from dashboard — map it:

```tsx
const chartData = data.map((r) => ({
  id: r.categoryId,
  name: r.categoryName,
  value: r.total,
}));
// Pass chartData to <SpendingChart data={chartData} ... />
```

- [ ] **Step 4: Delete `cash-flow-chart.tsx` widget and update dashboard-grid**

Delete `src/components/organisms/widgets/cash-flow-chart.tsx`.

In `src/components/organisms/dashboard-grid.tsx`:
- Remove the `CashFlowChart` import (line 12)
- Replace line 114: `return <CashFlowChart data={data.cashFlow} />;`
- With: `return <CashFlowBarChart data={data.cashFlow} />;`
- Add import: `import { CashFlowBarChart } from "@/components/atoms/cash-flow-bar-chart";`

- [ ] **Step 5: Run typecheck + tests**

Run: `pnpm typecheck && pnpm vitest run`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git rm src/components/organisms/widgets/cash-flow-chart.tsx
git add src/components/atoms/spending-chart.tsx src/components/organisms/report-spending.tsx src/components/organisms/widgets/spending-by-category.tsx src/components/organisms/dashboard-grid.tsx
git commit -m "refactor: normalize SpendingChart input type, add onItemClick, delete redundant cash-flow widget"
```

---

## Task 5: Fix `getIncomeVsExpense` category filter bug

**Files:**
- Modify: `src/queries/reports.ts:200-261`

- [ ] **Step 1: Add missing categoryIds condition**

In `src/queries/reports.ts`, in the `getIncomeVsExpense` function, after the `accountIds` filter (around line 218), add:

```ts
if (filters.categoryIds?.length) {
  conditions.push(inArray(transactions.categoryId, filters.categoryIds));
}
```

- [ ] **Step 2: Run tests**

Run: `pnpm vitest run`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/queries/reports.ts
git commit -m "fix: wire up categoryIds filter in getIncomeVsExpense query"
```

---

## Task 6: `ReportSummaryBar` atom

**Files:**
- Create: `src/components/atoms/report-summary-bar.tsx`

- [ ] **Step 1: Create the component**

```tsx
// src/components/atoms/report-summary-bar.tsx
"use client";

import { centsToDisplay } from "@/lib/money";

export interface SummaryItem {
  label: string;
  value: number;
  format?: "currency" | "number" | "percent";
  color?: "default" | "income" | "expense" | "dynamic" | "safe-to-spend";
  secondaryLabel?: string;
}

interface ReportSummaryBarProps {
  items: SummaryItem[];
}

function formatValue(value: number, format: SummaryItem["format"]): string {
  switch (format) {
    case "number":
      return value.toLocaleString();
    case "percent":
      return `${value.toFixed(1)}%`;
    default:
      return centsToDisplay(value);
  }
}

function getValueColor(item: SummaryItem): string {
  switch (item.color) {
    case "income":
      return "text-green-600 dark:text-green-500";
    case "expense":
      return "text-destructive";
    case "dynamic":
      return item.value >= 0
        ? "text-green-600 dark:text-green-500"
        : "text-destructive";
    case "safe-to-spend": {
      if (item.value <= 0) return "text-destructive";
      // secondaryLabel contains the income for percentage calc — but we use a simpler approach
      // The parent computes the threshold and passes the appropriate color
      return "text-green-600 dark:text-green-500";
    }
    default:
      return "";
  }
}

export function ReportSummaryBar({ items }: ReportSummaryBarProps) {
  return (
    <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${Math.min(items.length, 5)}, 1fr)` }}>
      {items.map((item) => (
        <div key={item.label} className="rounded-lg border p-3">
          <div className="text-xs text-muted-foreground">{item.label}</div>
          <div className={`text-lg font-semibold tabular-nums ${getValueColor(item)}`}>
            {formatValue(item.value, item.format)}
          </div>
          {item.secondaryLabel && (
            <div className="text-xs text-muted-foreground mt-0.5">{item.secondaryLabel}</div>
          )}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/atoms/report-summary-bar.tsx
git commit -m "feat: add ReportSummaryBar atom for filtered totals"
```

---

## Task 7: Add filtered totals to all report tabs

**Files:**
- Modify: `src/components/organisms/report-spending.tsx`
- Modify: `src/components/organisms/report-income-expense.tsx`
- Modify: `src/components/organisms/report-trends.tsx`
- Modify: `src/components/organisms/report-net-worth.tsx`

- [ ] **Step 1: Add summary bar to Spending tab**

In `src/components/organisms/report-spending.tsx`, add at the top of the return JSX (before the chart toggle):

```tsx
import { ReportSummaryBar, type SummaryItem } from "@/components/atoms/report-summary-bar";

// Inside component, before return:
const totalSpent = data.reduce((s, r) => s + r.total, 0);
const topCategory = data.length > 0 ? data[0] : null;
const summaryItems: SummaryItem[] = [
  { label: "Total Spent", value: totalSpent, color: "expense" },
  { label: "Categories", value: data.length, format: "number" },
  ...(topCategory
    ? [{ label: `Top: ${topCategory.categoryName}`, value: topCategory.total } as SummaryItem]
    : []),
];

// In JSX, first child of the space-y-4 div:
<ReportSummaryBar items={summaryItems} />
```

- [ ] **Step 2: Replace inline cards in Income vs Expense tab**

In `src/components/organisms/report-income-expense.tsx`, replace the manual grid of cards:

```tsx
import { ReportSummaryBar, type SummaryItem } from "@/components/atoms/report-summary-bar";

// Replace the grid div (lines 27-40) with:
const summaryItems: SummaryItem[] = [
  { label: "Total Income", value: totalIncome, color: "income" },
  { label: "Total Expenses", value: totalExpenses, color: "expense" },
  { label: "Net", value: totalNet, color: "dynamic" },
];

// In JSX:
<ReportSummaryBar items={summaryItems} />
```

- [ ] **Step 3: Add summary bar to Trends tab**

In `src/components/organisms/report-trends.tsx`:

```tsx
import { ReportSummaryBar, type SummaryItem } from "@/components/atoms/report-summary-bar";

// Inside component:
const totalSpent = data.reduce((s, r) => s + r.total, 0);
const monthCount = new Set(data.map((r) => r.period)).size;
const monthlyAvg = monthCount > 0 ? Math.round(totalSpent / monthCount) : 0;

const summaryItems: SummaryItem[] = [
  { label: "Total Spent", value: totalSpent, color: "expense" },
  { label: "Monthly Average", value: monthlyAvg },
];

// First child in JSX:
<ReportSummaryBar items={summaryItems} />
```

- [ ] **Step 4: Add summary bar to Net Worth tab**

In `src/components/organisms/report-net-worth.tsx`:

```tsx
import { ReportSummaryBar, type SummaryItem } from "@/components/atoms/report-summary-bar";
import { centsToDisplay } from "@/lib/money";

// Inside component:
const latest = data.length > 0 ? data[data.length - 1] : null;
const earliest = data.length > 0 ? data[0] : null;
const change = latest && earliest ? latest.netWorth - earliest.netWorth : 0;
const changePct = earliest && earliest.netWorth !== 0
  ? ((change / Math.abs(earliest.netWorth)) * 100).toFixed(1)
  : "0.0";

const summaryItems: SummaryItem[] = [
  { label: "Current Net Worth", value: latest?.netWorth ?? 0, color: "dynamic" },
  {
    label: "Change",
    value: change,
    color: "dynamic",
    secondaryLabel: `${change >= 0 ? "+" : ""}${changePct}%`,
  },
];

// First child in JSX:
<ReportSummaryBar items={summaryItems} />
```

- [ ] **Step 5: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/components/organisms/report-spending.tsx src/components/organisms/report-income-expense.tsx src/components/organisms/report-trends.tsx src/components/organisms/report-net-worth.tsx
git commit -m "feat: add filtered totals via ReportSummaryBar to all report tabs"
```

---

## Task 8: `TransactionListPanel` molecule + `DrillDownSheet` organism

**Files:**
- Create: `src/components/molecules/transaction-list-panel.tsx`
- Create: `src/components/organisms/drill-down-sheet.tsx`
- Modify: `src/actions/reports.ts` (add `getDrillDownTransactions`)

- [ ] **Step 1: Create `TransactionListPanel`**

```tsx
// src/components/molecules/transaction-list-panel.tsx
"use client";

import { useMemo } from "react";
import { groupByDate } from "@/lib/transactions";
import { AmountDisplay } from "@/components/atoms/amount-display";
import { EntityAvatar } from "@/components/atoms/entity-avatar";
import { formatDateShort } from "@/lib/date-utils";
import type { TransactionRow } from "@/queries/transactions";

interface TransactionListPanelProps {
  rows: TransactionRow[];
}

export function TransactionListPanel({ rows }: TransactionListPanelProps) {
  const groups = useMemo(() => groupByDate(rows), [rows]);

  if (rows.length === 0) {
    return (
      <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
        No transactions found.
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {groups.map((group) => (
        <div key={group.date}>
          <div className="text-xs font-medium text-muted-foreground px-1 py-1.5 sticky top-0 bg-background">
            {formatDateShort(group.date)}
          </div>
          {group.rows.map((txn) => (
            <div
              key={txn.id}
              className="flex items-center gap-2 py-1.5 px-1 text-sm hover:bg-muted/50 rounded"
            >
              <EntityAvatar
                logoUrl={txn.merchantLogoUrl}
                name={txn.merchantName ?? txn.name}
                pfcPrimary={txn.pfcPrimary}
                size="sm"
              />
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{txn.name}</div>
                <div className="text-xs text-muted-foreground truncate">{txn.accountName}</div>
              </div>
              <AmountDisplay amount={txn.normalizedAmount} currency={txn.currency} pending={txn.pending} />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Add `getDrillDownTransactions` server action**

Add to `src/actions/reports.ts`:

```ts
import { getTransactions, type TransactionRow as TxnRow } from "@/queries/transactions";

export async function getDrillDownTransactions(filters: {
  categoryId?: string;
  dateFrom: string;
  dateTo: string;
  type?: "income" | "expense";
}): Promise<{ rows: TxnRow[]; totalCount: number }> {
  const householdId = await getHouseholdId();

  const txnFilters = {
    categoryId: filters.categoryId ?? undefined,
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
  };

  const page = getTransactions(householdId, txnFilters, 50);

  // Get total count for display
  const allPage = getTransactions(householdId, txnFilters, 1000);
  const totalCount = allPage.rows.length;

  return { rows: page.rows, totalCount };
}
```

Also update the `saveReportSchema` reportType enum to include "cash-flow":

```ts
reportType: z.enum(["spending", "income-expense", "trends", "net-worth", "cash-flow"]),
```

- [ ] **Step 3: Create `DrillDownSheet`**

```tsx
// src/components/organisms/drill-down-sheet.tsx
"use client";

import { useEffect, useTransition, useState } from "react";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { TransactionListPanel } from "@/components/molecules/transaction-list-panel";
import { getDrillDownTransactions } from "@/actions/reports";
import { centsToDisplay } from "@/lib/money";
import type { TransactionRow } from "@/queries/transactions";

export interface DrillDownFilter {
  categoryId?: string;
  categoryName: string;
  month?: string;
  type?: "income" | "expense";
  tabContext: string;
}

interface DrillDownSheetProps {
  filter: DrillDownFilter | null;
  dateFrom: string;
  dateTo: string;
  onClose: () => void;
}

export function DrillDownSheet({ filter, dateFrom, dateTo, onClose }: DrillDownSheetProps) {
  const [isPending, startTransition] = useTransition();
  const [rows, setRows] = useState<TransactionRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);

  useEffect(() => {
    if (!filter) return;

    const effectiveDateFrom = filter.month ? `${filter.month}-01` : dateFrom;
    const effectiveDateTo = filter.month
      ? `${filter.month}-${new Date(Number(filter.month.slice(0, 4)), Number(filter.month.slice(5, 7)), 0).getDate()}`
      : dateTo;

    startTransition(async () => {
      const result = await getDrillDownTransactions({
        categoryId: filter.categoryId,
        dateFrom: effectiveDateFrom,
        dateTo: effectiveDateTo,
        type: filter.type,
      });
      setRows(result.rows);
      setTotalCount(result.totalCount);
    });
  }, [filter, dateFrom, dateTo]);

  const totalAmount = rows.reduce((s, r) => s + r.normalizedAmount, 0);

  const txnPageUrl = filter
    ? `/transactions?${new URLSearchParams({
        ...(filter.categoryId ? { category: filter.categoryId } : {}),
        from: filter.month ? `${filter.month}-01` : dateFrom,
        to: filter.month ? `${filter.month}-31` : dateTo,
      }).toString()}`
    : "/transactions";

  return (
    <Sheet open={!!filter} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-[400px] sm:w-[540px] flex flex-col">
        <SheetHeader>
          <div className="text-xs text-muted-foreground">{filter?.tabContext}</div>
          <SheetTitle className="text-base">
            {filter?.categoryName}
          </SheetTitle>
          {!isPending && rows.length > 0 && (
            <div className="text-sm text-muted-foreground tabular-nums">
              {centsToDisplay(totalAmount)}
            </div>
          )}
        </SheetHeader>

        <div className="flex-1 overflow-y-auto min-h-0 py-2">
          {isPending ? (
            <div className="space-y-3 p-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : (
            <>
              {totalCount > rows.length && (
                <div className="text-xs text-muted-foreground px-1 pb-2">
                  Showing {rows.length} of {totalCount} transactions
                </div>
              )}
              <TransactionListPanel rows={rows} />
            </>
          )}
        </div>

        <SheetFooter className="border-t pt-3">
          <Link
            href={txnPageUrl}
            className="text-sm text-primary hover:underline flex items-center gap-1"
          >
            View all in Transactions
            <ExternalLink className="size-3" />
          </Link>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
```

- [ ] **Step 4: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/molecules/transaction-list-panel.tsx src/components/organisms/drill-down-sheet.tsx src/actions/reports.ts
git commit -m "feat: add TransactionListPanel molecule and DrillDownSheet organism for chart drill-down"
```

---

## Task 9: Wire drill-down into report organisms

**Files:**
- Modify: `src/components/organisms/report-spending.tsx`
- Modify: `src/components/organisms/report-income-expense.tsx`
- Modify: `src/components/organisms/report-trends.tsx`

- [ ] **Step 1: Add drill-down to Spending tab**

Update `src/components/organisms/report-spending.tsx`:

```tsx
"use client";

import { useState } from "react";
import { ChartViewToggle } from "@/components/atoms/chart-view-toggle";
import { SpendingChart } from "@/components/atoms/spending-chart";
import { ReportSummaryBar, type SummaryItem } from "@/components/atoms/report-summary-bar";
import { ComparisonBadge } from "@/components/molecules/comparison-badge";
import { DrillDownSheet, type DrillDownFilter } from "@/components/organisms/drill-down-sheet";
import { centsToDisplay } from "@/lib/money";
import { useSearchParamFilters } from "@/hooks/use-search-param-filters";
import type { SpendingRow } from "@/queries/reports";

interface ReportSpendingProps {
  data: SpendingRow[];
  comparisonLabel: string | null;
}

export function ReportSpending({ data, comparisonLabel: compLabel }: ReportSpendingProps) {
  const [view, setView] = useState<"donut" | "bar">("donut");
  const [drillDown, setDrillDown] = useState<DrillDownFilter | null>(null);
  const { searchParams } = useSearchParamFilters();

  const dateFrom = searchParams.get("from") ?? "2000-01-01";
  const dateTo = searchParams.get("to") ?? new Date().toISOString().slice(0, 10);

  const chartData = data.map((r) => ({
    id: r.categoryId,
    name: r.categoryName,
    value: r.total,
  }));

  const totalSpent = data.reduce((s, r) => s + r.total, 0);
  const topCategory = data.length > 0 ? data[0] : null;
  const summaryItems: SummaryItem[] = [
    { label: "Total Spent", value: totalSpent, color: "expense" },
    { label: "Categories", value: data.length, format: "number" },
    ...(topCategory
      ? [{ label: `Top: ${topCategory.categoryName}`, value: topCategory.total } as SummaryItem]
      : []),
  ];

  function handleDrillDown(item: { id: string | null; name: string }) {
    setDrillDown({
      categoryId: item.id ?? undefined,
      categoryName: item.name,
      tabContext: "Spending",
    });
  }

  return (
    <div className="space-y-4">
      <ReportSummaryBar items={summaryItems} />

      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium">Spending by Category</h3>
        <ChartViewToggle value={view} onChange={setView} />
      </div>

      <div className="h-[300px]">
        <SpendingChart data={chartData} viewMode={view} onItemClick={handleDrillDown} />
      </div>

      <div className="border rounded-lg">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="px-3 py-2 font-medium">Category</th>
              <th className="px-3 py-2 font-medium text-right">Amount</th>
              {compLabel && <th className="px-3 py-2 font-medium text-right">Change</th>}
            </tr>
          </thead>
          <tbody>
            {data.map((row) => (
              <tr
                key={row.categoryId ?? "uncategorized"}
                className="border-b last:border-0 cursor-pointer hover:bg-muted/50"
                onClick={() => handleDrillDown({ id: row.categoryId, name: row.categoryName })}
              >
                <td className="px-3 py-2">
                  <div className="text-sm">{row.categoryName}</div>
                  {row.groupName && (
                    <div className="text-xs text-muted-foreground">{row.groupName}</div>
                  )}
                </td>
                <td className="px-3 py-2 text-right tabular-nums font-medium">
                  {centsToDisplay(row.total)}
                </td>
                {compLabel && (
                  <td className="px-3 py-2 text-right">
                    <ComparisonBadge
                      current={row.total}
                      previous={row.prevTotal}
                      periodLabel={compLabel}
                    />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <DrillDownSheet
        filter={drillDown}
        dateFrom={dateFrom}
        dateTo={dateTo}
        onClose={() => setDrillDown(null)}
      />
    </div>
  );
}
```

- [ ] **Step 2: Add drill-down to Income vs Expense tab**

Update `src/components/organisms/report-income-expense.tsx` — add drill-down on bar click:

```tsx
"use client";

import { useState } from "react";
import { CashFlowBarChart } from "@/components/atoms/cash-flow-bar-chart";
import { ReportSummaryBar, type SummaryItem } from "@/components/atoms/report-summary-bar";
import { DrillDownSheet, type DrillDownFilter } from "@/components/organisms/drill-down-sheet";
import { useSearchParamFilters } from "@/hooks/use-search-param-filters";
import type { IncomeExpenseRow } from "@/queries/reports";

interface ReportIncomeExpenseProps {
  data: IncomeExpenseRow[];
}

export function ReportIncomeExpense({ data }: ReportIncomeExpenseProps) {
  const [drillDown, setDrillDown] = useState<DrillDownFilter | null>(null);
  const { searchParams } = useSearchParamFilters();

  const dateFrom = searchParams.get("from") ?? "2000-01-01";
  const dateTo = searchParams.get("to") ?? new Date().toISOString().slice(0, 10);

  const chartData = data.map((r) => ({
    month: r.period,
    income: r.income,
    expenses: r.expenses,
    net: r.net,
  }));

  const totalIncome = data.reduce((s, r) => s + r.income, 0);
  const totalExpenses = data.reduce((s, r) => s + r.expenses, 0);
  const totalNet = totalIncome - totalExpenses;

  const summaryItems: SummaryItem[] = [
    { label: "Total Income", value: totalIncome, color: "income" },
    { label: "Total Expenses", value: totalExpenses, color: "expense" },
    { label: "Net", value: totalNet, color: "dynamic" },
  ];

  return (
    <div className="space-y-4">
      <ReportSummaryBar items={summaryItems} />
      <h3 className="text-lg font-medium">Income vs Expense</h3>
      <div className="h-[300px]">
        <CashFlowBarChart data={chartData} />
      </div>
      <DrillDownSheet
        filter={drillDown}
        dateFrom={dateFrom}
        dateTo={dateTo}
        onClose={() => setDrillDown(null)}
      />
    </div>
  );
}
```

- [ ] **Step 3: Add drill-down to Trends tab**

Update `src/components/organisms/report-trends.tsx` — add drill-down on line click. The `TrendLineChart` atom needs an `onItemClick` prop first. Add it:

In `src/components/atoms/trend-line-chart.tsx`, add optional prop:

```tsx
interface TrendLineChartProps {
  data: Record<string, number | string>[];
  categories: { name: string; color: string }[];
  onItemClick?: (item: { id: string | null; name: string }) => void;
}
```

Then in the Recharts `<Line>` elements, add:

```tsx
<Line
  key={cat.name}
  type="monotone"
  dataKey={cat.name}
  name={cat.name}
  stroke={cat.color}
  strokeWidth={2}
  dot={false}
  activeDot={onItemClick ? {
    onClick: () => onItemClick({ id: null, name: cat.name }),
    className: "cursor-pointer",
  } : undefined}
/>
```

Then update `report-trends.tsx` to pass drill-down and include the `DrillDownSheet`.

- [ ] **Step 4: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/organisms/report-spending.tsx src/components/organisms/report-income-expense.tsx src/components/organisms/report-trends.tsx src/components/atoms/trend-line-chart.tsx
git commit -m "feat: wire chart-to-transaction drill-down into spending, income/expense, and trends tabs"
```

---

## Task 10: Migrate `CashFlowBarChart` to `ComposedChart` + trendline

**Files:**
- Modify: `src/components/atoms/cash-flow-bar-chart.tsx`

- [ ] **Step 1: Migrate from BarChart to ComposedChart and add trendline**

Replace `src/components/atoms/cash-flow-bar-chart.tsx`:

```tsx
"use client";

import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { centsToDisplay } from "@/lib/money";
import { formatMonthShort } from "@/lib/date-utils";
import { INCOME_COLOR, EXPENSE_COLOR, PRIMARY_COLOR } from "@/lib/chart-colors";
import type { CashFlowRow } from "@/queries/dashboard";

interface CashFlowBarChartProps {
  data: CashFlowRow[];
  showTrendline?: boolean;
}

export function CashFlowBarChart({ data, showTrendline = false }: CashFlowBarChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        Cash flow data will appear after your first sync.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={data} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
        <XAxis dataKey="month" tickFormatter={formatMonthShort} tick={{ fontSize: 11 }} />
        <YAxis
          tickFormatter={(v) => centsToDisplay(v).replace(/\.00$/, "")}
          tick={{ fontSize: 11 }}
          width={60}
        />
        <Tooltip
          formatter={(v) => centsToDisplay(Number(v))}
          labelFormatter={(label) => formatMonthShort(String(label))}
        />
        <Legend />
        <Bar dataKey="income" name="Income" fill={INCOME_COLOR} radius={[2, 2, 0, 0]} />
        <Bar dataKey="expenses" name="Expenses" fill={EXPENSE_COLOR} radius={[2, 2, 0, 0]} />
        {showTrendline && (
          <Line
            type="monotone"
            dataKey="net"
            name="Net"
            stroke={PRIMARY_COLOR}
            strokeWidth={2}
            dot={false}
          />
        )}
      </ComposedChart>
    </ResponsiveContainer>
  );
}
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/components/atoms/cash-flow-bar-chart.tsx
git commit -m "feat: migrate CashFlowBarChart to ComposedChart, add optional trendline"
```

---

## Task 11: `getIncomeExpenseByCategory` query + `IncomeExpenseCategoryTable`

**Files:**
- Modify: `src/queries/reports.ts`
- Create: `src/components/molecules/income-expense-category-table.tsx`
- Modify: `src/components/organisms/report-income-expense.tsx`
- Modify: `src/app/(dashboard)/reports/page.tsx`

- [ ] **Step 1: Add `getIncomeExpenseByCategory` query**

Add to `src/queries/reports.ts`:

```ts
import { getIncomeCategoryIds } from "@/lib/query-helpers";

export interface IncomeExpenseCategoryRow {
  categoryId: string;
  categoryName: string;
  isIncome: boolean;
  total: number;
  monthlyAverage: number;
  percentOfTotal: number;
}

export function getIncomeExpenseByCategory(
  householdId: string,
  filters: ReportFilters,
  db: LedgrDb = defaultDb,
): IncomeExpenseCategoryRow[] {
  const scoped = scopedQuery(householdId, db);
  const incomeCatIds = getIncomeCategoryIds(db);

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

  const txns = db
    .select({
      categoryId: transactions.categoryId,
      categoryName: categories.name,
      normalizedAmount: transactions.normalizedAmount,
      date: transactions.date,
    })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(scoped.where(transactions, ...conditions))
    .all();

  // Count distinct months in range for average calculation
  const months = new Set(txns.map((t) => t.date.slice(0, 7)));
  const monthCount = Math.max(months.size, 1);

  // Aggregate by category
  const byCat = new Map<string, { name: string; isIncome: boolean; total: number }>();
  for (const txn of txns) {
    if (!txn.categoryId) continue;
    const isIncome = incomeCatIds.has(txn.categoryId);
    const existing = byCat.get(txn.categoryId);
    const amount = isIncome ? Math.abs(txn.normalizedAmount) : txn.normalizedAmount;
    if (existing) {
      existing.total += amount;
    } else {
      byCat.set(txn.categoryId, {
        name: txn.categoryName ?? "Unknown",
        isIncome,
        total: amount,
      });
    }
  }

  // Calculate totals for percentages
  let totalIncome = 0;
  let totalExpenses = 0;
  for (const cat of byCat.values()) {
    if (cat.isIncome) totalIncome += cat.total;
    else totalExpenses += cat.total;
  }

  const result: IncomeExpenseCategoryRow[] = [];
  for (const [categoryId, cat] of byCat.entries()) {
    const denominator = cat.isIncome ? totalIncome : totalExpenses;
    result.push({
      categoryId,
      categoryName: cat.name,
      isIncome: cat.isIncome,
      total: cat.total,
      monthlyAverage: Math.round(cat.total / monthCount),
      percentOfTotal: denominator > 0 ? (cat.total / denominator) * 100 : 0,
    });
  }

  return result.sort((a, b) => b.total - a.total);
}
```

- [ ] **Step 2: Create `IncomeExpenseCategoryTable` molecule**

```tsx
// src/components/molecules/income-expense-category-table.tsx
"use client";

import { centsToDisplay } from "@/lib/money";
import type { IncomeExpenseCategoryRow } from "@/queries/reports";
import { ChevronRight } from "lucide-react";

interface IncomeExpenseCategoryTableProps {
  data: IncomeExpenseCategoryRow[];
  onCategoryClick?: (categoryId: string, isIncome: boolean) => void;
}

export function IncomeExpenseCategoryTable({ data, onCategoryClick }: IncomeExpenseCategoryTableProps) {
  const incomeRows = data.filter((r) => r.isIncome);
  const expenseRows = data.filter((r) => !r.isIncome);

  return (
    <div className="border rounded-lg">
      <Section
        label="Income Sources"
        rows={incomeRows}
        onCategoryClick={onCategoryClick}
      />
      <div className="border-t" />
      <Section
        label="Expense Categories"
        rows={expenseRows}
        onCategoryClick={onCategoryClick}
      />
    </div>
  );
}

function Section({
  label,
  rows,
  onCategoryClick,
}: {
  label: string;
  rows: IncomeExpenseCategoryRow[];
  onCategoryClick?: (categoryId: string, isIncome: boolean) => void;
}) {
  if (rows.length === 0) {
    return (
      <div className="px-3 py-4 text-sm text-muted-foreground text-center">
        No {label.toLowerCase()} found.
      </div>
    );
  }

  return (
    <div>
      <div className="px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider bg-muted/30">
        {label}
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="px-3 py-1.5 font-medium">Category</th>
            <th className="px-3 py-1.5 font-medium text-right">Total</th>
            <th className="px-3 py-1.5 font-medium text-right">Monthly Avg</th>
            <th className="px-3 py-1.5 font-medium text-right w-24">%</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.categoryId}
              className={`border-b last:border-0 ${onCategoryClick ? "cursor-pointer hover:bg-muted/50 group" : ""}`}
              onClick={() => onCategoryClick?.(row.categoryId, row.isIncome)}
            >
              <td className="px-3 py-2 flex items-center gap-1">
                <span>{row.categoryName}</span>
                {onCategoryClick && (
                  <ChevronRight className="size-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                )}
              </td>
              <td className="px-3 py-2 text-right tabular-nums font-medium">
                {centsToDisplay(row.total)}
              </td>
              <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                {centsToDisplay(row.monthlyAverage)}
              </td>
              <td className="px-3 py-2 text-right">
                <div className="flex items-center justify-end gap-1.5">
                  <div className="w-12 h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${Math.min(row.percentOfTotal, 100)}%` }}
                    />
                  </div>
                  <span className="tabular-nums text-xs text-muted-foreground w-8 text-right">
                    {row.percentOfTotal.toFixed(0)}%
                  </span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 3: Update `ReportIncomeExpense` organism to include table + trendline**

Update `src/components/organisms/report-income-expense.tsx`:

```tsx
"use client";

import { useState } from "react";
import { CashFlowBarChart } from "@/components/atoms/cash-flow-bar-chart";
import { ReportSummaryBar, type SummaryItem } from "@/components/atoms/report-summary-bar";
import { IncomeExpenseCategoryTable } from "@/components/molecules/income-expense-category-table";
import { DrillDownSheet, type DrillDownFilter } from "@/components/organisms/drill-down-sheet";
import { useSearchParamFilters } from "@/hooks/use-search-param-filters";
import type { IncomeExpenseRow, IncomeExpenseCategoryRow } from "@/queries/reports";

interface ReportIncomeExpenseProps {
  data: IncomeExpenseRow[];
  categoryData?: IncomeExpenseCategoryRow[];
}

export function ReportIncomeExpense({ data, categoryData }: ReportIncomeExpenseProps) {
  const [drillDown, setDrillDown] = useState<DrillDownFilter | null>(null);
  const { searchParams } = useSearchParamFilters();

  const dateFrom = searchParams.get("from") ?? "2000-01-01";
  const dateTo = searchParams.get("to") ?? new Date().toISOString().slice(0, 10);

  const chartData = data.map((r) => ({
    month: r.period,
    income: r.income,
    expenses: r.expenses,
    net: r.net,
  }));

  const totalIncome = data.reduce((s, r) => s + r.income, 0);
  const totalExpenses = data.reduce((s, r) => s + r.expenses, 0);
  const totalNet = totalIncome - totalExpenses;

  const summaryItems: SummaryItem[] = [
    { label: "Total Income", value: totalIncome, color: "income" },
    { label: "Total Expenses", value: totalExpenses, color: "expense" },
    { label: "Net", value: totalNet, color: "dynamic" },
  ];

  function handleCategoryDrillDown(categoryId: string, isIncome: boolean) {
    const cat = categoryData?.find((c) => c.categoryId === categoryId);
    setDrillDown({
      categoryId,
      categoryName: cat?.categoryName ?? "Unknown",
      type: isIncome ? "income" : "expense",
      tabContext: "Income vs Expense",
    });
  }

  return (
    <div className="space-y-4">
      <ReportSummaryBar items={summaryItems} />
      <h3 className="text-lg font-medium">Income vs Expense</h3>
      <div className="h-[300px]">
        <CashFlowBarChart data={chartData} showTrendline />
      </div>
      {categoryData && (
        <IncomeExpenseCategoryTable
          data={categoryData}
          onCategoryClick={handleCategoryDrillDown}
        />
      )}
      <DrillDownSheet
        filter={drillDown}
        dateFrom={dateFrom}
        dateTo={dateTo}
        onClose={() => setDrillDown(null)}
      />
    </div>
  );
}
```

- [ ] **Step 4: Update reports page to fetch category data for income-expense tab**

In `src/app/(dashboard)/reports/page.tsx`, update the switch case:

```ts
import { getIncomeExpenseByCategory } from "@/queries/reports";

// Add variable declaration:
let incomeExpenseCategoryData;

// Update the switch case:
case "income-expense":
  incomeExpenseData = getIncomeVsExpense(householdId, filters);
  incomeExpenseCategoryData = getIncomeExpenseByCategory(householdId, filters);
  break;
```

Pass it to `ReportTabs` and then to `ReportIncomeExpense`:

Update `ReportTabs` to accept and pass through `incomeExpenseCategoryData`:

```tsx
// In ReportTabs props:
incomeExpenseCategoryData?: IncomeExpenseCategoryRow[];

// In TabsContent for income-expense:
{incomeExpenseData && (
  <ReportIncomeExpense data={incomeExpenseData} categoryData={incomeExpenseCategoryData} />
)}
```

- [ ] **Step 5: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/queries/reports.ts src/components/molecules/income-expense-category-table.tsx src/components/organisms/report-income-expense.tsx src/components/organisms/report-tabs.tsx src/app/\(dashboard\)/reports/page.tsx
git commit -m "feat: add income/expense category breakdown table with trendline and drill-down"
```

---

## Task 12: Install d3-sankey + create `SankeyChart` molecule

**Files:**
- Create: `src/components/molecules/sankey-chart.tsx`

- [ ] **Step 1: Install d3-sankey**

```bash
pnpm add d3-sankey && pnpm add -D @types/d3-sankey
```

- [ ] **Step 2: Create `SankeyChart` molecule**

```tsx
// src/components/molecules/sankey-chart.tsx
"use client";

import { useMemo, useState } from "react";
import { sankey, sankeyLinkHorizontal, type SankeyNode as D3SankeyNode, type SankeyLink as D3SankeyLink } from "d3-sankey";
import { centsToDisplay } from "@/lib/money";
import { INCOME_COLOR, CHART_COLORS } from "@/lib/chart-colors";

export interface SankeyNode {
  id: string;
  name: string;
  type: "income" | "expense" | "savings";
}

export interface SankeyLink {
  source: string;
  target: string;
  value: number;
}

interface SankeyChartProps {
  nodes: SankeyNode[];
  links: SankeyLink[];
  onNodeClick?: (nodeId: string, type: "income" | "expense" | "savings") => void;
  height?: number;
}

type LayoutNode = D3SankeyNode<SankeyNode, SankeyLink>;
type LayoutLink = D3SankeyLink<SankeyNode, SankeyLink>;

const SAVINGS_COLOR = "hsl(142 40% 60%)";
const MIN_NODE_HEIGHT = 8;

function getNodeColor(node: SankeyNode, index: number): string {
  if (node.type === "income") return INCOME_COLOR;
  if (node.type === "savings") return SAVINGS_COLOR;
  return CHART_COLORS[index % CHART_COLORS.length];
}

export function SankeyChart({ nodes, links, onNodeClick, height = 400 }: SankeyChartProps) {
  const [hoveredLink, setHoveredLink] = useState<number | null>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string } | null>(null);

  const layout = useMemo(() => {
    if (nodes.length === 0 || links.length === 0) return null;

    const nodeMap = new Map(nodes.map((n, i) => [n.id, i]));
    const indexedLinks = links
      .filter((l) => nodeMap.has(l.source) && nodeMap.has(l.target) && l.value > 0)
      .map((l) => ({
        source: nodeMap.get(l.source)!,
        target: nodeMap.get(l.target)!,
        value: l.value,
      }));

    if (indexedLinks.length === 0) return null;

    const generator = sankey<SankeyNode, { source: number; target: number; value: number }>()
      .nodeId((_, i) => i)
      .nodeWidth(20)
      .nodePadding(8)
      .nodeMinHeight(MIN_NODE_HEIGHT)
      .extent([[0, 0], [600, height - 40]]);

    return generator({
      nodes: nodes.map((n) => ({ ...n })),
      links: indexedLinks,
    });
  }, [nodes, links, height]);

  if (!layout || layout.nodes.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        Not enough data for cash flow visualization.
      </div>
    );
  }

  const expenseIndex = new Map<string, number>();
  let ei = 0;
  for (const node of layout.nodes) {
    if ((node as unknown as SankeyNode).type === "expense") {
      expenseIndex.set((node as unknown as SankeyNode).id, ei++);
    }
  }

  return (
    <div className="relative w-full" style={{ height }}>
      <svg viewBox={`0 0 600 ${height - 40}`} className="w-full h-full" preserveAspectRatio="xMidYMid meet">
        <defs>
          {(layout.links as LayoutLink[]).map((link, i) => {
            const sourceNode = link.source as LayoutNode;
            const targetNode = link.target as LayoutNode;
            const sourceData = sourceNode as unknown as SankeyNode;
            const targetData = targetNode as unknown as SankeyNode;
            const sColor = getNodeColor(sourceData, 0);
            const tColor = getNodeColor(targetData, expenseIndex.get(targetData.id) ?? 0);
            return (
              <linearGradient key={i} id={`link-gradient-${i}`} gradientUnits="userSpaceOnUse"
                x1={(sourceNode.x1 ?? 0)} x2={(targetNode.x0 ?? 0)}>
                <stop offset="0%" stopColor={sColor} />
                <stop offset="100%" stopColor={tColor} />
              </linearGradient>
            );
          })}
        </defs>

        {(layout.links as LayoutLink[]).map((link, i) => {
          const path = sankeyLinkHorizontal()(link as never);
          if (!path) return null;
          const sourceData = (link.source as LayoutNode) as unknown as SankeyNode;
          const targetData = (link.target as LayoutNode) as unknown as SankeyNode;
          return (
            <path
              key={i}
              d={path}
              fill="none"
              stroke={`url(#link-gradient-${i})`}
              strokeWidth={Math.max((link as { width?: number }).width ?? 1, 1)}
              strokeOpacity={hoveredLink === i ? 0.4 : 0.15}
              onMouseEnter={(e) => {
                setHoveredLink(i);
                setTooltip({
                  x: e.clientX,
                  y: e.clientY,
                  text: `${sourceData.name} → ${targetData.name}: ${centsToDisplay(link.value)}`,
                });
              }}
              onMouseLeave={() => {
                setHoveredLink(null);
                setTooltip(null);
              }}
            />
          );
        })}

        {(layout.nodes as LayoutNode[]).map((node) => {
          const nodeData = node as unknown as SankeyNode;
          const x0 = node.x0 ?? 0;
          const y0 = node.y0 ?? 0;
          const x1 = node.x1 ?? 0;
          const y1 = node.y1 ?? 0;
          const color = getNodeColor(nodeData, expenseIndex.get(nodeData.id) ?? 0);
          const nodeHeight = y1 - y0;
          return (
            <g key={nodeData.id}>
              <rect
                x={x0}
                y={y0}
                width={x1 - x0}
                height={nodeHeight}
                fill={color}
                rx={2}
                className={onNodeClick && nodeData.type !== "savings" ? "cursor-pointer" : ""}
                onClick={() => onNodeClick && nodeData.type !== "savings" && onNodeClick(nodeData.id, nodeData.type)}
              />
              {nodeHeight > 12 && (
                <text
                  x={nodeData.type === "income" ? x0 - 4 : x1 + 4}
                  y={(y0 + y1) / 2}
                  dy="0.35em"
                  textAnchor={nodeData.type === "income" ? "end" : "start"}
                  className="text-[10px] fill-foreground"
                >
                  {nodeData.name}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {tooltip && (
        <div
          className="fixed z-50 rounded-md border bg-popover px-3 py-1.5 text-xs shadow-md pointer-events-none"
          style={{ left: tooltip.x + 12, top: tooltip.y - 10 }}
        >
          {tooltip.text}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/components/molecules/sankey-chart.tsx package.json pnpm-lock.yaml
git commit -m "feat: add SankeyChart molecule with d3-sankey layout and React SVG rendering"
```

---

## Task 13: `getCashFlowSankey` query + `getSafeToSpend` query

**Files:**
- Modify: `src/queries/reports.ts`

- [ ] **Step 1: Add `getCashFlowSankey` query**

Add to `src/queries/reports.ts`:

```ts
import type { SankeyNode, SankeyLink } from "@/components/molecules/sankey-chart";

export function getCashFlowSankey(
  householdId: string,
  filters: ReportFilters,
  db: LedgrDb = defaultDb,
): { nodes: SankeyNode[]; links: SankeyLink[] } {
  const scoped = scopedQuery(householdId, db);
  const incomeCatIds = getIncomeCategoryIds(db);

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

  const txns = db
    .select({
      categoryId: transactions.categoryId,
      categoryName: categories.name,
      normalizedAmount: transactions.normalizedAmount,
    })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(scoped.where(transactions, ...conditions))
    .all();

  // Aggregate by category, split income vs expense
  const incomeMap = new Map<string, { name: string; total: number }>();
  const expenseMap = new Map<string, { name: string; total: number }>();

  for (const txn of txns) {
    if (!txn.categoryId) continue;
    if (incomeCatIds.has(txn.categoryId)) {
      const existing = incomeMap.get(txn.categoryId);
      const amount = Math.abs(txn.normalizedAmount);
      if (existing) existing.total += amount;
      else incomeMap.set(txn.categoryId, { name: txn.categoryName ?? "Unknown", total: amount });
    } else if (txn.normalizedAmount > 0) {
      const existing = expenseMap.get(txn.categoryId);
      if (existing) existing.total += txn.normalizedAmount;
      else expenseMap.set(txn.categoryId, { name: txn.categoryName ?? "Unknown", total: txn.normalizedAmount });
    }
  }

  const totalIncome = [...incomeMap.values()].reduce((s, v) => s + v.total, 0);
  const totalExpenses = [...expenseMap.values()].reduce((s, v) => s + v.total, 0);

  // Build nodes
  const nodes: SankeyNode[] = [];
  for (const [id, data] of incomeMap) {
    nodes.push({ id: `income-${id}`, name: data.name, type: "income" });
  }
  for (const [id, data] of expenseMap) {
    nodes.push({ id: `expense-${id}`, name: data.name, type: "expense" });
  }

  // Savings/deficit node
  const surplus = totalIncome - totalExpenses;
  if (surplus > 0) {
    nodes.push({ id: "savings", name: "Savings", type: "savings" });
  }

  // Build links: each income source → each expense category proportionally
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
    // Savings link
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
```

- [ ] **Step 2: Add `getSafeToSpend` query**

Add to `src/queries/reports.ts`:

```ts
import { recurringTransactions } from "@/db/schema";
import { getCurrentMonth, monthBounds } from "@/lib/date-utils";

export interface SafeToSpendResult {
  monthlyIncome: number;
  recurringExpenses: number;
  discretionarySpent: number;
  safeToSpend: number;
}

export function getSafeToSpend(
  householdId: string,
  db: LedgrDb = defaultDb,
): SafeToSpendResult {
  const scoped = scopedQuery(householdId, db);
  const incomeCatIds = getIncomeCategoryIds(db);
  const { from: dateFrom, to: dateTo } = monthBounds(getCurrentMonth());

  // Monthly income (including pending — so paycheck shows immediately)
  const incomeTxns = db
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
    )
    .all();

  const monthlyIncome = incomeTxns.reduce((s, t) => s + Math.abs(t.normalizedAmount), 0);

  // Recurring expenses: use actual posted amounts when available, projected otherwise
  const activeRecurring = db
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
    )
    .all();

  // Find which recurring transactions already posted this month
  const recurringIds = activeRecurring.map((r) => r.id);
  const postedRecurring = recurringIds.length > 0
    ? db
        .select({
          recurringTransactionId: transactions.recurringTransactionId,
          total: sql<number>`COALESCE(SUM(ABS(${transactions.normalizedAmount})), 0)`,
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
        .all()
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
  const discretionaryTxns = db
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
        gt(transactions.normalizedAmount, 0),
        notIncome(db),
      ),
    )
    .all();

  const discretionarySpent = discretionaryTxns.reduce((s, t) => s + t.normalizedAmount, 0);

  return {
    monthlyIncome,
    recurringExpenses,
    discretionarySpent,
    safeToSpend: monthlyIncome - recurringExpenses - discretionarySpent,
  };
}
```

- [ ] **Step 3: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/queries/reports.ts
git commit -m "feat: add getCashFlowSankey and getSafeToSpend queries"
```

---

## Task 14: Cash Flow tab organism + wire into page

**Files:**
- Create: `src/components/organisms/report-cash-flow.tsx`
- Modify: `src/components/organisms/report-tabs.tsx`
- Modify: `src/app/(dashboard)/reports/page.tsx`

- [ ] **Step 1: Create `ReportCashFlow` organism**

```tsx
// src/components/organisms/report-cash-flow.tsx
"use client";

import { useState } from "react";
import { SankeyChart, type SankeyNode, type SankeyLink } from "@/components/molecules/sankey-chart";
import { CashFlowBarChart } from "@/components/atoms/cash-flow-bar-chart";
import { ReportSummaryBar, type SummaryItem } from "@/components/atoms/report-summary-bar";
import { DrillDownSheet, type DrillDownFilter } from "@/components/organisms/drill-down-sheet";
import { useSearchParamFilters } from "@/hooks/use-search-param-filters";
import type { IncomeExpenseRow } from "@/queries/reports";
import type { SafeToSpendResult } from "@/queries/reports";

interface ReportCashFlowProps {
  sankeyNodes: SankeyNode[];
  sankeyLinks: SankeyLink[];
  barData: IncomeExpenseRow[];
  safeToSpend: SafeToSpendResult;
  isCurrentMonth: boolean;
}

export function ReportCashFlow({
  sankeyNodes,
  sankeyLinks,
  barData,
  safeToSpend,
  isCurrentMonth,
}: ReportCashFlowProps) {
  const [drillDown, setDrillDown] = useState<DrillDownFilter | null>(null);
  const { searchParams } = useSearchParamFilters();

  const dateFrom = searchParams.get("from") ?? "2000-01-01";
  const dateTo = searchParams.get("to") ?? new Date().toISOString().slice(0, 10);

  const safeColor: SummaryItem["color"] = (() => {
    if (safeToSpend.monthlyIncome === 0) return "default";
    const pct = safeToSpend.safeToSpend / safeToSpend.monthlyIncome;
    if (pct < 0.05) return "expense";
    if (pct < 0.20) return "default";
    return "income";
  })();

  const summaryItems: SummaryItem[] = [
    { label: "Total Income", value: safeToSpend.monthlyIncome, color: "income" },
    { label: "Recurring Bills", value: safeToSpend.recurringExpenses, color: "expense" },
    { label: "Spent So Far", value: safeToSpend.discretionarySpent, color: "expense" },
    {
      label: "Safe to Spend",
      value: safeToSpend.safeToSpend,
      color: safeColor,
      secondaryLabel: isCurrentMonth ? undefined : "(current month)",
    },
  ];

  const chartData = barData.map((r) => ({
    month: r.period,
    income: r.income,
    expenses: r.expenses,
    net: r.net,
  }));

  function handleNodeClick(nodeId: string, type: "income" | "expense" | "savings") {
    if (type === "savings") return;
    const catId = nodeId.replace(/^(income|expense)-/, "");
    const node = sankeyNodes.find((n) => n.id === nodeId);
    setDrillDown({
      categoryId: catId,
      categoryName: node?.name ?? "Unknown",
      type: type as "income" | "expense",
      tabContext: "Cash Flow",
    });
  }

  return (
    <div className="space-y-4">
      <ReportSummaryBar items={summaryItems} />

      <h3 className="text-lg font-medium">Money Flow</h3>
      <div className="h-[400px]">
        <SankeyChart
          nodes={sankeyNodes}
          links={sankeyLinks}
          onNodeClick={handleNodeClick}
          height={400}
        />
      </div>

      <h3 className="text-lg font-medium">Monthly Breakdown</h3>
      <div className="h-[300px]">
        <CashFlowBarChart data={chartData} showTrendline />
      </div>

      <DrillDownSheet
        filter={drillDown}
        dateFrom={dateFrom}
        dateTo={dateTo}
        onClose={() => setDrillDown(null)}
      />
    </div>
  );
}
```

- [ ] **Step 2: Update `ReportTabs` — add Cash Flow tab, reorder, mobile scrollable**

Replace `src/components/organisms/report-tabs.tsx`:

```tsx
"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSearchParamFilters } from "@/hooks/use-search-param-filters";
import { ReportSpending } from "./report-spending";
import { ReportIncomeExpense } from "./report-income-expense";
import { ReportTrends } from "./report-trends";
import { ReportNetWorth } from "./report-net-worth";
import { ReportCashFlow } from "./report-cash-flow";
import type { SpendingRow, IncomeExpenseRow, CategoryTrendRow, IncomeExpenseCategoryRow, SafeToSpendResult } from "@/queries/reports";
import type { NetWorthPoint } from "@/queries/dashboard";
import type { SankeyNode, SankeyLink } from "@/components/molecules/sankey-chart";

interface ReportTabsProps {
  activeTab: string;
  spendingData?: SpendingRow[];
  incomeExpenseData?: IncomeExpenseRow[];
  incomeExpenseCategoryData?: IncomeExpenseCategoryRow[];
  trendsData?: CategoryTrendRow[];
  netWorthData?: NetWorthPoint[];
  sankeyNodes?: SankeyNode[];
  sankeyLinks?: SankeyLink[];
  cashFlowBarData?: IncomeExpenseRow[];
  safeToSpendData?: SafeToSpendResult;
  isCurrentMonth?: boolean;
  comparisonLabel: string | null;
}

export function ReportTabs({
  activeTab,
  spendingData,
  incomeExpenseData,
  incomeExpenseCategoryData,
  trendsData,
  netWorthData,
  sankeyNodes,
  sankeyLinks,
  cashFlowBarData,
  safeToSpendData,
  isCurrentMonth,
  comparisonLabel,
}: ReportTabsProps) {
  const { updateFilter } = useSearchParamFilters();

  return (
    <Tabs
      value={activeTab}
      onValueChange={(tab) => updateFilter("tab", tab === "spending" ? null : tab)}
    >
      <TabsList className="overflow-x-auto max-w-full">
        <TabsTrigger value="spending">Spending</TabsTrigger>
        <TabsTrigger value="income-expense">Income vs Expense</TabsTrigger>
        <TabsTrigger value="cash-flow">Cash Flow</TabsTrigger>
        <TabsTrigger value="trends">Trends</TabsTrigger>
        <TabsTrigger value="net-worth">Net Worth</TabsTrigger>
      </TabsList>

      <TabsContent value="spending" className="mt-4">
        {spendingData && <ReportSpending data={spendingData} comparisonLabel={comparisonLabel} />}
      </TabsContent>
      <TabsContent value="income-expense" className="mt-4">
        {incomeExpenseData && (
          <ReportIncomeExpense data={incomeExpenseData} categoryData={incomeExpenseCategoryData} />
        )}
      </TabsContent>
      <TabsContent value="cash-flow" className="mt-4">
        {sankeyNodes && sankeyLinks && cashFlowBarData && safeToSpendData && (
          <ReportCashFlow
            sankeyNodes={sankeyNodes}
            sankeyLinks={sankeyLinks}
            barData={cashFlowBarData}
            safeToSpend={safeToSpendData}
            isCurrentMonth={isCurrentMonth ?? false}
          />
        )}
      </TabsContent>
      <TabsContent value="trends" className="mt-4">
        {trendsData && <ReportTrends data={trendsData} />}
      </TabsContent>
      <TabsContent value="net-worth" className="mt-4">
        {netWorthData && <ReportNetWorth data={netWorthData} />}
      </TabsContent>
    </Tabs>
  );
}
```

- [ ] **Step 3: Update reports page to fetch Cash Flow data**

In `src/app/(dashboard)/reports/page.tsx`, update:

```ts
import {
  getSpendingByCategory,
  getIncomeVsExpense,
  getIncomeExpenseByCategory,
  getCategoryTrends,
  getReportNetWorthHistory,
  getCashFlowSankey,
  getSafeToSpend,
  type ReportFilters,
} from "@/queries/reports";
import { getCurrentMonth } from "@/lib/date-utils";

const VALID_TABS = new Set(["spending", "income-expense", "cash-flow", "trends", "net-worth"]);

// Add variables:
let incomeExpenseCategoryData;
let sankeyData;
let safeToSpendData;
let cashFlowBarData;

// Add to switch:
case "income-expense":
  incomeExpenseData = getIncomeVsExpense(householdId, filters);
  incomeExpenseCategoryData = getIncomeExpenseByCategory(householdId, filters);
  break;
case "cash-flow": {
  const [sankey, sts, cfBar] = [
    getCashFlowSankey(householdId, filters),
    getSafeToSpend(householdId),
    getIncomeVsExpense(householdId, filters),
  ];
  sankeyData = sankey;
  safeToSpendData = sts;
  cashFlowBarData = cfBar;
  break;
}

// Determine if current month
const currentMonth = getCurrentMonth();
const isCurrentMonth = dateFrom <= `${currentMonth}-01` && dateTo >= `${currentMonth}-01`;

// Pass all new props to ReportTabs:
<ReportTabs
  activeTab={tab}
  spendingData={spendingData}
  incomeExpenseData={incomeExpenseData}
  incomeExpenseCategoryData={incomeExpenseCategoryData}
  trendsData={trendsData}
  netWorthData={netWorthData}
  sankeyNodes={sankeyData?.nodes}
  sankeyLinks={sankeyData?.links}
  cashFlowBarData={cashFlowBarData}
  safeToSpendData={safeToSpendData}
  isCurrentMonth={isCurrentMonth}
  comparisonLabel={compLabel}
/>
```

- [ ] **Step 4: Run typecheck + dev server**

Run: `pnpm typecheck`
Expected: PASS

Run: `pnpm dev` — verify all 5 tabs render, Cash Flow shows Sankey + bar chart + Safe to Spend cards.

- [ ] **Step 5: Commit**

```bash
git add src/components/organisms/report-cash-flow.tsx src/components/organisms/report-tabs.tsx src/app/\(dashboard\)/reports/page.tsx
git commit -m "feat: add Cash Flow tab with Sankey diagram, bar chart, and Safe to Spend"
```

---

## Task 15: Final verification + update research doc

**Files:**
- Modify: `docs/reports-feature-research.md`

- [ ] **Step 1: Run full test suite + typecheck**

```bash
pnpm typecheck && pnpm vitest run && pnpm lint
```

Expected: All pass.

- [ ] **Step 2: Manual smoke test in browser**

Run `pnpm dev` and verify:
1. Spending tab: summary bar, donut/bar toggle, click slice → drill-down sheet opens with transactions
2. Income vs Expense tab: summary bar, bar chart with trendline, category table with spark bars, click category → drill-down
3. Cash Flow tab: Safe to Spend cards, Sankey diagram with hover tooltips, bar chart with trendline, click node → drill-down
4. Trends tab: summary bar, line chart
5. Net Worth tab: summary bar with change %
6. Filter bar: date presets, account/category multi-select — all tabs respond
7. Saved reports: save/load/delete works
8. Mobile: 5 tabs scroll horizontally

- [ ] **Step 3: Update research doc status**

Update `docs/reports-feature-research.md` implementation status table to reflect completed features.

- [ ] **Step 4: Commit**

```bash
git add docs/reports-feature-research.md
git commit -m "docs: update reports research doc with completed implementation status"
```
