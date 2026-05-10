import {
  Building2,
  PiggyBank,
  CreditCard,
  Receipt,
  TrendingUp,
  CircleDot,
} from "lucide-react";
import { cn } from "@/lib/utils";

type AccountType = "checking" | "savings" | "credit" | "loan" | "investment" | "other";

interface AccountTypeIconProps {
  type: AccountType;
  className?: string;
}

const icons: Record<AccountType, typeof Building2> = {
  checking: Building2,
  savings: PiggyBank,
  credit: CreditCard,
  loan: Receipt,
  investment: TrendingUp,
  other: CircleDot,
};

export function AccountTypeIcon({ type, className }: AccountTypeIconProps) {
  const Icon = icons[type] ?? CircleDot;
  return <Icon className={cn("size-4 text-muted-foreground", className)} />;
}
