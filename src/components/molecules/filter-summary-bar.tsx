import { centsToDisplay } from "@/lib/money";

interface FilterSummaryBarProps {
  count: number;
  totalExpense: number;
  totalIncome: number;
  net: number;
}

export function FilterSummaryBar({
  count,
  totalExpense,
  totalIncome,
  net,
}: FilterSummaryBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-2 py-1.5 text-xs text-muted-foreground bg-muted/40 rounded-md">
      <span>{count} transaction{count !== 1 ? "s" : ""}</span>
      <span className="text-border">|</span>
      <span>Expenses: {centsToDisplay(totalExpense)}</span>
      <span className="text-border">|</span>
      <span className="text-emerald-600">Credits: +{centsToDisplay(totalIncome)}</span>
      <span className="text-border">|</span>
      <span className={net >= 0 ? "text-emerald-600" : "text-destructive"}>
        Net: {net >= 0 ? "+" : ""}{centsToDisplay(Math.abs(net))}
      </span>
    </div>
  );
}
