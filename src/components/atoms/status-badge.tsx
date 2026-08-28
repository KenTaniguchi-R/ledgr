import { cn } from "@/lib/utils";
import type { ConnectionStatus } from "@/db/schema/bank-connections";

interface StatusBadgeProps {
  status: ConnectionStatus;
}

const config = {
  active: { label: "Connected", dotClass: "bg-positive" },
  error: { label: "Error", dotClass: "bg-amber-500" },
  reauth_required: { label: "Reconnect needed", dotClass: "bg-destructive" },
  revoked: { label: "Access revoked", dotClass: "bg-destructive" },
  pending_classification: { label: "Setting up", dotClass: "bg-amber-500" },
} as const;

export function StatusBadge({ status }: StatusBadgeProps) {
  const { label, dotClass } = config[status];
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className={cn("size-1.5 rounded-full", dotClass)} aria-hidden />
      {label}
    </span>
  );
}
