"use client";

import { useState, useRef, useCallback } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
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
  SelectGroup,
  SelectLabel,
} from "@/components/ui/select";
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
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [searchValue, setSearchValue] = useState(searchParams.get("q") ?? "");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const updateFilter = useCallback(
    (key: string, value: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value === null || value === "" || value === "all") {
        params.delete(key);
      } else {
        params.set(key, value);
      }
      router.push(`${pathname}?${params.toString()}`);
    },
    [router, pathname, searchParams],
  );

  function handleSearchChange(value: string) {
    setSearchValue(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      updateFilter("q", value || null);
    }, 300);
  }

  function clearFilters() {
    setSearchValue("");
    router.push(pathname);
  }

  const hasFilters =
    searchParams.has("q") ||
    searchParams.has("account") ||
    searchParams.has("category") ||
    searchParams.has("from") ||
    searchParams.has("to") ||
    searchParams.has("reviewed");

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          placeholder="Search..."
          value={searchValue}
          onChange={(e) => handleSearchChange(e.target.value)}
          className="h-8 w-[180px] pl-7 text-sm"
        />
      </div>

      {/* Account filter */}
      <Select
        value={searchParams.get("account") ?? "all"}
        onValueChange={(v) => updateFilter("account", v === "all" ? null : v)}
      >
        <SelectTrigger className="h-8 w-[160px] text-xs">
          <SelectValue placeholder="All accounts" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All accounts</SelectItem>
          {accounts.map((a) => (
            <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Category filter */}
      <Select
        value={searchParams.get("category") ?? "all"}
        onValueChange={(v) => updateFilter("category", v === "all" ? null : v)}
      >
        <SelectTrigger className="h-8 w-[160px] text-xs">
          <SelectValue placeholder="All categories" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All categories</SelectItem>
          <SelectItem value="uncategorized">
            <span className="italic">Uncategorized</span>
          </SelectItem>
          {categories.map((group) => (
            <SelectGroup key={group.id}>
              <SelectLabel className="text-xs font-semibold text-muted-foreground px-2 py-1">
                {group.name}
              </SelectLabel>
              {group.categories.map((cat) => (
                <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
              ))}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>

      {/* Date range */}
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

      {/* Reviewed switch */}
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

      {/* Clear */}
      {hasFilters && (
        <Button variant="ghost" size="xs" onClick={clearFilters} className="text-xs">
          <X className="h-3 w-3 mr-1" /> Clear
        </Button>
      )}
    </div>
  );
}
