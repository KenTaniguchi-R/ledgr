import { v4 as uuid } from "uuid";
import { categoryGroups, categories } from "@/db/schema";
import type { LedgrDb } from "@/db";

type Tx = Parameters<Parameters<LedgrDb["transaction"]>[0]>[0] | LedgrDb;

interface CategoryDef {
  name: string;
  icon: string | null;
  isIncome: boolean;
}

interface GroupDef {
  name: string;
  icon: string | null;
  categories: CategoryDef[];
}

export const DEFAULT_CATEGORIES: GroupDef[] = [
  {
    name: "Income",
    icon: "dollar-sign",
    categories: [
      { name: "Salary", icon: null, isIncome: true },
      { name: "Freelance", icon: null, isIncome: true },
      { name: "Investment Income", icon: null, isIncome: true },
      { name: "Other Income", icon: null, isIncome: true },
    ],
  },
  {
    name: "Housing",
    icon: "home",
    categories: [
      { name: "Rent/Mortgage", icon: null, isIncome: false },
      { name: "Property Tax", icon: null, isIncome: false },
      { name: "Home Insurance", icon: null, isIncome: false },
      { name: "Maintenance", icon: null, isIncome: false },
    ],
  },
  {
    name: "Food & Dining",
    icon: "utensils",
    categories: [
      { name: "Groceries", icon: null, isIncome: false },
      { name: "Restaurants", icon: null, isIncome: false },
      { name: "Coffee Shops", icon: null, isIncome: false },
    ],
  },
  {
    name: "Transportation",
    icon: "car",
    categories: [
      { name: "Gas", icon: null, isIncome: false },
      { name: "Public Transit", icon: null, isIncome: false },
      { name: "Car Payment", icon: null, isIncome: false },
      { name: "Car Insurance", icon: null, isIncome: false },
      { name: "Parking", icon: null, isIncome: false },
    ],
  },
  {
    name: "Utilities",
    icon: "zap",
    categories: [
      { name: "Electric", icon: null, isIncome: false },
      { name: "Water", icon: null, isIncome: false },
      { name: "Internet", icon: null, isIncome: false },
      { name: "Phone", icon: null, isIncome: false },
    ],
  },
  {
    name: "Shopping",
    icon: "shopping-bag",
    categories: [
      { name: "Clothing", icon: null, isIncome: false },
      { name: "Electronics", icon: null, isIncome: false },
      { name: "Home Goods", icon: null, isIncome: false },
    ],
  },
  {
    name: "Health",
    icon: "heart",
    categories: [
      { name: "Health Insurance", icon: null, isIncome: false },
      { name: "Medical", icon: null, isIncome: false },
      { name: "Pharmacy", icon: null, isIncome: false },
      { name: "Fitness", icon: null, isIncome: false },
    ],
  },
  {
    name: "Personal",
    icon: "user",
    categories: [
      { name: "Entertainment", icon: null, isIncome: false },
      { name: "Subscriptions", icon: null, isIncome: false },
      { name: "Education", icon: null, isIncome: false },
      { name: "Gifts", icon: null, isIncome: false },
      { name: "Travel", icon: null, isIncome: false },
    ],
  },
];

export async function seedDefaultCategories(
  tx: Tx,
  householdId: string
): Promise<void> {
  for (let gi = 0; gi < DEFAULT_CATEGORIES.length; gi++) {
    const group = DEFAULT_CATEGORIES[gi];
    const groupId = uuid();

    await tx.insert(categoryGroups).values({
      id: groupId,
      householdId,
      name: group.name,
      icon: group.icon,
      sortOrder: gi,
      isSystem: true,
    });

    for (let ci = 0; ci < group.categories.length; ci++) {
      const cat = group.categories[ci];
      await tx.insert(categories).values({
        id: uuid(),
        householdId,
        groupId,
        name: cat.name,
        icon: cat.icon,
        isIncome: cat.isIncome,
        isSystem: true,
        sortOrder: ci,
      });
    }
  }
}
