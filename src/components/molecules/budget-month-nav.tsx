"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatMonthLong, getCurrentMonth, shiftMonth } from "@/lib/date-utils";

interface BudgetMonthNavProps {
  month?: string;
}

export function BudgetMonthNav({ month }: BudgetMonthNavProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const current = month ?? searchParams.get("month") ?? getCurrentMonth();

  function navigate(newMonth: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("month", newMonth);
    router.push(`/budgets?${params.toString()}`);
  }

  return (
    <div className="flex items-center gap-1">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => navigate(shiftMonth(current, -1))}
        aria-label="Previous month"
        className="h-8 w-8 p-0"
      >
        <ChevronLeft className="size-4" />
      </Button>
      <span className="text-lg font-semibold w-48 text-center">
        {formatMonthLong(current)}
      </span>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => navigate(shiftMonth(current, 1))}
        aria-label="Next month"
        className="h-8 w-8 p-0"
      >
        <ChevronRight className="size-4" />
      </Button>
    </div>
  );
}
