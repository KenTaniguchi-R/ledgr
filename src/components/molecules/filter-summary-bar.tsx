import { centsToDisplay, centsToSignedDisplay } from "@/lib/money";

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
  const label = `${count} transaction${count !== 1 ? "s" : ""}`;
  // Math.abs() here used to swallow the minus, so a net of -$248 read as
  // "$248" — a loss shown as a gain to anyone not reading the color.
  const netText = centsToSignedDisplay(net);

  return (
    <>
      {/*
        Below sm the four figures and three separators wrap to two lines, which
        puts Net — the number the strip exists for — last, on the second line.
        One line instead, net first; expenses and credits return at sm, where
        the full strip fits on one line anyway.
      */}
      <div className="flex items-center gap-x-2 px-2 py-1.5 text-sm text-muted-foreground sm:hidden">
        <span className={net >= 0 ? "text-positive" : ""}>
          Net <span className="tabular-nums">{netText}</span>
        </span>
        <span className="text-border">·</span>
        <span className="truncate">{label}</span>
      </div>

      <div className="hidden flex-wrap items-center gap-x-4 gap-y-1 px-2 py-1.5 text-sm text-muted-foreground sm:flex">
        <span>{label}</span>
        <span className="text-border">|</span>
        <span>Expenses: <span className="tabular-nums">{centsToDisplay(totalExpense)}</span></span>
        <span className="text-border">|</span>
        <span className="text-positive">Credits: <span className="tabular-nums">+{centsToDisplay(totalIncome)}</span></span>
        <span className="text-border">|</span>
        <span className={net >= 0 ? "text-positive" : ""}>
          Net: <span className="tabular-nums">{netText}</span>
        </span>
      </div>
    </>
  );
}
