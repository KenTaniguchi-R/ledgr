import { getHouseholdId } from "@/lib/auth/session";
import { getAccountsByInstitution, getAccountSummary } from "@/queries/accounts";
import { SummaryCard } from "@/components/molecules/summary-card";
import { AccountList } from "@/components/organisms/account-list";
import { AccountsActions } from "@/components/organisms/accounts-actions";
import { EmptyStateCTA } from "@/components/organisms/empty-state-cta";

export default async function AccountsPage() {
  const householdId = await getHouseholdId();

  const groups = await getAccountsByInstitution(householdId);
  const summary = await getAccountSummary(householdId);

  const hasAccounts = groups.some((g) => g.accounts.length > 0);

  if (!hasAccounts) {
    return <EmptyStateCTA />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Accounts</h1>
        <AccountsActions />
      </div>

      <div className="grid grid-cols-3 gap-2 sm:gap-4">
        <SummaryCard label="Net Worth" amount={summary.netWorth} />
        <SummaryCard label="Assets" amount={summary.totalAssets} />
        <SummaryCard label="Debts" amount={summary.totalLiabilities} />
      </div>

      <AccountList groups={groups} />
    </div>
  );
}
