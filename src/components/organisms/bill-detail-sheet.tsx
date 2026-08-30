"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  updateRecurringTransaction,
  deleteRecurringTransaction,
} from "@/actions/recurring";
import type { BillRow } from "@/queries/recurring";
import type { CategoryGroup } from "@/queries/categories";

const FREQUENCIES = ["weekly", "biweekly", "semimonthly", "monthly", "yearly"] as const;
type Frequency = (typeof FREQUENCIES)[number];

const FREQUENCY_LABELS: Record<Frequency, string> = {
  weekly: "Weekly",
  biweekly: "Biweekly",
  semimonthly: "Twice a month",
  monthly: "Monthly",
  yearly: "Yearly",
};

const NO_CATEGORY = "__none__";

interface BillDetailSheetProps {
  /** Non-null: the parent mounts this only for the open bill, keyed by id. */
  bill: BillRow;
  categoryGroups: CategoryGroup[];
  onClose: () => void;
}

/**
 * The parent renders this with `key={bill.id}`, so opening a different bill
 * remounts it and the initialisers below re-seed the form. That replaces
 * syncing props into state from an effect, which React now flags.
 */
export function BillDetailSheet({ bill, categoryGroups, onClose }: BillDetailSheetProps) {
  const categories = categoryGroups.flatMap((g) => g.categories);

  const [name, setName] = useState(bill.name);
  const [categoryId, setCategoryId] = useState<string>(
    () => categories.find((c) => c.name === bill.categoryName)?.id ?? NO_CATEGORY,
  );
  const [amount, setAmount] = useState(() =>
    bill.averageAmount !== null ? (bill.averageAmount / 100).toFixed(2) : "0.00",
  );
  const [frequency, setFrequency] = useState<Frequency>(
    () => (bill.frequency as Frequency) ?? "monthly",
  );
  // getUpcomingBills only returns active bills, so an open one is always active.
  const [isActive, setIsActive] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    setError(null);
    // Money is stored in cents; the field edits dollars.
    const cents = Math.round(parseFloat(amount || "0") * 100);

    startTransition(async () => {
      const result = await updateRecurringTransaction({
        id: bill.id,
        name,
        categoryId: categoryId === NO_CATEGORY ? null : categoryId,
        averageAmount: cents,
        frequency,
        isActive,
      });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      onClose();
    });
  }

  function remove() {
    setError(null);
    startTransition(async () => {
      const result = await deleteRecurringTransaction(bill.id);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      onClose();
    });
  }

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="flex w-full flex-col sm:w-[440px]">
        <SheetHeader>
          <SheetTitle className="text-base">Edit bill</SheetTitle>
          <SheetDescription>
            Corrections apply to this recurring stream, not to past transactions.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-4 overflow-y-auto px-4">
          {error && (
            <div
              role="alert"
              className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive"
            >
              {error}
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="bill-name">Name</Label>
            <Input id="bill-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="bill-category">Category</Label>
            <Select
              value={categoryId}
              onValueChange={(v) => {
                if (v !== null) setCategoryId(v);
              }}
            >
              <SelectTrigger id="bill-category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_CATEGORY}>Uncategorized</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="bill-amount">Amount</Label>
              <Input
                id="bill-amount"
                type="number"
                step="0.01"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bill-frequency">Frequency</Label>
              <Select
                value={frequency}
                onValueChange={(v) => {
                  if (v !== null) setFrequency(v as Frequency);
                }}
              >
                <SelectTrigger id="bill-frequency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FREQUENCIES.map((f) => (
                    <SelectItem key={f} value={f}>
                      {FREQUENCY_LABELS[f]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
            <div>
              <Label htmlFor="bill-active" className="text-sm">
                Counts as a recurring bill
              </Label>
              {/* Muting is how a cancelled subscription -- or a credit-card
                  payment that is really a transfer -- stops inflating the
                  monthly total, without deleting the detection. */}
              <p className="mt-1 text-xs text-muted-foreground">
                Turn off to drop it from the list and the monthly total. The bill is remembered, so
                a future sync will not detect it again as new.
              </p>
            </div>
            <Switch
              id="bill-active"
              checked={isActive}
              onCheckedChange={setIsActive}
              disabled={pending}
            />
          </div>
        </div>

        <div className="flex gap-2 border-t p-4">
          <Button onClick={save} disabled={pending || !name.trim()}>
            Save
          </Button>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button
            variant="ghost"
            className="ml-auto text-destructive hover:text-destructive"
            onClick={remove}
            disabled={pending}
          >
            <Trash2 className="mr-1 h-3.5 w-3.5" />
            Delete
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
