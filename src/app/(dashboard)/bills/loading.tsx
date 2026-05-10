import { Skeleton } from "@/components/ui/skeleton";

export default function BillsLoading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-32" />
      <Skeleton className="h-4 w-64" />
      <Skeleton className="h-8 w-full" />
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}
