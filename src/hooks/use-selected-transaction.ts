"use client";

import { useCallback, useEffect, useRef } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";

export function useSelectedTransaction() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const selectedId = searchParams.get("txn");

  // `select` goes to every row in the ledger. Reading the params through a ref
  // keeps it stable across the URL changes it causes itself — otherwise every
  // selection hands every memoised row a new callback and re-renders them all.
  const searchParamsRef = useRef(searchParams);
  useEffect(() => {
    searchParamsRef.current = searchParams;
  });

  const navigate = useCallback(
    (update: (params: URLSearchParams) => void) => {
      const params = new URLSearchParams(searchParamsRef.current.toString());
      update(params);
      const qs = params.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname],
  );

  const select = useCallback((id: string) => navigate((p) => p.set("txn", id)), [navigate]);
  const clear = useCallback(() => navigate((p) => p.delete("txn")), [navigate]);

  return { selectedId, select, clear };
}
