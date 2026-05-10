import { generateText, Output } from "ai";
import { z } from "zod";
import { eq, and, isNull } from "drizzle-orm";
import { db as defaultDb, type LedgrDb } from "@/db";
import {
  transactions,
  categories,
  categoryGroups,
  householdMembers,
} from "@/db/schema";
import { notDeleted } from "@/lib/query-helpers";
import { createUserModel, type AiProvider } from "./provider";
import { getUserAiSettings } from "@/queries/settings";
import { decrypt } from "@/lib/encryption";

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

function getBatchSize(provider: AiProvider): number {
  return provider === "custom" ? 20 : 50;
}

export async function categorizeWithAi(
  householdId: string,
  db: LedgrDb = defaultDb,
): Promise<{ categorized: number; skipped: number }> {
  const owner = db
    .select({ userId: householdMembers.userId })
    .from(householdMembers)
    .where(
      and(
        eq(householdMembers.householdId, householdId),
        eq(householdMembers.role, "owner"),
      ),
    )
    .get();

  if (!owner) return { categorized: 0, skipped: 0 };

  const settings = getUserAiSettings(owner.userId, db);
  if (!settings?.aiProvider || !settings?.aiModel || !settings.hasKey) {
    return { categorized: 0, skipped: 0 };
  }

  const model = createUserModel({
    aiProvider: settings.aiProvider as AiProvider,
    aiModel: settings.aiModel,
    aiApiKey: decrypt(settings.rawEncryptedKey!),
    aiBaseUrl: settings.aiBaseUrl ?? undefined,
  });

  const uncategorized = db
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
    )
    .all();

  if (uncategorized.length === 0) return { categorized: 0, skipped: 0 };

  const cats = db
    .select()
    .from(categories)
    .where(eq(categories.householdId, householdId))
    .all();
  const groups = db
    .select()
    .from(categoryGroups)
    .where(eq(categoryGroups.householdId, householdId))
    .all();
  const groupMap = new Map(groups.map((g) => [g.id, g.name]));

  const categoryInfos: CategoryInfo[] = cats.map((c) => ({
    id: c.id,
    name: c.name,
    groupName: groupMap.get(c.groupId) ?? "Other",
  }));
  const validCategoryIds = new Set(cats.map((c) => c.id));

  const examples = db
    .select({ name: transactions.name, categoryId: transactions.categoryId })
    .from(transactions)
    .where(
      and(
        eq(transactions.householdId, householdId),
        eq(transactions.reviewed, true),
      ),
    )
    .limit(10)
    .all()
    .filter((e) => e.categoryId)
    .map((e) => ({
      description: e.name,
      categoryName: cats.find((c) => c.id === e.categoryId)?.name ?? "Unknown",
    }));

  const threshold = settings.aiConfidenceThreshold;
  const batchSize = getBatchSize(settings.aiProvider as AiProvider);
  let categorized = 0;
  const now = new Date().toISOString();

  for (let i = 0; i < uncategorized.length; i += batchSize) {
    const batch = uncategorized.slice(i, i + batchSize);
    const batchInputs: CategorizationInput[] = batch.map((t) => ({
      id: t.id,
      description: t.name,
      amount: t.amount,
    }));
    const batchIds = new Set(batch.map((t) => t.id));

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
        const aboveThreshold = validated.filter(
          (a) => a.confidence >= threshold,
        );

        if (aboveThreshold.length > 0) {
          db.transaction((tx) => {
            for (const a of aboveThreshold) {
              tx.update(transactions)
                .set({ categoryId: a.categoryId, updatedAt: now })
                .where(eq(transactions.id, a.transactionId))
                .run();
            }
          });
          categorized += aboveThreshold.length;
        }
      }
    } catch (e) {
      console.error(`AI categorization batch failed:`, e);
    }

    // Mark all batch transactions as attempted regardless of success
    db.transaction((tx) => {
      for (const id of batchIds) {
        tx.update(transactions)
          .set({ aiCategorizationAttemptedAt: now })
          .where(eq(transactions.id, id))
          .run();
      }
    });
  }

  return { categorized, skipped: uncategorized.length - categorized };
}
