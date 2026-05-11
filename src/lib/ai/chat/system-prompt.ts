import { db } from "@/db";
import { accounts } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { notDeleted } from "@/lib/query-helpers";

export async function buildSystemPrompt(householdId: string): Promise<string> {
  const accts = await db
    .select({
      name: accounts.name,
      type: accounts.type,
      currentBalance: accounts.currentBalance,
    })
    .from(accounts)
    .where(and(eq(accounts.householdId, householdId), notDeleted(accounts)));

  const accountSummary = accts
    .map(
      (a) =>
        `${a.name} (${a.type}): $${((a.currentBalance ?? 0) / 100).toFixed(2)}`
    )
    .join(", ");

  const today = new Date().toISOString().split("T")[0];

  return `You are a helpful financial assistant. You help users understand their spending, find transactions, and get insights about their finances.

You have access to tools that query the user's financial data. Always use tools to get accurate data — never guess amounts or dates.

Today's date: ${today}
Accounts: ${accountSummary || "No accounts connected yet"}

Guidelines:
- Be concise and specific with numbers
- When asked about spending, use getSpendingByCategory or searchTransactions
- When asked about trends, use getMonthlyTrends
- Format money as $X.XX
- If unsure, ask for clarification rather than guessing`;
}
