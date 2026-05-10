"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

function formatMonth(month: string): string {
  const [year, m] = month.split("-").map(Number);
  const date = new Date(year, m - 1);
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function shiftMonth(month: string, delta: number): string {
  const [year, m] = month.split("-").map(Number);
  const d = new Date(year, m - 1 + delta);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

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
        {formatMonth(current)}
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
