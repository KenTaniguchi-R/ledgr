"use client";

import { useState, useRef } from "react";
import { DateRangeSelector } from "@/components/molecules/date-range-selector";
import { Search, X, Download, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSearchParamFilters } from "@/hooks/use-search-param-filters";
import { useAmountFilter } from "@/hooks/use-amount-filter";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { CategorySelectItems } from "@/components/molecules/category-select-items";
import { UNCATEGORIZED } from "@/lib/labels";
import type { CategoryGroup } from "@/queries/categories";

interface AccountOption {
  id: string;
  name: string;
}

interface TransactionFiltersProps {
  accounts: AccountOption[];
  categories: CategoryGroup[];
}

export function TransactionFilters({ accounts, categories }: TransactionFiltersProps) {
  const { updateFilter, updateFilters, clearFilters, hasFilters, searchParams } = useSearchParamFilters();

  const [searchValue, setSearchValue] = useState(searchParams.get("q") ?? "");
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [activePreset, setActivePreset] = useState("All");
  const [filtersExpanded, setFiltersExpanded] = useState(false);

  const amount = useAmountFilter({
    initialMin: searchParams.get("amountMin"),
    initialMax: searchParams.get("amountMax"),
    onUpdate: updateFilter,
  });

  function handleSearchChange(value: string) {
    setSearchValue(value);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      updateFilter("q", value || null);
    }, 300);
  }

  function handlePresetChange(range: string) {
    setActivePreset(range);
    if (range === "All") {
      updateFilters({ from: null, to: null });
      return;
    }
    const today = new Date();
    const to = today.toISOString().split("T")[0];
    const from = new Date(today);
    switch (range) {
      case "1M": from.setMonth(from.getMonth() - 1); break;
      case "3M": from.setMonth(from.getMonth() - 3); break;
      case "6M": from.setMonth(from.getMonth() - 6); break;
      case "1Y": from.setFullYear(from.getFullYear() - 1); break;
    }
    updateFilters({ from: from.toISOString().split("T")[0], to });
  }

  function handleClearFilters() {
    setSearchValue("");
    amount.reset();
    setActivePreset("All");
    clearFilters();
  }

  const selectedAccountId = searchParams.get("account");
  const selectedAccountName = selectedAccountId
    ? accounts.find((a) => a.id === selectedAccountId)?.name ?? "All accounts"
    : "All accounts";

  const selectedCategoryId = searchParams.get("category");
  const selectedCategoryName = (() => {
    if (!selectedCategoryId) return "All categories";
    if (selectedCategoryId === "uncategorized") return UNCATEGORIZED;
    for (const group of categories) {
      const cat = group.categories.find((c) => c.id === selectedCategoryId);
      if (cat) return cat.name;
    }
    return "All categories";
  })();

  const activeFilterCount = [
    searchParams.get("account"),
    searchParams.get("category"),
    searchParams.get("type"),
    searchParams.get("amountMin"),
    searchParams.get("amountMax"),
    searchParams.get("from"),
    searchParams.get("to"),
    searchParams.get("reviewed"),
  ].filter(Boolean).length;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search..."
            aria-label="Search transactions"
            value={searchValue}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="h-8 w-full sm:w-[180px] pl-7 text-sm"
          />
        </div>

        <DateRangeSelector value={activePreset} onChange={handlePresetChange} />

        <Button
          variant="outline"
          size="sm"
          className="text-xs md:hidden min-h-[44px]"
          onClick={() => setFiltersExpanded(!filtersExpanded)}
        >
          <SlidersHorizontal className="h-3 w-3 mr-1" />
          Filters
          {activeFilterCount > 0 && (
            <span className="ml-1 inline-flex items-center justify-center h-4 min-w-4 rounded-full bg-primary text-primary-foreground text-[10px] px-1">
              {activeFilterCount}
            </span>
          )}
        </Button>

        {hasFilters && (
          <Button variant="ghost" size="xs" onClick={handleClearFilters} className="text-xs">
            <X className="h-3 w-3 mr-1" /> Clear
          </Button>
        )}

        <a
          href={`/api/export/transactions?${searchParams.toString()}`}
          download
          className="ml-auto"
        >
          <Button variant="outline" size="xs" className="text-xs">
            <Download className="h-3 w-3 mr-1" /> Export
          </Button>
        </a>
      </div>

      <div className={cn(
        "flex flex-col sm:flex-row sm:flex-wrap items-start sm:items-center gap-2",
        !filtersExpanded && "hidden md:flex",
      )}>
        <Select
          value={searchParams.get("account") ?? "all"}
          onValueChange={(v) => updateFilter("account", v === "all" ? null : v)}
        >
          <SelectTrigger className="h-8 w-full sm:w-[160px] text-xs">
            <SelectValue>{selectedAccountName}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All accounts</SelectItem>
            {accounts.map((a) => (
              <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={searchParams.get("category") ?? "all"}
          onValueChange={(v) => updateFilter("category", v === "all" ? null : v)}
        >
          <SelectTrigger className="h-8 w-full sm:w-[160px] text-xs">
            <SelectValue>{selectedCategoryName}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            <CategorySelectItems categories={categories} />
          </SelectContent>
        </Select>

        <Select
          value={searchParams.get("type") ?? "all"}
          onValueChange={(v) => updateFilter("type", v === "all" ? null : v)}
        >
          <SelectTrigger className="h-8 w-full sm:w-[120px] text-xs">
            <SelectValue>
              {searchParams.get("type") === "expense" ? "Expenses"
                : searchParams.get("type") === "credits" ? "Credits"
                : searchParams.get("type") === "transfer" ? "Transfers"
                : "All types"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            <SelectItem value="expense">Expenses</SelectItem>
            <SelectItem value="credits">Credits</SelectItem>
            <SelectItem value="transfer">Transfers</SelectItem>
          </SelectContent>
        </Select>

        <div className="grid grid-cols-2 gap-2 w-full sm:flex sm:w-auto">
          <Input
            type="text"
            inputMode="decimal"
            placeholder="Min $"
            aria-label="Minimum amount"
            value={amount.minDisplay}
            onChange={(e) => amount.handleMinChange(e.target.value)}
            onBlur={() => amount.handleBlur("amountMin")}
            className="h-8 sm:w-[80px] text-xs"
          />
          <Input
            type="text"
            inputMode="decimal"
            placeholder="Max $"
            aria-label="Maximum amount"
            value={amount.maxDisplay}
            onChange={(e) => amount.handleMaxChange(e.target.value)}
            onBlur={() => amount.handleBlur("amountMax")}
            className="h-8 sm:w-[80px] text-xs"
          />
        </div>

        <div className="grid grid-cols-[1fr_auto_1fr] sm:flex items-center gap-2 w-full sm:w-auto">
          <Input
            type="date"
            aria-label="From date"
            value={searchParams.get("from") ?? ""}
            onChange={(e) => {
              setActivePreset("");
              updateFilter("from", e.target.value || null);
            }}
            className="h-8 sm:w-[130px] text-xs"
          />
          <span className="text-xs text-muted-foreground">to</span>
          <Input
            type="date"
            aria-label="To date"
            value={searchParams.get("to") ?? ""}
            onChange={(e) => {
              setActivePreset("");
              updateFilter("to", e.target.value || null);
            }}
            className="h-8 sm:w-[130px] text-xs"
          />
        </div>

        <div className="flex items-center gap-1.5">
          <Switch
            id="reviewed-filter"
            checked={searchParams.get("reviewed") === "true"}
            onCheckedChange={(checked) =>
              updateFilter("reviewed", checked ? "true" : null)
            }
            className="h-4 w-7"
          />
          <Label htmlFor="reviewed-filter" className="text-xs">Reviewed</Label>
        </div>
      </div>
    </div>
  );
}
