"use client";

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { RANGES, type RangeSupport } from "@/lib/net-worth-range";

interface DateRangeSelectorProps {
  value: string;
  onChange: (range: string) => void;
  /**
   * Per-range availability. Omit to leave every range selectable — the reports
   * series has no coverage data, so gating there would disable ranges for no
   * stated reason.
   */
  support?: RangeSupport[];
}

export function DateRangeSelector({ value, onChange, support }: DateRangeSelectorProps) {
  const supportByRange = new Map(support?.map((r) => [r.range, r]) ?? []);

  return (
    <ToggleGroup
      value={[value]}
      onValueChange={(values) => {
        const next = values[0];
        if (next) onChange(next);
      }}
      size="sm"
    >
      {RANGES.map((range) => {
        const info = supportByRange.get(range);
        const disabled = info ? !info.supported : false;

        return (
          <ToggleGroupItem
            key={range}
            value={range}
            disabled={disabled}
            // The reason is on the control itself rather than only in a
            // tooltip, so it reaches keyboard and screen-reader users too — a
            // range that goes grey without saying why reads as a bug.
            title={info?.reason ?? undefined}
            aria-description={info?.reason ?? undefined}
            className="text-xs px-2"
          >
            {range}
          </ToggleGroupItem>
        );
      })}
    </ToggleGroup>
  );
}
