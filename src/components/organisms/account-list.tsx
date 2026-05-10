"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { AccountCard } from "@/components/molecules/account-card";
import { InstitutionHeader } from "@/components/molecules/institution-header";
import { EditAccountDialog } from "./edit-account-dialog";
import { triggerSync } from "@/actions/sync";
import type { InstitutionGroup, AccountRow } from "@/queries/accounts";
import type { SyncStatus } from "@/components/atoms/sync-status-badge";

interface SyncState {
  status: SyncStatus;
  error?: string;
}

interface AccountListProps {
  groups: InstitutionGroup[];
}

export function AccountList({ groups }: AccountListProps) {
  const [editingAccount, setEditingAccount] = useState<AccountRow | null>(null);
  const [syncStates, setSyncStates] = useState<Map<string, SyncState>>(new Map());
  const router = useRouter();

  const plaidItemIds = groups
    .map((g) => g.plaidItemId)
    .filter((id): id is string => id !== null);

  const handleSync = useCallback(async (itemId: string) => {
    setSyncStates((prev) => {
      const next = new Map(prev);
      next.set(itemId, { status: "syncing" });
      return next;
    });

    const result = await triggerSync(itemId);

    const newStatus: SyncStatus = result.success ? "success" : "error";

    setSyncStates((prev) => {
      const next = new Map(prev);
      next.set(itemId, {
        status: newStatus,
        error: result.success ? undefined : result.error,
      });
      return next;
    });

    router.refresh();

    if (newStatus === "success") {
      setTimeout(() => {
        setSyncStates((prev) => {
          const next = new Map(prev);
          next.delete(itemId);
          return next;
        });
      }, 3000);
    }
  }, [router]);

  const handleSyncAll = useCallback(async () => {
    await Promise.allSettled(plaidItemIds.map((id) => handleSync(id)));
  }, [plaidItemIds, handleSync]);

  const getSyncState = (itemId: string | null): SyncState =>
    (itemId ? syncStates.get(itemId) : undefined) ?? { status: "idle" };

  return (
    <>
      {plaidItemIds.length > 0 && (
        <div className="flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSyncAll}
            disabled={plaidItemIds.some((id) => getSyncState(id).status === "syncing")}
          >
            <RefreshCw className="size-3.5 mr-1" />
            Sync All
          </Button>
        </div>
      )}

      <div className="space-y-6">
        {groups.map((group) => {
          const state = getSyncState(group.plaidItemId);
          return (
            <Card key={group.plaidItemId ?? "__manual__"}>
              <InstitutionHeader
                institutionName={group.institutionName}
                status={group.status}
                accountCount={group.accounts.length}
                plaidItemId={group.plaidItemId}
                lastSyncedAt={group.lastSyncedAt}
                syncStatus={state.status}
                syncError={state.error}
                onSync={() => group.plaidItemId && handleSync(group.plaidItemId)}
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
          );
        })}
      </div>

      <EditAccountDialog
        account={editingAccount}
        onClose={() => setEditingAccount(null)}
      />
    </>
  );
}
