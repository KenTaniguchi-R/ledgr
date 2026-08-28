import { generateText, Output } from "ai";
import { z } from "zod";
import { v4 as uuid } from "uuid";
import { eq, and, isNull, inArray } from "drizzle-orm";
import { db as defaultDb, type LedgrDb } from "@/db";
import { transactions, merchants } from "@/db/schema";
import { notDeleted } from "@/lib/query-helpers";
import { titleCase } from "@/lib/text-utils";
import { fetchFaviconDataUri } from "@/lib/favicon";
import { coalesce } from "@/lib/coalesce";
import { getAiConfig, createAiModel } from "./config";
import { getBatchSize } from "./categorize";

const merchantResolutionSchema = z.object({
  identifications: z.array(
    z.object({
      transactionId: z.string(),
      merchantName: z
        .string()
        .nullable()
        .describe(
          "Clean brand name if this transaction is confidently identifiable as a specific commercial merchant, else null.",
        ),
      merchantDomain: z
        .string()
        .nullable()
        .describe(
          "The merchant's primary website domain (e.g. \"fedex.com\"), used only to fetch a logo. Null if merchantName is null.",
        ),
    }),
  ),
});

type Identifications = z.infer<typeof merchantResolutionSchema>["identifications"];

interface MerchantResolutionInput {
  id: string;
  description: string;
}

export function buildMerchantResolutionPrompt(txns: MerchantResolutionInput[]): string {
  let prompt =
    "For each transaction below, identify the specific commercial merchant/brand it was with, " +
    "so we can fetch that brand's logo.\n\n";

  prompt += "## Transactions\n";
  for (const txn of txns) {
    prompt += `- ID: "${txn.id}" | "${txn.description}"\n`;
  }

  prompt +=
    "\nSet merchantName and merchantDomain ONLY when the description confidently names a specific " +
    "commercial brand with its own website. Set both to null for anything else — internal transfers " +
    "between the user's own accounts, fees, consular/government charges, generic service descriptors, " +
    "or a description you don't recognize as a real company. Be conservative: a wrong guess is worse " +
    "than no guess.";

  return prompt;
}

export function validateIdentifications(
  identifications: Identifications,
  batchTransactionIds: Set<string>,
): Identifications {
  return identifications.filter((i) => batchTransactionIds.has(i.transactionId));
}

// Hostnames only — guards the favicon fetch from a malformed or hallucinated
// domain string before it's used to build a URL.
const DOMAIN_PATTERN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i;

export function isPlausibleDomain(domain: string): boolean {
  return DOMAIN_PATTERN.test(domain);
}

/**
 * Resolves a merchant identity (and its logo) for any transaction that has
 * neither — independent of category state. This is deliberately its own
 * pass, gated only on merchantId/merchantResolutionAttemptedAt: a
 * transaction already categorized via rule/PFC (which never touches
 * merchantId) still needs this to ever get a logo, and a transaction the
 * model correctly can't identify still needs to be marked "attempted" so
 * it isn't re-guessed every sync.
 */
// Household-scoped, and invoked once per synced connection — coalesced so
// several connections syncing in parallel (the "sync all" button) share a
// single run instead of each racing over the same unresolved rows and
// paying for duplicate AI calls.
export function resolveMerchantLogos(
  householdId: string,
  db: LedgrDb = defaultDb,
): Promise<{ resolved: number; skipped: number }> {
  return coalesce(`ai-resolve-merchants:${householdId}`, () => runMerchantResolution(householdId, db));
}

