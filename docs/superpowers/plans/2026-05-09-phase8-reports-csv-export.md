# Phase 8 — Reports + CSV Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a tabbed reports page (spending, income vs expense, trends, net worth), CSV export of filtered transactions, saved report presets, and a budget progress dashboard widget.

**Architecture:** Extract chart rendering from dashboard widgets into reusable atoms. Report queries use SQL aggregation with split-aware two-pass strategy. URL-driven filters via searchParams. CSV export via authenticated API route. Saved reports store serialized URL params.

**Tech Stack:** Next.js 16 App Router, Drizzle ORM + SQLite, shadcn/ui v4, Recharts v3, Vitest, fast-check

---

### Task 1: Install shadcn prerequisites + extract shared utilities

**Files:**
- Modify: `src/lib/date-utils.ts`
- Create: `src/lib/date-utils.test.ts`
- Create: `src/lib/chart-colors.ts`
- Create: `src/hooks/use-search-param-filters.ts`
- Modify: `src/queries/dashboard.ts`
- Modify: `src/components/molecules/transaction-filters.tsx`

- [ ] **Step 1: Install shadcn components**

```bash
pnpm dlx shadcn@latest add popover command checkbox
```

Expected: Creates `src/components/ui/popover.tsx`, `src/components/ui/command.tsx`, `src/components/ui/checkbox.tsx`

- [ ] **Step 2: Write failing tests for date-utils**

Create `src/lib/date-utils.test.ts`:

```ts
import { describe, test, expect } from "vitest";
import { test as fcTest } from "@fast-check/vitest";
import { fc } from "@fast-check/vitest";
import { rangeToDateBounds, monthBounds, shiftDateRange, comparisonLabel } from "./date-utils";

describe("rangeToDateBounds", () => {
  test("returns date strings for all presets", () => {
    for (const range of ["1M", "3M", "6M", "1Y"] as const) {
      const result = rangeToDateBounds(range);
      expect(result.from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(result.to).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(result.from < result.to).toBe(true);
    }
  });

  test("all returns null from", () => {
    const result = rangeToDateBounds("all");
    expect(result.from).toBeNull();
    expect(result.to).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("monthBounds", () => {
  test("returns first and last day of month", () => {
    const result = monthBounds("2026-02");
    expect(result.from).toBe("2026-02-01");
    expect(result.to).toBe("2026-02-28");
  });

  test("handles leap year", () => {
    const result = monthBounds("2024-02");
    expect(result.to).toBe("2024-02-29");
  });

  test("handles December", () => {
    const result = monthBounds("2026-12");
    expect(result.from).toBe("2026-12-01");
    expect(result.to).toBe("2026-12-31");
  });

  fcTest.prop([
    fc.integer({ min: 2020, max: 2030 }),
    fc.integer({ min: 1, max: 12 }),
  ])("last day is always a valid calendar date", (year, month) => {
    const monthStr = `${year}-${String(month).padStart(2, "0")}`;
    const result = monthBounds(monthStr);
    const parsed = new Date(result.to + "T00:00:00");
    expect(parsed.getMonth() + 1).toBe(month);
  });
});

describe("shiftDateRange", () => {
  test("shifts preset 3M range by calendar months", () => {
    const result = shiftDateRange("2026-04-01", "2026-06-30", "back", true);
    expect(result.from).toBe("2026-01-01");
    expect(result.to).toBe("2026-03-31");
  });

  test("shifts custom range by exact day count", () => {
    const result = shiftDateRange("2026-03-10", "2026-03-20", "back", false);
    const fromDate = new Date(result.from + "T00:00:00");
    const toDate = new Date(result.to + "T00:00:00");
    const days = (toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24);
    expect(days).toBe(10);
  });

  fcTest.prop([
    fc.date({ min: new Date("2020-01-01"), max: new Date("2029-01-01") }),
    fc.integer({ min: 1, max: 365 }),
  ])("custom range shift preserves length", (startDate, daySpan) => {
    const from = startDate.toISOString().slice(0, 10);
    const toDate = new Date(startDate.getTime() + daySpan * 86400000);
    const to = toDate.toISOString().slice(0, 10);
    const result = shiftDateRange(from, to, "back", false);
    const originalMs = toDate.getTime() - startDate.getTime();
    const shiftedMs = new Date(result.to + "T00:00:00").getTime() - new Date(result.from + "T00:00:00").getTime();
    expect(shiftedMs).toBe(originalMs);
  });
});

describe("comparisonLabel", () => {
  test("formats date range as vs label", () => {
    const result = comparisonLabel("2026-01-01", "2026-03-31");
    expect(result).toMatch(/^vs /);
    expect(result).toContain("Jan");
    expect(result).toContain("Mar");
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
pnpm vitest run src/lib/date-utils.test.ts
```

Expected: FAIL — `rangeToDateBounds`, `monthBounds`, `shiftDateRange`, `comparisonLabel` not exported

- [ ] **Step 4: Implement date-utils functions**

Add to `src/lib/date-utils.ts`:

```ts
export function rangeToDateBounds(range: string): { from: string | null; to: string } {
  const to = todayDateString();
  const now = new Date();
  switch (range) {
    case "1M":
      now.setMonth(now.getMonth() - 1);
      return { from: now.toISOString().slice(0, 10), to };
    case "3M":
      now.setMonth(now.getMonth() - 3);
      return { from: now.toISOString().slice(0, 10), to };
    case "6M":
      now.setMonth(now.getMonth() - 6);
      return { from: now.toISOString().slice(0, 10), to };
    case "1Y":
      now.setFullYear(now.getFullYear() - 1);
      return { from: now.toISOString().slice(0, 10), to };
    case "all":
      return { from: null, to };
    default:
      return { from: null, to };
  }
}

export function monthBounds(monthStr: string): { from: string; to: string } {
  const [year, month] = monthStr.split("-").map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  return {
    from: `${monthStr}-01`,
    to: `${monthStr}-${String(lastDay).padStart(2, "0")}`,
  };
}

export function shiftDateRange(
  from: string,
  to: string,
  direction: "back" | "forward",
  isPreset: boolean,
): { from: string; to: string } {
  const sign = direction === "back" ? -1 : 1;

  if (isPreset) {
    const fromDate = new Date(from + "T00:00:00");
    const toDate = new Date(to + "T00:00:00");
    const monthSpan =
      (toDate.getFullYear() - fromDate.getFullYear()) * 12 +
      (toDate.getMonth() - fromDate.getMonth()) + 1;
    const newFrom = new Date(fromDate);
    newFrom.setMonth(newFrom.getMonth() + sign * monthSpan);
    const newTo = new Date(toDate);
    newTo.setMonth(newTo.getMonth() + sign * monthSpan);
    return {
      from: newFrom.toISOString().slice(0, 10),
      to: newTo.toISOString().slice(0, 10),
    };
  }

  const fromMs = new Date(from + "T00:00:00").getTime();
  const toMs = new Date(to + "T00:00:00").getTime();
  const spanMs = toMs - fromMs;
  const newFrom = new Date(fromMs + sign * spanMs);
  const newTo = new Date(toMs + sign * spanMs);
  return {
    from: newFrom.toISOString().slice(0, 10),
    to: newTo.toISOString().slice(0, 10),
  };
}

export function comparisonLabel(from: string, to: string): string {
  const fromDate = new Date(from + "T00:00:00");
  const toDate = new Date(to + "T00:00:00");
  const fmt = (d: Date) =>
    d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `vs ${fmt(fromDate)} – ${fmt(toDate)}`;
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
pnpm vitest run src/lib/date-utils.test.ts
```

Expected: ALL PASS

- [ ] **Step 6: Update dashboard.ts to use extracted rangeToDateBounds**

In `src/queries/dashboard.ts`, replace the private `rangeToDateFrom` function:

Remove lines 29-49 (the `rangeToDateFrom` function). Add import at top:

```ts
import { todayDateString, rangeToDateBounds } from "@/lib/date-utils";
```

Replace line 136 (`const dateFrom = rangeToDateFrom(range);`) with:

```ts
const { from: dateFrom } = rangeToDateBounds(range);
```

- [ ] **Step 7: Create chart-colors.ts**

Create `src/lib/chart-colors.ts`:

```ts
export const CHART_COLORS = [
  "hsl(142 76% 36%)",
  "hsl(221 83% 53%)",
  "hsl(262 83% 58%)",
  "hsl(25 95% 53%)",
  "hsl(346 77% 50%)",
  "hsl(47 96% 53%)",
  "hsl(173 80% 36%)",
  "hsl(322 65% 55%)",
];

export const INCOME_COLOR = "hsl(142 76% 36%)";
export const EXPENSE_COLOR = "hsl(var(--destructive))";
export const PRIMARY_COLOR = "hsl(var(--primary))";
```

- [ ] **Step 8: Create useSearchParamFilters hook**

Create `src/hooks/use-search-param-filters.ts`:

```ts
"use client";

import { useCallback } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";

export function useSearchParamFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const updateFilter = useCallback(
    (key: string, value: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value === null || value === "" || value === "all") {
        params.delete(key);
      } else {
        params.set(key, value);
      }
      router.push(`${pathname}?${params.toString()}`);
    },
    [router, pathname, searchParams],
  );

  const updateFilters = useCallback(
    (entries: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(entries)) {
        if (value === null || value === "" || value === "all") {
          params.delete(key);
        } else {
          params.set(key, value);
        }
      }
      router.push(`${pathname}?${params.toString()}`);
    },
    [router, pathname, searchParams],
  );

  const clearFilters = useCallback(() => {
    router.push(pathname);
  }, [router, pathname]);

  const hasFilters = searchParams.toString().length > 0;

  return { updateFilter, updateFilters, clearFilters, hasFilters, searchParams };
}
```

- [ ] **Step 9: Refactor transaction-filters.tsx to use the hook**

In `src/components/molecules/transaction-filters.tsx`:

Replace the manual `useRouter`/`usePathname`/`useSearchParams` + `updateFilter` callback with the hook:

Remove imports: `useRouter`, `usePathname` (keep `useSearchParams` removal too since hook provides it).

