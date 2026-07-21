import { centsToDisplay } from "@/lib/money";
import { StatStrip } from "@/components/molecules/stat-strip";

interface BudgetSummaryBarProps {
  totalBudgeted: number;
  totalSpent: number;
  totalRemaining: number;
  lastSyncedAt: Date | string | null;
}

function timeAgo(date: Date | string): string {
  const diff = Date.now() - new Date(date).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function BudgetSummaryBar({
  totalBudgeted,
  totalSpent,
  totalRemaining,
  lastSyncedAt,
}: BudgetSummaryBarProps) {
  return (
    <div>
      <StatStrip
        ariaLabel="Budget summary"
        items={[
          { label: "Total Budgeted", value: centsToDisplay(totalBudgeted) },
          { label: "Total Spent", value: centsToDisplay(totalSpent) },
          {
            label: "Remaining",
            value: centsToDisplay(totalRemaining),
            valueClassName: totalRemaining < 0 ? "text-destructive" : undefined,
          },
        ]}
      />
      {lastSyncedAt && (
        <p className="text-xs text-muted-foreground text-right mt-1.5">
          Last synced {timeAgo(lastSyncedAt)}
        </p>
      )}
    </div>
  );
}
