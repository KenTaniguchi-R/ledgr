import { getHouseholdId } from "@/lib/auth/session";
import { getAccountsForImport } from "@/queries/accounts";
import { ImportWizard } from "@/components/organisms/import-wizard";

export default async function ImportPage() {
  const householdId = await getHouseholdId();
  const userAccounts = await getAccountsForImport(householdId);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Import Transactions</h1>
      <ImportWizard accounts={userAccounts} />
    </div>
  );
}
