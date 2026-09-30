import { CategoryManager } from "@/components/organisms/category-manager";
import { getHouseholdId } from "@/lib/auth/session";
import { getCategories } from "@/queries/categories";

export default async function CategoriesPage() {
  const householdId = await getHouseholdId();
  const groups = await getCategories(householdId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Categories</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Create and maintain the categories used throughout your household&apos;s ledger.
        </p>
      </div>
      <CategoryManager groups={groups} />
    </div>
  );
}
