import { db as defaultDb, type LedgrDb } from "@/db";
import { categoryGroups, categories } from "@/db/schema";
import { scopedQuery } from "@/lib/scoped-query";

interface CategoryOption {
  id: string;
  name: string;
  icon: string | null;
  isIncome: boolean;
  sortOrder: number;
}

export interface CategoryGroup {
  id: string;
  name: string;
  icon: string | null;
  sortOrder: number;
  categories: CategoryOption[];
}

export async function getCategories(
  householdId: string,
  db: LedgrDb = defaultDb,
): Promise<CategoryGroup[]> {
  const scoped = scopedQuery(householdId, db);

  const groups = await db
    .select()
    .from(categoryGroups)
    .where(scoped.where(categoryGroups))
    .orderBy(categoryGroups.sortOrder);

  const cats = await db
    .select()
    .from(categories)
    .where(scoped.where(categories))
    .orderBy(categories.sortOrder);

  const catsByGroup = new Map<string, CategoryOption[]>();
  for (const cat of cats) {
    const list = catsByGroup.get(cat.groupId) ?? [];
    list.push({
      id: cat.id,
      name: cat.name,
      icon: cat.icon,
      isIncome: cat.isIncome ?? false,
      sortOrder: cat.sortOrder ?? 0,
    });
    catsByGroup.set(cat.groupId, list);
  }

  return groups.map((g) => ({
    id: g.id,
    name: g.name,
    icon: g.icon,
    sortOrder: g.sortOrder ?? 0,
    categories: catsByGroup.get(g.id) ?? [],
  }));
}
