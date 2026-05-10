import { cn } from "@/lib/utils";
import type { PlaidItemStatus } from "@/db/schema";

interface StatusBadgeProps {
  status: PlaidItemStatus;
}

const config = {
  active: { label: "Connected", dotClass: "bg-emerald-500" },
  error: { label: "Error", dotClass: "bg-amber-500" },
  reauth_required: { label: "Reconnect needed", dotClass: "bg-destructive" },
  revoked: { label: "Access revoked", dotClass: "bg-destructive" },
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
