import { getHouseholdId } from "@/lib/auth/session";
import { db } from "@/db";
import { accounts } from "@/db/schema/accounts";
import { eq, and } from "drizzle-orm";
import { notDeleted } from "@/lib/query-helpers";
import { ImportWizard } from "@/components/organisms/import-wizard";

export default async function ImportPage() {
  const householdId = await getHouseholdId();

  const userAccounts = db
    .select({ id: accounts.id, name: accounts.name })
    .from(accounts)
    .where(and(eq(accounts.householdId, householdId), notDeleted(accounts)))
    .all();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Import Transactions</h1>
      <ImportWizard accounts={userAccounts} />
    </div>
  );
}
