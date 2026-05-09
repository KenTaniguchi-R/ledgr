import { redirect } from "next/navigation";
import { getSession, getHouseholdId } from "@/lib/auth/session";

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const householdId = await getHouseholdId();

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight">Welcome to Ledgr</h1>
        <p className="mt-2 text-muted-foreground">
          Your finances are ready. Dashboard coming in Phase 6.
        </p>
      </div>
    </div>
  );
}
