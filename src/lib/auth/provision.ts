import { v4 as uuid } from "uuid";
import { eq } from "drizzle-orm";
import { db as defaultDb, type LedgrDb } from "@/db";
import {
  households,
  householdMembers,
  userSettings,
} from "@/db/schema";
import { seedDefaultCategories } from "@/db/seed/categories";

export async function provisionHousehold(
  userId: string,
  db: LedgrDb = defaultDb
): Promise<string> {
  const [existing] = await db
    .select({ householdId: householdMembers.householdId })
    .from(householdMembers)
    .where(eq(householdMembers.userId, userId))
    .limit(1);

  if (existing) {
    return existing.householdId;
  }

  const householdId = uuid();

  await db.transaction(async (tx) => {
    await tx.insert(households).values({
      id: householdId,
      name: "My Finances",
    });

    await tx.insert(householdMembers).values({
      id: uuid(),
      householdId,
      userId,
      role: "owner",
    });

    await tx.insert(userSettings).values({
      id: uuid(),
      userId,
    });

    await seedDefaultCategories(tx, householdId);
  });

  return householdId;
}
