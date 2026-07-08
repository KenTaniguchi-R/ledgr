"use client";

import { useState, useRef, type ReactNode } from "react";
import {
  Search,
  X,
  Download,
  Landmark,
  Tags,
  ArrowLeftRight,
  DollarSign,
  Check,
  ChevronDown,
  BadgeCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useSearchParamFilters } from "@/hooks/use-search-param-filters";
import { useAmountFilter } from "@/hooks/use-amount-filter";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  DateRangePopover,
  type DatePresetOption,
} from "@/components/molecules/date-range-popover";
import { DATE_PRESETS, dateRangeForPreset, matchDatePreset, type DatePresetId } from "@/lib/date-presets";
import { formatDateShort } from "@/lib/date-utils";
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

const TYPE_LABELS: Record<string, string> = {
  expense: "Expenses",
  credits: "Credits",
  transfer: "Transfers",
};

// "All time" clears from/to; the rest map to date-presets ranges.
const DATE_OPTIONS: DatePresetOption[] = [
  { id: "all", label: "All time" },
  ...DATE_PRESETS,
];

/** Label content for a filter trigger: bare label when inactive, "Label: value" when set. */
function triggerLabel(label: string, value: string | null, active: boolean): ReactNode {
  if (!value) return label;
  return (
    <>
      <span className={cn("font-normal", active ? "opacity-70" : "text-muted-foreground")}>
        {label}:
      </span>
      <span className="ml-1 max-w-[140px] truncate">{value}</span>
    </>
  );
}

