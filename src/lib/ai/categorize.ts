import { generateText, Output } from "ai";
import { z } from "zod";
import { eq, and, isNull } from "drizzle-orm";
import { db as defaultDb, type LedgrDb } from "@/db";
import {
  transactions,
  categories,
  categoryGroups,
} from "@/db/schema";
import { notDeleted } from "@/lib/query-helpers";
import { getAiConfig, createAiModel } from "./config";

const categorizationSchema = z.object({
  assignments: z.array(
    z.object({
      transactionId: z.string(),
      categoryId: z.string(),
      confidence: z.number().min(0).max(1),
    }),
  ),
});

interface CategorizationInput {
  id: string;
  description: string;
  amount: number;
}

interface CategoryInfo {
  id: string;
  name: string;
  groupName: string;
}

export function buildCategorizationPrompt(
  txns: CategorizationInput[],
  cats: CategoryInfo[],
  examples: { description: string; categoryName: string }[],
): string {
  let prompt =
    "Categorize these transactions. Use ONLY the category IDs listed below.\n\n";
  prompt += "## Available Categories\n";
  for (const cat of cats) {
    prompt += `- ID: "${cat.id}" | Name: "${cat.name}" | Group: "${cat.groupName}"\n`;
  }

  if (examples.length > 0) {
    prompt += "\n## Examples of previously categorized transactions\n";
    for (const ex of examples) {
      prompt += `- "${ex.description}" → ${ex.categoryName}\n`;
    }
  }

  prompt += "\n## Transactions to categorize\n";
  for (const txn of txns) {
    const type = txn.amount > 0 ? "expense" : "income";
    prompt += `- ID: "${txn.id}" | "${txn.description}" | $${Math.abs(txn.amount / 100).toFixed(2)} (${type})\n`;
  }

  prompt +=
    "\nReturn low confidence (<0.5) when uncertain. Use ONLY the exact category IDs listed above.";
  return prompt;
}

export function validateAssignments(
  assignments: z.infer<typeof categorizationSchema>["assignments"],
  validCategoryIds: Set<string>,
  batchTransactionIds: Set<string>,
): z.infer<typeof categorizationSchema>["assignments"] {
  return assignments.filter(
    (a) =>
      validCategoryIds.has(a.categoryId) &&
      batchTransactionIds.has(a.transactionId),
  );
}

function getBatchSize(provider: string): number {
  return provider === "custom" ? 20 : 50;
}

export async function categorizeWithAi(
  householdId: string,
  db: LedgrDb = defaultDb,
): Promise<{ categorized: number; skipped: number }> {
  const config = getAiConfig();
  const model = createAiModel();
  if (!config || !model) return { categorized: 0, skipped: 0 };

  const uncategorized = await db
    .select({
      id: transactions.id,
      name: transactions.name,
      amount: transactions.amount,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.householdId, householdId),
        isNull(transactions.categoryId),
        isNull(transactions.aiCategorizationAttemptedAt),
        notDeleted(transactions),
      ),
    );

  if (uncategorized.length === 0) return { categorized: 0, skipped: 0 };

  const cats = await db
    .select()
    .from(categories)
    .where(eq(categories.householdId, householdId));
  const groups = await db
    .select()
    .from(categoryGroups)
    .where(eq(categoryGroups.householdId, householdId));
  const groupMap = new Map(groups.map((g) => [g.id, g.name]));

  const categoryInfos: CategoryInfo[] = cats.map((c) => ({
    id: c.id,
    name: c.name,
    groupName: groupMap.get(c.groupId) ?? "Other",
  }));
  const validCategoryIds = new Set(cats.map((c) => c.id));

  const exampleRows = await db
    .select({ name: transactions.name, categoryId: transactions.categoryId })
    .from(transactions)
    .where(
      and(
        eq(transactions.householdId, householdId),
        eq(transactions.reviewed, true),
      ),
    )
    .limit(10);

  const examples = exampleRows
    .filter((e) => e.categoryId)
    .map((e) => ({
      description: e.name,
      categoryName: cats.find((c) => c.id === e.categoryId)?.name ?? "Unknown",
    }));

  const threshold = config.confidenceThreshold;
  const batchSize = getBatchSize(config.aiProvider);
  let categorized = 0;
  const now = new Date();

  for (let i = 0; i < uncategorized.length; i += batchSize) {
    const batch = uncategorized.slice(i, i + batchSize);
    const batchInputs: CategorizationInput[] = batch.map((t) => ({
      id: t.id,
      description: t.name,
      amount: t.amount,
    }));
    const batchIds = new Set(batch.map((t) => t.id));

    let aboveThreshold: z.infer<typeof categorizationSchema>["assignments"] = [];
    try {
      const { output } = await generateText({
        model,
        output: Output.object({ schema: categorizationSchema }),
        system:
          "You are a financial transaction categorization assistant. Be precise and conservative.",
        prompt: buildCategorizationPrompt(batchInputs, categoryInfos, examples),
      });

      if (output) {
        const validated = validateAssignments(
          output.assignments,
          validCategoryIds,
          batchIds,
        );
        aboveThreshold = validated.filter((a) => a.confidence >= threshold);
      }
    } catch (e) {
      console.error(`AI categorization batch failed:`, e);
    }

    await db.transaction(async (tx) => {
      for (const a of aboveThreshold) {
        await tx.update(transactions)
          .set({ categoryId: a.categoryId, categorySource: "ai", updatedAt: now })
          .where(eq(transactions.id, a.transactionId));
      }
      for (const id of batchIds) {
        await tx.update(transactions)
          .set({ aiCategorizationAttemptedAt: now })
          .where(eq(transactions.id, id));
      }
    });
    categorized += aboveThreshold.length;
  }

  return { categorized, skipped: uncategorized.length - categorized };
}