async function runMerchantResolution(
  householdId: string,
  db: LedgrDb,
): Promise<{ resolved: number; skipped: number }> {
  const config = getAiConfig();
  const model = createAiModel();
  if (!config || !model) return { resolved: 0, skipped: 0 };

  const candidates = await db
    .select({ id: transactions.id, name: transactions.name })
    .from(transactions)
    .where(
      and(
        eq(transactions.householdId, householdId),
        isNull(transactions.merchantId),
        isNull(transactions.merchantResolutionAttemptedAt),
        notDeleted(transactions),
      ),
    );

  if (candidates.length === 0) return { resolved: 0, skipped: 0 };

  const batchSize = getBatchSize(config.aiProvider);
  const now = new Date();
  let resolved = 0;

  for (let i = 0; i < candidates.length; i += batchSize) {
    const batch = candidates.slice(i, i + batchSize);
    const batchIds = new Set(batch.map((t) => t.id));
    const rawNameByTxnId = new Map(batch.map((t) => [t.id, t.name]));

    let validated: Identifications = [];
    try {
      const { output } = await generateText({
        model,
        output: Output.object({ schema: merchantResolutionSchema }),
        instructions:
          "You identify commercial merchants from raw bank transaction descriptions. Be precise and conservative.",
        prompt: buildMerchantResolutionPrompt(
          batch.map((t) => ({ id: t.id, description: t.name })),
        ),
      });

      if (output) {
        validated = validateIdentifications(output.identifications, batchIds);
      }
    } catch (e) {
      console.error(`AI merchant resolution batch failed:`, e);
    }

    const merchantCandidates = validated
      .filter(
        (i): i is Identifications[number] & { merchantName: string; merchantDomain: string } =>
          !!i.merchantName && !!i.merchantDomain && isPlausibleDomain(i.merchantDomain),
      )
      .map((i) => ({
        transactionId: i.transactionId,
        name: titleCase(i.merchantName),
        domain: i.merchantDomain,
        rawName: rawNameByTxnId.get(i.transactionId) ?? i.merchantName,
      }));

    const merchantIdByTxnId = await linkOrCreateMerchants(db, householdId, merchantCandidates);

    const txnIdsByMerchantId = new Map<string, string[]>();
    for (const [transactionId, merchantId] of merchantIdByTxnId) {
      const ids = txnIdsByMerchantId.get(merchantId);
      if (ids) ids.push(transactionId);
      else txnIdsByMerchantId.set(merchantId, [transactionId]);
    }

    await db.transaction(async (tx) => {
      for (const [merchantId, ids] of txnIdsByMerchantId) {
        await tx.update(transactions)
          .set({ merchantId, updatedAt: now })
          .where(inArray(transactions.id, ids));
      }
      await tx.update(transactions)
        .set({ merchantResolutionAttemptedAt: now })
        .where(inArray(transactions.id, [...batchIds]));
    });
    resolved += merchantIdByTxnId.size;
  }

  return { resolved, skipped: candidates.length - resolved };
}

interface MerchantCandidate {
  transactionId: string;
  name: string;
  domain: string;
  rawName: string;
}

/**
 * Links each candidate to a merchant row, creating one and fetching its logo
 * (favicon-by-domain) only when the household doesn't already have that
 * merchant — a brand already resolved via Plaid enrichment (or a prior AI
 * guess) is reused as-is rather than re-fetching its logo.
 */
async function linkOrCreateMerchants(
  db: LedgrDb,
  householdId: string,
  candidates: MerchantCandidate[],
): Promise<Map<string, string>> {
  const merchantIdByTxnId = new Map<string, string>();
  if (candidates.length === 0) return merchantIdByTxnId;

  const uniqueByName = new Map<string, MerchantCandidate>();
  for (const c of candidates) {
    if (!uniqueByName.has(c.name)) uniqueByName.set(c.name, c);
  }

  const existing = await db
    .select({ id: merchants.id, name: merchants.name, logoUrl: merchants.logoUrl })
    .from(merchants)
    .where(
      and(
        eq(merchants.householdId, householdId),
        inArray(merchants.name, [...uniqueByName.keys()]),
      ),
    );
  const existingByName = new Map(existing.map((m) => [m.name, m]));

  const merchantIdByName = new Map<string, string>();
  const now = new Date();

  await Promise.all(
    [...uniqueByName.entries()].map(async ([name, candidate]) => {
      const found = existingByName.get(name);
      if (found) {
        merchantIdByName.set(name, found.id);
        if (!found.logoUrl) {
          const logo = await fetchFaviconDataUri(candidate.domain);
          if (logo) {
            await db.update(merchants)
              .set({ logoUrl: logo, updatedAt: now })
              .where(eq(merchants.id, found.id));
          }
        }
        return;
      }

      const logo = await fetchFaviconDataUri(candidate.domain);
      const id = uuid();
      await db.insert(merchants).values({
        id,
        householdId,
        name,
        rawNames: JSON.stringify([candidate.rawName]),
        logoUrl: logo,
        createdAt: now,
        updatedAt: now,
      });
      merchantIdByName.set(name, id);
    }),
  );

  for (const c of candidates) {
    const merchantId = merchantIdByName.get(c.name);
    if (merchantId) merchantIdByTxnId.set(c.transactionId, merchantId);
  }

  return merchantIdByTxnId;
}
