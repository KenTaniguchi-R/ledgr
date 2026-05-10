import { centsToDisplay } from "@/lib/money";
import { cn } from "@/lib/utils";

interface AmountDisplayProps {
  amount: number;
  currency?: string;
  pending?: boolean;
  className?: string;
}

export function AmountDisplay({
  amount,
  currency = "USD",
  pending = false,
  className,
}: AmountDisplayProps) {
  const isIncome = amount < 0;
  const formatted = centsToDisplay(Math.abs(amount), currency);
  const prefix = isIncome ? "+" : "-";

  return (
    <span
      className={cn(
        "tabular-nums text-sm font-medium",
        isIncome && "text-emerald-600",
        pending && "opacity-60",
        className,
      )}
    >
      {prefix}
      {formatted}
    </span>
  );
}
