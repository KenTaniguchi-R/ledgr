import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TransactionSplitRow } from "@/components/molecules/transaction-split-row";
import { centsToDisplay } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { SplitRow } from "@/queries/transactions";
import type { CategoryGroup } from "@/queries/categories";

interface SplitEditorProps {
  transactionId: string;
  splits: (SplitRow & { isDraft?: boolean })[];
  totalAmount: number;
  categories: CategoryGroup[];
  onAdd: () => void;
  onUpdate: (updated: SplitRow) => void;
  onDelete: (splitId: string) => Promise<void>;
}

export function SplitEditor({
  transactionId,
  splits,
  totalAmount,
  categories,
  onAdd,
  onUpdate,
  onDelete,
}: SplitEditorProps) {
  const hasDraftSplits = splits.some((s) => s.isDraft && !s.categoryId);
  const totalSplitAmount = splits.reduce((sum, s) => sum + s.amount, 0);
  const remaining = Math.abs(totalAmount) - totalSplitAmount;

  return (
    <div>
      {splits.length > 0 && (
        <div className="bg-muted/30 rounded-lg p-3 space-y-1">
          <p className="text-xs text-muted-foreground mb-1">Splits</p>
          {splits.map((split) => (
            <TransactionSplitRow
              key={split.id}
              transactionId={transactionId}
              split={split}
              categories={categories}
              onUpdate={onUpdate}
              onDelete={onDelete}
            />
          ))}
          <div className={cn(
            "flex justify-between text-xs pt-1 border-t border-border/50 mt-1",
            remaining === 0 ? "text-emerald-600" : "text-destructive",
          )}>
            <span>Remaining</span>
            <span className="tabular-nums">{centsToDisplay(remaining)}</span>
          </div>
        </div>
      )}
      <Button
        variant="ghost"
        size="sm"
        className="mt-2 text-xs"
        onClick={onAdd}
        disabled={hasDraftSplits}
      >
        <Plus className="size-3 mr-1" /> Add Split
      </Button>
    </div>
  );
}
