"use client";

import { useState } from "react";
import { ChevronsUpDown, X, Landmark, Tags } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DateRangePopover,
  type DatePresetOption,
} from "@/components/molecules/date-range-popover";
import { useSearchParamFilters } from "@/hooks/use-search-param-filters";
import { rangeToDateBounds, formatDateShort, formatTxnSpan } from "@/lib/date-utils";
import { resolveReportDateSelection } from "@/lib/report-date-selection";
import type { CategoryGroup } from "@/queries/categories";

// Reports keeps its own preset ids (mapped to rangeToDateBounds + the server's
// comparison-period logic). "All time" clears the range; the rest set from/to + preset.
const REPORT_DATE_OPTIONS: DatePresetOption[] = [
  { id: "all", label: "All time" },
  { id: "1M", label: "Last month" },
  { id: "3M", label: "Last 3 months" },
  { id: "6M", label: "Last 6 months" },
  { id: "1Y", label: "Last year" },
];

interface AccountOption {
  id: string;
  name: string;
  /** Soft-deleted: the connection was removed, but its transactions remain. */
  disconnected: boolean;
  firstTxnDate: string | null;
  lastTxnDate: string | null;
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
  const activeAccounts = accounts.filter((a) => !a.disconnected);
  const disconnectedAccounts = accounts.filter((a) => a.disconnected);
  const selectedCategoryIds = searchParams.get("categories")?.split(",").filter(Boolean) ?? [];

  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");
  const presetParam = searchParams.get("preset");
  // Shared with the Reports page so the chip and the report below it always
  // describe the same range.
  const { effectivePreset, isAllTime } = resolveReportDateSelection({
    from: fromParam,
    to: toParam,
    preset: presetParam,
  });
  const dateActive = !isAllTime;
  const dateValue = (() => {
    if (!dateActive) return null;
    if (effectivePreset) return REPORT_DATE_OPTIONS.find((o) => o.id === effectivePreset)?.label ?? null;
    if (fromParam && toParam) return `${formatDateShort(fromParam)} - ${formatDateShort(toParam)}`;
    if (fromParam) return `From ${formatDateShort(fromParam)}`;
    if (toParam) return `Until ${formatDateShort(toParam)}`;
    return null;
  })();

  // A preset names a window without saying which one. Resolve it here so the
  // chip prints the dates the report below it actually used.
  const dateDetail = (() => {
    if (!dateActive || !effectivePreset) return null;
    const { from, to } = rangeToDateBounds(effectivePreset);
    if (!from) return null;
    return `${formatDateShort(from)} – ${formatDateShort(to)}`;
  })();

  function handleDatePreset(id: string) {
    const { from, to } = rangeToDateBounds(id);
    updateFilters({ from, to, preset: id === "all" ? null : id });
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

  return (
    <div className="flex flex-wrap items-center gap-2">
      <DateRangePopover
        presets={REPORT_DATE_OPTIONS}
        selectedId={effectivePreset}
        active={dateActive}
        triggerValue={dateValue}
        triggerDetail={dateDetail}
        from={fromParam ?? ""}
        to={toParam ?? ""}
        onSelectPreset={handleDatePreset}
        onFromChange={(v) => updateFilters({ from: v, preset: null })}
        onToChange={(v) => updateFilters({ to: v, preset: null })}
      />

      {/* Account multi-select */}
      <Popover open={accountsOpen} onOpenChange={setAccountsOpen}>
        <PopoverTrigger
          render={<Button variant="outline" size="sm" className="h-8 text-xs" />}
        >
          <Landmark className="mr-1 h-3.5 w-3.5" />
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
              <CommandGroup heading="Active">
                {activeAccounts.map((a) => (
                  <CommandItem key={a.id} onSelect={() => toggleAccount(a.id)}>
                    <Checkbox
                      checked={selectedAccountIds.includes(a.id)}
                      className="mr-2"
                    />
                    {a.name}
                  </CommandItem>
                ))}
              </CommandGroup>
              {disconnectedAccounts.length > 0 && (
                <CommandGroup heading="Disconnected">
                  {disconnectedAccounts.map((a) => (
                    <CommandItem key={a.id} onSelect={() => toggleAccount(a.id)}>
                      <Checkbox
                        checked={selectedAccountIds.includes(a.id)}
                        className="mr-2"
                      />
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate text-muted-foreground">{a.name}</span>
                        {/* The span is what tells a superseded account apart from
                            a duplicated one — it stops where its replacement starts. */}
                        {a.firstTxnDate && a.lastTxnDate && (
                          <span className="text-[10px] tabular-nums text-muted-foreground/70">
                            {formatTxnSpan(a.firstTxnDate, a.lastTxnDate)}
                          </span>
                        )}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {/* Category multi-select */}
      <Popover open={categoriesOpen} onOpenChange={setCategoriesOpen}>
        <PopoverTrigger
          render={<Button variant="outline" size="sm" className="h-8 text-xs" />}
        >
          <Tags className="mr-1 h-3.5 w-3.5" />
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
