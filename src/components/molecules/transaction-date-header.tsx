import { AmountDisplay } from "@/components/atoms/amount-display";

interface TransactionDateHeaderProps {
  date: string;
  transactionCount: number;
  netAmount: number;
  currency?: string;
}

export function TransactionDateHeader({
  date,
  transactionCount,
  netAmount,
  currency = "USD",
}: TransactionDateHeaderProps) {
  const formatted = new Date(date + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });

  return (
    <div className="sticky top-0 z-10 flex items-center gap-2 h-8 px-2 bg-background border-b group-data-[bulk-active]/list:top-14">
      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{formatted}</span>
      <span className="text-xs text-muted-foreground">
        ·  {transactionCount} transaction{transactionCount !== 1 ? "s" : ""}
      </span>
      <span className="text-xs text-muted-foreground">·</span>
      <AmountDisplay amount={netAmount} currency={currency} className="text-xs" />
    </div>
  );
}
