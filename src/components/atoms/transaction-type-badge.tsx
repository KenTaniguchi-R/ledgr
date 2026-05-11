import { Badge } from "@/components/ui/badge";

const TYPE_CONFIG: Record<string, { label: string; className: string }> = {
  buy: { label: "BUY", className: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200" },
  sell: { label: "SELL", className: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200" },
  dividend: { label: "DIVIDEND", className: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" },
  fee: { label: "FEE", className: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200" },
  transfer: { label: "TRANSFER", className: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200" },
  other: { label: "OTHER", className: "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200" },
};

interface TransactionTypeBadgeProps {
  type: string | null;
}

export function TransactionTypeBadge({ type }: TransactionTypeBadgeProps) {
  const config = TYPE_CONFIG[type ?? "other"] ?? TYPE_CONFIG.other;
  return (
    <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 font-medium w-fit ${config.className}`}>
      {config.label}
    </Badge>
  );
}
