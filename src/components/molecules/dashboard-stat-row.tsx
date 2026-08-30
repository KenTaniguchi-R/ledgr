import { centsToDisplay } from "@/lib/money";
import { pctChange, savingsRatePct } from "@/lib/stat-delta";
import { formatMonthShort } from "@/lib/date-utils";
import { StatStrip } from "@/components/molecules/stat-strip";
import type { DashboardSummary } from "@/queries/dashboard";
import type { BudgetPace } from "@/lib/budget-pace";

interface DashboardStatRowProps {
  summary: DashboardSummary;
  prevSummary: DashboardSummary;
  month: string;
  prevMonth: string;
  /**
   * Budget position for `month`, or null when the household has not set one.
   * Must be for the same month the tile reports — comparing August's spend to
   * September's budget would be worse than not showing a budget at all.
   */
  pace: BudgetPace | null;
}

interface StatChange {
  text: string;
  /** Whether the change moves the user's finances the right way. */
  good: boolean;
}

function pctChangeText(current: number, previous: number, vsLabel: string, upIsGood: boolean): StatChange | undefined {
  const pct = pctChange(current, previous);
  if (pct === null) return undefined;
  const up = pct >= 0;
  return {
    text: `${up ? "↑" : "↓"} ${Math.abs(pct).toFixed(1)}% ${vsLabel}`,
    good: up === upIsGood,
  };
}

export function DashboardStatRow({ summary, prevSummary, month, prevMonth, pace }: DashboardStatRowProps) {
  const monthLabel = formatMonthShort(month);
  const vsLabel = `vs ${formatMonthShort(prevMonth)}`;

  const rate = savingsRatePct(summary);
  const prevRate = savingsRatePct(prevSummary);
  const rateChange: StatChange | undefined =
    rate !== null && prevRate !== null
      ? {
          text: `${rate >= prevRate ? "↑" : "↓"} ${Math.abs(rate - prevRate).toFixed(1)} pt ${vsLabel}`,
          good: rate >= prevRate,
        }
      : undefined;

  const netChange: StatChange | undefined =
    prevSummary.monthlyNet !== summary.monthlyNet
      ? {
          text: `${summary.monthlyNet >= prevSummary.monthlyNet ? "↑" : "↓"} ${centsToDisplay(Math.abs(summary.monthlyNet - prevSummary.monthlyNet))} ${vsLabel}`,
          good: summary.monthlyNet >= prevSummary.monthlyNet,
        }
      : undefined;

  return (
    <StatStrip
      ariaLabel="Monthly summary"
      className="mb-6"
      items={[
        {
          label: `Income · ${monthLabel}`,
          value: centsToDisplay(summary.monthlyIncome),
          change: pctChangeText(summary.monthlyIncome, prevSummary.monthlyIncome, vsLabel, true),
        },
        pace
          ? {
              // Answers "how much is left" rather than "how does this compare
              // to last month". The month-over-month figure stays as the
              // secondary line so nothing is lost.
              label: `Spending · ${monthLabel}`,
              value: `${centsToDisplay(Math.abs(pace.remaining))} ${pace.exceeded ? "over" : "left"}`,
              valueClassName: pace.exceeded ? "text-destructive" : undefined,
              rail: {
                // Clamped so an overrun does not overflow the track; the
                // percentage beneath still reports the true figure.
                pct: Math.min(pace.pctUsed, 100),
                exceeded: pace.exceeded,
              },
              // Days elapsed, not a verdict on pace — see lib/budget-pace.ts.
              footnote: `${centsToDisplay(pace.spent)} of ${centsToDisplay(pace.budgeted)} · ${pace.daysElapsed} of ${pace.daysInMonth} days`,
            }
          : {
              label: `Spending · ${monthLabel}`,
              value: centsToDisplay(summary.monthlyExpenses),
              change: pctChangeText(summary.monthlyExpenses, prevSummary.monthlyExpenses, vsLabel, false),
              footnoteHref: { label: "Set a budget", href: "/budgets" },
            },
        {
          label: `Net saved · ${monthLabel}`,
          value: centsToDisplay(summary.monthlyNet),
          change: netChange,
        },
        {
          label: "Savings rate",
          value: rate !== null ? `${rate.toFixed(1)}%` : "n/a",
          change: rateChange,
        },
      ]}
    />
  );
}
