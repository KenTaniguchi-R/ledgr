import { Skeleton } from "@/components/ui/skeleton";

/**
 * Stand-in for a report panel while its data or its code-split chunk is
 * loading — a rough match for the real shape (KPI row, chart, table) rather
 * than a spinner or bare "Loading…" text, so the page doesn't visibly
 * collapse and reflow when the real content lands.
 *
 * Shared by the page's per-panel Suspense fallback, the tab strip's
 * optimistic switch, and the route-level `reports/loading.tsx`, so all three
 * describe the same layout.
 */
export function ReportPanelSkeleton() {
  return (
    <div className="space-y-4">
      {/* Same shape as ReportStatStrip: one card, hairline-separated cells. */}
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-border ring-1 ring-foreground/10 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className={`space-y-2 bg-card px-5 py-4 ${i === 0 ? "col-span-2 lg:col-span-1" : ""}`}>
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-7 w-32" />
          </div>
        ))}
      </div>
      <Skeleton className="h-[300px] w-full" />
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    </div>
  );
}
