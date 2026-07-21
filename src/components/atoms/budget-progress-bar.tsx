import { Progress } from "@/components/ui/progress";
import { centsToDisplay } from "@/lib/money";
import { budgetProgressPercent } from "@/lib/budget-utils";
import { cn } from "@/lib/utils";

interface BudgetProgressBarProps {
  label?: string;
  spent: number;
  limit: number;
  className?: string;
}

export function BudgetProgressBar({ label, spent, limit, className }: BudgetProgressBarProps) {
  const percent = budgetProgressPercent(spent, limit);
  const remaining = limit - spent;
  const displayValue = Math.min(percent, 100);

  const colorClass =
    percent > 100
      ? "[&>div]:bg-destructive"
      : percent >= 80
        ? "[&>div]:bg-yellow-500"
        : "[&>div]:bg-positive";

  return (
    <div className={cn("space-y-1", className)}>
      {label && (
        <div className="flex items-center justify-between text-xs">
          <span className="truncate">{label}</span>
          <span className="text-muted-foreground tabular-nums">{percent}%</span>
        </div>
      )}
      <div className="flex items-center gap-2">
      <Progress value={displayValue} className={cn("h-2 flex-1", colorClass)} />
      <span
        className={cn(
          "text-xs tabular-nums w-16 text-right",
          remaining < 0 && "text-destructive",
        )}
      >
        {centsToDisplay(remaining)}
      </span>
      </div>
    </div>
  );
}
