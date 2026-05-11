import { BalanceDisplay } from "@/components/atoms/balance-display";

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
  const labels = ["Total Budgeted", "Total Spent", "Remaining"];
  const values = [totalBudgeted, totalSpent, totalRemaining];

  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between rounded-lg border bg-card p-4 gap-3 sm:gap-0">
      <div className="flex gap-4 sm:gap-8 overflow-x-auto">
        {labels.map((label, i) => (
          <div key={label}>
            <p className="text-xs text-muted-foreground">{label}</p>
            <BalanceDisplay amount={values[i]} size="lg" />
          </div>
        ))}
      </div>
      {lastSyncedAt && (
        <p className="text-xs text-muted-foreground">
          Last synced {timeAgo(lastSyncedAt)}
        </p>
      )}
    </div>
  );
}
