"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import type { ColumnMapping } from "@/lib/import/mapper";

interface Props {
  headers: string[];
  mapping: Partial<ColumnMapping>;
  onChange: (mapping: Partial<ColumnMapping>) => void;
}

const FIELDS = [
  { key: "date", label: "Date", required: true },
  { key: "amount", label: "Amount", required: false },
  { key: "description", label: "Description", required: true },
  { key: "credit", label: "Credit", required: false },
  { key: "debit", label: "Debit", required: false },
  { key: "category", label: "Category", required: false },
] as const;

export function ColumnMapper({ headers, mapping, onChange }: Props) {
  function handleChange(field: string, value: string) {
    const updated = { ...mapping, [field]: value === "__skip__" ? undefined : value };
    onChange(updated);
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Map your file columns to transaction fields.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {FIELDS.map(({ key, label, required }) => (
          <div key={key} className="space-y-1">
            <Label className="text-xs">
              {label} {required && <span className="text-destructive">*</span>}
            </Label>
            <Select
              value={(mapping as Record<string, string | undefined>)[key] ?? "__skip__"}
              onValueChange={(v) => { if (v !== null) handleChange(key, v); }}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__skip__">(skip)</SelectItem>
                {headers.map((h) => (
                  <SelectItem key={h} value={h}>{h}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ))}
      </div>
    </div>
  );
}
