// Categorical palette for charts. The underlying values live in globals.css
// (--chart-1..8) so they re-step for dark mode; slot order is colorblind-safe.
// Note: theme tokens are oklch/hex values — never wrap them in hsl().
export const CHART_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--chart-6)",
  "var(--chart-7)",
  "var(--chart-8)",
];

export const INCOME_COLOR = "var(--positive)";
export const EXPENSE_COLOR = "var(--destructive)";
// Spending bars next to income use a neutral, not alarm-red — spending is
// normal, overspending is not.
export const SPENDING_COLOR = "var(--chart-neutral)";
export const PRIMARY_COLOR = "var(--primary)";
export const POSITIVE_COLOR = "var(--positive)";

// Used for a series stretch the data does not fully support — see
// lib/net-worth-coverage.ts. Deliberately not a status hue: the point is that
// the line is *not authoritative*, not that something is wrong.
export const UNCOVERED_COLOR = "var(--muted-foreground)";
