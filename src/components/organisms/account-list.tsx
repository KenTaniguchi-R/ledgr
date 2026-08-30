"use client";

import { useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { BalanceDisplay } from "@/components/atoms/balance-display";
import { formatRelativeTime } from "@/lib/relative-time";
import { groupAccountsByType } from "@/lib/group-accounts-by-type";
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

type GroupBy = "type" | "institution";

interface SyncState {
  status: SyncStatus;
  error?: string;
}

interface AccountListProps {
  groups: InstitutionGroup[];
}

export function AccountList({ groups }: AccountListProps) {
  const [groupBy, setGroupBy] = useState<GroupBy>("type");
  const [editingAccount, setEditingAccount] = useState<AccountRow | null>(null);
  const [syncStates, setSyncStates] = useState<Map<string, SyncState>>(new Map());
  const [reAuthingConnectionId, setReAuthingConnectionId] = useState<string | null>(null);
  const [reAuthError, setReAuthError] = useState<string | null>(null);
  const router = useRouter();

  const connectionIds = groups
    .map((g) => g.connectionId)
    .filter((id): id is string => id !== null);

  // Flattened once, carrying the institution down so a type-grouped row can
  // still say which bank an account sits at.
  const typeGroups = useMemo(
    () =>
      groupAccountsByType(
        groups.flatMap((g) =>
          g.accounts.map((a) => ({ ...a, institutionName: g.institutionName })),
        ),
      ),
    [groups],
  );

  // The toolbar reports one figure for the whole page, so it takes the most
  // recent sync rather than an arbitrary connection's.
  const freshestSync = useMemo(() => {
    const times = groups
      .map((g) => g.lastSyncedAt)
      .filter((d): d is Date => d != null)
      .map((d) => new Date(d).getTime());
    return times.length > 0 ? new Date(Math.max(...times)) : null;
  }, [groups]);

  const handleGroupByChange = useCallback((value: string[]) => {
    // Base UI hands back an empty array when the active item is clicked again;
    // ignoring it keeps one grouping always selected.
    const next = value[0];
    if (next === "type" || next === "institution") setGroupBy(next);
  }, []);

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
      {/* One toolbar row: the grouping choice and the sync action, anchored to
          each other instead of floating in the gap above the first card. */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ToggleGroup
          value={[groupBy]}
          onValueChange={handleGroupByChange}
          variant="outline"
          spacing={1}
          size="sm"
          aria-label="Group accounts by"
        >
          <ToggleGroupItem
            value="type"
            className="aria-pressed:bg-primary aria-pressed:text-primary-foreground aria-pressed:hover:bg-primary"
          >
            By type
          </ToggleGroupItem>
          <ToggleGroupItem
            value="institution"
            className="aria-pressed:bg-primary aria-pressed:text-primary-foreground aria-pressed:hover:bg-primary"
          >
            By institution
          </ToggleGroupItem>
        </ToggleGroup>

        {connectionIds.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSyncAll}
            disabled={isSyncing || reAuthingConnectionId !== null}
          >
            <RefreshCw className="size-3.5 mr-1" />
            Sync all
            {freshestSync && (
              <span className="ml-1 font-normal text-muted-foreground">
                · {formatRelativeTime(freshestSync)}
              </span>
            )}
          </Button>
        )}
      </div>

      {groupBy === "type" && (
        <div className="space-y-4">
          {typeGroups.map((group) => (
            <Card key={group.key} className="gap-0 py-0 overflow-hidden">
              <div className="flex items-center justify-between bg-muted px-4 py-2.5">
                <h3 className="text-sm font-semibold">{group.label}</h3>
                <BalanceDisplay amount={group.subtotal} size="sm" className="font-semibold" />
              </div>
              <Separator />
              <div>
                {group.accounts.map((account) => (
                  <AccountCard
                    key={account.id}
                    account={account}
                    institutionName={account.institutionName}
                    onEdit={setEditingAccount}
                  />
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}

      {groupBy === "institution" && (
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
      )}

      <EditAccountDialog
        account={editingAccount}
        onClose={() => setEditingAccount(null)}
      />
    </>
  );
}
