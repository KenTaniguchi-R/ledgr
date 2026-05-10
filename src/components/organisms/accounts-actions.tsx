"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Plus, PenLine } from "lucide-react";
import { PlaidLinkFlow } from "./plaid-link-flow";
import { AddManualAccountDialog } from "./add-manual-account-dialog";

export function AccountsActions() {
  const [manualDialogOpen, setManualDialogOpen] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={
          <Button variant="outline" size="sm">
            <Plus className="size-4" />
            Add Account
          </Button>
        } />
        <DropdownMenuContent align="end">
          <PlaidLinkFlow variant="dropdown-item" label="Connect Bank" />
          <DropdownMenuItem onClick={() => setManualDialogOpen(true)}>
            <PenLine className="size-4" />
            Add Manual Account
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AddManualAccountDialog
        open={manualDialogOpen}
        onOpenChange={setManualDialogOpen}
      />
    </>
  );
}
