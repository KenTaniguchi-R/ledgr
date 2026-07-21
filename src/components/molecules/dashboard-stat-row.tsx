import { centsToDisplay } from "@/lib/money";
import { pctChange, savingsRatePct } from "@/lib/stat-delta";
import { formatMonthShort } from "@/lib/date-utils";
import { StatStrip } from "@/components/molecules/stat-strip";
import type { DashboardSummary } from "@/queries/dashboard";

interface DashboardStatRowProps {
  summary: DashboardSummary;
  prevSummary: DashboardSummary;
  month: string;
  prevMonth: string;
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

export function DashboardStatRow({ summary, prevSummary, month, prevMonth }: DashboardStatRowProps) {
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
        {
          label: `Spending · ${monthLabel}`,
          value: centsToDisplay(summary.monthlyExpenses),
          change: pctChangeText(summary.monthlyExpenses, prevSummary.monthlyExpenses, vsLabel, false),
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
