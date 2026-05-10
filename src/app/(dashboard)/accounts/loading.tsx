import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";

export default function AccountsLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-8 w-28" />
      </div>

      <div className="grid grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <CardContent className="pt-4 pb-3 px-4">
              <Skeleton className="h-7 w-24" />
              <Skeleton className="h-3 w-16 mt-2" />
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <div className="px-4 py-3">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-3 w-12 mt-1" />
        </div>
        {[1, 2].map((i) => (
          <div key={i} className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-3">
              <Skeleton className="size-4 rounded" />
              <Skeleton className="h-4 w-28" />
            </div>
            <Skeleton className="h-4 w-20" />
          </div>
        ))}
      </Card>
    </div>
  );
}
