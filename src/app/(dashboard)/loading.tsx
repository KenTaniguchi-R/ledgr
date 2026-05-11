import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export default function DashboardLoading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-48" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i} className={i % 3 === 0 ? "sm:col-span-2 sm:row-span-2" : "sm:col-span-1"}>
            <CardHeader className="pb-2 pt-3 px-4">
              <Skeleton className="h-4 w-24" />
            </CardHeader>
            <CardContent className="pb-3 px-4">
              <Skeleton className="h-full min-h-[120px] w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
