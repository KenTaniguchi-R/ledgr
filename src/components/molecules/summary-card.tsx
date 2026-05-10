import { Card, CardContent } from "@/components/ui/card";
import { BalanceDisplay } from "@/components/atoms/balance-display";

interface SummaryCardProps {
  label: string;
  amount: number | null;
  currency?: string;
}

export function SummaryCard({ label, amount, currency }: SummaryCardProps) {
  return (
    <Card>
      <CardContent className="pt-4 pb-3 px-4">
        <BalanceDisplay amount={amount} currency={currency} size="lg" />
        <p className="text-xs text-muted-foreground mt-1">{label}</p>
      </CardContent>
    </Card>
  );
}
