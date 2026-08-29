import { generateText, Output } from "ai";
import { z } from "zod";
import { eq, and, isNull, inArray } from "drizzle-orm";
import { db as defaultDb, type LedgrDb } from "@/db";
import {
  transactions,
  categories,
  categoryGroups,
} from "@/db/schema";
import { notDeleted } from "@/lib/query-helpers";
import { resolvedCategoryLabel } from "@/lib/labels";
import { coalesce } from "@/lib/coalesce";
import { withHousehold } from "@/lib/household-context";
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

export function getBatchSize(provider: string): number {
  return provider === "custom" ? 20 : 50;
}

// Household-scoped, and invoked once per synced connection — coalesced so
// several connections syncing in parallel (the "sync all" button) share a
// single run instead of each racing over the same uncategorized rows and
// paying for duplicate AI calls.
export function categorizeWithAi(
  householdId: string,
  db: LedgrDb = defaultDb,
): Promise<{ categorized: number; skipped: number }> {
  return coalesce(`ai-categorize:${householdId}`, () => runCategorization(householdId, db));
}

async function runCategorization(
  householdId: string,
  db: LedgrDb,
): Promise<{ categorized: number; skipped: number }> {
  const config = getAiConfig();
  const model = createAiModel();
  if (!config || !model) return { categorized: 0, skipped: 0 };

  // Short-lived transaction — not held open across the batched LLM calls below.
  const initial = await withHousehold(householdId, async (tx) => {
    const uncategorizedRows = await tx
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

    if (uncategorizedRows.length === 0) return null;

    const catRows = await tx
      .select()
      .from(categories)
      .where(eq(categories.householdId, householdId));
    const groupRows = await tx
      .select()
      .from(categoryGroups)
      .where(eq(categoryGroups.householdId, householdId));

    const exampleTxnRows = await tx
      .select({ name: transactions.name, categoryId: transactions.categoryId })
      .from(transactions)
      .where(
        and(
          eq(transactions.householdId, householdId),
          eq(transactions.reviewed, true),
        ),
      )
      .limit(10);

    return { uncategorizedRows, catRows, groupRows, exampleTxnRows };
  }, db);

  if (!initial) return { categorized: 0, skipped: 0 };
  const { uncategorizedRows: uncategorized, catRows: cats, groupRows: groups, exampleTxnRows: exampleRows } = initial;

  const groupMap = new Map(groups.map((g) => [g.id, g.name]));

  const categoryInfos: CategoryInfo[] = cats.map((c) => ({
    id: c.id,
    name: c.name,
    groupName: groupMap.get(c.groupId) ?? "Other",
  }));
  const validCategoryIds = new Set(cats.map((c) => c.id));

  const examples = exampleRows
    .filter((e) => e.categoryId)
    .map((e) => ({
      description: e.name,
      categoryName: resolvedCategoryLabel(
        cats.find((c) => c.id === e.categoryId)?.name,
      ),
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
        instructions:
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

    const idsByCategoryId = new Map<string, string[]>();
    for (const a of aboveThreshold) {
      const ids = idsByCategoryId.get(a.categoryId);
      if (ids) ids.push(a.transactionId);
      else idsByCategoryId.set(a.categoryId, [a.transactionId]);
    }

    await withHousehold(householdId, async (tx) => {
      for (const [categoryId, ids] of idsByCategoryId) {
        await tx.update(transactions)
          .set({ categoryId, categorySource: "ai", updatedAt: now })
          .where(inArray(transactions.id, ids));
      }
      await tx.update(transactions)
        .set({ aiCategorizationAttemptedAt: now })
        .where(inArray(transactions.id, [...batchIds]));
    }, db);
    categorized += aboveThreshold.length;
  }

  return { categorized, skipped: uncategorized.length - categorized };
}
