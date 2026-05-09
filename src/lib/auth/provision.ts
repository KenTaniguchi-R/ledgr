import { v4 as uuid } from "uuid";
import { eq } from "drizzle-orm";
import { db as defaultDb } from "@/db";
import {
  households,
  householdMembers,
  userSettings,
} from "@/db/schema";
import { seedDefaultCategories } from "@/db/seed/categories";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";

type Db = BetterSQLite3Database<typeof schema>;

export async function provisionHousehold(
  userId: string,
  db: Db = defaultDb
): Promise<string> {
  const existing = await db.query.householdMembers.findFirst({
    where: eq(householdMembers.userId, userId),
  });

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
