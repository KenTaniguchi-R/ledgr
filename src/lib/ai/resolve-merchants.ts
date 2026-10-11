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
import { withHousehold } from "@/lib/household-context";
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

/**
 * Comparison key for a raw transaction description. Tokens carrying a digit
 * are dropped so per-charge reference suffixes ("Cloudflare St-t9v3j2d5z7d6",
 * "Lawson 1234") collapse onto the same key as earlier charges. A name that is
 * nothing but such tokens ("7-Eleven") keeps its full form instead.
 */
export function merchantNameKey(raw: string): string {
  const tokens = raw.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const stable = tokens.filter((t) => !/\d/.test(t));
  return (stable.length > 0 ? stable : tokens).join(" ");
}

/**
 * Maps every known spelling of each merchant (its display name and every raw
 * description already linked to it) to that merchant. A key two merchants
 * both claim maps to null — ambiguous, so it's left for the model to decide.
 */
export function buildMerchantNameIndex(
  known: { id: string; name: string; rawNames: string | null }[],
): Map<string, string | null> {
  const index = new Map<string, string | null>();
  for (const m of known) {
    const spellings = [m.name, ...(m.rawNames ? (JSON.parse(m.rawNames) as string[]) : [])];
    for (const spelling of spellings) {
      const key = merchantNameKey(spelling);
      if (!key) continue;
      const claimed = index.get(key);
      if (claimed === undefined) index.set(key, m.id);
      else if (claimed !== m.id) index.set(key, null);
    }
  }
  return index;
}

/**
 * Links unlinked transactions whose description is a spelling the household
 * already has a merchant for — no model call needed, so a repeat charge keeps
 * its logo even while the AI provider is down. Runs over every unlinked row,
 * including ones the AI pass already gave up on: there is no user action that
 * unlinks a merchant, so a NULL merchantId never encodes a deliberate choice.
 */
async function linkKnownMerchantNames(householdId: string, db: LedgrDb): Promise<number> {
  return withHousehold(householdId, async (tx) => {
    const unlinked = await tx
      .select({ id: transactions.id, name: transactions.name })
      .from(transactions)
      .where(
        and(
          eq(transactions.householdId, householdId),
          isNull(transactions.merchantId),
          notDeleted(transactions),
        ),
      );
    if (unlinked.length === 0) return 0;

    const known = await tx
      .select({ id: merchants.id, name: merchants.name, rawNames: merchants.rawNames })
      .from(merchants)
      .where(eq(merchants.householdId, householdId));
    const index = buildMerchantNameIndex(known);

    const txnIdsByMerchantId = new Map<string, string[]>();
    for (const t of unlinked) {
      const merchantId = index.get(merchantNameKey(t.name));
      if (!merchantId) continue;
      const ids = txnIdsByMerchantId.get(merchantId);
      if (ids) ids.push(t.id);
      else txnIdsByMerchantId.set(merchantId, [t.id]);
    }

    const now = new Date();
    let linked = 0;
    for (const [merchantId, ids] of txnIdsByMerchantId) {
      await tx.update(transactions)
        .set({ merchantId, updatedAt: now })
        .where(inArray(transactions.id, ids));
      linked += ids.length;
    }
    return linked;
  }, db);
}

