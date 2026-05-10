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
import { Switch } from "@/components/ui/switch";
import { updateAccount } from "@/actions/plaid";
import type { AccountRow } from "@/queries/accounts";

interface EditAccountDialogProps {
  account: AccountRow | null;
  onClose: () => void;
}

export function EditAccountDialog({ account, onClose }: EditAccountDialogProps) {
  const [name, setName] = useState(account?.name ?? "");
  const [isHidden, setIsHidden] = useState(account?.isHidden ?? false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleOpenChange(open: boolean) {
    if (!open) onClose();
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    startTransition(async () => {
      const result = await updateAccount(account!.id, {
        name: name !== account!.name ? name : undefined,
        isHidden: isHidden !== account!.isHidden ? isHidden : undefined,
      });

      if ("error" in result && result.error) {
        setError(result.error);
        return;
      }

      onClose();
    });
  }

  return (
    <Dialog open={account !== null} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Account</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="edit-name">Name</Label>
            <Input
              id="edit-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={100}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="edit-hidden">Hide from dashboard</Label>
            <Switch
              id="edit-hidden"
              checked={isHidden}
              onCheckedChange={setIsHidden}
            />
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">{error}</p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
