"use client";

import { useState, useTransition } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { displayToCents } from "@/lib/money";
import { createManualAccount } from "@/actions/plaid";

const ACCOUNT_TYPES = [
  { value: "checking", label: "Checking" },
  { value: "savings", label: "Savings" },
  { value: "credit", label: "Credit Card" },
  { value: "loan", label: "Loan" },
  { value: "investment", label: "Investment" },
  { value: "other", label: "Other" },
] as const;

interface AddManualAccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddManualAccountDialog({
  open,
  onOpenChange,
}: AddManualAccountDialogProps) {
  const [name, setName] = useState("");
  const [type, setType] = useState<string>("checking");
  const [balanceStr, setBalanceStr] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const balanceNum = parseFloat(balanceStr);
    if (isNaN(balanceNum)) {
      setError("Please enter a valid balance");
      return;
    }

    startTransition(async () => {
      const result = await createManualAccount({
        name,
        type: type as "checking",
        balance: displayToCents(balanceNum),
      });

      if ("error" in result && result.error) {
        setError(result.error);
        return;
      }

      setName("");
      setType("checking");
      setBalanceStr("");
      onOpenChange(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Manual Account</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="manual-name">Account Name</Label>
            <Input
              id="manual-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Cash, Venmo"
              required
              maxLength={100}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="manual-type">Type</Label>
            <Select value={type} onValueChange={(v) => { if (v !== null) setType(v); }}>
              <SelectTrigger id="manual-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ACCOUNT_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="manual-balance">Current Balance ($)</Label>
            <Input
              id="manual-balance"
              type="number"
              step="0.01"
              value={balanceStr}
              onChange={(e) => setBalanceStr(e.target.value)}
              placeholder="0.00"
              required
            />
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">{error}</p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Adding..." : "Add Account"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
