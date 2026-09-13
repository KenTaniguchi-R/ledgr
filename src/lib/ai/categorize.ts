import { generateText, Output } from "ai";
import { z } from "zod";
import { eq, and, isNull, inArray } from "drizzle-orm";
import { db as defaultDb, type LedgrDb } from "@/db";
import {
  transactions,
  categories,
  categoryGroups,
  type CategorySource,
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
  /**
   * Signed cents in the provider-agnostic display convention: negative is
   * money out, positive is money in. This must be `normalized_amount`, never
   * the raw `amount` — Plaid sends positive-for-debit and SimpleFIN sends
   * negative-for-debit, so raw amounts label half the household's expenses as
   * income and steer the model straight into the Income group.
   */
  normalizedAmount: number;
}

export interface CategorizationRun {
  /** Rows the model assigned a category to, at any confidence. */
  categorized: number;
  /** Subset of `categorized` filed as `ai_low_confidence` — a best guess. */
  lowConfidence: number;
  /** Rows the model returned no pick for, plus rows in batches that failed. */
  skipped: number;
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
    const type = txn.normalizedAmount < 0 ? "expense" : "income";
    prompt += `- ID: "${txn.id}" | "${txn.description}" | $${Math.abs(txn.normalizedAmount / 100).toFixed(2)} (${type})\n`;
  }

  prompt +=
    "\nEach transaction is marked (expense) or (income) — never assign an " +
    "expense to an income category, or the reverse. " +
    "Return an assignment for EVERY transaction listed — never omit one because " +
    "you are unsure. Pick the single closest category and report your genuine " +
    "confidence (a low number is fine and useful; omitting the row is not). " +
    "Use ONLY the exact category IDs listed above.";
  return prompt;
}

export function validateAssignments(
  assignments: z.infer<typeof categorizationSchema>["assignments"],
  validCategoryIds: Set<string>,
  batchTransactionIds: Set<string>,
  incomeCategoryIds: Set<string> = new Set(),
  incomeTransactionIds: Set<string> = new Set(),
): z.infer<typeof categorizationSchema>["assignments"] {
  return assignments.filter((a) => {
    if (!validCategoryIds.has(a.categoryId)) return false;
    if (!batchTransactionIds.has(a.transactionId)) return false;
    // Money going out may never be filed under an income category. Reports
    // subtract income categories from spend (queries/shared-conditions
    // notIncome), so an expense parked in one disappears from spending
    // entirely and inflates income — strictly worse than leaving it
    // uncategorized, which is the whole reason low-confidence picks are kept.
    // Asymmetric on purpose: an inflow *may* take an expense category, since
    // that is how a refund correctly offsets the category it came from.
    if (incomeCategoryIds.has(a.categoryId) && !incomeTransactionIds.has(a.transactionId)) {
      return false;
    }
    return true;
  });
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
): Promise<CategorizationRun> {
  return coalesce(`ai-categorize:${householdId}`, () => runCategorization(householdId, db));
}

async function runCategorization(
  householdId: string,
  db: LedgrDb,
): Promise<CategorizationRun> {
  const config = getAiConfig();
  const model = createAiModel();
  if (!config || !model) return { categorized: 0, lowConfidence: 0, skipped: 0 };

  // Short-lived transaction — not held open across the batched LLM calls below.
  const initial = await withHousehold(householdId, async (tx) => {
    const uncategorizedRows = await tx
      .select({
        id: transactions.id,
        name: transactions.name,
        normalizedAmount: transactions.normalizedAmount,
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

  if (!initial) return { categorized: 0, lowConfidence: 0, skipped: 0 };
  const { uncategorizedRows: uncategorized, catRows: cats, groupRows: groups, exampleTxnRows: exampleRows } = initial;

  const groupMap = new Map(groups.map((g) => [g.id, g.name]));

  const categoryInfos: CategoryInfo[] = cats.map((c) => ({
    id: c.id,
    name: c.name,
    groupName: groupMap.get(c.groupId) ?? "Other",
  }));
  const validCategoryIds = new Set(cats.map((c) => c.id));
  const incomeCategoryIds = new Set(cats.filter((c) => c.isIncome).map((c) => c.id));

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
  let lowConfidence = 0;
  const now = new Date();

  for (let i = 0; i < uncategorized.length; i += batchSize) {
    const batch = uncategorized.slice(i, i + batchSize);
    const batchInputs: CategorizationInput[] = batch.map((t) => ({
      id: t.id,
      description: t.name,
      normalizedAmount: t.normalizedAmount,
    }));
    const batchIds = new Set(batch.map((t) => t.id));
    const incomeTxnIds = new Set(batch.filter((t) => t.normalizedAmount > 0).map((t) => t.id));

    let picks: z.infer<typeof categorizationSchema>["assignments"] = [];
    // Only a batch the model actually answered gets stamped below. A thrown
    // call or an unparseable response must leave aiCategorizationAttemptedAt
    // NULL, or one transient provider blip permanently retires those rows —
    // the uncategorized scan at the top of this function filters on that
    // column being NULL, so a burnt row is never offered to the AI again.
    let modelAnswered = false;
    try {
      const { output } = await generateText({
        model,
        output: Output.object({ schema: categorizationSchema }),
        instructions:
          "You are a financial transaction categorization assistant. Always commit " +
          "to the closest category for every transaction, and use the confidence " +
          "score — not omission — to express uncertainty.",
        prompt: buildCategorizationPrompt(batchInputs, categoryInfos, examples),
      });

      if (output) {
        const validated = validateAssignments(
          output.assignments,
          validCategoryIds,
          batchIds,
          incomeCategoryIds,
          incomeTxnIds,
        );
        // Every validated pick is applied, including the unsure ones. An
        // uncategorized row costs the user an edit regardless, so the model's
        // closest guess can only save work: right, and they keep it; wrong,
        // and they were going to set it by hand anyway. `threshold` no longer
        // discards anything — it decides which provenance the pick is filed
        // under.
        picks = validated;
        modelAnswered = true;
      } else {
        console.error(
          "AI categorization batch returned no output — leaving rows unstamped for retry",
        );
      }
    } catch (e) {
      console.error(`AI categorization batch failed:`, e);
    }

    // Group by (categoryId, source) so each distinct pair is one UPDATE over
    // inArray(ids) rather than one UPDATE per transaction.
    const groups = new Map<string, { categoryId: string; source: CategorySource; ids: string[] }>();
    for (const a of picks) {
      const source: CategorySource = a.confidence >= threshold ? "ai" : "ai_low_confidence";
      const key = `${a.categoryId}\0${source}`;
      const group = groups.get(key);
      if (group) group.ids.push(a.transactionId);
      else groups.set(key, { categoryId: a.categoryId, source, ids: [a.transactionId] });
    }

    if (modelAnswered || groups.size > 0) {
      await withHousehold(householdId, async (tx) => {
        for (const group of groups.values()) {
          await tx.update(transactions)
            .set({ categoryId: group.categoryId, categorySource: group.source, updatedAt: now })
            .where(inArray(transactions.id, group.ids));
        }
        // A batch the model actually answered is stamped whole — including
        // any row it returned no pick for at all, which is a real verdict and
        // must not be resent every sync. Failed batches fall through
        // unstamped so the next run retries them.
        if (modelAnswered) {
          await tx.update(transactions)
            .set({ aiCategorizationAttemptedAt: now })
            .where(inArray(transactions.id, [...batchIds]));
        }
      }, db);
    }
    categorized += picks.length;
    lowConfidence += picks.filter((a) => a.confidence < threshold).length;
  }

  return { categorized, lowConfidence, skipped: uncategorized.length - categorized };
}
