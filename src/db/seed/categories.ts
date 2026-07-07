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
      { name: "Salary", icon: "banknote", isIncome: true },
      { name: "Freelance", icon: "laptop", isIncome: true },
      { name: "Investment Income", icon: "trending-up", isIncome: true },
      { name: "Other Income", icon: "circle-dollar-sign", isIncome: true },
    ],
  },
  {
    name: "Housing",
    icon: "home",
    categories: [
      { name: "Rent/Mortgage", icon: "key", isIncome: false },
      { name: "Property Tax", icon: "landmark", isIncome: false },
      { name: "Home Insurance", icon: "umbrella", isIncome: false },
      { name: "Maintenance", icon: "wrench", isIncome: false },
    ],
  },
  {
    name: "Food & Dining",
    icon: "utensils",
    categories: [
      { name: "Groceries", icon: "shopping-cart", isIncome: false },
      { name: "Restaurants", icon: "utensils", isIncome: false },
      { name: "Coffee Shops", icon: "coffee", isIncome: false },
    ],
  },
  {
    name: "Transportation",
    icon: "car",
    categories: [
      { name: "Gas", icon: "fuel", isIncome: false },
      { name: "Public Transit", icon: "train-front", isIncome: false },
      { name: "Car Payment", icon: "car", isIncome: false },
      { name: "Car Insurance", icon: "car-front", isIncome: false },
      { name: "Parking", icon: "square-parking", isIncome: false },
    ],
  },
  {
    name: "Utilities",
    icon: "zap",
    categories: [
      { name: "Electric", icon: "zap", isIncome: false },
      { name: "Water", icon: "droplet", isIncome: false },
      { name: "Internet", icon: "wifi", isIncome: false },
      { name: "Phone", icon: "smartphone", isIncome: false },
    ],
  },
  {
    name: "Shopping",
    icon: "shopping-bag",
    categories: [
      { name: "Clothing", icon: "shirt", isIncome: false },
      { name: "Electronics", icon: "cpu", isIncome: false },
      { name: "Home Goods", icon: "lamp", isIncome: false },
    ],
  },
  {
    name: "Health",
    icon: "heart",
    categories: [
      { name: "Health Insurance", icon: "heart-pulse", isIncome: false },
      { name: "Medical", icon: "stethoscope", isIncome: false },
      { name: "Pharmacy", icon: "pill", isIncome: false },
      { name: "Fitness", icon: "dumbbell", isIncome: false },
    ],
  },
  {
    name: "Personal",
    icon: "user",
    categories: [
      { name: "Entertainment", icon: "clapperboard", isIncome: false },
      { name: "Subscriptions", icon: "repeat", isIncome: false },
      { name: "Education", icon: "graduation-cap", isIncome: false },
      { name: "Gifts", icon: "gift", isIncome: false },
      { name: "Travel", icon: "plane", isIncome: false },
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
