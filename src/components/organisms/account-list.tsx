"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { AccountCard } from "@/components/molecules/account-card";
import { InstitutionHeader } from "@/components/molecules/institution-header";
import { EditAccountDialog } from "./edit-account-dialog";
import type { InstitutionGroup, AccountRow } from "@/queries/accounts";

interface AccountListProps {
  groups: InstitutionGroup[];
}

export function AccountList({ groups }: AccountListProps) {
  const [editingAccount, setEditingAccount] = useState<AccountRow | null>(null);

  return (
    <>
      <div className="space-y-6">
        {groups.map((group, i) => (
          <Card key={group.plaidItemId ?? "__manual__"}>
            <InstitutionHeader
              institutionName={group.institutionName}
              status={group.status}
              accountCount={group.accounts.length}
            />
            <Separator />
            <div>
              {group.accounts.map((account) => (
                <AccountCard
                  key={account.id}
                  account={account}
                  onEdit={setEditingAccount}
                />
              ))}
            </div>
          </Card>
        ))}
      </div>

      <EditAccountDialog
        account={editingAccount}
        onClose={() => setEditingAccount(null)}
      />
    </>
  );
}
