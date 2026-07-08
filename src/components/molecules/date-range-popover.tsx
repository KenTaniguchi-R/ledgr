"use client";

import { useState } from "react";
import { CalendarDays, Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export interface DatePresetOption {
  id: string;
  label: string;
}

interface DateRangePopoverProps {
  /** Preset rows to show, in order (e.g. All time, Last 7 days, ...). */
  presets: DatePresetOption[];
  /** Preset row to check, or null when a custom range (or nothing) is active. */
  selectedId: string | null;
  /** Whether the trigger renders in its active (filled) state. */
  active: boolean;
  /** Text shown after "Date:" on the trigger; null renders a bare "Date". */
  triggerValue: string | null;
  /** Current custom-range input values ("" when unset). */
  from: string;
  to: string;
  onSelectPreset: (id: string) => void;
  onFromChange: (value: string | null) => void;
  onToChange: (value: string | null) => void;
  align?: "start" | "center" | "end";
}

/**
 * A single Date trigger that opens a popover of preset ranges plus a custom
 * From/To range. Purely presentational: the parent owns all param semantics
 * (which is why Transactions and Reports can share it despite different URL
 * conventions).
 */
export function DateRangePopover({
  presets,
  selectedId,
  active,
  triggerValue,
  from,
  to,
  onSelectPreset,
  onFromChange,
  onToChange,
  align = "start",
}: DateRangePopoverProps) {
  const [open, setOpen] = useState(false);

  function handlePreset(id: string) {
    onSelectPreset(id);
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={<Button variant={active ? "default" : "outline"} size="sm" className="h-8 text-xs" />}
      >
        <CalendarDays className="mr-1 h-3.5 w-3.5" />
        {triggerValue ? (
          <>
            <span className={cn("font-normal", active ? "opacity-70" : "text-muted-foreground")}>Date:</span>
            <span className="ml-1 max-w-[160px] truncate">{triggerValue}</span>
          </>
        ) : (
          "Date"
        )}
        <ChevronDown className="ml-1 h-3 w-3 opacity-60" />
      </PopoverTrigger>
      <PopoverContent className="w-[240px] p-2" align={align}>
        <div className="flex flex-col">
          {presets.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => handlePreset(preset.id)}
              className="flex h-8 items-center justify-between rounded-md px-2 text-sm hover:bg-muted"
            >
              {preset.label}
              {selectedId === preset.id && <Check className="h-3.5 w-3.5" />}
            </button>
          ))}
        </div>
        <Separator className="my-2" />
        <p className="px-2 pb-1 text-xs text-muted-foreground">Custom range</p>
        <div className="flex items-center gap-1.5 px-1">
          <Input
            type="date"
            aria-label="From date"
            value={from}
            onChange={(e) => onFromChange(e.target.value || null)}
            className="h-8 flex-1 text-xs"
          />
          <span className="text-xs text-muted-foreground">to</span>
          <Input
            type="date"
            aria-label="To date"
            value={to}
            onChange={(e) => onToChange(e.target.value || null)}
            className="h-8 flex-1 text-xs"
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}
