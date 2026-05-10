import { Badge } from "@/components/ui/badge";

const TYPE_CONFIG: Record<string, { label: string; className: string }> = {
  stock: { label: "Stock", className: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200" },
  etf: { label: "ETF", className: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200" },
  mutual_fund: { label: "Mutual Fund", className: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200" },
  bond: { label: "Bond", className: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200" },
  crypto: { label: "Crypto", className: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200" },
  cash: { label: "Cash", className: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" },
  other: { label: "Other", className: "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200" },
};

interface InvestmentTypeBadgeProps {
  type: string | null;
}

export function InvestmentTypeBadge({ type }: InvestmentTypeBadgeProps) {
  const config = TYPE_CONFIG[type ?? "other"] ?? TYPE_CONFIG.other;
  return (
    <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 font-medium ${config.className}`}>
      {config.label}
    </Badge>
  );
}
