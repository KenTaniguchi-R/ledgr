import { v4 as uuid } from "uuid";
import { eq } from "drizzle-orm";
import { db as defaultDb, type LedgrDb } from "@/db";
import {
  households,
  householdMembers,
  userSettings,
} from "@/db/schema";
import { seedDefaultCategories } from "@/db/seed/categories";

export function provisionHousehold(
  userId: string,
  db: LedgrDb = defaultDb
): string {
  const existing = db
    .select({ householdId: householdMembers.householdId })
    .from(householdMembers)
    .where(eq(householdMembers.userId, userId))
    .get();

  if (existing) {
    return existing.householdId;
  }

  const householdId = uuid();

  db.transaction((tx) => {
    tx.insert(households).values({
      id: householdId,
      name: "My Finances",
    }).run();

    tx.insert(householdMembers).values({
      id: uuid(),
      householdId,
      userId,
      role: "owner",
    }).run();

    tx.insert(userSettings).values({
      id: uuid(),
      userId,
    }).run();

    seedDefaultCategories(tx, householdId);
  });

  return householdId;
}
