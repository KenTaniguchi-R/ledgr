import { getHouseholdId } from "@/lib/auth/session";

export default async function DashboardPage() {
  await getHouseholdId();

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
      <p className="mt-2 text-muted-foreground">
        Your financial overview. Coming in Phase 6.
      </p>
    </div>
  );
}
