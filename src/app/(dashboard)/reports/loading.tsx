import { Skeleton } from "@/components/ui/skeleton";

export default function ReportsLoading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-32" />
      <div className="flex gap-2">
        <Skeleton className="h-8 w-[200px]" />
        <Skeleton className="h-8 w-[130px]" />
        <Skeleton className="h-8 w-[130px]" />
        <Skeleton className="h-8 w-[120px]" />
        <Skeleton className="h-8 w-[120px]" />
      </div>
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-[300px] w-full" />
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    </div>
  );
}
