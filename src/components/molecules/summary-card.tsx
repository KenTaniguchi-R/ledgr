import { Card, CardContent } from "@/components/ui/card";
import { BalanceDisplay } from "@/components/atoms/balance-display";
import { cn } from "@/lib/utils";

interface SummaryCardProps {
  label: string;
  amount: number | null;
  currency?: string;
  variant?: "default" | "positive" | "negative";
}

export function SummaryCard({ label, amount, currency, variant = "default" }: SummaryCardProps) {
  return (
    <Card>
      <CardContent className="pt-3 pb-2 px-2 sm:pt-4 sm:pb-3 sm:px-4">
        <div
          className={cn(
            variant === "positive" && "text-emerald-600",
            variant === "negative" && "text-destructive",
          )}
        >
          <BalanceDisplay amount={amount} currency={currency} size="lg" />
        </div>
        <p className="text-[10px] sm:text-xs text-muted-foreground mt-1">{label}</p>
      </CardContent>
    </Card>
  );
}
