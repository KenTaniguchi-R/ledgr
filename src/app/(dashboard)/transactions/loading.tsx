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
      {Array.from({ length: 10 }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}
