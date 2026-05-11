"use client";

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

const RANGES = ["1M", "3M", "6M", "1Y", "All"] as const;

interface DateRangeSelectorProps {
  value: string;
  onChange: (range: string) => void;
}

export function DateRangeSelector({ value, onChange }: DateRangeSelectorProps) {
  return (
    <ToggleGroup
      value={[value]}
      onValueChange={(values) => {
        const next = values[0];
        if (next) onChange(next);
      }}
      size="sm"
    >
      {RANGES.map((range) => (
        <ToggleGroupItem key={range} value={range} className="text-xs px-2">
          {range}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
