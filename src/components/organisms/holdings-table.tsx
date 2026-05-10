"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { HoldingRow } from "@/components/molecules/holding-row";
import { InvestmentTypeBadge } from "@/components/atoms/investment-type-badge";
import { ComparisonBadge } from "@/components/molecules/comparison-badge";
import { centsToDisplay } from "@/lib/money";
import type { InvestmentHoldingRow } from "@/queries/investments";

interface HoldingsTableProps {
  holdings: InvestmentHoldingRow[];
  view: "consolidated" | "by-account";
}

type SortKey = "value" | "gainLoss" | "name";

export function HoldingsTable({ holdings, view }: HoldingsTableProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [sortBy, setSortBy] = useState<SortKey>("value");
  const [selectedHolding, setSelectedHolding] = useState<InvestmentHoldingRow | null>(null);

  function handleViewChange(values: string[]) {
    const newView = values[values.length - 1];
    if (!newView) return;
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    params.set("view", newView);
    router.push(`?${params.toString()}`);
  }

  const sorted = [...holdings].sort((a, b) => {
    switch (sortBy) {
      case "value": return b.currentValue - a.currentValue;
      case "gainLoss": return (b.gainLossPercent ?? 0) - (a.gainLossPercent ?? 0);
      case "name": return a.securityName.localeCompare(b.securityName);
      default: return 0;
    }
  });

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <ToggleGroup
          value={[view]}
          onValueChange={handleViewChange}
          size="sm"
        >
          <ToggleGroupItem value="consolidated" className="text-xs">Consolidated</ToggleGroupItem>
          <ToggleGroupItem value="by-account" className="text-xs">By Account</ToggleGroupItem>
        </ToggleGroup>
        <div className="flex gap-1">
          {(["value", "gainLoss", "name"] as SortKey[]).map((key) => (
            <button key={key} type="button" onClick={() => setSortBy(key)}
              className={`text-xs px-2 py-1 rounded ${sortBy === key ? "bg-muted font-medium" : "text-muted-foreground hover:bg-muted/50"}`}>
              {key === "value" ? "Value" : key === "gainLoss" ? "Gain/Loss" : "Name"}
            </button>
          ))}
        </div>
      </div>
      <div className="border rounded-lg overflow-hidden">
        <div className="grid grid-cols-[minmax(80px,1fr)_2fr_80px_80px_100px_100px_100px_90px] gap-2 items-center h-8 px-3 text-xs font-medium text-muted-foreground bg-muted/30 border-b">
          <span>Ticker</span><span>Name</span><span>Type</span><span className="text-right">Shares</span>
          <span className="text-right">Value</span><span className="text-right">Cost</span><span className="text-right">Gain/Loss</span>
        </div>
        {sorted.map((h, i) => (
          <HoldingRow key={`${h.ticker ?? h.securityName}-${h.accountId ?? i}`} holding={h} onClick={() => setSelectedHolding(h)} />
        ))}
        {sorted.length === 0 && (
          <div className="flex items-center justify-center h-20 text-sm text-muted-foreground">No holdings found.</div>
        )}
      </div>
      <Sheet open={!!selectedHolding} onOpenChange={() => setSelectedHolding(null)}>
        <SheetContent>
          <SheetHeader><SheetTitle>{selectedHolding?.securityName}</SheetTitle></SheetHeader>
          {selectedHolding && (
            <div className="space-y-4 mt-4">
              <div className="flex items-center gap-2">
                <span className="text-2xl font-bold tabular-nums">{selectedHolding.ticker ?? "N/A"}</span>
                <InvestmentTypeBadge type={selectedHolding.type} />
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-muted-foreground">Value</span><p className="font-medium tabular-nums">{centsToDisplay(selectedHolding.currentValue)}</p></div>
                <div><span className="text-muted-foreground">Cost Basis</span><p className="font-medium tabular-nums">{selectedHolding.costBasis !== null ? centsToDisplay(selectedHolding.costBasis) : "—"}</p></div>
                <div><span className="text-muted-foreground">Shares</span><p className="font-medium tabular-nums">{selectedHolding.quantity}</p></div>
                <div><span className="text-muted-foreground">Gain/Loss</span><p>{selectedHolding.gainLossPercent !== null ? <ComparisonBadge current={selectedHolding.currentValue} previous={selectedHolding.costBasis} pill /> : "—"}</p></div>
                {selectedHolding.sector && <div className="col-span-2"><span className="text-muted-foreground">Sector</span><p>{selectedHolding.sector}</p></div>}
                {selectedHolding.accountName && <div className="col-span-2"><span className="text-muted-foreground">Account</span><p>{selectedHolding.accountName}</p></div>}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
