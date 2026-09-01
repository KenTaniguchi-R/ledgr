"use client";

import { useState, type ReactNode } from "react";
import { Check, ChevronDown, SlidersHorizontal } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

export interface FilterSheetOption {
  id: string;
  label: string;
  /** Renders the label muted and italic — used for "Uncategorized". */
  muted?: boolean;
}

export interface FilterSheetGroup {
  heading?: string;
  options: FilterSheetOption[];
}

export interface FilterSheetSection {
  key: string;
  label: string;
  icon: LucideIcon;
  /** The applied value, or null when this filter is unset. */
  value: string | null;
  /** Shown in place of the value when the filter is unset ("All accounts"). */
  placeholder: string;
  groups?: FilterSheetGroup[];
  /** Id of the selected option; "" when the filter is unset. */
  selectedId?: string;
  onSelect?: (id: string) => void;
  /** Rendered under the options — a custom date range, the amount inputs. */
  extra?: ReactNode;
}

interface MobileFilterSheetProps {
  sections: FilterSheetSection[];
  activeCount: number;
  reviewed: boolean;
  onReviewedChange: (next: boolean) => void;
  onClearAll: () => void;
  /** Row count under the filters as they currently stand. */
  resultCount: number;
}

/**
 * The filter bar's mobile form: a single Filters button opening a bottom sheet.
 *
 * Rows expand inline rather than opening the popovers the desktop pills use.
 * That is partly a mobile-ergonomics call — a full-width list beats a 220px
 * popover on a 390px screen — and partly to keep a popover from being nested
 * inside this dialog, where two competing focus traps is a fight worth not
 * having.
 */
export function MobileFilterSheet({
  sections,
  activeCount,
  reviewed,
  onReviewedChange,
  onClearAll,
  resultCount,
}: MobileFilterSheetProps) {
  const [open, setOpen] = useState(false);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  // Collapse the open row when the sheet closes, so reopening starts at the
  // list of filters rather than wherever the last visit left off.
  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) setExpandedKey(null);
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetTrigger
        render={
          <Button
            variant={activeCount > 0 ? "default" : "outline"}
            size="sm"
            className="h-8 shrink-0 text-xs"
          />
        }
      >
        <SlidersHorizontal className="mr-1 h-3.5 w-3.5" />
        Filters
        {activeCount > 0 && (
          <span className="ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary-foreground px-1 text-[10px] font-medium tabular-nums text-primary">
            {activeCount}
          </span>
        )}
      </SheetTrigger>

      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="max-h-[85svh] gap-0 rounded-t-xl p-0"
      >
        <SheetHeader className="px-4 pb-3">
          <SheetTitle className="text-sm">Filters</SheetTitle>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {sections.map((section) => {
            const Icon = section.icon;
            const expanded = expandedKey === section.key;
            return (
              <div key={section.key} className="border-t">
                <button
                  type="button"
                  aria-expanded={expanded}
                  aria-controls={`filter-panel-${section.key}`}
                  onClick={() => setExpandedKey(expanded ? null : section.key)}
                  className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm"
                >
                  <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                  {section.label}
                  <span
                    className={cn(
                      "ml-auto min-w-0 truncate text-xs",
                      section.value ? "text-foreground" : "text-muted-foreground",
                    )}
                  >
                    {section.value ?? section.placeholder}
                  </span>
                  <ChevronDown
                    className={cn(
                      "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform",
                      expanded && "rotate-180",
                    )}
                  />
                </button>

                {expanded && (
                  <div id={`filter-panel-${section.key}`} className="px-2 pb-3">
                    {section.groups?.map((group, i) => (
                      <div key={group.heading ?? i} role="radiogroup" aria-label={section.label}>
                        {group.heading && (
                          <p className="px-2 pt-2 pb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                            {group.heading}
                          </p>
                        )}
                        {group.options.map((option) => {
                          const checked = section.selectedId === option.id;
                          return (
                            <button
                              key={option.id}
                              type="button"
                              role="radio"
                              aria-checked={checked}
                              onClick={() => section.onSelect?.(option.id)}
                              className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-muted"
                            >
                              <span className={cn("min-w-0 truncate", option.muted && "italic text-muted-foreground")}>
                                {option.label}
                              </span>
                              {checked && <Check className="ml-auto h-3.5 w-3.5 shrink-0" />}
                            </button>
                          );
                        })}
                      </div>
                    ))}
                    {section.extra}
                  </div>
                )}
              </div>
            );
          })}

          {/* Reviewed is a toggle, not a list, so it gets a row of its own. */}
          <div className="flex items-center gap-2 border-t px-4 py-3 text-sm">
            <label htmlFor="filter-reviewed" className="flex-1">
              Reviewed only
            </label>
            <Switch
              id="filter-reviewed"
              checked={reviewed}
              onCheckedChange={onReviewedChange}
            />
          </div>
        </div>

        <div className="flex items-center gap-2 border-t p-3">
          <Button variant="outline" size="sm" className="h-9" onClick={onClearAll}>
            Clear all
          </Button>
          <SheetClose render={<Button size="sm" className="ml-auto h-9" />}>
            Show {resultCount} transaction{resultCount !== 1 ? "s" : ""}
          </SheetClose>
        </div>
      </SheetContent>
    </Sheet>
  );
}
