import { getHouseholdId } from "@/lib/auth/session";
import { getAccountsForImport } from "@/queries/accounts";
import { ImportWizard } from "@/components/organisms/import-wizard";

export default async function ImportPage() {
  const householdId = await getHouseholdId();
  const userAccounts = await getAccountsForImport(householdId);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Import Transactions</h1>
      <ImportWizard accounts={userAccounts} />
    </div>
  );
}
