"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";

interface ReviewEntryButtonProps {
  unreviewedCount: number;
}

export function ReviewEntryButton({ unreviewedCount }: ReviewEntryButtonProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  if (unreviewedCount === 0) return null;

  function handleClick() {
    const params = new URLSearchParams(searchParams.toString());
    params.set("mode", "review");
    params.delete("txn");
    params.delete("reviewed");
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <Button variant="outline" size="sm" onClick={handleClick}>
      Review ({unreviewedCount})
    </Button>
  );
}
