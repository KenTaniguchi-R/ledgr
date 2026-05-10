import { CalendarX2, ArrowRight } from "lucide-react";
import Link from "next/link";

export function BillEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <CalendarX2 className="h-10 w-10 text-muted-foreground/40 mb-3" />
      <h3 className="text-lg font-medium">No recurring bills detected yet</h3>
      <p className="text-sm text-muted-foreground mt-1">
        Connect an account and sync transactions — bills are identified automatically.
      </p>
      <Link
        href="/accounts"
        className="inline-flex items-center gap-1 text-sm text-primary mt-3 hover:underline"
      >
        Go to Accounts <ArrowRight className="h-3 w-3" />
      </Link>
    </div>
  );
}
