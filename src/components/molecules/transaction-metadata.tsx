"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

interface TransactionMetadataProps {
  originalName: string;
  categorySource: string | null;
  plaidTransactionId: string | null;
  transferPairId: string | null;
  onSelectTransferPair?: (id: string) => void;
}

const SOURCE_LABELS: Record<string, string> = {
  manual: "Manual",
  ai: "AI",
  rule: "Rule",
  plaid: "Plaid",
  pfc: "Plaid (PFC)",
};

export function TransactionMetadata({
  originalName,
  categorySource,
  plaidTransactionId,
  transferPairId,
  onSelectTransferPair,
}: TransactionMetadataProps) {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <Separator className="my-3" />
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground w-full"
      >
        {open ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
        Details
      </button>

      {open && (
        <div className="mt-2 space-y-2 text-xs text-muted-foreground">
          <div className="flex justify-between">
            <span>Original description</span>
            <span className="text-foreground font-mono text-[11px] max-w-[60%] truncate text-right">
              {originalName}
            </span>
          </div>
          {categorySource && (
            <div className="flex justify-between items-center">
              <span>Category source</span>
              <Badge variant="outline" className="text-[10px] h-5">
                {SOURCE_LABELS[categorySource] ?? categorySource}
              </Badge>
            </div>
          )}
          {plaidTransactionId && (
            <div className="flex justify-between">
              <span>Plaid ID</span>
              <span className="font-mono text-[11px] max-w-[60%] truncate text-right">
                {plaidTransactionId}
              </span>
            </div>
          )}
          <div className="flex justify-between items-center">
            <span>Transfer pair</span>
            {transferPairId ? (
              <button
                type="button"
                onClick={() => onSelectTransferPair?.(transferPairId)}
                className="text-primary hover:underline text-[11px]"
              >
                View paired transaction
              </button>
            ) : (
              <span>—</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
