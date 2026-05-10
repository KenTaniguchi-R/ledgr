"use client";

import { useState } from "react";
import { ChevronsUpDown, X } from "lucide-react";
import { DateRangeSelector } from "@/components/atoms/date-range-selector";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Checkbox } from "@/components/ui/checkbox";
import { useSearchParamFilters } from "@/hooks/use-search-param-filters";
import { rangeToDateBounds } from "@/lib/date-utils";
import type { CategoryGroup } from "@/queries/categories";

interface AccountOption {
  id: string;
  name: string;
}

interface ReportFilterBarProps {
  accounts: AccountOption[];
  categories: CategoryGroup[];
}

export function ReportFilterBar({ accounts, categories }: ReportFilterBarProps) {
  const { updateFilter, updateFilters, clearFilters, hasFilters, searchParams } = useSearchParamFilters();
  const [accountsOpen, setAccountsOpen] = useState(false);
  const [categoriesOpen, setCategoriesOpen] = useState(false);

  const selectedAccountIds = searchParams.get("accounts")?.split(",").filter(Boolean) ?? [];
  const selectedCategoryIds = searchParams.get("categories")?.split(",").filter(Boolean) ?? [];

  function handlePresetChange(range: string) {
    const { from, to } = rangeToDateBounds(range);
    updateFilters({
      from: from,
      to: to,
      preset: range === "all" ? null : range,
    });
  }

  function toggleAccount(id: string) {
    const next = selectedAccountIds.includes(id)
      ? selectedAccountIds.filter((a) => a !== id)
      : [...selectedAccountIds, id];
    updateFilter("accounts", next.length > 0 ? next.join(",") : null);
  }

  function toggleCategory(id: string) {
    const next = selectedCategoryIds.includes(id)
      ? selectedCategoryIds.filter((c) => c !== id)
      : [...selectedCategoryIds, id];
    updateFilter("categories", next.length > 0 ? next.join(",") : null);
  }

  const currentPreset = searchParams.get("preset") ?? "3M";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <DateRangeSelector value={currentPreset} onChange={handlePresetChange} />

      <Input
        type="date"
        value={searchParams.get("from") ?? ""}
        onChange={(e) => updateFilters({ from: e.target.value || null, preset: null })}
        className="h-8 w-[130px] text-xs"
      />
      <span className="text-xs text-muted-foreground">to</span>
      <Input
        type="date"
        value={searchParams.get("to") ?? ""}
        onChange={(e) => updateFilters({ to: e.target.value || null, preset: null })}
        className="h-8 w-[130px] text-xs"
      />

      {/* Account multi-select */}
      <Popover open={accountsOpen} onOpenChange={setAccountsOpen}>
        <PopoverTrigger
          render={<Button variant="outline" size="sm" className="h-8 text-xs" />}
        >
          {selectedAccountIds.length > 0
            ? `${selectedAccountIds.length} account${selectedAccountIds.length > 1 ? "s" : ""}`
            : "All accounts"}
          <ChevronsUpDown className="ml-1 h-3 w-3" />
        </PopoverTrigger>
        <PopoverContent className="w-[200px] p-0" align="start">
          <Command>
            <CommandInput placeholder="Search accounts..." className="h-8" />
            <CommandList>
              <CommandEmpty>No accounts found.</CommandEmpty>
              <CommandGroup>
                {accounts.map((a) => (
                  <CommandItem key={a.id} onSelect={() => toggleAccount(a.id)}>
                    <Checkbox
                      checked={selectedAccountIds.includes(a.id)}
                      className="mr-2"
                    />
                    {a.name}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {/* Category multi-select */}
      <Popover open={categoriesOpen} onOpenChange={setCategoriesOpen}>
        <PopoverTrigger
          render={<Button variant="outline" size="sm" className="h-8 text-xs" />}
        >
          {selectedCategoryIds.length > 0
            ? `${selectedCategoryIds.length} categor${selectedCategoryIds.length > 1 ? "ies" : "y"}`
            : "All categories"}
          <ChevronsUpDown className="ml-1 h-3 w-3" />
        </PopoverTrigger>
        <PopoverContent className="w-[220px] p-0" align="start">
          <Command>
            <CommandInput placeholder="Search categories..." className="h-8" />
            <CommandList>
              <CommandEmpty>No categories found.</CommandEmpty>
              {categories.map((group) => (
                <CommandGroup key={group.id} heading={group.name}>
                  {group.categories.map((cat) => (
                    <CommandItem key={cat.id} onSelect={() => toggleCategory(cat.id)}>
                      <Checkbox
                        checked={selectedCategoryIds.includes(cat.id)}
                        className="mr-2"
                      />
                      {cat.name}
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {hasFilters && (
        <Button variant="ghost" size="xs" onClick={clearFilters} className="text-xs">
          <X className="h-3 w-3 mr-1" /> Clear
        </Button>
      )}
    </div>
  );
}
