/**
 * Display values for the transactions filter bar.
 *
 * The bar renders the same applied-filter state three ways — as the value on a
 * desktop pill ("Category: Groceries"), as a removable chip, and as the current
 * value on a row of the mobile filter sheet — so the branchy part (which of a
 * range's endpoints are set, whether an id still resolves) lives here rather
 * than three times in the component.
 *
 * Everything here is pure: ids in, strings out. The URL params stay the source
 * of truth, and the component owns what removing a chip does.
 */

import { formatDateShort } from "@/lib/date-utils";
import { DATE_PRESETS, matchDatePreset } from "@/lib/date-presets";
import { UNCATEGORIZED } from "@/lib/labels";
import type { CategoryGroup } from "@/queries/categories";

export const TYPE_LABELS: Record<string, string> = {
  expense: "Expenses",
  credits: "Credits",
  transfer: "Transfers",
};

export type FilterChipKey =
  | "date"
  | "account"
  | "category"
  | "type"
  | "amount"
  | "reviewed";

export interface FilterChip {
  key: FilterChipKey;
  /** The filter's name, or null when the value already names it ("Expenses"). */
  label: string | null;
  value: string;
}

export interface AccountOption {
  id: string;
  name: string;
}

export interface ChipInput {
  from: string | null;
  to: string | null;
  accountId: string | null;
  categoryId: string | null;
  typeId: string | null;
  /** Amount bounds as the user typed them, not cents — the inputs are the source. */
  amountMinDisplay: string;
  amountMaxDisplay: string;
  reviewed: boolean;
  accounts: AccountOption[];
  categories: CategoryGroup[];
}

/** "Last 30 days", "Mar 4 - Apr 9", "From Mar 4", or null when unfiltered. */
export function describeDateFilter(from: string | null, to: string | null): string | null {
  const match = matchDatePreset(from, to);
  if (match === null) return null;
  if (match !== "custom") return DATE_PRESETS.find((p) => p.id === match)?.label ?? null;
  if (from && to) return `${formatDateShort(from)} - ${formatDateShort(to)}`;
  if (from) return `From ${formatDateShort(from)}`;
  if (to) return `Until ${formatDateShort(to)}`;
  return null;
}

/** The account's name, or null when the id names no account we hold. */
export function describeAccountFilter(
  accountId: string | null,
  accounts: AccountOption[],
): string | null {
  if (!accountId) return null;
  return accounts.find((a) => a.id === accountId)?.name ?? null;
}

/** The category's name, or null when the id resolves to nothing. */
export function describeCategoryFilter(
  categoryId: string | null,
  categories: CategoryGroup[],
): string | null {
  if (!categoryId) return null;
  if (categoryId === "uncategorized") return UNCATEGORIZED;
  for (const group of categories) {
    const cat = group.categories.find((c) => c.id === categoryId);
    if (cat) return cat.name;
  }
  return null;
}

/** "Expenses" / "Credits" / "Transfers", or null for an unknown type param. */
export function describeTypeFilter(typeId: string | null): string | null {
  if (!typeId) return null;
  return TYPE_LABELS[typeId] ?? null;
}

/** "$10 - $50", "≥ $10", "≤ $50", or null when neither bound is set. */
export function describeAmountFilter(min: string, max: string): string | null {
  if (min && max) return `$${min} - $${max}`;
  if (min) return `≥ $${min}`;
  if (max) return `≤ $${max}`;
  return null;
}

/**
 * One chip per applied filter, in the order the controls themselves appear.
 *
 * A filter whose value no longer resolves — a stale account id left in the URL
 * after the account was removed — contributes no chip: a chip reading
 * "Account:" and nothing else is worse than showing no chip at all.
 */
export function buildFilterChips(input: ChipInput): FilterChip[] {
  const chips: FilterChip[] = [];

  const date = describeDateFilter(input.from, input.to);
  if (date) chips.push({ key: "date", label: "Date", value: date });

  const account = describeAccountFilter(input.accountId, input.accounts);
  if (account) chips.push({ key: "account", label: "Account", value: account });

  const category = describeCategoryFilter(input.categoryId, input.categories);
  if (category) chips.push({ key: "category", label: "Category", value: category });

  const type = describeTypeFilter(input.typeId);
  if (type) chips.push({ key: "type", label: null, value: type });

  const amount = describeAmountFilter(input.amountMinDisplay, input.amountMaxDisplay);
  if (amount) chips.push({ key: "amount", label: "Amount", value: amount });

  if (input.reviewed) chips.push({ key: "reviewed", label: null, value: "Reviewed" });

  return chips;
}