async function runMerchantResolution(
  householdId: string,
  db: LedgrDb,
): Promise<{ resolved: number; skipped: number }> {
  const linkedByName = await linkKnownMerchantNames(householdId, db);

  const config = getAiConfig();
  const model = createAiModel();
  if (!config || !model) return { resolved: linkedByName, skipped: 0 };

  // Short-lived transaction — not held open across the batched LLM calls below.
  const candidates = await withHousehold(householdId, (tx) =>
    tx
      .select({ id: transactions.id, name: transactions.name })
      .from(transactions)
      .where(
        and(
          eq(transactions.householdId, householdId),
          isNull(transactions.merchantId),
          isNull(transactions.merchantResolutionAttemptedAt),
          notDeleted(transactions),
        ),
      ),
  db);

  if (candidates.length === 0) return { resolved: linkedByName, skipped: 0 };

  const batchSize = getBatchSize(config.aiProvider);
  const now = new Date();
  let resolved = 0;

  for (let i = 0; i < candidates.length; i += batchSize) {
    const batch = candidates.slice(i, i + batchSize);
    const batchIds = new Set(batch.map((t) => t.id));
    const rawNameByTxnId = new Map(batch.map((t) => [t.id, t.name]));

    let validated: Identifications = [];
    // Same contract as categorizeWithAi: only a batch the model actually
    // answered is stamped attempted. A thrown call (provider outage, depleted
    // credits) or an empty response leaves the rows NULL so the next sync
    // retries them — stamping them anyway retired a week of rows for good
    // the last time a provider's credits ran out.
    let modelAnswered = false;
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
        modelAnswered = true;
      } else {
        console.error(
          "AI merchant resolution batch returned no output — leaving rows unstamped for retry",
        );
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

    if (modelAnswered) {
      await withHousehold(householdId, async (tx) => {
        for (const [merchantId, ids] of txnIdsByMerchantId) {
          await tx.update(transactions)
            .set({ merchantId, updatedAt: now })
            .where(inArray(transactions.id, ids));
        }
        await tx.update(transactions)
          .set({ merchantResolutionAttemptedAt: now })
          .where(inArray(transactions.id, [...batchIds]));
      }, db);
    }
    resolved += merchantIdByTxnId.size;
  }

  return { resolved: linkedByName + resolved, skipped: candidates.length - resolved };
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
 * guess) is reused as-is rather than re-fetching its logo. Every raw
 * description linked here is recorded in the merchant's rawNames, which is
 * what lets linkKnownMerchantNames match the next charge without the model.
 */
async function linkOrCreateMerchants(
  db: LedgrDb,
  householdId: string,
  candidates: MerchantCandidate[],
): Promise<Map<string, string>> {
  const merchantIdByTxnId = new Map<string, string>();
  if (candidates.length === 0) return merchantIdByTxnId;

  const uniqueByName = new Map<string, MerchantCandidate>();
  const rawNamesByName = new Map<string, Set<string>>();
  for (const c of candidates) {
    if (!uniqueByName.has(c.name)) uniqueByName.set(c.name, c);
    const raws = rawNamesByName.get(c.name);
    if (raws) raws.add(c.rawName);
    else rawNamesByName.set(c.name, new Set([c.rawName]));
  }

  // Short-lived — not held open across the per-candidate favicon fetches
  // (network I/O) below.
  const existing = await withHousehold(householdId, (tx) =>
    tx
      .select({
        id: merchants.id,
        name: merchants.name,
        logoUrl: merchants.logoUrl,
        rawNames: merchants.rawNames,
      })
      .from(merchants)
      .where(
        and(
          eq(merchants.householdId, householdId),
          inArray(merchants.name, [...uniqueByName.keys()]),
        ),
      ),
  db);
  const existingByName = new Map(existing.map((m) => [m.name, m]));

  const merchantIdByName = new Map<string, string>();
  const now = new Date();

  await Promise.all(
    [...uniqueByName.entries()].map(async ([name, candidate]) => {
      const newRawNames = rawNamesByName.get(name) ?? new Set([candidate.rawName]);
      const found = existingByName.get(name);
      if (found) {
        merchantIdByName.set(name, found.id);
        const knownRaw: string[] = found.rawNames ? JSON.parse(found.rawNames) : [];
        const mergedRaw = [...new Set([...knownRaw, ...newRawNames])];
        const logo = found.logoUrl ? null : await fetchFaviconDataUri(candidate.domain);
        if (logo || mergedRaw.length > knownRaw.length) {
          await withHousehold(householdId, (tx) =>
            tx.update(merchants)
              .set({
                rawNames: JSON.stringify(mergedRaw),
                ...(logo ? { logoUrl: logo } : {}),
                updatedAt: now,
              })
              .where(eq(merchants.id, found.id)),
          db);
        }
        return;
      }

      const logo = await fetchFaviconDataUri(candidate.domain);
      const id = uuid();
      await withHousehold(householdId, (tx) =>
        tx.insert(merchants).values({
          id,
          householdId,
          name,
          rawNames: JSON.stringify([...newRawNames]),
          logoUrl: logo,
          createdAt: now,
          updatedAt: now,
        }),
      db);
      merchantIdByName.set(name, id);
    }),
  );

  for (const c of candidates) {
    const merchantId = merchantIdByName.get(c.name);
    if (merchantId) merchantIdByTxnId.set(c.transactionId, merchantId);
  }

  return merchantIdByTxnId;
}
