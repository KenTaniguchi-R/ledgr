import { getHouseholdId } from "@/lib/auth/session";
import { getCategoryRules } from "@/queries/category-rules";
import { getCategories } from "@/queries/categories";
import { CategoryRulesManager } from "@/components/organisms/category-rules-manager";

export default async function RulesPage() {
  const householdId = await getHouseholdId();

  const [rules, categoryGroups] = await Promise.all([
    getCategoryRules(householdId),
    getCategories(householdId),
  ]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Category rules</h1>
        <p className="text-sm text-muted-foreground">
          Send transactions to a category by matching their name or merchant.
        </p>
      </div>

      <CategoryRulesManager rules={rules} categoryGroups={categoryGroups} />
    </div>
  );
}
