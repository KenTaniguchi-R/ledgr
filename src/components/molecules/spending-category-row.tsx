import { centsToDisplay } from "@/lib/money";

interface SpendingCategoryRowProps {
  name: string;
  icon: string;
  amount: number;
  percentage: number;
  color: string;
}

export function SpendingCategoryRow({ name, icon, amount, percentage, color }: SpendingCategoryRowProps) {
  return (
    <div className="flex items-center gap-3 py-1.5">
      <span className="text-sm">{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <span className="text-sm truncate">{name}</span>
          <span className="text-sm font-medium tabular-nums ml-2">{centsToDisplay(amount)}</span>
        </div>
        <div className="h-1.5 rounded-full bg-muted mt-1">
          <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(percentage, 100)}%`, backgroundColor: color }} />
        </div>
      </div>
    </div>
  );
}
