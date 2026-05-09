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

export function provisionHousehold(
  userId: string,
  db: Db = defaultDb
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
