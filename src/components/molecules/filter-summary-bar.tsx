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
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-2 py-1.5 text-sm text-muted-foreground">
      <span>{count} transaction{count !== 1 ? "s" : ""}</span>
      <span className="text-border">|</span>
      <span>Expenses: <span className="tabular-nums">{centsToDisplay(totalExpense)}</span></span>
      <span className="text-border">|</span>
      <span className="text-positive">Credits: <span className="tabular-nums">+{centsToDisplay(totalIncome)}</span></span>
      <span className="text-border">|</span>
      <span className={net >= 0 ? "text-positive" : ""}>
        Net: <span className="tabular-nums">{net >= 0 ? "+" : ""}{centsToDisplay(Math.abs(net))}</span>
      </span>
    </div>
  );
}
