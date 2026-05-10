"use client";

import { type ReactNode, useState } from "react";
import { RefreshCw, MoreHorizontal, Unplug, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { EntityAvatar } from "@/components/atoms/entity-avatar";
import { StatusBadge } from "@/components/atoms/status-badge";
import { SyncStatusBadge, type SyncStatus } from "@/components/atoms/sync-status-badge";
import type { PlaidItemStatus } from "@/db/schema";

interface InstitutionHeaderProps {
  institutionName: string;
  logo?: { base64: string; primaryColor: string | null } | null;
  status: PlaidItemStatus | null;
  accountCount: number;
  plaidItemId: string | null;
  lastSyncedAt: string | null;
  syncStatus: SyncStatus;
  syncError?: string;
  onSync: () => void;
  onDisconnect?: () => void;
  reconnectButton?: ReactNode;
  reAuthError?: string | null;
}

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function InstitutionHeader({
  institutionName,
  logo,
  status,
  accountCount,
  plaidItemId,
  lastSyncedAt,
  syncStatus,
  syncError,
  onSync,
  onDisconnect,
  reconnectButton,
  reAuthError,
}: InstitutionHeaderProps) {
  const [disconnectOpen, setDisconnectOpen] = useState(false);

  return (
    <div>
      <div className="group flex items-center justify-between px-4 py-2">
        <div className="flex items-center gap-3">
          <EntityAvatar
            logoBase64={logo?.base64}
            name={institutionName}
            primaryColor={logo?.primaryColor}
            size="md"
          />
          <div>
            <h3 className="text-sm font-semibold">{institutionName}</h3>
            <div className="flex items-center gap-2">
              <p className="text-xs text-muted-foreground">
                {accountCount} {accountCount === 1 ? "account" : "accounts"}
              </p>
              {plaidItemId && lastSyncedAt && syncStatus === "idle" && (
                <>
                  <span className="text-xs text-muted-foreground">·</span>
                  <p className="text-xs text-muted-foreground">
                    Synced {formatRelativeTime(lastSyncedAt)}
                  </p>
                </>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <SyncStatusBadge status={syncStatus} errorMessage={syncError} />
          {status && syncStatus === "idle" && <StatusBadge status={status} />}
          {reconnectButton ?? (plaidItemId ? (
            <DropdownMenu>
              <DropdownMenuTrigger
                className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
                render={
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8"
                  />
                }
              >
                <MoreHorizontal className="size-4" />
                <span className="sr-only">Institution actions</span>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" sideOffset={4}>
                <DropdownMenuItem
                  disabled={syncStatus === "syncing"}
                  onClick={onSync}
                >
                  <RefreshCw className="size-3.5 mr-2" />
                  Sync now
                </DropdownMenuItem>
                {onDisconnect && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={() => setDisconnectOpen(true)}
                    >
                      <Unplug className="size-3.5 mr-2" />
                      Disconnect
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null)}
        </div>
      </div>
      {reAuthError && (
        <p role="alert" className="px-4 pb-2 text-xs text-destructive">
          {reAuthError}
        </p>
      )}

      <AlertDialog open={disconnectOpen} onOpenChange={setDisconnectOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia className="bg-destructive/10">
              <AlertTriangle className="size-5 text-destructive" />
            </AlertDialogMedia>
            <AlertDialogTitle>Disconnect {institutionName}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove {accountCount} {accountCount === 1 ? "account" : "accounts"} and
              revoke Ledgr&apos;s access to this institution. Transaction history will be
              preserved but no longer update. You can reconnect anytime.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                setDisconnectOpen(false);
                onDisconnect?.();
              }}
            >
              Disconnect
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
