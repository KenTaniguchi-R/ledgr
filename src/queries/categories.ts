import { db as defaultDb, type LedgrDb } from "@/db";
import { categoryGroups, categories } from "@/db/schema";
import { scopedQuery } from "@/lib/scoped-query";

export interface CategoryOption {
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

export function getCategories(
  householdId: string,
  db: LedgrDb = defaultDb,
): CategoryGroup[] {
  const scoped = scopedQuery(householdId, db);

  const groups = db
    .select()
    .from(categoryGroups)
    .where(scoped.where(categoryGroups))
    .orderBy(categoryGroups.sortOrder)
    .all();

  const cats = db
    .select()
    .from(categories)
    .where(scoped.where(categories))
    .orderBy(categories.sortOrder)
    .all();

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
