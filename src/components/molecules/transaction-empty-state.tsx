import { ListX, ArrowRight } from "lucide-react";
import Link from "next/link";

interface TransactionEmptyStateProps {
  hasFilters: boolean;
}

export function TransactionEmptyState({ hasFilters }: TransactionEmptyStateProps) {
  if (hasFilters) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <ListX className="h-10 w-10 text-muted-foreground/40 mb-3" />
        <h3 className="text-lg font-medium">No transactions match your filters</h3>
        <p className="text-sm text-muted-foreground mt-1">Try adjusting or clearing your filters.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <ListX className="h-10 w-10 text-muted-foreground/40 mb-3" />
      <h3 className="text-lg font-medium">No transactions yet</h3>
      <p className="text-sm text-muted-foreground mt-1">
        Connect a bank account and sync to see your transactions.
      </p>
      <Link
        href="/accounts"
        className="inline-flex items-center gap-1 text-sm text-primary mt-3 hover:underline"
      >
        Go to Accounts <ArrowRight className="h-3 w-3" />
      </Link>
    </div>
  );
}
