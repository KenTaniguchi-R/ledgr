import { Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EntityAvatar } from "@/components/molecules/entity-avatar";
import { EditableText } from "@/components/molecules/editable-text";
import { formatDateShort } from "@/lib/date-utils";

interface TransactionIdentityHeaderProps {
  name: string;
  originalName: string;
  accountName: string;
  date: string;
  pending: boolean;
  merchantLogoUrl: string | null;
  merchantName: string | null;
  pfcPrimary: string | null;
  isPlaidSynced: boolean;
  onNameSave: (value: string) => Promise<{ success: true } | { error: string }>;
  onDateSave: (value: string) => Promise<{ success: true } | { error: string }>;
}

export function TransactionIdentityHeader({
  name,
  accountName,
  date,
  pending,
  merchantLogoUrl,
  merchantName,
  pfcPrimary,
  isPlaidSynced,
  onNameSave,
  onDateSave,
}: TransactionIdentityHeaderProps) {
  return (
    <div className="flex items-start gap-3">
      <EntityAvatar
        logoUrl={merchantLogoUrl}
        name={merchantName ?? name}
        pfcPrimary={pfcPrimary}
        size="md"
      />
      <div className="min-w-0 flex-1">
        <EditableText
          value={name}
          onSave={onNameSave}
          className="font-semibold"
        />
        <p className="text-xs text-muted-foreground mt-0.5">{accountName}</p>
        <div className="flex items-center gap-2 mt-1">
          {isPlaidSynced ? (
            <span className="text-xs text-muted-foreground" title="Date is managed by your bank">
              {formatDateShort(date)}
            </span>
          ) : (
            <EditableText
              value={date}
              onSave={onDateSave}
              className="text-xs text-muted-foreground"
              inputClassName="w-28"
            />
          )}
          {pending && (
            <Badge variant="outline" className="text-[10px] h-5 gap-1">
              <Clock className="size-3" /> Pending
            </Badge>
          )}
        </div>
      </div>
    </div>
  );
}