export function TransactionFilters({ accounts, categories }: TransactionFiltersProps) {
  const { updateFilter, updateFilters, clearFilters, hasFilters, searchParams } =
    useSearchParamFilters();

  const [searchValue, setSearchValue] = useState(searchParams.get("q") ?? "");
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const [accountOpen, setAccountOpen] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [typeOpen, setTypeOpen] = useState(false);
  const [amountOpen, setAmountOpen] = useState(false);

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

  function handleClearAll() {
    setSearchValue("");
    amount.reset();
    clearFilters();
  }

  // ---- derive active state + display labels from the URL params ----
  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");
  const dateMatch = matchDatePreset(fromParam, toParam);
  const dateActive = dateMatch !== null;
  const dateSelectedId = dateActive ? (dateMatch === "custom" ? null : dateMatch) : "all";
  const dateValue = (() => {
    if (dateMatch === null) return null;
    if (dateMatch !== "custom") return DATE_PRESETS.find((p) => p.id === dateMatch)?.label ?? null;
    if (fromParam && toParam) return `${formatDateShort(fromParam)} - ${formatDateShort(toParam)}`;
    if (fromParam) return `From ${formatDateShort(fromParam)}`;
    if (toParam) return `Until ${formatDateShort(toParam)}`;
    return null;
  })();

  const accountId = searchParams.get("account");
  const accountValue = accountId
    ? accounts.find((a) => a.id === accountId)?.name ?? null
    : null;

  const categoryId = searchParams.get("category");
  const categoryValue = (() => {
    if (!categoryId) return null;
    if (categoryId === "uncategorized") return UNCATEGORIZED;
    for (const group of categories) {
      const cat = group.categories.find((c) => c.id === categoryId);
      if (cat) return cat.name;
    }
    return null;
  })();

  const typeId = searchParams.get("type");
  const typeValue = typeId ? TYPE_LABELS[typeId] ?? null : null;

  const amountActive = !!(searchParams.get("amountMin") || searchParams.get("amountMax"));
  const amountValue = (() => {
    const { minDisplay: min, maxDisplay: max } = amount;
    if (min && max) return `$${min} - $${max}`;
    if (min) return `≥ $${min}`;
    if (max) return `≤ $${max}`;
    return null;
  })();

  const reviewedActive = searchParams.get("reviewed") === "true";

  function handleDatePreset(id: string) {
    if (id === "all") updateFilters({ from: null, to: null });
    else updateFilters(dateRangeForPreset(id as DatePresetId));
  }

  function selectType(value: string | null) {
    updateFilter("type", value);
    setTypeOpen(false);
  }

  // ---- applied-filter chips ----
  const chips: { key: string; label: string; onRemove: () => void }[] = [];
  if (dateActive)
    chips.push({ key: "date", label: `Date: ${dateValue}`, onRemove: () => updateFilters({ from: null, to: null }) });
  if (accountValue)
    chips.push({ key: "account", label: `Account: ${accountValue}`, onRemove: () => updateFilter("account", null) });
  if (categoryValue)
    chips.push({ key: "category", label: `Category: ${categoryValue}`, onRemove: () => updateFilter("category", null) });
  if (typeValue)
    chips.push({ key: "type", label: typeValue, onRemove: () => updateFilter("type", null) });
  if (amountActive)
    chips.push({
      key: "amount",
      label: `Amount: ${amountValue}`,
      onRemove: () => {
        amount.reset();
        updateFilters({ amountMin: null, amountMax: null });
      },
    });
  if (reviewedActive)
    chips.push({ key: "reviewed", label: "Reviewed", onRemove: () => updateFilter("reviewed", null) });

  return (
    <div className="space-y-3">
      {/* Row 1: search + export */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1 sm:flex-none">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search transactions..."
            aria-label="Search transactions"
            value={searchValue}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="h-9 w-full pl-8 text-sm sm:w-[280px]"
          />
        </div>

        <a
          href={`/api/export/transactions?${searchParams.toString()}`}
          download
          className="ml-auto"
        >
          <Button variant="outline" size="sm" className="h-9 text-xs">
            <Download className="mr-1 h-3.5 w-3.5" /> Export
          </Button>
        </a>
      </div>

      {/* Row 2: filter pills */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Date */}
        <DateRangePopover
          presets={DATE_OPTIONS}
          selectedId={dateSelectedId}
          active={dateActive}
          triggerValue={dateValue}
          from={fromParam ?? ""}
          to={toParam ?? ""}
          onSelectPreset={handleDatePreset}
          onFromChange={(v) => updateFilter("from", v)}
          onToChange={(v) => updateFilter("to", v)}
        />

        {/* Account */}
        <Popover open={accountOpen} onOpenChange={setAccountOpen}>
          <PopoverTrigger
            render={<Button variant={accountValue ? "default" : "outline"} size="sm" className="h-8 text-xs" />}
          >
            <Landmark className="mr-1 h-3.5 w-3.5" />
            {triggerLabel("Account", accountValue, !!accountValue)}
            <ChevronDown className="ml-1 h-3 w-3 opacity-60" />
          </PopoverTrigger>
          <PopoverContent className="w-[220px] p-0" align="start">
            <Command>
              <CommandInput placeholder="Search accounts..." className="h-8" />
              <CommandList>
                <CommandEmpty>No accounts found.</CommandEmpty>
                <CommandGroup>
                  <CommandItem
                    onSelect={() => {
                      updateFilter("account", null);
                      setAccountOpen(false);
                    }}
                  >
                    All accounts
                    {!accountId && <Check className="ml-auto h-3.5 w-3.5" />}
                  </CommandItem>
                  {accounts.map((a) => (
                    <CommandItem
                      key={a.id}
                      onSelect={() => {
                        updateFilter("account", a.id);
                        setAccountOpen(false);
                      }}
                    >
                      {a.name}
                      {accountId === a.id && <Check className="ml-auto h-3.5 w-3.5" />}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>

        {/* Category */}
        <Popover open={categoryOpen} onOpenChange={setCategoryOpen}>
          <PopoverTrigger
            render={<Button variant={categoryValue ? "default" : "outline"} size="sm" className="h-8 text-xs" />}
          >
            <Tags className="mr-1 h-3.5 w-3.5" />
            {triggerLabel("Category", categoryValue, !!categoryValue)}
            <ChevronDown className="ml-1 h-3 w-3 opacity-60" />
          </PopoverTrigger>
          <PopoverContent className="w-[240px] p-0" align="start">
            <Command>
              <CommandInput placeholder="Search categories..." className="h-8" />
              <CommandList>
                <CommandEmpty>No categories found.</CommandEmpty>
                <CommandGroup>
                  <CommandItem
                    onSelect={() => {
                      updateFilter("category", null);
                      setCategoryOpen(false);
                    }}
                  >
                    All categories
                    {!categoryId && <Check className="ml-auto h-3.5 w-3.5" />}
                  </CommandItem>
                  <CommandItem
                    onSelect={() => {
                      updateFilter("category", "uncategorized");
                      setCategoryOpen(false);
                    }}
                  >
                    <span className="italic text-muted-foreground">{UNCATEGORIZED}</span>
                    {categoryId === "uncategorized" && <Check className="ml-auto h-3.5 w-3.5" />}
                  </CommandItem>
                </CommandGroup>
                {categories.map((group) => (
                  <CommandGroup key={group.id} heading={group.name}>
                    {group.categories.map((cat) => (
                      <CommandItem
                        key={cat.id}
                        value={`${group.name} ${cat.name}`}
                        onSelect={() => {
                          updateFilter("category", cat.id);
                          setCategoryOpen(false);
                        }}
                      >
                        {cat.icon ? `${cat.icon} ` : ""}
                        {cat.name}
                        {categoryId === cat.id && <Check className="ml-auto h-3.5 w-3.5" />}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                ))}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>

        {/* Type */}
        <Popover open={typeOpen} onOpenChange={setTypeOpen}>
          <PopoverTrigger
            render={<Button variant={typeValue ? "default" : "outline"} size="sm" className="h-8 text-xs" />}
          >
            <ArrowLeftRight className="mr-1 h-3.5 w-3.5" />
            {triggerLabel("Type", typeValue, !!typeValue)}
            <ChevronDown className="ml-1 h-3 w-3 opacity-60" />
          </PopoverTrigger>
          <PopoverContent className="w-[180px] p-1" align="start">
            <div className="flex flex-col">
              <button
                type="button"
                onClick={() => selectType(null)}
                className="flex h-8 items-center justify-between rounded-md px-2 text-sm hover:bg-muted"
              >
                All types
                {!typeId && <Check className="h-3.5 w-3.5" />}
              </button>
              {Object.entries(TYPE_LABELS).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => selectType(value)}
                  className="flex h-8 items-center justify-between rounded-md px-2 text-sm hover:bg-muted"
                >
                  {label}
                  {typeId === value && <Check className="h-3.5 w-3.5" />}
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        {/* Amount */}
        <Popover open={amountOpen} onOpenChange={setAmountOpen}>
          <PopoverTrigger
            render={<Button variant={amountActive ? "default" : "outline"} size="sm" className="h-8 text-xs" />}
          >
            <DollarSign className="mr-1 h-3.5 w-3.5" />
            {triggerLabel("Amount", amountValue, amountActive)}
            <ChevronDown className="ml-1 h-3 w-3 opacity-60" />
          </PopoverTrigger>
          <PopoverContent className="w-[220px] p-2.5" align="start">
            <p className="pb-1.5 text-xs text-muted-foreground">Amount range</p>
            <div className="flex items-center gap-1.5">
              <Input
                type="text"
                inputMode="decimal"
                placeholder="Min $"
                aria-label="Minimum amount"
                value={amount.minDisplay}
                onChange={(e) => amount.handleMinChange(e.target.value)}
                onBlur={() => amount.handleBlur("amountMin")}
                className="h-8 text-xs"
              />
              <span className="text-xs text-muted-foreground">to</span>
              <Input
                type="text"
                inputMode="decimal"
                placeholder="Max $"
                aria-label="Maximum amount"
                value={amount.maxDisplay}
                onChange={(e) => amount.handleMaxChange(e.target.value)}
                onBlur={() => amount.handleBlur("amountMax")}
                className="h-8 text-xs"
              />
            </div>
          </PopoverContent>
        </Popover>

        {/* Reviewed toggle */}
        <Button
          type="button"
          variant={reviewedActive ? "default" : "outline"}
          size="sm"
          className="h-8 text-xs"
          aria-pressed={reviewedActive}
          onClick={() => updateFilter("reviewed", reviewedActive ? null : "true")}
        >
          <BadgeCheck className="mr-1 h-3.5 w-3.5" /> Reviewed
        </Button>
      </div>

      {/* Row 3: applied-filter chips */}
      {hasFilters && chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {chips.map((chip) => (
            <Badge key={chip.key} variant="secondary" className="gap-1 pr-1 font-normal">
              {chip.label}
              <button
                type="button"
                aria-label={`Remove ${chip.label} filter`}
                onClick={chip.onRemove}
                className="ml-0.5 rounded-full p-0.5 text-muted-foreground hover:bg-foreground/10 hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
          <Button variant="ghost" size="xs" onClick={handleClearAll} className="text-xs text-muted-foreground">
            Clear all
          </Button>
        </div>
      )}
    </div>
  );
}
