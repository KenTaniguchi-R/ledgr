"use client";

import { useState, useRef, useCallback } from "react";
import { Search, X, Download } from "lucide-react";
import { useSearchParamFilters } from "@/hooks/use-search-param-filters";
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
import { parseToCents, centsToInputDisplay } from "@/lib/money";
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

  const initMin = searchParams.get("amountMin");
  const initMax = searchParams.get("amountMax");
  const [amountMinDisplay, setAmountMinDisplay] = useState(
    initMin ? centsToInputDisplay(parseInt(initMin, 10)) : "",
  );
  const [amountMaxDisplay, setAmountMaxDisplay] = useState(
    initMax ? centsToInputDisplay(parseInt(initMax, 10)) : "",
  );
  const minDebounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const maxDebounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  function handleSearchChange(value: string) {
    setSearchValue(value);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      updateFilter("q", value || null);
    }, 300);
  }

  const flushAmountFilter = useCallback(
    (key: "amountMin" | "amountMax", displayValue: string) => {
      if (displayValue === "") {
        updateFilter(key, null);
        return;
      }
      const cents = parseToCents(displayValue);
      if (cents !== null && cents >= 0) {
        updateFilter(key, String(cents));
      }
    },
    [updateFilter],
  );

  function handleAmountMinChange(value: string) {
    setAmountMinDisplay(value);
    if (minDebounceRef.current) clearTimeout(minDebounceRef.current);
    minDebounceRef.current = setTimeout(() => {
      flushAmountFilter("amountMin", value);
    }, 500);
  }

  function handleAmountMaxChange(value: string) {
    setAmountMaxDisplay(value);
    if (maxDebounceRef.current) clearTimeout(maxDebounceRef.current);
    maxDebounceRef.current = setTimeout(() => {
      flushAmountFilter("amountMax", value);
    }, 500);
  }

  function handleAmountBlur(key: "amountMin" | "amountMax", displayValue: string) {
    const ref = key === "amountMin" ? minDebounceRef : maxDebounceRef;
    if (ref.current) clearTimeout(ref.current);
    flushAmountFilter(key, displayValue);
  }

  function handleClearFilters() {
    setSearchValue("");
    setAmountMinDisplay("");
    setAmountMaxDisplay("");
    clearFilters();
  }

  const selectedAccountId = searchParams.get("account");
  const selectedAccountName = selectedAccountId
    ? accounts.find((a) => a.id === selectedAccountId)?.name ?? "All accounts"
    : "All accounts";

  const selectedCategoryId = searchParams.get("category");
  const selectedCategoryName = (() => {
    if (!selectedCategoryId) return "All categories";
    if (selectedCategoryId === "uncategorized") return "Uncategorized";
    for (const group of categories) {
      const cat = group.categories.find((c) => c.id === selectedCategoryId);
      if (cat) return cat.name;
    }
    return "All categories";
  })();

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          placeholder="Search..."
          aria-label="Search transactions"
          value={searchValue}
          onChange={(e) => handleSearchChange(e.target.value)}
          className="h-8 w-[180px] pl-7 text-sm"
        />
      </div>

      <Select
        value={searchParams.get("account") ?? "all"}
        onValueChange={(v) => updateFilter("account", v === "all" ? null : v)}
      >
        <SelectTrigger className="h-8 w-[160px] text-xs">
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
        <SelectTrigger className="h-8 w-[160px] text-xs">
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
        <SelectTrigger className="h-8 w-[120px] text-xs">
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

      <Input
        type="text"
        inputMode="decimal"
        placeholder="Min $"
        aria-label="Minimum amount"
        value={amountMinDisplay}
        onChange={(e) => handleAmountMinChange(e.target.value)}
        onBlur={() => handleAmountBlur("amountMin", amountMinDisplay)}
        className="h-8 w-[80px] text-xs"
      />
      <Input
        type="text"
        inputMode="decimal"
        placeholder="Max $"
        aria-label="Maximum amount"
        value={amountMaxDisplay}
        onChange={(e) => handleAmountMaxChange(e.target.value)}
        onBlur={() => handleAmountBlur("amountMax", amountMaxDisplay)}
        className="h-8 w-[80px] text-xs"
      />

      <Input
        type="date"
        aria-label="From date"
        value={searchParams.get("from") ?? ""}
        onChange={(e) => updateFilter("from", e.target.value || null)}
        className="h-8 w-[130px] text-xs"
      />
      <span className="text-xs text-muted-foreground">to</span>
      <Input
        type="date"
        aria-label="To date"
        value={searchParams.get("to") ?? ""}
        onChange={(e) => updateFilter("to", e.target.value || null)}
        className="h-8 w-[130px] text-xs"
      />

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
  );
}
