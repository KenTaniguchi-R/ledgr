"use client";

import { useState, useRef } from "react";
import { Search, X } from "lucide-react";
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
  const { updateFilter, clearFilters, hasFilters, searchParams } = useSearchParamFilters();

  const [searchValue, setSearchValue] = useState(searchParams.get("q") ?? "");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  function handleSearchChange(value: string) {
    setSearchValue(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      updateFilter("q", value || null);
    }, 300);
  }

  function handleClearFilters() {
    setSearchValue("");
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

      <Input
        type="date"
        value={searchParams.get("from") ?? ""}
        onChange={(e) => updateFilter("from", e.target.value || null)}
        className="h-8 w-[130px] text-xs"
      />
      <span className="text-xs text-muted-foreground">to</span>
      <Input
        type="date"
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
    </div>
  );
}
