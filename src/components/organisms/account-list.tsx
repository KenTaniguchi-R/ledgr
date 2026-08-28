"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { AccountCard } from "@/components/molecules/account-card";
import { InstitutionHeader } from "@/components/molecules/institution-header";
import { PlaidLinkFlow } from "./plaid-link-flow";
import { SimplefinReconnectFlow } from "./simplefin-reconnect-flow";
import { EditAccountDialog } from "./edit-account-dialog";
import { triggerSync } from "@/actions/sync";
import { disconnectPlaidItem } from "@/actions/plaid";
import { disconnectSimplefinConnection } from "@/actions/simplefin";
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
  const [reAuthingConnectionId, setReAuthingConnectionId] = useState<string | null>(null);
  const [reAuthError, setReAuthError] = useState<string | null>(null);
  const router = useRouter();

  const connectionIds = groups
    .map((g) => g.connectionId)
    .filter((id): id is string => id !== null);

  const handleSync = useCallback(async (connectionId: string) => {
    setSyncStates((prev) => {
      const next = new Map(prev);
      next.set(connectionId, { status: "syncing" });
      return next;
    });

    const result = await triggerSync(connectionId);

    const newStatus: SyncStatus = result.success ? "success" : "error";

    setSyncStates((prev) => {
      const next = new Map(prev);
      next.set(connectionId, {
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
          next.delete(connectionId);
          return next;
        });
      }, 3000);
    }
  }, [router]);

  const handleSyncAll = useCallback(async () => {
    await Promise.allSettled(connectionIds.map((id) => handleSync(id)));
  }, [connectionIds, handleSync]);

  const getSyncState = (connectionId: string | null): SyncState =>
    (connectionId ? syncStates.get(connectionId) : undefined) ?? { status: "idle" };

  const handleReAuthSuccess = useCallback(() => {
    setReAuthingConnectionId(null);
    setReAuthError(null);
    router.refresh();
  }, [router]);

  const handleReAuthError = useCallback((connectionId: string, error: string) => {
    setReAuthingConnectionId(connectionId);
    setReAuthError(error);
  }, []);

  const handleDisconnect = useCallback(async (connectionId: string, provider: string | null) => {
    if (provider === "simplefin") {
      await disconnectSimplefinConnection(connectionId);
    } else {
      await disconnectPlaidItem(connectionId);
    }
    router.refresh();
  }, [router]);

  const isSyncing = connectionIds.some((id) => getSyncState(id).status === "syncing");

  return (
    <>
      {connectionIds.length > 0 && (
        <div className="flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSyncAll}
            disabled={isSyncing || reAuthingConnectionId !== null}
          >
            <RefreshCw className="size-3.5 mr-1" />
            Sync All
          </Button>
        </div>
      )}

      <div className="space-y-6">
        {groups.map((group) => {
          const state = getSyncState(group.connectionId);
          return (
            <Card key={group.connectionId ?? "__manual__"}>
              <InstitutionHeader
                institutionName={group.institutionName}
                logoBase64={group.logoBase64}
                primaryColor={group.primaryColor}
                status={group.status}
                accountCount={group.accounts.length}
                connectionId={group.connectionId}
                lastSyncedAt={group.lastSyncedAt}
                syncStatus={state.status}
                syncError={state.error}
                onSync={() => group.connectionId && handleSync(group.connectionId)}
                onDisconnect={
                  group.connectionId
                    ? () => handleDisconnect(group.connectionId!, group.provider)
                    : undefined
                }
                reconnectButton={
                  group.provider === "plaid" && group.status === "reauth_required" && group.connectionId ? (
                    <PlaidLinkFlow
                      mode="update"
                      variant="reconnect-inline"
                      plaidItemId={group.connectionId}
                      onReAuthSuccess={handleReAuthSuccess}
                      onError={(err) => handleReAuthError(group.connectionId!, err)}
                    />
                  ) : group.provider === "simplefin" && group.status === "revoked" && group.connectionId ? (
                    <SimplefinReconnectFlow
                      connectionId={group.connectionId}
                      institutionName={group.institutionName}
                      onReconnectSuccess={handleReAuthSuccess}
                      onError={(err) => handleReAuthError(group.connectionId!, err)}
                    />
                  ) : undefined
                }
                reAuthError={group.connectionId === reAuthingConnectionId ? reAuthError : null}
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