Add: `import { useSearchParamFilters } from "@/hooks/use-search-param-filters";`

Replace lines 31-49 (the `updateFilter` callback and hooks) with:

```ts
const { updateFilter, clearFilters, hasFilters, searchParams } = useSearchParamFilters();
```

Remove the manual `clearFilters` function (lines 59-62) and `hasFilters` computation (lines 80-86) since both come from the hook.

Keep the `searchValue` state and `debounceRef` for search debouncing (lines 35-36) as-is.

- [ ] **Step 10: Verify existing tests still pass**

```bash
pnpm vitest run
```

Expected: All existing tests pass (no regressions from refactoring)

- [ ] **Step 11: Commit**

```bash
git add src/lib/date-utils.ts src/lib/date-utils.test.ts src/lib/chart-colors.ts src/hooks/use-search-param-filters.ts src/queries/dashboard.ts src/components/molecules/transaction-filters.tsx src/components/ui/popover.tsx src/components/ui/command.tsx src/components/ui/checkbox.tsx
git commit -m "refactor: extract date-utils, chart-colors, useSearchParamFilters for Phase 8"
```

---

### Task 2: Extract chart atoms from dashboard widgets

**Files:**
- Create: `src/components/atoms/spending-chart.tsx`
- Create: `src/components/atoms/cash-flow-bar-chart.tsx`
- Create: `src/components/atoms/net-worth-area-chart.tsx`
- Modify: `src/components/organisms/widgets/spending-by-category.tsx`
- Modify: `src/components/organisms/widgets/cash-flow-chart.tsx`
- Modify: `src/components/organisms/widgets/net-worth-chart.tsx`

- [ ] **Step 1: Create spending-chart atom**

Create `src/components/atoms/spending-chart.tsx`:

```tsx
"use client";

import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts";
import { centsToDisplay } from "@/lib/money";
import { CHART_COLORS } from "@/lib/chart-colors";
import type { MonthlySpendingRow } from "@/queries/dashboard";

interface SpendingChartProps {
  data: MonthlySpendingRow[];
  viewMode: "donut" | "bar";
}

export function SpendingChart({ data, viewMode }: SpendingChartProps) {
  const total = data.reduce((sum, d) => sum + d.total, 0);
  const top8 = data.slice(0, 8);
  const otherTotal = data.slice(8).reduce((sum, d) => sum + d.total, 0);
  const chartData =
    otherTotal > 0
      ? [
          ...top8,
          {
            categoryId: null,
            categoryName: "Other",
            categoryIcon: "📦",
            groupName: "Other",
            total: otherTotal,
          },
        ]
      : top8;

  if (viewMode === "donut") {
    return (
      <div className="flex gap-4 h-full">
        <div className="w-1/2">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                dataKey="total"
                nameKey="categoryName"
                cx="50%"
                cy="50%"
                innerRadius="55%"
                outerRadius="85%"
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
              key={row.categoryId ?? "other"}
              name={row.categoryName}
              icon={row.categoryIcon ?? "📦"}
              amount={row.total}
              percentage={total > 0 ? (row.total / total) * 100 : 0}
              color={CHART_COLORS[i % CHART_COLORS.length]}
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
        <YAxis type="category" dataKey="categoryName" tick={{ fontSize: 11 }} width={75} />
        <Tooltip formatter={(v) => centsToDisplay(Number(v))} />
        <Bar dataKey="total">
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
  icon,
  amount,
  percentage,
  color,
}: {
  name: string;
  icon: string;
  amount: number;
  percentage: number;
  color: string;
}) {
  return (
    <div className="flex items-center gap-2 py-1 text-sm">
      <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
      <span className="truncate flex-1">
        {icon} {name}
      </span>
      <span className="font-medium tabular-nums">{centsToDisplay(amount)}</span>
      <span className="text-muted-foreground text-xs w-10 text-right">{percentage.toFixed(0)}%</span>
    </div>
  );
}
```

- [ ] **Step 2: Create cash-flow-bar-chart atom**

Create `src/components/atoms/cash-flow-bar-chart.tsx`:

```tsx
"use client";

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { centsToDisplay } from "@/lib/money";
import { INCOME_COLOR, EXPENSE_COLOR } from "@/lib/chart-colors";
import type { CashFlowRow } from "@/queries/dashboard";

interface CashFlowBarChartProps {
  data: CashFlowRow[];
  height?: number;
}

function formatMonth(month: string) {
  const [y, m] = month.split("-");
  return new Date(Number(y), Number(m) - 1).toLocaleDateString("en-US", { month: "short" });
}

export function CashFlowBarChart({ data }: CashFlowBarChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        Cash flow data will appear after your first sync.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
        <XAxis dataKey="month" tickFormatter={formatMonth} tick={{ fontSize: 11 }} />
        <YAxis
          tickFormatter={(v) => centsToDisplay(v).replace(/\.00$/, "")}
          tick={{ fontSize: 11 }}
          width={60}
        />
        <Tooltip
          formatter={(v) => centsToDisplay(Number(v))}
          labelFormatter={(label) => formatMonth(String(label))}
        />
        <Legend />
        <Bar dataKey="income" name="Income" fill={INCOME_COLOR} radius={[2, 2, 0, 0]} />
        <Bar dataKey="expenses" name="Expenses" fill={EXPENSE_COLOR} radius={[2, 2, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
```

- [ ] **Step 3: Create net-worth-area-chart atom**

Create `src/components/atoms/net-worth-area-chart.tsx`:

```tsx
"use client";

import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { centsToDisplay } from "@/lib/money";
import { INCOME_COLOR, EXPENSE_COLOR, PRIMARY_COLOR } from "@/lib/chart-colors";
import type { NetWorthPoint } from "@/queries/dashboard";

interface NetWorthAreaChartProps {
  data: NetWorthPoint[];
  height?: number;
}

function formatDate(date: string) {
  return new Date(date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

interface TooltipEntry {
  name: string;
  value: number;
  color: string;
}

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: TooltipEntry[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-sm shadow-md">
      <p className="font-medium">{formatDate(label ?? "")}</p>
      {payload.map((entry: TooltipEntry) => (
        <p key={entry.name} style={{ color: entry.color }}>
          {entry.name}: {centsToDisplay(entry.value)}
        </p>
      ))}
    </div>
  );
}

export function NetWorthAreaChart({ data }: NetWorthAreaChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        Net worth history will appear after your accounts sync.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={data} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
        <XAxis dataKey="date" tickFormatter={formatDate} tick={{ fontSize: 11 }} />
        <YAxis
          tickFormatter={(v) => centsToDisplay(v).replace(/\.00$/, "")}
          tick={{ fontSize: 11 }}
          width={60}
        />
        <Tooltip content={<CustomTooltip />} />
        <Area
          type="monotone"
          dataKey="netWorth"
          name="Net Worth"
          fill={`${PRIMARY_COLOR.replace(")", " / 0.1)")}`}
          stroke={PRIMARY_COLOR}
          strokeWidth={2}
        />
        <Line type="monotone" dataKey="assets" name="Assets" stroke={INCOME_COLOR} strokeWidth={1.5} dot={false} />
        <Line type="monotone" dataKey="liabilities" name="Liabilities" stroke={EXPENSE_COLOR} strokeWidth={1.5} dot={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
```

- [ ] **Step 4: Update spending-by-category widget to use atom**

Replace `src/components/organisms/widgets/spending-by-category.tsx`:

```tsx
"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChartViewToggle } from "@/components/atoms/chart-view-toggle";
import { SpendingChart } from "@/components/atoms/spending-chart";
import { formatMonthLong, shiftMonth } from "@/lib/date-utils";
import type { MonthlySpendingRow } from "@/queries/dashboard";

interface SpendingByCategoryProps {
  data: MonthlySpendingRow[];
  currentMonth: string;
  onMonthChange: (month: string) => void;
  isLoading?: boolean;
}

export function SpendingByCategory({ data, currentMonth, onMonthChange, isLoading }: SpendingByCategoryProps) {
  const [view, setView] = useState<"donut" | "bar">("donut");

  if (data.length === 0 && !isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        No spending data for {formatMonthLong(currentMonth)}.
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="size-6" onClick={() => onMonthChange(shiftMonth(currentMonth, -1))}>
            <ChevronLeft className="size-4" />
          </Button>
          <span className="text-sm font-medium min-w-[140px] text-center">{formatMonthLong(currentMonth)}</span>
          <Button variant="ghost" size="icon" className="size-6" onClick={() => onMonthChange(shiftMonth(currentMonth, 1))}>
            <ChevronRight className="size-4" />
          </Button>
        </div>
        <ChartViewToggle value={view} onChange={setView} />
      </div>
      <div className="flex-1 min-h-0">
        <SpendingChart data={data} viewMode={view} />
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Update cash-flow-chart widget to use atom**

Replace `src/components/organisms/widgets/cash-flow-chart.tsx`:

```tsx
"use client";

import { CashFlowBarChart } from "@/components/atoms/cash-flow-bar-chart";
import type { CashFlowRow } from "@/queries/dashboard";

interface CashFlowChartProps {
  data: CashFlowRow[];
}

export function CashFlowChart({ data }: CashFlowChartProps) {
  return <CashFlowBarChart data={data} />;
}
```

- [ ] **Step 6: Update net-worth-chart widget to use atom**

Replace `src/components/organisms/widgets/net-worth-chart.tsx`:

```tsx
"use client";

import { DateRangeSelector } from "@/components/atoms/date-range-selector";
import { NetWorthAreaChart } from "@/components/atoms/net-worth-area-chart";
import type { NetWorthPoint } from "@/queries/dashboard";

interface NetWorthChartProps {
  data: NetWorthPoint[];
  onRangeChange: (range: string) => void;
  currentRange: string;
  isLoading?: boolean;
}

