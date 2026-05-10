import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/atoms/status-badge";
import { SyncStatusBadge, type SyncStatus } from "@/components/atoms/sync-status-badge";

interface InstitutionHeaderProps {
  institutionName: string;
  status: "active" | "error" | "reauth_required" | null;
  accountCount: number;
  plaidItemId: string | null;
  lastSyncedAt: string | null;
  syncStatus: SyncStatus;
  syncError?: string;
  onSync: () => void;
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
  status,
  accountCount,
  plaidItemId,
  lastSyncedAt,
  syncStatus,
  syncError,
  onSync,
}: InstitutionHeaderProps) {
  return (
    <div className="group flex items-center justify-between px-4 py-2">
      <div className="flex items-center gap-3">
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
        {plaidItemId && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onSync}
            disabled={syncStatus === "syncing"}
            className="opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <RefreshCw className="size-3.5" />
            <span className="sr-only">Sync Now</span>
          </Button>
        )}
      </div>
    </div>
  );
}
