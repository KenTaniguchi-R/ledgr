"use client";

import { NetWorthAreaChart } from "@/components/atoms/net-worth-area-chart";
import { ReportStatStrip } from "@/components/molecules/report-stat-strip";
import { centsToDisplay, centsToSignedDisplay } from "@/lib/money";
import { netWorthChange } from "@/lib/net-worth-change";
import { coverageBoundary } from "@/lib/net-worth-coverage";
import { formatDateShort } from "@/lib/date-utils";
import type { NetWorthPoint } from "@/queries/dashboard";

interface ReportNetWorthProps {
  data: NetWorthPoint[];
}

export function ReportNetWorth({ data }: ReportNetWorthProps) {
  // Measure change only across the stretch where every account has a balance.
  // Before that the series is a partial sum, and a delta across the boundary
  // reports accounts appearing, not money arriving — the "+26702%" this tile
  // showed when three brokerage accounts first reported mid-range.
  const coverage = coverageBoundary(data);
  const covered = coverage.index === -1 ? [] : data.slice(coverage.index);
  const { current } = netWorthChange(data);
  const { change, percent } = netWorthChange(covered);

  const secondaryLabel =
    covered.length < 2
      ? "not enough full history in this range"
      : [
          percent !== null
            ? `${percent >= 0 ? "+" : ""}${percent.toFixed(1)}%`
            : // A percentage off a near-zero opening balance describes the
              // balance, not the period.
              "from a near-zero opening balance",
          coverage.hasPartial && coverage.date ? `since ${formatDateShort(coverage.date)}` : null,
        ]
          .filter(Boolean)
          .join(" · ");

  const shownChange = covered.length < 2 ? 0 : change;

  return (
    <div className="space-y-4">
      <ReportStatStrip
        items={[
          { label: "Net worth", value: centsToDisplay(current), tone: current < 0 ? "negative" : "default" },
          {
            label: "Change",
            value: centsToSignedDisplay(shownChange),
            tone: shownChange < 0 ? "negative" : shownChange > 0 ? "positive" : "default",
            sub: secondaryLabel,
          },
        ]}
      />
      <h3 className="text-lg font-medium">Net Worth</h3>
      <div className="h-[400px]">
        <NetWorthAreaChart data={data} />
      </div>
      {coverage.hasPartial && (
        <p className="text-xs text-muted-foreground">
          Hatched: only{" "}
          {coverage.minCovered === coverage.maxPartialCovered
            ? coverage.minCovered
            : `${coverage.minCovered}–${coverage.maxPartialCovered}`}{" "}
          of {coverage.totalAccounts} accounts had balance history
          {coverage.date ? ` before ${formatDateShort(coverage.date)}` : " in this range"}, so
          those totals are not yet net worth.
        </p>
      )}
    </div>
  );
}
