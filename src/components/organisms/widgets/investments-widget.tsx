"use client";

import Link from "next/link";
import { centsToDisplay } from "@/lib/money";
import { ComparisonBadge } from "@/components/molecules/comparison-badge";
import { WidgetPlaceholder } from "@/components/molecules/widget-placeholder";
import { Progress } from "@/components/ui/progress";
import type { InvestmentsSummaryHolding } from "@/queries/investments";

interface InvestmentsWidgetProps {
  totalValue: number;
  dayChange: number | null;
  holdingCount: number;
  topHoldings: InvestmentsSummaryHolding[];
}

function holdingLabel(h: InvestmentsSummaryHolding) {
  return h.ticker ?? h.securityName;
}

export function InvestmentsWidget({
  totalValue,
  dayChange,
  holdingCount,
  topHoldings,
}: InvestmentsWidgetProps) {
  if (holdingCount === 0) {
    return (
      <WidgetPlaceholder
        title="No holdings yet"
        description="Connect a brokerage and your positions will appear here."
        actions={[{ label: "Connect accounts", href: "/accounts", primary: true }]}
      />
    );
  }

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-2xl font-semibold tabular-nums tracking-tight">
          {centsToDisplay(totalValue)}
        </span>
        {dayChange !== null && (
          <ComparisonBadge current={totalValue} previous={totalValue - dayChange} pill />
        )}
      </div>

      {/* The grid cell is a fixed height and the widget is user-resizable, so
          the list scrolls rather than clipping. The min-height matters for
          anyone whose saved layout still has this widget at one row — without
          it `flex-1` resolves to zero there and the list vanishes entirely. */}
      <ul className="flex min-h-10 flex-1 flex-col gap-2 overflow-y-auto overflow-x-hidden">
        {topHoldings.map((h) => (
          <li key={holdingLabel(h)} className="flex flex-col gap-1">
            <div className="flex min-w-0 items-baseline justify-between gap-2">
              <span className="truncate text-sm font-medium">{holdingLabel(h)}</span>
              <span className="shrink-0 text-sm tabular-nums">
                {centsToDisplay(h.currentValue)}
              </span>
            </div>
            {/* Share of portfolio. Muted rather than the default primary fill —
                these are proportions, not progress toward a goal, and six
                near-black bars would out-weigh every other widget on the page. */}
            <Progress
              value={h.share}
              className="h-1 [&_[data-slot=progress-indicator]]:bg-muted-foreground/40"
              aria-label={`${holdingLabel(h)} — ${h.share.toFixed(0)}% of portfolio`}
            />
          </li>
        ))}
      </ul>

      {holdingCount > topHoldings.length && (
        <Link
          href="/investments"
          className="mt-auto pt-1 text-center text-xs text-primary hover:underline"
        >
          View all {holdingCount} holdings
        </Link>
      )}
    </div>
  );
}
