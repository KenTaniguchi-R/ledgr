import { eq } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import { db as defaultDb, type LedgrDb } from "@/db";
import { userSettings } from "@/db/schema";

export async function upsertUserSetting(
  userId: string,
  values: Partial<typeof userSettings.$inferInsert>,
  txDb: LedgrDb = defaultDb,
): Promise<void> {
  const [existing] = await txDb
    .select({ id: userSettings.id })
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1);

  const now = new Date();

  if (existing) {
    await txDb.update(userSettings)
      .set({ ...values, updatedAt: now })
      .where(eq(userSettings.id, existing.id));
  } else {
    await txDb.insert(userSettings).values({
      id: uuid(),
      userId,
      createdAt: now,
      updatedAt: now,
      ...values,
    });
  }
}