export function NetWorthChart({ data, onRangeChange, currentRange, isLoading }: NetWorthChartProps) {
  return (
    <div className="relative h-full flex flex-col">
      <div className="flex justify-end mb-2">
        <DateRangeSelector value={currentRange} onChange={onRangeChange} />
      </div>
      {isLoading && (
        <div className="absolute inset-0 bg-background/50 flex items-center justify-center z-10">
          <div className="animate-pulse text-sm text-muted-foreground">Loading...</div>
        </div>
      )}
      <div className="flex-1 min-h-0">
        <NetWorthAreaChart data={data} />
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Verify dashboard still works**

```bash
pnpm vitest run
pnpm typecheck
```

Expected: All pass, no regressions

- [ ] **Step 8: Commit**

```bash
git add src/components/atoms/spending-chart.tsx src/components/atoms/cash-flow-bar-chart.tsx src/components/atoms/net-worth-area-chart.tsx src/components/organisms/widgets/spending-by-category.tsx src/components/organisms/widgets/cash-flow-chart.tsx src/components/organisms/widgets/net-worth-chart.tsx
git commit -m "refactor: extract chart renderers into reusable atoms"
```

---

### Task 3: Schema + saved reports queries and actions

**Files:**
- Create: `src/db/schema/reports.ts`
- Modify: `src/db/schema/index.ts`
- Create: `src/queries/saved-reports.ts`
- Create: `src/actions/reports.ts`
- Create: `tests/integration/report-actions.test.ts`

- [ ] **Step 1: Create saved_reports Drizzle schema**

Create `src/db/schema/reports.ts`:

```ts
import { index, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { households } from "./households";

export const savedReports = sqliteTable(
  "saved_reports",
  {
    id: text("id").primaryKey(),
    householdId: text("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    reportType: text("report_type").notNull(),
    filters: text("filters").notNull(),
    createdAt: text("created_at").default(sql`(CURRENT_TIMESTAMP)`).notNull(),
    updatedAt: text("updated_at").default(sql`(CURRENT_TIMESTAMP)`).notNull(),
  },
  (table) => [
    index("idx_saved_reports_household").on(table.householdId),
  ]
);
```

- [ ] **Step 2: Export from schema index**

In `src/db/schema/index.ts`, add:

```ts
export * from "./reports";
```

- [ ] **Step 3: Generate and run migration**

```bash
pnpm db:generate
pnpm db:migrate
```

Expected: Migration file created for `saved_reports` table

- [ ] **Step 4: Write failing tests for saved report actions**

Create `tests/integration/report-actions.test.ts`:

```ts
import { describe, test, expect, beforeAll, afterAll, vi } from "vitest";
import { createTestDb } from "./setup";
import { insertHousehold } from "./helpers";
import type { LedgrDb } from "../../src/db";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const mockHouseholdId = "test-household-id";
vi.mock("../../src/lib/auth/session", () => ({
  getHouseholdId: vi.fn(() => Promise.resolve(mockHouseholdId)),
}));

let db: LedgrDb;
let close: () => void;

beforeAll(() => {
  const testDb = createTestDb();
  db = testDb.db;
  close = testDb.close;
  insertHousehold(db, "Test Household");
});

afterAll(() => close());

describe("saveReport", () => {
  test("persists report and returns id", async () => {
    const { saveReport } = await import("../../src/actions/reports");
    const result = await saveReport(
      { name: "Monthly Spending", reportType: "spending", filters: { dateFrom: "2026-01-01", dateTo: "2026-03-31" } },
      db,
    );
    expect(result).toHaveProperty("success", true);
    expect(result).toHaveProperty("id");
  });
});

describe("deleteReport", () => {
  test("deletes owned report", async () => {
    const { saveReport, deleteReport } = await import("../../src/actions/reports");
    const saved = await saveReport(
      { name: "To Delete", reportType: "spending", filters: { dateFrom: "2026-01-01", dateTo: "2026-01-31" } },
      db,
    );
    if (!("id" in saved)) throw new Error("save failed");

    const result = await deleteReport(saved.id, db);
    expect(result).toEqual({ success: true });
  });

  test("rejects deletion of another household's report", async () => {
    const { getSavedReportsByHousehold } = await import("../../src/queries/saved-reports");
    const { deleteReport } = await import("../../src/actions/reports");

    const { householdId: otherHhId } = insertHousehold(db, "Other Household");
    const { savedReports } = await import("../../src/db/schema");
    const { v4: uuid } = await import("uuid");
    const id = uuid();
    db.insert(savedReports).values({
      id,
      householdId: otherHhId,
      name: "Other Report",
      reportType: "spending",
      filters: JSON.stringify({ dateFrom: "2026-01-01", dateTo: "2026-01-31" }),
    }).run();

    const result = await deleteReport(id, db);
    expect(result).toHaveProperty("error");

    const otherReports = getSavedReportsByHousehold(otherHhId, db);
    expect(otherReports).toHaveLength(1);
  });
});

describe("getSavedReportsByHousehold", () => {
  test("scoped to household", async () => {
    const { getSavedReportsByHousehold } = await import("../../src/queries/saved-reports");
    const reports = getSavedReportsByHousehold(mockHouseholdId, db);
    for (const report of reports) {
      expect(report.householdId).toBe(mockHouseholdId);
    }
  });
});
```

- [ ] **Step 5: Run tests to verify they fail**

```bash
pnpm vitest run tests/integration/report-actions.test.ts
```

Expected: FAIL — modules don't exist yet

- [ ] **Step 6: Create saved-reports queries**

Create `src/queries/saved-reports.ts`:

```ts
import { eq, desc } from "drizzle-orm";
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

export function getSavedReportById(
  id: string,
  householdId: string,
  db: LedgrDb = defaultDb,
) {
  const scoped = scopedQuery(householdId, db);
  return db
    .select()
    .from(savedReports)
    .where(scoped.where(savedReports, eq(savedReports.id, id)))
    .get();
}
```

- [ ] **Step 7: Create report actions**

Create `src/actions/reports.ts`:

```ts
"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { v4 as uuid } from "uuid";
import { db as defaultDb, type LedgrDb } from "@/db";
import { savedReports } from "@/db/schema";
import { scopedQuery } from "@/lib/scoped-query";
import { getHouseholdId } from "@/lib/auth/session";

const saveReportSchema = z.object({
  name: z.string().min(1).max(100),
  reportType: z.enum(["spending", "income-expense", "trends", "net-worth"]),
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
  const id = uuid();
  const now = new Date().toISOString();

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
  const scoped = scopedQuery(householdId, db);

  const existing = db
    .select({ id: savedReports.id })
    .from(savedReports)
    .where(scoped.where(savedReports, eq(savedReports.id, reportId)))
    .get();

  if (!existing) {
    return { error: "Report not found" };
  }

  db.delete(savedReports).where(eq(savedReports.id, reportId)).run();

  revalidatePath("/reports");
  return { success: true };
}
```

- [ ] **Step 8: Run tests to verify they pass**

```bash
pnpm vitest run tests/integration/report-actions.test.ts
```

Expected: ALL PASS

- [ ] **Step 9: Commit**

```bash
git add src/db/schema/reports.ts src/db/schema/index.ts src/queries/saved-reports.ts src/actions/reports.ts tests/integration/report-actions.test.ts src/db/migrations/
git commit -m "feat(reports): add saved_reports schema, queries, and actions"
```

---

### Task 4: Report aggregation queries

**Files:**
- Create: `src/queries/reports.ts`
- Create: `tests/integration/report-queries.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/integration/report-queries.test.ts`:

```ts
import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { createTestDb } from "./setup";
import {
  insertHousehold,
  insertAccount,
  insertTransaction,
  insertCategoryGroup,
  insertCategory,
  insertTransactionSplit,
} from "./helpers";
import type { LedgrDb } from "../../src/db";

let db: LedgrDb;
let close: () => void;
let householdId: string;
let accountId: string;
let foodCatId: string;
let rentCatId: string;
let incomeCatId: string;
let groupId: string;

beforeEach(() => {
  const testDb = createTestDb();
  db = testDb.db;
  close = testDb.close;

  ({ householdId } = insertHousehold(db));
  ({ accountId } = insertAccount(db, householdId));
  ({ groupId } = insertCategoryGroup(db, householdId, { name: "Living" }));
  ({ categoryId: foodCatId } = insertCategory(db, householdId, groupId, { name: "Food" }));
  ({ categoryId: rentCatId } = insertCategory(db, householdId, groupId, { name: "Rent" }));
  const incGroup = insertCategoryGroup(db, householdId, { name: "Income" });
  ({ categoryId: incomeCatId } = insertCategory(db, householdId, incGroup.groupId, { name: "Salary", isIncome: true }));

  // Food transactions in March
  insertTransaction(db, householdId, accountId, { date: "2026-03-05", normalizedAmount: 5000, amount: -5000, categoryId: foodCatId, name: "Grocery" });
  insertTransaction(db, householdId, accountId, { date: "2026-03-15", normalizedAmount: 3000, amount: -3000, categoryId: foodCatId, name: "Restaurant" });
  // Rent in March
  insertTransaction(db, householdId, accountId, { date: "2026-03-01", normalizedAmount: 100000, amount: -100000, categoryId: rentCatId, name: "Rent" });
  // Income in March (negative normalizedAmount = income)
  insertTransaction(db, householdId, accountId, { date: "2026-03-01", normalizedAmount: -500000, amount: 500000, categoryId: incomeCatId, name: "Salary" });
  // Food in February (prior period)
  insertTransaction(db, householdId, accountId, { date: "2026-02-10", normalizedAmount: 4000, amount: -4000, categoryId: foodCatId, name: "Grocery Feb" });
});

afterEach(() => close());

describe("getSpendingByCategory", () => {
  test("returns correct totals grouped by category", async () => {
    const { getSpendingByCategory } = await import("../../src/queries/reports");
    const result = getSpendingByCategory(householdId, { dateFrom: "2026-03-01", dateTo: "2026-03-31" }, db);

    const food = result.find((r) => r.categoryName === "Food");
    const rent = result.find((r) => r.categoryName === "Rent");
    expect(food?.total).toBe(8000);
    expect(rent?.total).toBe(100000);
    // Income should NOT appear
    const salary = result.find((r) => r.categoryName === "Salary");
    expect(salary).toBeUndefined();
  });

  test("comparison period calculates deltas", async () => {
    const { getSpendingByCategory } = await import("../../src/queries/reports");
    const result = getSpendingByCategory(
      householdId,
      { dateFrom: "2026-03-01", dateTo: "2026-03-31" },
      db,
      { dateFrom: "2026-02-01", dateTo: "2026-02-28" },
    );

    const food = result.find((r) => r.categoryName === "Food");
    expect(food?.total).toBe(8000);
    expect(food?.prevTotal).toBe(4000);
  });
});

describe("getIncomeVsExpense", () => {
  test("uses normalizedAmount sign, handles uncategorized", async () => {
    // Add uncategorized expense
    insertTransaction(db, householdId, accountId, { date: "2026-03-20", normalizedAmount: 2000, amount: -2000, categoryId: null, name: "Unknown" });

    const { getIncomeVsExpense } = await import("../../src/queries/reports");
    const result = getIncomeVsExpense(householdId, { dateFrom: "2026-03-01", dateTo: "2026-03-31" }, db);

    const march = result.find((r) => r.period === "2026-03");
    expect(march).toBeDefined();
    expect(march!.expenses).toBe(110000); // 5000 + 3000 + 100000 + 2000
    expect(march!.income).toBe(500000);
    expect(march!.net).toBe(500000 - 110000);
  });
});

describe("getCategoryTrends", () => {
  test("groups by month and category", async () => {
    const { getCategoryTrends } = await import("../../src/queries/reports");
    const result = getCategoryTrends(householdId, { dateFrom: "2026-02-01", dateTo: "2026-03-31" }, db);

    const foodMarch = result.find((r) => r.period === "2026-03" && r.categoryName === "Food");
    const foodFeb = result.find((r) => r.period === "2026-02" && r.categoryName === "Food");
    expect(foodMarch?.total).toBe(8000);
    expect(foodFeb?.total).toBe(4000);
  });
});

describe("guards", () => {
  test("transfers excluded", async () => {
    insertTransaction(db, householdId, accountId, {
      date: "2026-03-10",
      normalizedAmount: 50000,
      amount: -50000,
      categoryId: foodCatId,
      name: "Transfer",
      isTransfer: true,
    });

    const { getSpendingByCategory } = await import("../../src/queries/reports");
    const result = getSpendingByCategory(householdId, { dateFrom: "2026-03-01", dateTo: "2026-03-31" }, db);
    const food = result.find((r) => r.categoryName === "Food");
    expect(food?.total).toBe(8000); // Transfer NOT included
  });

  test("pending transactions excluded", async () => {
    insertTransaction(db, householdId, accountId, {
      date: "2026-03-10",
      normalizedAmount: 9999,
      amount: -9999,
      categoryId: foodCatId,
      name: "Pending",
      pending: true,
    });

    const { getSpendingByCategory } = await import("../../src/queries/reports");
    const result = getSpendingByCategory(householdId, { dateFrom: "2026-03-01", dateTo: "2026-03-31" }, db);
    const food = result.find((r) => r.categoryName === "Food");
    expect(food?.total).toBe(8000); // Pending NOT included
  });

  test("account filter narrows results", async () => {
    const { accountId: otherAcctId } = insertAccount(db, householdId, { name: "Savings", type: "savings" });
    insertTransaction(db, householdId, otherAcctId, {
      date: "2026-03-10",
      normalizedAmount: 7000,
      amount: -7000,
      categoryId: foodCatId,
      name: "Other Acct Food",
    });

    const { getSpendingByCategory } = await import("../../src/queries/reports");
    const result = getSpendingByCategory(householdId, { dateFrom: "2026-03-01", dateTo: "2026-03-31", accountIds: [accountId] }, db);
    const food = result.find((r) => r.categoryName === "Food");
    expect(food?.total).toBe(8000); // Only original account
  });

  test("split transactions attributed to split categories", async () => {
    // Create a split parent
    const { transactionId: splitParentId } = insertTransaction(db, householdId, accountId, {
      date: "2026-03-25",
      normalizedAmount: 10000,
      amount: -10000,
      categoryId: foodCatId,
      name: "Split Purchase",
    });

    insertTransactionSplit(db, splitParentId, foodCatId, 6000);
    insertTransactionSplit(db, splitParentId, rentCatId, 4000);

    const { getSpendingByCategory } = await import("../../src/queries/reports");
    const result = getSpendingByCategory(householdId, { dateFrom: "2026-03-01", dateTo: "2026-03-31" }, db);

    const food = result.find((r) => r.categoryName === "Food");
    const rent = result.find((r) => r.categoryName === "Rent");
    // Food: 5000 + 3000 (non-split) + 6000 (split) = 14000
    expect(food?.total).toBe(14000);
    // Rent: 100000 (non-split) + 4000 (split) = 104000
    expect(rent?.total).toBe(104000);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm vitest run tests/integration/report-queries.test.ts
```

Expected: FAIL — `src/queries/reports` doesn't exist

- [ ] **Step 3: Implement report queries**

Create `src/queries/reports.ts`:

```ts
import { eq, gt, gte, lte, sql, inArray, notInArray, isNull } from "drizzle-orm";
import { db as defaultDb, type LedgrDb } from "@/db";
import {
  transactions,
  transactionSplits,
  categories,
  categoryGroups,
  accounts,
  balanceHistory,
} from "@/db/schema";
import { scopedQuery } from "@/lib/scoped-query";
import { notDeleted } from "@/lib/query-helpers";
import { classifyAccountType } from "@/lib/account-utils";
import { todayDateString } from "@/lib/date-utils";

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

// ── Shared base conditions ──────────────────────────────────────────

function spendingBaseConditions(filters: ReportFilters) {
  const conditions = [
    notDeleted(transactions),
    gt(transactions.normalizedAmount, 0),
    eq(transactions.pending, false),
    eq(transactions.isTransfer, false),
    isNull(transactions.transferPairId),
    gte(transactions.date, filters.dateFrom),
    lte(transactions.date, filters.dateTo),
  ];
  if (filters.accountIds?.length) {
    conditions.push(inArray(transactions.accountId, filters.accountIds));
  }
  return conditions;
}

// ── Split-aware spending aggregation ────────────────────────────────

function aggregateSpending(
  householdId: string,
  filters: ReportFilters,
  db: LedgrDb,
): Map<string, number> {
  const scoped = scopedQuery(householdId, db);
  const conditions = spendingBaseConditions(filters);

  // Find split parents
  const splitParentRows = db
    .select({ transactionId: transactionSplits.transactionId })
    .from(transactionSplits)
    .innerJoin(transactions, eq(transactionSplits.transactionId, transactions.id))
    .where(scoped.where(transactions, ...conditions))
    .groupBy(transactionSplits.transactionId)
    .all();

  const splitParentIds = splitParentRows.map((r) => r.transactionId);

  // Non-split transactions
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

  // Split transactions
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

function enrichSpendingMap(
  spending: Map<string, number>,
  db: LedgrDb,
): Omit<SpendingRow, "prevTotal">[] {
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
      .all()
      .filter((c) => categoryIds.includes(c.id));
  }

  const catMap = new Map(catRows.map((c) => [c.id, c]));
  const result: Omit<SpendingRow, "prevTotal">[] = [];

  for (const [key, total] of spending.entries()) {
    if (key === "uncategorized") {
      result.push({ categoryId: null, categoryName: "Uncategorized", groupName: null, groupId: null, total });
    } else {
      const cat = catMap.get(key);
      result.push({
        categoryId: key,
        categoryName: cat?.name ?? "Unknown",
        groupName: cat?.groupName ?? null,
        groupId: cat?.groupId ?? null,
        total,
      });
    }
  }

  return result.sort((a, b) => b.total - a.total);
}

// ── Public query functions ──────────────────────────────────────────

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
    ...row,
    prevTotal: prevMap.get(row.categoryId ?? "uncategorized") ?? 0,
  }));
}

export function getIncomeVsExpense(
  householdId: string,
  filters: ReportFilters,
  db: LedgrDb = defaultDb,
): IncomeExpenseRow[] {
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

  const txns = db
    .select({
      date: transactions.date,
      normalizedAmount: transactions.normalizedAmount,
    })
    .from(transactions)
    .where(scoped.where(transactions, ...conditions))
    .all();

  const byMonth = new Map<string, { income: number; expenses: number }>();
  for (const txn of txns) {
    const month = txn.date.slice(0, 7);
    if (!byMonth.has(month)) {
      byMonth.set(month, { income: 0, expenses: 0 });
    }
    const entry = byMonth.get(month)!;
    if (txn.normalizedAmount > 0) {
      entry.expenses += txn.normalizedAmount;
    } else {
      entry.income += Math.abs(txn.normalizedAmount);
    }
  }

  return [...byMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([period, { income, expenses }]) => ({
      period,
      income,
      expenses,
      net: income - expenses,
    }));
}

export function getCategoryTrends(
  householdId: string,
  filters: ReportFilters,
  db: LedgrDb = defaultDb,
): CategoryTrendRow[] {
  const scoped = scopedQuery(householdId, db);
  const conditions = spendingBaseConditions(filters);

  if (filters.categoryIds?.length) {
    conditions.push(inArray(transactions.categoryId, filters.categoryIds));
  }

  // Find split parents
  const splitParentRows = db
    .select({ transactionId: transactionSplits.transactionId })
    .from(transactionSplits)
    .innerJoin(transactions, eq(transactionSplits.transactionId, transactions.id))
    .where(scoped.where(transactions, ...conditions))
    .groupBy(transactionSplits.transactionId)
    .all();

  const splitParentIds = splitParentRows.map((r) => r.transactionId);

  // Non-split: group by month + category
  const nonSplitConditions =
    splitParentIds.length > 0
      ? [...conditions, notInArray(transactions.id, splitParentIds)]
      : conditions;

  const nonSplitRows = db
    .select({
      month: sql<string>`substr(${transactions.date}, 1, 7)`,
      categoryId: transactions.categoryId,
      categoryName: categories.name,
      total: sql<number>`COALESCE(SUM(${transactions.normalizedAmount}), 0)`,
    })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(scoped.where(transactions, ...nonSplitConditions))
    .groupBy(sql`substr(${transactions.date}, 1, 7)`, transactions.categoryId)
    .all();

  const trendMap = new Map<string, number>(); // "YYYY-MM|catId" → total

  for (const row of nonSplitRows) {
    if (!row.categoryId) continue;
    const key = `${row.month}|${row.categoryId}`;
    trendMap.set(key, (trendMap.get(key) ?? 0) + row.total);
  }

  // Split transactions: need date from parent
  if (splitParentIds.length > 0) {
    const parentDates = db
      .select({ id: transactions.id, date: transactions.date })
      .from(transactions)
      .where(inArray(transactions.id, splitParentIds))
      .all();

    const dateMap = new Map(parentDates.map((p) => [p.id, p.date.slice(0, 7)]));

    const splitRows = db
      .select({
        transactionId: transactionSplits.transactionId,
        categoryId: transactionSplits.categoryId,
        amount: transactionSplits.amount,
      })
      .from(transactionSplits)
      .where(inArray(transactionSplits.transactionId, splitParentIds))
      .all();

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
    const cats = db
      .select({ id: categories.id, name: categories.name })
      .from(categories)
      .where(inArray(categories.id, allCatIds))
      .all();
    for (const c of cats) catNames.set(c.id, c.name);
  }

  const result: CategoryTrendRow[] = [];
  for (const [key, total] of trendMap.entries()) {
    const [period, categoryId] = key.split("|");
    result.push({
      period,
      categoryId,
      categoryName: catNames.get(categoryId) ?? "Unknown",
      total,
    });
  }

  return result.sort((a, b) => a.period.localeCompare(b.period) || b.total - a.total);
}

export function getReportNetWorthHistory(
  householdId: string,
  filters: ReportFilters,
  db: LedgrDb = defaultDb,
): { date: string; assets: number; liabilities: number; netWorth: number }[] {
  const scoped = scopedQuery(householdId, db);

  const allAccounts = db
    .select({ id: accounts.id, type: accounts.type, isHidden: accounts.isHidden })
    .from(accounts)
    .where(scoped.where(accounts, notDeleted(accounts)))
    .all()
    .filter((a) => !a.isHidden);

  const accountTypeMap = new Map(allAccounts.map((a) => [a.id, a.type]));

  let filteredAccountIds = allAccounts.map((a) => a.id);
  if (filters.accountIds?.length) {
    filteredAccountIds = filteredAccountIds.filter((id) => filters.accountIds!.includes(id));
  }

  if (filteredAccountIds.length === 0) return [];

  const allHistory = db
    .select({
      accountId: balanceHistory.accountId,
      date: balanceHistory.date,
      balance: balanceHistory.balance,
    })
    .from(balanceHistory)
    .all();

  let historyRows = allHistory.filter((row) => filteredAccountIds.includes(row.accountId));
  historyRows = historyRows.filter((row) => row.date >= filters.dateFrom && row.date <= filters.dateTo);

  const byDate = new Map<string, { assets: number; liabilities: number }>();
  for (const row of historyRows) {
    const type = accountTypeMap.get(row.accountId) ?? "other";
    const classification = classifyAccountType(type);
    if (!byDate.has(row.date)) {
      byDate.set(row.date, { assets: 0, liabilities: 0 });
    }
    const point = byDate.get(row.date)!;
    if (classification === "asset") {
      point.assets += row.balance;
    } else {
      point.liabilities += row.balance;
    }
  }

  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, { assets, liabilities }]) => ({
      date,
      assets,
      liabilities,
      netWorth: assets - liabilities,
    }));
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm vitest run tests/integration/report-queries.test.ts
```

Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add src/queries/reports.ts tests/integration/report-queries.test.ts
git commit -m "feat(reports): add report aggregation queries with split-aware spending"
```

---

### Task 5: CSV export API route

**Files:**
- Create: `src/app/api/export/transactions/route.ts`
- Modify: `src/components/molecules/transaction-filters.tsx`
- Create: `tests/integration/csv-export.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/integration/csv-export.test.ts`:

```ts
import { describe, test, expect, beforeAll, afterAll, vi } from "vitest";
import { createTestDb } from "./setup";
import { insertHousehold, insertAccount, insertTransaction, insertCategoryGroup, insertCategory } from "./helpers";
import type { LedgrDb } from "../../src/db";

let db: LedgrDb;
let close: () => void;
let householdId: string;
let accountId: string;

beforeAll(() => {
  const testDb = createTestDb();
  db = testDb.db;
  close = testDb.close;

  ({ householdId } = insertHousehold(db));
  ({ accountId } = insertAccount(db, householdId, { name: "Checking" }));
  const { groupId } = insertCategoryGroup(db, householdId, { name: "Food" });
  const { categoryId } = insertCategory(db, householdId, groupId, { name: "Groceries" });

  insertTransaction(db, householdId, accountId, {
    date: "2026-03-15",
    normalizedAmount: 1250,
    amount: -1250,
    categoryId,
    name: "Test Store",
    originalName: "TEST STORE #123",
  });
  insertTransaction(db, householdId, accountId, {
    date: "2026-04-01",
    normalizedAmount: 2000,
    amount: -2000,
    categoryId,
    name: "Other Store",
    originalName: "OTHER STORE",
  });
});

afterAll(() => close());

describe("buildCsvString", () => {
  test("exports amounts as negated dollars", async () => {
    const { buildCsvString } = await import("../../src/app/api/export/transactions/route");
    const csv = buildCsvString(householdId, {}, db);
    const lines = csv.split("\n");
    // Header + 2 data rows + trailing newline
    expect(lines[0]).toBe("Date,Account,Merchant,Amount,Category,Category Group,Notes,Original Description");
    // $12.50 expense (normalizedAmount=1250) → -12.50
    const row1 = lines.find((l) => l.includes("Test Store"));
    expect(row1).toContain("-12.50");
  });

  test("respects date range filter", async () => {
    const { buildCsvString } = await import("../../src/app/api/export/transactions/route");
    const csv = buildCsvString(householdId, { from: "2026-03-01", to: "2026-03-31" }, db);
    const lines = csv.split("\n").filter((l) => l.trim().length > 0);
    expect(lines).toHaveLength(2); // header + 1 row in March
  });

  test("UTF-8 BOM present", async () => {
    const { buildCsvResponse } = await import("../../src/app/api/export/transactions/route");

    vi.mock("../../src/lib/auth/session", () => ({
      getHouseholdId: vi.fn(() => Promise.resolve(householdId)),
    }));

    const response = buildCsvResponse(householdId, {}, db);
    const buffer = Buffer.from(await response.arrayBuffer());
    expect(buffer[0]).toBe(0xef);
    expect(buffer[1]).toBe(0xbb);
    expect(buffer[2]).toBe(0xbf);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm vitest run tests/integration/csv-export.test.ts
```

Expected: FAIL — module doesn't exist

- [ ] **Step 3: Implement CSV export route**

Create `src/app/api/export/transactions/route.ts`:

```ts
import { NextRequest } from "next/server";
import { getHouseholdId } from "@/lib/auth/session";
import { baseTransactionQuery } from "@/queries/transactions";
import { transactions } from "@/db/schema";
import { notDeleted } from "@/lib/query-helpers";
import { desc, gte, lte, eq, like, type SQL } from "drizzle-orm";
import { db as defaultDb, type LedgrDb } from "@/db";
import { todayDateString } from "@/lib/date-utils";

interface ExportFilters {
  from?: string;
  to?: string;
  account?: string;
  category?: string;
  q?: string;
  reviewed?: string;
}

export function buildCsvString(
  householdId: string,
  filters: ExportFilters,
  db: LedgrDb = defaultDb,
): string {
  const conditions: (SQL | undefined)[] = [notDeleted(transactions)];

  if (filters.from) conditions.push(gte(transactions.date, filters.from));
  if (filters.to) conditions.push(lte(transactions.date, filters.to));
  if (filters.account) conditions.push(eq(transactions.accountId, filters.account));
  if (filters.category) {
    if (filters.category === "uncategorized") {
      conditions.push(eq(transactions.categoryId, ""));
    } else {
      conditions.push(eq(transactions.categoryId, filters.category));
    }
  }
  if (filters.q) conditions.push(like(transactions.name, `%${filters.q}%`));
  if (filters.reviewed === "true") conditions.push(eq(transactions.reviewed, true));

  const base = baseTransactionQuery(db, householdId);
  const rows = base
    .joins(db.select(base.select).from(base.from))
    .where(base.scoped.where(transactions, ...conditions))
    .orderBy(desc(transactions.date), desc(transactions.id))
    .all();

  const header = "Date,Account,Merchant,Amount,Category,Category Group,Notes,Original Description";
  const dataRows = rows.map((row: typeof rows[0]) => {
    const amount = (-(row.normalizedAmount ?? 0) / 100).toFixed(2);
    return [
      row.date,
      csvEscape(row.accountName ?? ""),
      csvEscape(row.merchantName ?? ""),
      amount,
      csvEscape(row.categoryName ?? ""),
      csvEscape(row.categoryGroupName ?? ""),
      csvEscape(row.notes ?? ""),
      csvEscape(row.originalName ?? ""),
    ].join(",");
  });

  return [header, ...dataRows].join("\n") + "\n";
}

function csvEscape(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function buildCsvResponse(
  householdId: string,
  filters: ExportFilters,
  db: LedgrDb = defaultDb,
): Response {
  const csv = buildCsvString(householdId, filters, db);
  const bom = "\xEF\xBB\xBF";
  const filename = `ledgr-transactions-${todayDateString()}.csv`;

  return new Response(bom + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

export async function GET(request: NextRequest) {
  const householdId = await getHouseholdId();
  const sp = request.nextUrl.searchParams;

  const filters: ExportFilters = {
    from: sp.get("from") ?? undefined,
    to: sp.get("to") ?? undefined,
    account: sp.get("account") ?? undefined,
    category: sp.get("category") ?? undefined,
    q: sp.get("q") ?? undefined,
    reviewed: sp.get("reviewed") ?? undefined,
  };

  return buildCsvResponse(householdId, filters);
}
```

- [ ] **Step 4: Add export button to transaction-filters.tsx**

In `src/components/molecules/transaction-filters.tsx`, add an export link after the Clear button:

Add import: `import { Download } from "lucide-react";`

After the Clear button (the last element inside the flex container), add:

```tsx
<a
  href={`/api/export/transactions?${searchParams.toString()}`}
  download
  className="ml-auto"
>
  <Button variant="outline" size="xs" className="text-xs">
    <Download className="h-3 w-3 mr-1" /> Export
  </Button>
</a>
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
pnpm vitest run tests/integration/csv-export.test.ts
```

Expected: ALL PASS

- [ ] **Step 6: Commit**

```bash
git add src/app/api/export/transactions/route.ts src/components/molecules/transaction-filters.tsx tests/integration/csv-export.test.ts
git commit -m "feat(reports): add CSV export API route with auth + export button"
```

---

### Task 6: Reports page — UI shell + filter bar + tabs

**Files:**
- Create: `src/components/molecules/report-filter-bar.tsx`
- Create: `src/components/molecules/comparison-badge.tsx`
- Create: `src/components/atoms/trend-line-chart.tsx`
- Create: `src/components/organisms/report-tabs.tsx`
- Create: `src/components/organisms/report-spending.tsx`
- Create: `src/components/organisms/report-income-expense.tsx`
- Create: `src/components/organisms/report-trends.tsx`
- Create: `src/components/organisms/report-net-worth.tsx`
- Create: `src/app/(dashboard)/reports/page.tsx`
- Create: `src/app/(dashboard)/reports/loading.tsx`
- Create: `src/app/(dashboard)/reports/error.tsx`
- Modify: `src/components/organisms/sidebar-nav.tsx`

- [ ] **Step 1: Create comparison-badge molecule**

Create `src/components/molecules/comparison-badge.tsx`:

```tsx
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface ComparisonBadgeProps {
  current: number;
  previous: number;
  periodLabel: string;
}

export function ComparisonBadge({ current, previous, periodLabel }: ComparisonBadgeProps) {
  if (previous === 0) return null;

  const change = ((current - previous) / previous) * 100;
  const isUp = change > 0;
  const isFlat = Math.abs(change) < 0.5;

  return (
    <span
      className={`inline-flex items-center gap-1 text-xs ${
        isFlat
          ? "text-muted-foreground"
          : isUp
            ? "text-destructive"
            : "text-green-600"
      }`}
    >
      {isFlat ? (
        <Minus className="size-3" />
      ) : isUp ? (
        <TrendingUp className="size-3" />
      ) : (
        <TrendingDown className="size-3" />
      )}
      {isFlat ? "0%" : `${change > 0 ? "+" : ""}${change.toFixed(0)}%`}
      <span className="text-muted-foreground">{periodLabel}</span>
    </span>
  );
}
```

- [ ] **Step 2: Create report-filter-bar molecule**

Create `src/components/molecules/report-filter-bar.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { DateRangeSelector } from "@/components/atoms/date-range-selector";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Checkbox } from "@/components/ui/checkbox";
import { useSearchParamFilters } from "@/hooks/use-search-param-filters";
import { rangeToDateBounds } from "@/lib/date-utils";
import type { CategoryGroup } from "@/queries/categories";

interface AccountOption {
  id: string;
  name: string;
}

interface ReportFilterBarProps {
  accounts: AccountOption[];
  categories: CategoryGroup[];
}

export function ReportFilterBar({ accounts, categories }: ReportFilterBarProps) {
  const { updateFilter, updateFilters, clearFilters, hasFilters, searchParams } = useSearchParamFilters();
  const [accountsOpen, setAccountsOpen] = useState(false);
  const [categoriesOpen, setCategoriesOpen] = useState(false);

  const selectedAccountIds = searchParams.get("accounts")?.split(",").filter(Boolean) ?? [];
  const selectedCategoryIds = searchParams.get("categories")?.split(",").filter(Boolean) ?? [];

  function handlePresetChange(range: string) {
    const { from, to } = rangeToDateBounds(range);
    updateFilters({
      from: from,
      to: to,
      preset: range === "all" ? null : range,
    });
  }

  function toggleAccount(id: string) {
    const next = selectedAccountIds.includes(id)
      ? selectedAccountIds.filter((a) => a !== id)
      : [...selectedAccountIds, id];
    updateFilter("accounts", next.length > 0 ? next.join(",") : null);
  }

  function toggleCategory(id: string) {
    const next = selectedCategoryIds.includes(id)
      ? selectedCategoryIds.filter((c) => c !== id)
      : [...selectedCategoryIds, id];
    updateFilter("categories", next.length > 0 ? next.join(",") : null);
  }

  const currentPreset = searchParams.get("preset") ?? "3M";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <DateRangeSelector value={currentPreset} onChange={handlePresetChange} />

      <Input
        type="date"
        value={searchParams.get("from") ?? ""}
        onChange={(e) => updateFilters({ from: e.target.value || null, preset: null })}
        className="h-8 w-[130px] text-xs"
      />
      <span className="text-xs text-muted-foreground">to</span>
      <Input
        type="date"
        value={searchParams.get("to") ?? ""}
        onChange={(e) => updateFilters({ to: e.target.value || null, preset: null })}
        className="h-8 w-[130px] text-xs"
      />

      {/* Account multi-select */}
      <Popover open={accountsOpen} onOpenChange={setAccountsOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 text-xs">
            {selectedAccountIds.length > 0
              ? `${selectedAccountIds.length} account${selectedAccountIds.length > 1 ? "s" : ""}`
              : "All accounts"}
            <ChevronsUpDown className="ml-1 h-3 w-3" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[200px] p-0" align="start">
          <Command>
            <CommandInput placeholder="Search accounts..." className="h-8" />
            <CommandList>
              <CommandEmpty>No accounts found.</CommandEmpty>
              <CommandGroup>
                {accounts.map((a) => (
                  <CommandItem key={a.id} onSelect={() => toggleAccount(a.id)}>
                    <Checkbox
                      checked={selectedAccountIds.includes(a.id)}
                      className="mr-2"
                    />
                    {a.name}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {/* Category multi-select */}
      <Popover open={categoriesOpen} onOpenChange={setCategoriesOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 text-xs">
            {selectedCategoryIds.length > 0
              ? `${selectedCategoryIds.length} categor${selectedCategoryIds.length > 1 ? "ies" : "y"}`
              : "All categories"}
            <ChevronsUpDown className="ml-1 h-3 w-3" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[220px] p-0" align="start">
          <Command>
            <CommandInput placeholder="Search categories..." className="h-8" />
            <CommandList>
              <CommandEmpty>No categories found.</CommandEmpty>
              {categories.map((group) => (
                <CommandGroup key={group.id} heading={group.name}>
                  {group.categories.map((cat) => (
                    <CommandItem key={cat.id} onSelect={() => toggleCategory(cat.id)}>
                      <Checkbox
                        checked={selectedCategoryIds.includes(cat.id)}
                        className="mr-2"
                      />
                      {cat.name}
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {hasFilters && (
        <Button variant="ghost" size="xs" onClick={clearFilters} className="text-xs">
          <X className="h-3 w-3 mr-1" /> Clear
        </Button>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Create trend-line-chart atom**

Create `src/components/atoms/trend-line-chart.tsx`:

```tsx
"use client";

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { centsToDisplay } from "@/lib/money";
import { CHART_COLORS } from "@/lib/chart-colors";

interface TrendLineChartProps {
  data: Record<string, number | string>[];
  categories: { name: string; color: string }[];
}

function formatMonth(month: string) {
  const [y, m] = month.split("-");
  return new Date(Number(y), Number(m) - 1).toLocaleDateString("en-US", { month: "short" });
}

export function TrendLineChart({ data, categories: cats }: TrendLineChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        No trend data available.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
        <XAxis dataKey="period" tickFormatter={formatMonth} tick={{ fontSize: 11 }} />
        <YAxis
          tickFormatter={(v) => centsToDisplay(v).replace(/\.00$/, "")}
          tick={{ fontSize: 11 }}
          width={60}
        />
        <Tooltip formatter={(v) => centsToDisplay(Number(v))} labelFormatter={(l) => formatMonth(String(l))} />
        <Legend />
        {cats.map((cat) => (
          <Line
            key={cat.name}
            type="monotone"
            dataKey={cat.name}
            name={cat.name}
            stroke={cat.color}
            strokeWidth={2}
            dot={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
```

- [ ] **Step 4: Create report tab organisms**

Create `src/components/organisms/report-spending.tsx`:

```tsx
"use client";

import { useState } from "react";
import { ChartViewToggle } from "@/components/atoms/chart-view-toggle";
import { SpendingChart } from "@/components/atoms/spending-chart";
import { ComparisonBadge } from "@/components/molecules/comparison-badge";
import { centsToDisplay } from "@/lib/money";
import type { SpendingRow } from "@/queries/reports";

interface ReportSpendingProps {
  data: SpendingRow[];
  comparisonLabel: string | null;
}

export function ReportSpending({ data, comparisonLabel: compLabel }: ReportSpendingProps) {
  const [view, setView] = useState<"donut" | "bar">("donut");

  const chartData = data.map((r) => ({
    categoryId: r.categoryId,
    categoryName: r.categoryName,
    categoryIcon: null,
    groupName: r.groupName,
    total: r.total,
  }));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium">Spending by Category</h3>
        <ChartViewToggle value={view} onChange={setView} />
      </div>

      <div className="h-[300px]">
        <SpendingChart data={chartData} viewMode={view} />
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
              <tr key={row.categoryId ?? "uncategorized"} className="border-b last:border-0">
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
    </div>
  );
}
```

Create `src/components/organisms/report-income-expense.tsx`:

```tsx
"use client";

import { CashFlowBarChart } from "@/components/atoms/cash-flow-bar-chart";
import { centsToDisplay } from "@/lib/money";
import type { IncomeExpenseRow } from "@/queries/reports";

interface ReportIncomeExpenseProps {
  data: IncomeExpenseRow[];
}

export function ReportIncomeExpense({ data }: ReportIncomeExpenseProps) {
  const chartData = data.map((r) => ({
    month: r.period,
    income: r.income,
    expenses: r.expenses,
    net: r.net,
  }));

  const totalIncome = data.reduce((s, r) => s + r.income, 0);
  const totalExpenses = data.reduce((s, r) => s + r.expenses, 0);
  const totalNet = totalIncome - totalExpenses;

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-medium">Income vs Expense</h3>

      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-lg border p-3">
          <div className="text-xs text-muted-foreground">Total Income</div>
          <div className="text-lg font-semibold text-green-600">{centsToDisplay(totalIncome)}</div>
        </div>
        <div className="rounded-lg border p-3">
          <div className="text-xs text-muted-foreground">Total Expenses</div>
          <div className="text-lg font-semibold text-destructive">{centsToDisplay(totalExpenses)}</div>
        </div>
        <div className="rounded-lg border p-3">
          <div className="text-xs text-muted-foreground">Net</div>
          <div className={`text-lg font-semibold ${totalNet >= 0 ? "text-green-600" : "text-destructive"}`}>
            {centsToDisplay(totalNet)}
          </div>
        </div>
      </div>

      <div className="h-[300px]">
        <CashFlowBarChart data={chartData} />
      </div>
    </div>
  );
}
```

Create `src/components/organisms/report-trends.tsx`:

```tsx
"use client";

import { useState } from "react";
import { TrendLineChart } from "@/components/atoms/trend-line-chart";
import { Checkbox } from "@/components/ui/checkbox";
import { CHART_COLORS } from "@/lib/chart-colors";
import type { CategoryTrendRow } from "@/queries/reports";

interface ReportTrendsProps {
  data: CategoryTrendRow[];
}

export function ReportTrends({ data }: ReportTrendsProps) {
  const allCategories = [...new Set(data.map((r) => r.categoryName))];
  const [selected, setSelected] = useState<Set<string>>(new Set(allCategories.slice(0, 10)));

  function toggle(name: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else if (next.size < 10) {
        next.add(name);
      }
      return next;
    });
  }

  const selectedList = allCategories.filter((c) => selected.has(c));
  const cats = selectedList.map((name, i) => ({
    name,
    color: CHART_COLORS[i % CHART_COLORS.length],
  }));

  // Pivot data for Recharts: { period, CatA: 1000, CatB: 2000, ... }
  const periods = [...new Set(data.map((r) => r.period))].sort();
  const chartData = periods.map((period) => {
    const row: Record<string, number | string> = { period };
    for (const cat of selectedList) {
      const match = data.find((r) => r.period === period && r.categoryName === cat);
      row[cat] = match?.total ?? 0;
    }
    return row;
  });

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-medium">Category Trends</h3>

      <div className="h-[300px]">
        <TrendLineChart data={chartData} categories={cats} />
      </div>

      <div className="flex flex-wrap gap-3">
        {allCategories.map((name) => (
          <label key={name} className="flex items-center gap-1.5 text-sm cursor-pointer">
            <Checkbox
              checked={selected.has(name)}
              onCheckedChange={() => toggle(name)}
            />
            {name}
          </label>
        ))}
      </div>
    </div>
  );
}
```

Create `src/components/organisms/report-net-worth.tsx`:

```tsx
"use client";

import { NetWorthAreaChart } from "@/components/atoms/net-worth-area-chart";
import type { NetWorthPoint } from "@/queries/dashboard";

interface ReportNetWorthProps {
  data: NetWorthPoint[];
}

export function ReportNetWorth({ data }: ReportNetWorthProps) {
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-medium">Net Worth</h3>
      <div className="h-[400px]">
        <NetWorthAreaChart data={data} />
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Create report-tabs organism (client wrapper)**

Create `src/components/organisms/report-tabs.tsx`:

```tsx
"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSearchParamFilters } from "@/hooks/use-search-param-filters";
import { ReportSpending } from "./report-spending";
import { ReportIncomeExpense } from "./report-income-expense";
import { ReportTrends } from "./report-trends";
import { ReportNetWorth } from "./report-net-worth";
import type { SpendingRow, IncomeExpenseRow, CategoryTrendRow } from "@/queries/reports";
import type { NetWorthPoint } from "@/queries/dashboard";

interface ReportTabsProps {
  activeTab: string;
  spendingData?: SpendingRow[];
  incomeExpenseData?: IncomeExpenseRow[];
  trendsData?: CategoryTrendRow[];
  netWorthData?: NetWorthPoint[];
  comparisonLabel: string | null;
}

export function ReportTabs({
  activeTab,
  spendingData,
  incomeExpenseData,
  trendsData,
  netWorthData,
  comparisonLabel,
}: ReportTabsProps) {
  const { updateFilter } = useSearchParamFilters();

  return (
    <Tabs
      value={activeTab}
      onValueChange={(tab) => updateFilter("tab", tab === "spending" ? null : tab)}
    >
      <TabsList>
        <TabsTrigger value="spending">Spending</TabsTrigger>
        <TabsTrigger value="income-expense">Income vs Expense</TabsTrigger>
        <TabsTrigger value="trends">Trends</TabsTrigger>
        <TabsTrigger value="net-worth">Net Worth</TabsTrigger>
      </TabsList>

      <TabsContent value="spending" className="mt-4">
        {spendingData && <ReportSpending data={spendingData} comparisonLabel={comparisonLabel} />}
      </TabsContent>
      <TabsContent value="income-expense" className="mt-4">
        {incomeExpenseData && <ReportIncomeExpense data={incomeExpenseData} />}
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

- [ ] **Step 6: Create reports page, loading, and error**

Create `src/app/(dashboard)/reports/page.tsx`:

```tsx
import { getHouseholdId } from "@/lib/auth/session";
import { getCategories } from "@/queries/categories";
import { getAccounts } from "@/queries/accounts";
import { getSavedReportsByHousehold } from "@/queries/saved-reports";
import {
  getSpendingByCategory,
  getIncomeVsExpense,
  getCategoryTrends,
  getReportNetWorthHistory,
  type ReportFilters,
} from "@/queries/reports";
import { rangeToDateBounds, shiftDateRange, comparisonLabel } from "@/lib/date-utils";
import { ReportFilterBar } from "@/components/molecules/report-filter-bar";
import { ReportTabs } from "@/components/organisms/report-tabs";

const VALID_TABS = new Set(["spending", "income-expense", "trends", "net-worth"]);

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const householdId = await getHouseholdId();
  const params = await searchParams;

  const tab = typeof params.tab === "string" && VALID_TABS.has(params.tab) ? params.tab : "spending";
  const preset = typeof params.preset === "string" ? params.preset : null;

  let dateFrom: string;
  let dateTo: string;

  if (typeof params.from === "string" && typeof params.to === "string") {
    dateFrom = params.from;
    dateTo = params.to;
  } else {
    const bounds = rangeToDateBounds(preset ?? "3M");
    dateFrom = bounds.from ?? "2000-01-01";
    dateTo = bounds.to;
  }

  const accountIds = typeof params.accounts === "string" ? params.accounts.split(",").filter(Boolean) : undefined;
  const categoryIds = typeof params.categories === "string" ? params.categories.split(",").filter(Boolean) : undefined;

  const filters: ReportFilters = { dateFrom, dateTo, accountIds, categoryIds };

  // Comparison period
  const isPreset = preset !== null;
  const isAllTime = preset === "all" || (!params.from && !params.to && !preset);
  let compLabel: string | null = null;
  let compPeriod: { dateFrom: string; dateTo: string } | undefined;

  if (!isAllTime) {
    const shifted = shiftDateRange(dateFrom, dateTo, "back", isPreset);
    compPeriod = { dateFrom: shifted.from, dateTo: shifted.to };
    compLabel = comparisonLabel(shifted.from, shifted.to);
  }

  // Only fetch data for active tab
  let spendingData;
  let incomeExpenseData;
  let trendsData;
  let netWorthData;

  switch (tab) {
    case "spending":
      spendingData = getSpendingByCategory(householdId, filters, undefined, compPeriod);
      break;
    case "income-expense":
      incomeExpenseData = getIncomeVsExpense(householdId, filters);
      break;
    case "trends":
      trendsData = getCategoryTrends(householdId, filters);
      break;
    case "net-worth":
      netWorthData = getReportNetWorthHistory(householdId, filters);
      break;
  }

  const allCategories = getCategories(householdId);
  const allAccounts = getAccounts(householdId);
  const accountOptions = allAccounts.map((a) => ({ id: a.id, name: a.name }));

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>

      <ReportFilterBar accounts={accountOptions} categories={allCategories} />

      <ReportTabs
        activeTab={tab}
        spendingData={spendingData}
        incomeExpenseData={incomeExpenseData}
        trendsData={trendsData}
        netWorthData={netWorthData}
        comparisonLabel={compLabel}
      />
    </div>
  );
}
```

Create `src/app/(dashboard)/reports/loading.tsx`:

```tsx
import { Skeleton } from "@/components/ui/skeleton";

export default function ReportsLoading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-32" />
      <div className="flex gap-2">
        <Skeleton className="h-8 w-[200px]" />
        <Skeleton className="h-8 w-[130px]" />
        <Skeleton className="h-8 w-[130px]" />
        <Skeleton className="h-8 w-[120px]" />
        <Skeleton className="h-8 w-[120px]" />
      </div>
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-[300px] w-full" />
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    </div>
  );
}
```

Create `src/app/(dashboard)/reports/error.tsx`:

```tsx
"use client";

import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ReportsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <AlertCircle className="h-10 w-10 text-destructive mb-3" />
      <h2 className="text-lg font-medium">Something went wrong</h2>
      <p className="text-sm text-muted-foreground mt-1">
        {error.message || "Failed to load reports."}
      </p>
      <Button variant="outline" size="sm" onClick={reset} className="mt-4">
        Try Again
      </Button>
    </div>
  );
}
```

- [ ] **Step 7: Add Reports to sidebar nav**

In `src/components/organisms/sidebar-nav.tsx`:

Add import: `import { BarChart3 } from "lucide-react";`

Add to `NAV_ITEMS` array after the Budgets entry:

```ts
{ href: "/reports", label: "Reports", icon: BarChart3 },
```

- [ ] **Step 8: Verify typecheck passes**

```bash
pnpm typecheck
```

Expected: No type errors

- [ ] **Step 9: Commit**

```bash
git add src/components/molecules/report-filter-bar.tsx src/components/molecules/comparison-badge.tsx src/components/atoms/trend-line-chart.tsx src/components/organisms/report-tabs.tsx src/components/organisms/report-spending.tsx src/components/organisms/report-income-expense.tsx src/components/organisms/report-trends.tsx src/components/organisms/report-net-worth.tsx src/app/\(dashboard\)/reports/ src/components/organisms/sidebar-nav.tsx
git commit -m "feat(reports): add reports page with spending, income/expense, trends, net worth tabs"
```

---

### Task 7: Saved report picker organism

**Files:**
- Create: `src/components/organisms/saved-report-picker.tsx`
- Modify: `src/app/(dashboard)/reports/page.tsx`

- [ ] **Step 1: Create saved-report-picker organism**

Create `src/components/organisms/saved-report-picker.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Bookmark, Trash2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useSearchParamFilters } from "@/hooks/use-search-param-filters";
import { saveReport, deleteReport } from "@/actions/reports";

interface SavedReport {
  id: string;
  name: string;
  reportType: string;
  filters: string;
}

interface SavedReportPickerProps {
  reports: SavedReport[];
  activeTab: string;
}

export function SavedReportPicker({ reports, activeTab }: SavedReportPickerProps) {
  const { updateFilters, searchParams } = useSearchParamFilters();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [reportName, setReportName] = useState("");

  function loadReport(report: SavedReport) {
    try {
      const filters = JSON.parse(report.filters);
      const params: Record<string, string | null> = {
        tab: report.reportType === "spending" ? null : report.reportType,
        from: filters.dateFrom ?? null,
        to: filters.dateTo ?? null,
        accounts: filters.accountIds?.join(",") ?? null,
        categories: filters.categoryIds?.join(",") ?? null,
        preset: null,
      };
      updateFilters(params);
    } catch {
      // Invalid JSON — ignore
    }
  }

  async function handleSave() {
    if (!reportName.trim()) return;

    const filters = {
      dateFrom: searchParams.get("from") ?? "",
      dateTo: searchParams.get("to") ?? "",
      accountIds: searchParams.get("accounts")?.split(",").filter(Boolean),
      categoryIds: searchParams.get("categories")?.split(",").filter(Boolean),
    };

    await saveReport({
      name: reportName.trim(),
      reportType: activeTab as "spending" | "income-expense" | "trends" | "net-worth",
      filters,
    });

    setReportName("");
    setDialogOpen(false);
  }

  async function handleDelete(id: string) {
    await deleteReport(id);
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 text-xs">
            <Bookmark className="h-3 w-3 mr-1" />
            Saved Reports
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          {reports.length === 0 && (
            <div className="px-2 py-3 text-xs text-muted-foreground text-center">
              No saved reports yet
            </div>
          )}
          {reports.map((report) => (
            <DropdownMenuItem
              key={report.id}
              className="flex items-center justify-between"
              onSelect={() => loadReport(report)}
            >
              <span className="truncate">{report.name}</span>
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5 shrink-0"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDelete(report.id);
                }}
              >
                <Trash2 className="h-3 w-3 text-muted-foreground" />
              </Button>
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              setDialogOpen(true);
            }}
          >
            <Save className="h-3 w-3 mr-2" />
            Save current view
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[320px]">
          <DialogHeader>
            <DialogTitle>Save Report</DialogTitle>
          </DialogHeader>
          <Input
            value={reportName}
            onChange={(e) => setReportName(e.target.value)}
            placeholder="Report name"
            onKeyDown={(e) => e.key === "Enter" && handleSave()}
          />
          <DialogFooter>
            <Button onClick={handleSave} disabled={!reportName.trim()} size="sm">
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
```

- [ ] **Step 2: Wire saved-report-picker into reports page**

In `src/app/(dashboard)/reports/page.tsx`, add import:

```ts
import { SavedReportPicker } from "@/components/organisms/saved-report-picker";
```

And add the picker next to the filter bar. Replace the `<ReportFilterBar>` render with:

```tsx
<div className="flex items-start justify-between gap-2">
  <ReportFilterBar accounts={accountOptions} categories={allCategories} />
  <SavedReportPicker reports={savedReports} activeTab={tab} />
</div>
```

Add saved reports fetch before the return:

```ts
const savedReports = getSavedReportsByHousehold(householdId);
```

- [ ] **Step 3: Typecheck**

```bash
pnpm typecheck
```

Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/components/organisms/saved-report-picker.tsx src/app/\(dashboard\)/reports/page.tsx
git commit -m "feat(reports): add saved report picker with save/load/delete"
```

---

### Task 8: Budget progress dashboard widget

**Files:**
- Create: `src/components/organisms/widgets/budget-progress.tsx`
- Modify: `src/components/organisms/widgets/registry.ts`
- Modify: `src/components/organisms/dashboard-grid.tsx`

- [ ] **Step 1: Create BudgetProgressWidget**

Create `src/components/organisms/widgets/budget-progress.tsx`:

```tsx
"use client";

import Link from "next/link";
import { BudgetProgressBar } from "@/components/atoms/budget-progress-bar";
import { budgetProgressPercent } from "@/lib/budget-utils";
import type { BudgetMonth } from "@/queries/budgets";

interface BudgetProgressWidgetProps {
  data: BudgetMonth;
}

export function BudgetProgressWidget({ data }: BudgetProgressWidgetProps) {
  if (!data.budget) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-sm text-muted-foreground">
        <p>No budget set</p>
        <Link href="/budgets" className="text-primary underline text-xs mt-1">
          Create Budget
        </Link>
      </div>
    );
  }

  const allCategories = data.groups
    .flatMap((g) => g.categories)
    .sort((a, b) => budgetProgressPercent(b.spent, b.limitAmount) - budgetProgressPercent(a.spent, a.limitAmount));

  const top5 = allCategories.slice(0, 5);
  const remaining = allCategories.length - 5;

  return (
    <div className="flex flex-col gap-2 h-full">
      {top5.map((cat) => (
        <BudgetProgressBar
          key={cat.budgetCategoryId}
          label={cat.categoryName}
          spent={cat.spent}
          limit={cat.limitAmount}
        />
      ))}
      {remaining > 0 && (
        <Link href="/budgets" className="text-xs text-muted-foreground hover:text-primary">
          +{remaining} more
        </Link>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Update widget registry**

In `src/components/organisms/widgets/registry.ts`, replace the budgets entry:

```ts
{ id: "budgets", title: "Budget Progress", defaultSize: { w: 2, h: 1 } },
```

(Remove `isPlaceholder` and `placeholderText`)

Update `ACTIVE_WIDGETS` — since `isPlaceholder` is removed, it will now be included automatically.

- [ ] **Step 3: Update dashboard-grid to render BudgetProgressWidget**

In `src/components/organisms/dashboard-grid.tsx`:

Add import:

```ts
import { BudgetProgressWidget } from "./widgets/budget-progress";
import type { BudgetMonth } from "@/queries/budgets";
```

Add `budgetData` to `DashboardData`:

```ts
export interface DashboardData {
  // ... existing fields ...
  budgetData?: BudgetMonth;
}
```

Add case in `renderWidget`:

```ts
case "budgets":
  return data.budgetData ? (
    <BudgetProgressWidget data={data.budgetData} />
  ) : (
    <WidgetPlaceholder title="Budget Progress" description="No budget data" />
  );
```

- [ ] **Step 4: Fetch budget data in dashboard page**

In `src/app/(dashboard)/page.tsx`, add import:

```ts
import { getBudgetForMonth } from "@/queries/budgets";
import { getCurrentMonth } from "@/lib/date-utils";
```

Add to the `Promise.all` array:

```ts
getBudgetForMonth(householdId, getCurrentMonth()),
```

And destructure it:

```ts
const [summary, netWorthHistory, monthlySpending, cashFlow, recentTransactions, allAccounts, budgetData] = ...
```

Add to `data` object:

```ts
budgetData,
```

- [ ] **Step 5: Typecheck and test**

```bash
pnpm typecheck
pnpm vitest run
```

Expected: All pass

- [ ] **Step 6: Commit**

```bash
git add src/components/organisms/widgets/budget-progress.tsx src/components/organisms/widgets/registry.ts src/components/organisms/dashboard-grid.tsx src/app/\(dashboard\)/page.tsx
git commit -m "feat(dashboard): replace budget placeholder with real BudgetProgressWidget"
```

---

### Task 9: Visual testing + final verification

- [ ] **Step 1: Run full test suite**

```bash
pnpm vitest run
```

Expected: All tests pass including new report queries, actions, CSV export, and date-utils tests

- [ ] **Step 2: Typecheck**

```bash
pnpm typecheck
```

Expected: No type errors

- [ ] **Step 3: Lint**

```bash
pnpm lint
```

Expected: No lint errors (fix any that appear)

- [ ] **Step 4: Start dev server and test manually**

```bash
pnpm dev
```

Test in browser:
- Navigate to `/reports` — verify tab bar renders, default is Spending
- Switch tabs — URL updates, correct chart renders per tab
- Change date preset (1M/3M/6M/1Y/All) — data updates
- Use custom date range — data updates
- Select accounts and categories via multi-select — data filters
- Verify comparison badges show on Spending tab
- Save a report, reload page, load saved report
- Delete a saved report
- Navigate to `/transactions` — verify Export button appears
- Click Export — CSV downloads with correct data
- Navigate to `/` — verify Budget Progress widget renders
- Verify all other dashboard widgets still work

- [ ] **Step 5: Commit any fixes**

```bash
git add -A
git commit -m "fix: address issues found during visual testing"
```
