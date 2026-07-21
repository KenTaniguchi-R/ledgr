import { getHouseholdId } from "@/lib/auth/session";
import { getAccountsByInstitution, getAccountSummary } from "@/queries/accounts";
import { centsToDisplay } from "@/lib/money";
import { StatStrip } from "@/components/molecules/stat-strip";
import { AccountList } from "@/components/organisms/account-list";
import { AccountsActions } from "@/components/organisms/accounts-actions";
import { EmptyStateCTA } from "@/components/organisms/empty-state-cta";

export default async function AccountsPage() {
  const householdId = await getHouseholdId();

  const [groups, summary] = await Promise.all([
    getAccountsByInstitution(householdId),
    getAccountSummary(householdId),
  ]);

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

      <StatStrip
        items={[
          { label: "Net Worth", value: centsToDisplay(summary.netWorth) },
          { label: "Assets", value: centsToDisplay(summary.totalAssets) },
          {
            label: "Debts",
            value: centsToDisplay(Math.abs(summary.totalLiabilities)),
            valueClassName: summary.totalLiabilities !== 0 ? "text-destructive" : undefined,
          },
        ]}
      />

      <AccountList groups={groups} />
    </div>
  );
}
