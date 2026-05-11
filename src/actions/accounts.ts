"use server";

import { v4 as uuid } from "uuid";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getHouseholdId, getSession } from "@/lib/auth/session";
import { guardDemoMode } from "@/lib/demo-mode";
import { todayDateString as todayISO } from "@/lib/date-utils";
import { db as defaultDb, type LedgrDb } from "@/db";
import { accounts, balanceHistory } from "@/db/schema";
import { scopedQuery } from "@/lib/scoped-query";

const createManualAccountSchema = z.object({
  name: z.string().min(1).max(100),
  type: z.enum(["checking", "savings", "credit", "loan", "investment", "other"]),
  balance: z.number().transform((v) => Math.round(v)),
});

type CreateManualAccountInput = {
  name: string;
  type: "checking" | "savings" | "credit" | "loan" | "investment" | "other";
  balance: number;
};

export async function createManualAccount(data: CreateManualAccountInput, db: LedgrDb = defaultDb) {
  const householdId = await getHouseholdId();
  const session = await getSession();
  const blocked = await guardDemoMode(session!.user.id);
  if (blocked) return blocked as { error: string };

  const parsed = createManualAccountSchema.safeParse(data);
  if (!parsed.success) {
    return { error: "Invalid input" };
  }

  const accountId = uuid();
  const today = todayISO();

  await db.transaction(async (tx) => {
    await tx.insert(accounts)
      .values({
        id: accountId,
        householdId,
        name: parsed.data.name,
        type: parsed.data.type,
        currentBalance: parsed.data.balance,
        isManual: true,
      });

    await tx.insert(balanceHistory)
      .values({
        id: uuid(),
        accountId,
        date: today,
        balance: parsed.data.balance,
      });
  });

  revalidatePath("/accounts");
  return { success: true, accountId };
}

const updateAccountSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  isHidden: z.boolean().optional(),
});

type UpdateAccountInput = {
  name?: string;
  isHidden?: boolean;
};

export async function updateAccount(
  accountId: string,
  data: UpdateAccountInput,
  db: LedgrDb = defaultDb,
) {
  const householdId = await getHouseholdId();
  const session = await getSession();
  const blocked = await guardDemoMode(session!.user.id);
  if (blocked) return blocked as { error: string };

  const parsed = updateAccountSchema.safeParse(data);
  if (!parsed.success) {
    return { error: "Invalid input" };
  }

  const scoped = scopedQuery(householdId, db);
  const [existing] = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(scoped.where(accounts, eq(accounts.id, accountId)))
    .limit(1);

  if (!existing) {
    return { error: "Account not found" };
  }

  const updates: Partial<typeof accounts.$inferInsert> = {};
  if (parsed.data.name !== undefined) updates.name = parsed.data.name;
  if (parsed.data.isHidden !== undefined) updates.isHidden = parsed.data.isHidden;

  if (Object.keys(updates).length > 0) {
    await db.update(accounts)
      .set(updates)
      .where(scoped.where(accounts, eq(accounts.id, accountId)));
  }

  revalidatePath("/accounts");
  return { success: true };
}
