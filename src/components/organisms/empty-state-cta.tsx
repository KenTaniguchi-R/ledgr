"use client";

import { Building2, ShieldCheck } from "lucide-react";
import { PlaidLinkFlow } from "./plaid-link-flow";

export function EmptyStateCTA() {
  return (
    <div className="flex flex-col items-center justify-center py-24 px-4 text-center">
      <div className="flex items-center justify-center size-16 rounded-2xl bg-muted mb-6">
        <Building2 className="size-8 text-muted-foreground" />
      </div>
      <h2 className="text-xl font-semibold tracking-tight">
        Connect Your Bank
      </h2>
      <p className="mt-2 text-sm text-muted-foreground max-w-sm">
        Securely link your bank accounts to automatically track balances,
        transactions, and spending. Powered by Plaid.
      </p>
      <div className="mt-6">
        <PlaidLinkFlow label="Connect Bank" />
      </div>
      <div className="mt-4 flex items-center gap-1.5 text-xs text-muted-foreground">
        <ShieldCheck className="size-3.5" />
        Bank-grade encryption. Your credentials are never stored.
      </div>
    </div>
  );
}
