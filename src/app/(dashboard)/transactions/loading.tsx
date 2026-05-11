import { Skeleton } from "@/components/ui/skeleton";

export default function TransactionsLoading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-48" />
      <div className="flex gap-2">
        <Skeleton className="h-8 w-[180px]" />
        <Skeleton className="h-8 w-[160px]" />
        <Skeleton className="h-8 w-[160px]" />
        <Skeleton className="h-8 w-[130px]" />
        <Skeleton className="h-8 w-[130px]" />
      </div>
      <Skeleton className="h-8 w-full" />
      {Array.from({ length: 3 }).map((_, gi) => (
        <div key={gi} className="space-y-0">
          <Skeleton className="h-8 w-64" />
          {Array.from({ length: 3 }).map((_, ri) => (
            <div key={ri} className="grid grid-cols-[24px_32px_1fr_auto_100px] items-center h-9 px-2 gap-2">
              <Skeleton className="size-1.5 rounded-full" />
              <Skeleton className="h-3.5 w-3.5" />
              <div className="flex items-center gap-1.5">
                <Skeleton className="size-6 rounded-full" />
                <Skeleton className="h-4 w-32" />
              </div>
              <Skeleton className="h-5 w-20 rounded-full" />
              <Skeleton className="h-4 w-16 ml-auto" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
