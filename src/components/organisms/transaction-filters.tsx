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
  CalendarDays,
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
import {
  MobileFilterSheet,
  type FilterSheetSection,
} from "@/components/molecules/mobile-filter-sheet";
import { DATE_PRESETS, dateRangeForPreset, matchDatePreset, type DatePresetId } from "@/lib/date-presets";
import {
  TYPE_LABELS,
  buildFilterChips,
  describeAccountFilter,
  describeAmountFilter,
  describeCategoryFilter,
  describeDateFilter,
  describeTypeFilter,
  type AccountOption,
  type FilterChip,
  type FilterChipKey,
} from "@/lib/transaction-filter-chips";
import { UNCATEGORIZED } from "@/lib/labels";
import type { CategoryGroup } from "@/queries/categories";

interface TransactionFiltersProps {
  accounts: AccountOption[];
  categories: CategoryGroup[];
  /** Rows matching the current filters — shown on the mobile sheet's apply button. */
  resultCount: number;
}

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

export function TransactionFilters({ accounts, categories, resultCount }: TransactionFiltersProps) {
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
  const dateValue = describeDateFilter(fromParam, toParam);

  const accountId = searchParams.get("account");
  const accountValue = describeAccountFilter(accountId, accounts);

  const categoryId = searchParams.get("category");
  const categoryValue = describeCategoryFilter(categoryId, categories);

  const typeId = searchParams.get("type");
  const typeValue = describeTypeFilter(typeId);

  const amountActive = !!(searchParams.get("amountMin") || searchParams.get("amountMax"));
  const amountValue = describeAmountFilter(amount.minDisplay, amount.maxDisplay);

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
  const chips = buildFilterChips({
    from: fromParam,
    to: toParam,
    accountId,
    categoryId,
    typeId,
    amountMinDisplay: amount.minDisplay,
    amountMaxDisplay: amount.maxDisplay,
    reviewed: reviewedActive,
    accounts,
    categories,
  });

  const removeChip: Record<FilterChipKey, () => void> = {
    date: () => updateFilters({ from: null, to: null }),
    account: () => updateFilter("account", null),
    category: () => updateFilter("category", null),
    type: () => updateFilter("type", null),
    amount: () => {
      amount.reset();
      updateFilters({ amountMin: null, amountMax: null });
    },
    reviewed: () => updateFilter("reviewed", null),
  };

  function renderChip(chip: FilterChip) {
    const text = chip.label ? `${chip.label}: ${chip.value}` : chip.value;
    return (
      <Badge key={chip.key} variant="secondary" className="shrink-0 gap-1 pr-1 font-normal">
        {chip.label && <span className="text-muted-foreground">{chip.label}:</span>}
        {chip.value}
        <button
          type="button"
          aria-label={`Remove ${text} filter`}
          onClick={removeChip[chip.key]}
          className="ml-0.5 rounded-full p-0.5 text-muted-foreground hover:bg-foreground/10 hover:text-foreground"
        >
          <X className="h-3 w-3" />
        </button>
      </Badge>
    );
  }

  // ---- the same filters, as rows for the mobile sheet ----
  const amountInputs = (
    <div className="flex items-center gap-1.5 px-2 pt-2">
      <Input
        type="text"
        inputMode="decimal"
        placeholder="Min $"
        aria-label="Minimum amount"
        value={amount.minDisplay}
        onChange={(e) => amount.handleMinChange(e.target.value)}
        onBlur={() => amount.handleBlur("amountMin")}
        className="h-9 text-sm"
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
        className="h-9 text-sm"
      />
    </div>
  );

  const sheetSections: FilterSheetSection[] = [
    {
      key: "date",
      label: "Date",
      icon: CalendarDays,
      value: dateValue,
      placeholder: "All time",
      groups: [{ options: DATE_OPTIONS.map((o) => ({ id: o.id, label: o.label })) }],
      selectedId: dateSelectedId ?? "",
      onSelect: handleDatePreset,
      extra: (
        <div className="flex items-center gap-1.5 px-2 pt-2">
          <Input
            type="date"
            aria-label="From date"
            value={fromParam ?? ""}
            onChange={(e) => updateFilter("from", e.target.value || null)}
            className="h-9 flex-1 text-sm"
          />
          <span className="text-xs text-muted-foreground">to</span>
          <Input
            type="date"
            aria-label="To date"
            value={toParam ?? ""}
            onChange={(e) => updateFilter("to", e.target.value || null)}
            className="h-9 flex-1 text-sm"
          />
        </div>
      ),
    },
    {
      key: "account",
      label: "Account",
      icon: Landmark,
      value: accountValue,
      placeholder: "All accounts",
      groups: [
        {
          options: [
            { id: "", label: "All accounts" },
            ...accounts.map((a) => ({ id: a.id, label: a.name })),
          ],
        },
      ],
      selectedId: accountId ?? "",
      onSelect: (id) => updateFilter("account", id || null),
    },
    {
      key: "category",
      label: "Category",
      icon: Tags,
      value: categoryValue,
      placeholder: "All categories",
      groups: [
        {
          options: [
            { id: "", label: "All categories" },
            { id: "uncategorized", label: UNCATEGORIZED, muted: true },
          ],
        },
        ...categories.map((group) => ({
          heading: group.name,
          options: group.categories.map((cat) => ({ id: cat.id, label: cat.name })),
        })),
      ],
      selectedId: categoryId ?? "",
      onSelect: (id) => updateFilter("category", id || null),
    },
    {
      key: "type",
      label: "Type",
      icon: ArrowLeftRight,
      value: typeValue,
      placeholder: "All types",
      groups: [
        {
          options: [
            { id: "", label: "All types" },
            ...Object.entries(TYPE_LABELS).map(([id, label]) => ({ id, label })),
          ],
        },
      ],
      selectedId: typeId ?? "",
      onSelect: (id) => updateFilter("type", id || null),
    },
    {
      key: "amount",
      label: "Amount",
      icon: DollarSign,
      value: amountValue,
      placeholder: "Any",
      extra: amountInputs,
    },
  ];

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

      {/*
        Row 2, below sm: one Filters button and the applied chips share a single
        scrolling row. Six wrapping pills plus a chips row cost up to three rows
        of a 390px screen before the ledger starts; this costs one, applied or
        not. The negative margin lets chips scroll to the screen edge rather
        than stopping short at the layout's px-4.
      */}
      <div className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none] sm:hidden [&::-webkit-scrollbar]:hidden">
        <MobileFilterSheet
          sections={sheetSections}
          activeCount={chips.length}
          reviewed={reviewedActive}
          onReviewedChange={(next) => updateFilter("reviewed", next ? "true" : null)}
          onClearAll={handleClearAll}
          resultCount={resultCount}
        />
        {chips.map(renderChip)}
      </div>

      {/* Row 2, sm and up: the filter pills, unchanged */}
      <div className="hidden flex-wrap items-center gap-2 sm:flex">
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

      {/* Row 3, sm and up: applied-filter chips. Below sm they ride in row 2. */}
      {hasFilters && chips.length > 0 && (
        <div className="hidden flex-wrap items-center gap-1.5 sm:flex">
          {chips.map(renderChip)}
          <Button variant="ghost" size="xs" onClick={handleClearAll} className="text-xs text-muted-foreground">
            Clear all
          </Button>
        </div>
      )}
    </div>
  );
}
