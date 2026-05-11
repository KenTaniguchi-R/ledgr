"use client";

import { useCallback, useMemo } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { todayDateString } from "@/lib/date-utils";

const FILTER_KEYS = [
  "q", "account", "category", "from", "to",
  "reviewed", "type", "amountMin", "amountMax",
];

export function useSearchParamFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const updateFilter = useCallback(
    (key: string, value: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value === null || value === "" || value === "all") {
        params.delete(key);
      } else {
        params.set(key, value);
      }
      router.push(`${pathname}?${params.toString()}`);
    },
    [router, pathname, searchParams],
  );

  const updateFilters = useCallback(
    (entries: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(entries)) {
        if (value === null || value === "" || value === "all") {
          params.delete(key);
        } else {
          params.set(key, value);
        }
      }
      router.push(`${pathname}?${params.toString()}`);
    },
    [router, pathname, searchParams],
  );

  const clearFilters = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    FILTER_KEYS.forEach((k) => params.delete(k));
    const remaining = params.toString();
    router.push(remaining ? `${pathname}?${remaining}` : pathname);
  }, [router, pathname, searchParams]);

  const hasFilters = FILTER_KEYS.some((k) => searchParams.has(k));

  const dateRange = useMemo(() => ({
    from: searchParams.get("from") ?? "2000-01-01",
    to: searchParams.get("to") ?? todayDateString(),
  }), [searchParams]);

  return { updateFilter, updateFilters, clearFilters, hasFilters, searchParams, dateRange };
}
