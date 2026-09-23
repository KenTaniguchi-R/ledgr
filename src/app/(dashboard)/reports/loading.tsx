import { Skeleton } from "@/components/ui/skeleton";
import { ReportPanelSkeleton } from "@/components/organisms/report-panel-skeleton";

export default function ReportsLoading() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>

      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Skeleton className="h-8 w-[140px]" />
          <Skeleton className="h-8 w-[130px]" />
          <Skeleton className="h-8 w-[130px]" />
        </div>
        <Skeleton className="h-8 w-[130px]" />
      </div>

      <Skeleton className="h-9 w-full max-w-md" />

      <ReportPanelSkeleton />
    </div>
  );
}
