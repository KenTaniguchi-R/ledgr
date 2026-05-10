import { StatusBadge } from "@/components/atoms/status-badge";

interface InstitutionHeaderProps {
  institutionName: string;
  status: "active" | "error" | "reauth_required" | null;
  accountCount: number;
}

export function InstitutionHeader({
  institutionName,
  status,
  accountCount,
}: InstitutionHeaderProps) {
  return (
    <div className="flex items-center justify-between px-4 py-2">
      <div>
        <h3 className="text-sm font-semibold">{institutionName}</h3>
        <p className="text-xs text-muted-foreground">
          {accountCount} {accountCount === 1 ? "account" : "accounts"}
        </p>
      </div>
      {status && <StatusBadge status={status} />}
    </div>
  );
}
