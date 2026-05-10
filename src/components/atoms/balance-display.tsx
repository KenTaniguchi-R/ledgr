import { centsToDisplay } from "@/lib/money";
import { cn } from "@/lib/utils";

interface BalanceDisplayProps {
  amount: number | null;
  currency?: string;
  size?: "sm" | "md" | "lg";
}

const sizeClasses = {
  sm: "text-sm",
  md: "text-base",
  lg: "text-2xl font-semibold tracking-tight",
};

export function BalanceDisplay({
  amount,
  currency = "USD",
  size = "md",
}: BalanceDisplayProps) {
  if (amount === null) {
    return (
      <span className={cn("text-muted-foreground", sizeClasses[size])}>
        —
      </span>
    );
  }

  return (
    <span
      className={cn(
        sizeClasses[size],
        amount < 0 && "text-destructive"
      )}
    >
      {centsToDisplay(amount, currency)}
    </span>
  );
}
