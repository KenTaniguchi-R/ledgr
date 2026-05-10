# PFC → Category Mapping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Map Plaid's PFC detailed codes to internal categories via a new tier in the categorization engine, so transactions get auto-categorized on sync.

**Architecture:** Static `Record<string, string>` maps PFC detailed codes to seed category names. The categorization engine gains a third tier (after rules and merchant default) that resolves PFC codes to household-scoped category IDs at runtime. A new `categorySource` column tracks how each category was assigned.

**Tech Stack:** TypeScript, Drizzle ORM, SQLite, Vitest, fast-check

---

### Task 1: Schema — Add `pfcDetailed` and `categorySource` columns

**Files:**
- Modify: `src/db/schema/transactions.ts:41` (after `pfcPrimary`)

- [ ] **Step 1: Add the two new columns to the schema**

In `src/db/schema/transactions.ts`, add two columns after line 41 (`pfcPrimary`):

```ts
pfcDetailed: text("pfc_detailed"),
categorySource: text("category_source"),
```

The full block around the insertion point should look like:

```ts
    aiCategorizationAttemptedAt: text("ai_categorization_attempted_at"),
    pfcPrimary: text("pfc_primary"),
    pfcDetailed: text("pfc_detailed"),
    categorySource: text("category_source"),
  },
```

- [ ] **Step 2: Generate the migration**

Run: `pnpm db:generate`

Expected: A new migration file appears in `src/db/migrations/` with `ALTER TABLE transactions ADD COLUMN pfc_detailed text` and `ALTER TABLE transactions ADD COLUMN category_source text`.

- [ ] **Step 3: Run the migration**

Run: `pnpm db:migrate`

Expected: Migration applies successfully. Existing rows get `null` for both new columns.

- [ ] **Step 4: Verify typecheck passes**

Run: `pnpm typecheck`

Expected: PASS — the new columns are optional (nullable by default in SQLite).

- [ ] **Step 5: Commit**

```bash
git add src/db/schema/transactions.ts src/db/migrations/
git commit -m "feat(pfc): add pfcDetailed and categorySource columns to transactions"
```

---

### Task 2: Plaid schema — Capture `pfcDetailed` and request PFC v2

**Files:**
- Modify: `src/lib/plaid/schemas.ts:14-21` (PlaidTransactionSchema personal_finance_category)
- Modify: `src/lib/plaid/sync.ts:59-73` (TransactionRow interface)
- Modify: `src/lib/plaid/sync.ts:160-178` (toRow function)
- Modify: `src/lib/plaid/sync.ts:96-107` (fetchAllPages request body)
- Modify: `src/lib/plaid/sync.ts:317-338` (applyToDb insert block)
- Modify: `src/lib/plaid/sync.ts:379-400` (applyToDb upsert-insert fallback)
- Modify: `src/lib/plaid/sync.ts:361-378` (applyToDb update block)

- [ ] **Step 1: Make `detailed` optional in the Zod schema**

In `src/lib/plaid/schemas.ts`, replace lines 14-21:

```ts
  personal_finance_category: z
    .object({
      primary: z.string(),
      detailed: z.string(),
    })
    .nullable()
    .optional(),
```

with:

```ts
  personal_finance_category: z
    .object({
      primary: z.string(),
      detailed: z.string().optional(),
      confidence_level: z.string().optional(),
    })
    .nullable()
    .optional(),
```

- [ ] **Step 2: Add `pfcDetailed` to `TransactionRow` interface**

In `src/lib/plaid/sync.ts`, find the `TransactionRow` interface (lines 59-73). Add after `pfcPrimary: string | null;`:

```ts
  pfcDetailed: string | null;
```

- [ ] **Step 3: Extract `pfcDetailed` in `toRow()`**

In `src/lib/plaid/sync.ts`, find the `toRow()` function. After the line `pfcPrimary: txn.personal_finance_category?.primary ?? null,` (line 177), add:

```ts
      pfcDetailed: txn.personal_finance_category?.detailed ?? null,
```

- [ ] **Step 4: Request PFC v2 in `fetchAllPages()`**

In `src/lib/plaid/sync.ts`, find the `fetchAllPages` function (line 85). Replace the `requestBody` construction (lines 97-101):

```ts
    const requestBody: { access_token: string; cursor?: string } = {
      access_token: accessToken,
    };
    if (currentCursor !== null) {
      requestBody.cursor = currentCursor;
    }
```

with:

```ts
    const requestBody: {
      access_token: string;
      cursor?: string;
      options?: { include_personal_finance_category: boolean };
    } = {
      access_token: accessToken,
      options: { include_personal_finance_category: true },
    };
    if (currentCursor !== null) {
      requestBody.cursor = currentCursor;
    }
```

Note: For `transactionsSync`, the Plaid Node SDK uses `options.include_personal_finance_category: true` to opt in to PFC data. This is different from the REST API's `personal_finance_category_version` parameter.

- [ ] **Step 5: Write `pfcDetailed` in `applyToDb()` insert block**

In `src/lib/plaid/sync.ts`, find the transaction insert block (~line 317). Add `pfcDetailed: row.pfcDetailed,` after the `pfcPrimary: row.pfcPrimary,` line in the `.values({...})` call.

- [ ] **Step 6: Write `pfcDetailed` in `applyToDb()` upsert update block**

In the update path for modified transactions (~line 361), add `pfcDetailed: row.pfcDetailed,` to the `.set({...})` call alongside `pfcPrimary: row.pfcPrimary,`.

- [ ] **Step 7: Write `pfcDetailed` in `applyToDb()` upsert-insert fallback**

In the fallback insert for modified transactions that don't exist (~line 379), add `pfcDetailed: row.pfcDetailed,` after `pfcPrimary: row.pfcPrimary,`.

- [ ] **Step 8: Verify typecheck passes**

Run: `pnpm typecheck`

Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add src/lib/plaid/schemas.ts src/lib/plaid/sync.ts
git commit -m "feat(pfc): capture pfcDetailed from Plaid and request PFC v2"
```

---

### Task 3: Static PFC map — Create `pfc-map.ts` with tests (TDD)

**Files:**
- Create: `src/lib/categorization/pfc-map.ts`
- Create: `src/lib/categorization/pfc-map.test.ts`

- [ ] **Step 1: Write the failing test file**

Create `src/lib/categorization/pfc-map.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { test } from "@fast-check/vitest";
import * as fc from "fast-check";
import { PFC_DETAILED_TO_CATEGORY, pfcToCategoryName } from "./pfc-map";
import { DEFAULT_CATEGORIES } from "@/db/seed/categories";

const ALL_SEED_NAMES = DEFAULT_CATEGORIES.flatMap((g) =>
  g.categories.map((c) => c.name),
);

describe("PFC_DETAILED_TO_CATEGORY", () => {
  test.prop([fc.constantFrom(...Object.keys(PFC_DETAILED_TO_CATEGORY))])(
    "every mapped PFC code resolves to a known seed category name",
    (pfcCode) => {
      const name = pfcToCategoryName(pfcCode);
      expect(ALL_SEED_NAMES).toContain(name);
    },
  );

  it("returns null for unknown PFC codes", () => {
    expect(pfcToCategoryName("TOTALLY_UNKNOWN_CODE")).toBeNull();
    expect(pfcToCategoryName("")).toBeNull();
  });

  it("covers at least 60 PFC codes", () => {
    const count = Object.keys(PFC_DETAILED_TO_CATEGORY).length;
    expect(count).toBeGreaterThanOrEqual(60);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/lib/categorization/pfc-map.test.ts`

Expected: FAIL — `pfc-map` module not found.

- [ ] **Step 3: Create the PFC map module**

Create `src/lib/categorization/pfc-map.ts`:

```ts
export const PFC_DETAILED_TO_CATEGORY: Record<string, string> = {
  // Income
  INCOME_DIVIDENDS: "Investment Income",
  INCOME_INTEREST_EARNED: "Investment Income",
  INCOME_WAGES: "Salary",
  INCOME_RETIREMENT_PENSION: "Other Income",
  INCOME_TAX_REFUND: "Other Income",
  INCOME_UNEMPLOYMENT: "Other Income",
  INCOME_OTHER_INCOME: "Other Income",

  // Housing
  RENT_AND_UTILITIES_RENT: "Rent/Mortgage",
  LOAN_PAYMENTS_MORTGAGE_PAYMENT: "Rent/Mortgage",
  HOME_IMPROVEMENT_REPAIR_AND_MAINTENANCE: "Maintenance",
  HOME_IMPROVEMENT_HARDWARE: "Maintenance",
  HOME_IMPROVEMENT_FURNITURE: "Home Goods",

  // Food & Dining
  FOOD_AND_DRINK_RESTAURANTS: "Restaurants",
  FOOD_AND_DRINK_FAST_FOOD: "Restaurants",
  FOOD_AND_DRINK_GROCERIES: "Groceries",
  FOOD_AND_DRINK_COFFEE: "Coffee Shops",
  FOOD_AND_DRINK_BEER_WINE_AND_LIQUOR: "Restaurants",
  FOOD_AND_DRINK_VENDING_MACHINES: "Restaurants",
  FOOD_AND_DRINK_OTHER_FOOD_AND_DRINK: "Restaurants",

  // Transportation
  TRANSPORTATION_GAS: "Gas",
  TRANSPORTATION_PUBLIC_TRANSIT: "Public Transit",
  TRANSPORTATION_PARKING: "Parking",
  TRANSPORTATION_TOLLS: "Parking",
  TRANSPORTATION_RIDE_SHARE: "Public Transit",
  TRANSPORTATION_TAXIS: "Public Transit",
  TRANSPORTATION_OTHER_TRANSPORTATION: "Public Transit",
  LOAN_PAYMENTS_CAR_PAYMENT: "Car Payment",

  // Utilities
  RENT_AND_UTILITIES_ELECTRIC: "Electric",
  RENT_AND_UTILITIES_WATER: "Water",
  RENT_AND_UTILITIES_INTERNET_AND_CABLE: "Internet",
  RENT_AND_UTILITIES_TELEPHONE: "Phone",
  RENT_AND_UTILITIES_GAS: "Electric",
  RENT_AND_UTILITIES_SEWAGE_AND_WASTE_MANAGEMENT: "Water",
  RENT_AND_UTILITIES_OTHER_UTILITIES: "Electric",

  // Shopping
  GENERAL_MERCHANDISE_CLOTHING_AND_ACCESSORIES: "Clothing",
  GENERAL_MERCHANDISE_ELECTRONICS: "Electronics",
  GENERAL_MERCHANDISE_DEPARTMENT_STORES: "Home Goods",
  GENERAL_MERCHANDISE_DISCOUNT_STORES: "Home Goods",
  GENERAL_MERCHANDISE_SUPERSTORES: "Home Goods",
  GENERAL_MERCHANDISE_GIFTS_AND_NOVELTIES: "Gifts",
  GENERAL_MERCHANDISE_ONLINE_MARKETPLACES: "Home Goods",
  GENERAL_MERCHANDISE_SPORTING_GOODS: "Home Goods",
  GENERAL_MERCHANDISE_OTHER_GENERAL_MERCHANDISE: "Home Goods",

  // Health
  MEDICAL_HEALTH_INSURANCE: "Health Insurance",
  MEDICAL_DENTIST_AND_OPTOMETRIST: "Medical",
  MEDICAL_DOCTOR: "Medical",
  MEDICAL_HOSPITAL: "Medical",
  MEDICAL_PHARMACY: "Pharmacy",
  MEDICAL_VETERINARY_SERVICES: "Medical",
  MEDICAL_OTHER_MEDICAL: "Medical",
  PERSONAL_CARE_GYMS_AND_FITNESS_CENTERS: "Fitness",
  PERSONAL_CARE_HAIR_AND_BEAUTY: "Entertainment",
  PERSONAL_CARE_OTHER_PERSONAL_CARE: "Entertainment",

  // Personal
  ENTERTAINMENT_MUSIC_AND_AUDIO: "Entertainment",
  ENTERTAINMENT_MOVIES_AND_DVDS: "Entertainment",
  ENTERTAINMENT_GAMES: "Entertainment",
  ENTERTAINMENT_SPORTING_EVENTS_AMUSEMENT_PARKS_AND_MUSEUMS: "Entertainment",
  ENTERTAINMENT_CASINOS_AND_GAMBLING: "Entertainment",
  ENTERTAINMENT_TV_AND_MOVIES: "Subscriptions",
  ENTERTAINMENT_OTHER_ENTERTAINMENT: "Entertainment",
  GENERAL_SERVICES_EDUCATION: "Education",
  LOAN_PAYMENTS_STUDENT_LOAN_PAYMENT: "Education",
  LOAN_PAYMENTS_PERSONAL_LOAN_PAYMENT: "Other Income",
  TRAVEL_FLIGHTS: "Travel",
  TRAVEL_LODGING: "Travel",
  TRAVEL_RENTAL_CARS: "Travel",
  TRAVEL_OTHER_TRAVEL: "Travel",
};

export function pfcToCategoryName(pfcDetailed: string): string | null {
  return PFC_DETAILED_TO_CATEGORY[pfcDetailed] ?? null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test src/lib/categorization/pfc-map.test.ts`

Expected: PASS — all 3 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/categorization/pfc-map.ts src/lib/categorization/pfc-map.test.ts
git commit -m "feat(pfc): add static PFC detailed-to-category map with tests"
```

---

### Task 4: Engine — Add PFC tier to the pure function (TDD)

**Files:**
- Modify: `src/lib/categorization/engine.ts:1-65` (types and pure function)
- Modify: `src/lib/categorization/engine.test.ts` (add PFC tests, update factory)

- [ ] **Step 1: Update `makeTxn()` factory and write PFC tier tests**

In `src/lib/categorization/engine.test.ts`, update the `makeTxn` function (line 10-19) to include `pfcDetailed`:

```ts
function makeTxn(overrides: Partial<CategorizableTransaction> = {}): CategorizableTransaction {
  return {
    id: "txn-1",
    name: "Whole Foods Market",
    merchantId: null,
    merchantName: null,
    merchantCategoryId: null,
    pfcDetailed: null,
    ...overrides,
  };
}
```

Then add these tests inside the `describe("categorizeTransactions")` block, after the existing tests (before the closing `});` on line 131):

```ts
  it("falls back to PFC mapping when no rule or merchant default matches", () => {
    const pfcMap = new Map([["FOOD_AND_DRINK_GROCERIES", "cat-groceries"]]);
    const txns = [makeTxn({ name: "Random Store", pfcDetailed: "FOOD_AND_DRINK_GROCERIES" })];
    const rules = [makeRule({ matchPattern: "no-match" })];

    const result = categorizeTransactions(txns, rules, pfcMap);

    expect(result).toHaveLength(1);
    expect(result[0].categoryId).toBe("cat-groceries");
    expect(result[0].source).toBe("pfc");
  });

  it("rule takes priority over PFC mapping", () => {
    const pfcMap = new Map([["FOOD_AND_DRINK_GROCERIES", "cat-pfc"]]);
    const txns = [makeTxn({ name: "Whole Foods", pfcDetailed: "FOOD_AND_DRINK_GROCERIES" })];
    const rules = [makeRule({ matchPattern: "whole foods", categoryId: "cat-rule" })];

    const result = categorizeTransactions(txns, rules, pfcMap);

    expect(result).toHaveLength(1);
    expect(result[0].categoryId).toBe("cat-rule");
    expect(result[0].source).toBe("rule");
  });

  it("merchant default takes priority over PFC mapping", () => {
    const pfcMap = new Map([["FOOD_AND_DRINK_GROCERIES", "cat-pfc"]]);
    const txns = [makeTxn({
      name: "Unknown",
      merchantCategoryId: "cat-merchant",
      merchantId: "m-1",
      pfcDetailed: "FOOD_AND_DRINK_GROCERIES",
    })];

    const result = categorizeTransactions(txns, [], pfcMap);

    expect(result).toHaveLength(1);
    expect(result[0].categoryId).toBe("cat-merchant");
    expect(result[0].source).toBe("merchant_default");
  });

  it("skips PFC mapping when pfcDetailed is null", () => {
    const pfcMap = new Map([["FOOD_AND_DRINK_GROCERIES", "cat-pfc"]]);
    const txns = [makeTxn({ name: "Unknown", pfcDetailed: null })];

    const result = categorizeTransactions(txns, [], pfcMap);

    expect(result).toHaveLength(0);
  });

  it("skips PFC mapping when pfcDetailed is not in the map", () => {
    const pfcMap = new Map([["FOOD_AND_DRINK_GROCERIES", "cat-pfc"]]);
    const txns = [makeTxn({ name: "Unknown", pfcDetailed: "TRANSFER_IN_ACCOUNT_TRANSFER" })];

    const result = categorizeTransactions(txns, [], pfcMap);

    expect(result).toHaveLength(0);
  });

  it("works with empty PFC map (backward compatible)", () => {
    const txns = [makeTxn({ name: "Store", pfcDetailed: "FOOD_AND_DRINK_GROCERIES" })];

    const result = categorizeTransactions(txns, []);

    expect(result).toHaveLength(0);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test src/lib/categorization/engine.test.ts`

Expected: FAIL — `pfcDetailed` does not exist in `CategorizableTransaction`, PFC tests fail with wrong results.

- [ ] **Step 3: Update the types in `engine.ts`**

In `src/lib/categorization/engine.ts`, update the `CategorizableTransaction` interface (lines 7-13) to add `pfcDetailed`:

```ts
export interface CategorizableTransaction {
  id: string;
  name: string;
  merchantId: string | null;
  merchantName: string | null;
  merchantCategoryId: string | null;
  pfcDetailed: string | null;
}
```

Update the `CategoryAssignment` interface (lines 22-26) to use a union type for `source`:

```ts
export interface CategoryAssignment {
  transactionId: string;
  categoryId: string;
  source: "rule" | "merchant_default" | "pfc";
}
```

- [ ] **Step 4: Add PFC tier to the pure function**

In `src/lib/categorization/engine.ts`, update the `categorizeTransactions` function signature (line 29) to accept an optional PFC map:

```ts
export function categorizeTransactions(
  transactions: CategorizableTransaction[],
  rules: CategoryRule[],
  pfcCategoryMap: Map<string, string> = new Map(),
): CategoryAssignment[] {
```

Then, after the merchant_default fallback (after line 60, before the closing `}` of the `for` loop), add the PFC tier:

```ts
    if (!matched && txn.pfcDetailed) {
      const pfcCategoryId = pfcCategoryMap.get(txn.pfcDetailed);
      if (pfcCategoryId) {
        assignments.push({
          transactionId: txn.id,
          categoryId: pfcCategoryId,
          source: "pfc",
        });
      }
    }
```

- [ ] **Step 5: Run tests to verify they all pass**

Run: `pnpm test src/lib/categorization/engine.test.ts`

Expected: PASS — all existing tests still pass (optional 3rd param), all new PFC tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/categorization/engine.ts src/lib/categorization/engine.test.ts
git commit -m "feat(pfc): add PFC tier to categorization engine pure function"
```

---

### Task 5: Orchestrator — Build PFC map and write `categorySource`

**Files:**
- Modify: `src/lib/categorization/engine.ts:67-158` (orchestrator function)

- [ ] **Step 1: Add PFC map import and category query to the orchestrator**

In `src/lib/categorization/engine.ts`, add the import at the top (after existing imports):

```ts
import { PFC_DETAILED_TO_CATEGORY } from "./pfc-map";
import { categories } from "@/db/schema";
```

Note: `categories` may already be imported — check first. If it's not imported, add it to the existing `@/db/schema` import.

- [ ] **Step 2: Build the resolved PFC map inside `categorizeSyncedTransactions()`**

In the `categorizeSyncedTransactions` function, after the rules query and before the uncategorized transactions query, add:

```ts
  // Build resolved PFC map: pfcDetailed → household's categoryId
  const allCategories = db
    .select({ id: categories.id, name: categories.name })
    .from(categories)
    .where(eq(categories.householdId, householdId))
    .all();
  const catNameToId = new Map(allCategories.map((c) => [c.name, c.id]));
  const pfcCategoryMap = new Map<string, string>();
  for (const [pfcCode, catName] of Object.entries(PFC_DETAILED_TO_CATEGORY)) {
    const catId = catNameToId.get(catName);
    if (catId) pfcCategoryMap.set(pfcCode, catId);
  }
```

- [ ] **Step 3: Fetch `pfcDetailed` in the uncategorized transactions query**

In the uncategorized transactions query (around line 101-118), add `pfcDetailed: transactions.pfcDetailed` to the `.select({...})` call:

```ts
  const uncategorized = db
    .select({
      id: transactions.id,
      name: transactions.name,
      merchantId: transactions.merchantId,
      pfcDetailed: transactions.pfcDetailed,
    })
    .from(transactions)
```

- [ ] **Step 4: Pass `pfcDetailed` through to categorizable transactions**

In the `categorizableTxns` mapping (around line 135-144), add `pfcDetailed`:

```ts
  const categorizableTxns: CategorizableTransaction[] = uncategorized.map((txn) => {
    const merchant = txn.merchantId ? merchantMap.get(txn.merchantId) : undefined;
    return {
      id: txn.id,
      name: txn.name,
      merchantId: txn.merchantId,
      merchantName: merchant?.name ?? null,
      merchantCategoryId: merchant?.categoryId ?? null,
      pfcDetailed: txn.pfcDetailed ?? null,
    };
  });
```

- [ ] **Step 5: Pass `pfcCategoryMap` to the pure function call**

Update the call to `categorizeTransactions` (around line 146):

```ts
  const assignments = categorizeTransactions(categorizableTxns, rules, pfcCategoryMap);
```

- [ ] **Step 6: Write `categorySource` alongside `categoryId` in the DB update**

In the transaction update loop (around line 150-156), add `categorySource`:

```ts
  db.transaction((tx) => {
    for (const assignment of assignments) {
      tx.update(transactions)
        .set({
          categoryId: assignment.categoryId,
          categorySource: assignment.source,
          updatedAt: now,
        })
        .where(eq(transactions.id, assignment.transactionId))
        .run();
    }
  });
```

- [ ] **Step 7: Verify typecheck passes**

Run: `pnpm typecheck`

Expected: PASS

- [ ] **Step 8: Run existing tests**

Run: `pnpm test src/lib/categorization/`

Expected: PASS — all engine tests still pass.

- [ ] **Step 9: Commit**

```bash
git add src/lib/categorization/engine.ts
git commit -m "feat(pfc): wire PFC map into orchestrator with categorySource tracking"
```

---

### Task 6: Set `categorySource` in manual and AI categorization paths

**Files:**
- Modify: `src/actions/transactions.ts:40-51` (updateTransactionCategory)
- Modify: `src/actions/transactions.ts:112-119` (bulkUpdateCategory)
- Modify: `src/lib/ai/categorize.ts:202-209` (AI categorization update)

- [ ] **Step 1: Set `categorySource: "manual"` in `updateTransactionCategory`**

In `src/actions/transactions.ts`, find the `updates` object (line 40-46). Add `categorySource`:

```ts
  const updates: Partial<typeof transactions.$inferInsert> = {
    categoryId: parsedCatId.data,
    categorySource: parsedCatId.data !== null ? "manual" : null,
    updatedAt: new Date().toISOString(),
  };
```

- [ ] **Step 2: Set `categorySource: "manual"` in `bulkUpdateCategory`**

In `src/actions/transactions.ts`, find the bulk `updates` object (line 112-119). Add `categorySource`:

```ts
  const updates: Partial<typeof transactions.$inferInsert> = {
    categoryId,
    categorySource: categoryId !== null ? "manual" : null,
    updatedAt: new Date().toISOString(),
  };
```

- [ ] **Step 3: Set `categorySource: "ai"` in AI categorization**

In `src/lib/ai/categorize.ts`, find the transaction update in the AI batch loop (lines 202-209). Add `categorySource`:

```ts
          db.transaction((tx) => {
            for (const a of aboveThreshold) {
              tx.update(transactions)
                .set({ categoryId: a.categoryId, categorySource: "ai", updatedAt: now })
                .where(eq(transactions.id, a.transactionId))
                .run();
            }
          });
```

- [ ] **Step 4: Verify typecheck passes**

Run: `pnpm typecheck`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/actions/transactions.ts src/lib/ai/categorize.ts
git commit -m "feat(pfc): set categorySource in manual and AI categorization paths"
```

---

### Task 7: Integration test — Full categorization pipeline

**Files:**
- Create: `tests/integration/categorization.test.ts`

- [ ] **Step 1: Write the integration test**

Create `tests/integration/categorization.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { eq, and, isNull } from "drizzle-orm";
import { createTestDb } from "./setup";
import { seedDefaultCategories } from "../../src/db/seed/categories";
import { categorizeSyncedTransactions } from "../../src/lib/categorization/engine";
import {
  households,
  accounts,
  transactions,
  categories,
  plaidItems,
} from "../../src/db/schema";

describe("categorizeSyncedTransactions — PFC tier integration", () => {
  let db: ReturnType<typeof createTestDb>["db"];
  let close: () => void;

  beforeEach(() => {
    const testDb = createTestDb();
    db = testDb.db;
    close = testDb.close;

    db.insert(households).values({ id: "hh-1", name: "Test Household" }).run();
    seedDefaultCategories(db, "hh-1");

    db.insert(accounts)
      .values({
        id: "acc-1",
        householdId: "hh-1",
        name: "Checking",
        type: "checking",
        plaidItemId: "item-1",
      })
      .run();

    db.insert(plaidItems)
      .values({
        id: "item-1",
        householdId: "hh-1",
        institutionId: "ins_1",
        institutionName: "Test Bank",
        accessToken: "encrypted-token",
        status: "active",
      })
      .run();
  });

  afterEach(() => close());

  it("categorizes transactions via PFC detailed codes", () => {
    db.insert(transactions)
      .values({
        id: "txn-1",
        accountId: "acc-1",
        householdId: "hh-1",
        date: "2026-01-15",
        originalName: "WHOLE FOODS MKT",
        name: "Whole Foods",
        amount: 5000,
        normalizedAmount: -5000,
        pfcPrimary: "FOOD_AND_DRINK",
        pfcDetailed: "FOOD_AND_DRINK_GROCERIES",
      })
      .run();

    categorizeSyncedTransactions("item-1", "hh-1", db);

    const txn = db
      .select({
        categoryId: transactions.categoryId,
        categorySource: transactions.categorySource,
      })
      .from(transactions)
      .where(eq(transactions.id, "txn-1"))
      .get();

    const groceriesCat = db
      .select({ id: categories.id })
      .from(categories)
      .where(
        and(
          eq(categories.householdId, "hh-1"),
          eq(categories.name, "Groceries"),
        ),
      )
      .get();

    expect(txn?.categoryId).toBe(groceriesCat?.id);
    expect(txn?.categorySource).toBe("pfc");
  });

  it("transactions with null pfcDetailed pass through without error", () => {
    db.insert(transactions)
      .values({
        id: "txn-null",
        accountId: "acc-1",
        householdId: "hh-1",
        date: "2026-01-15",
        originalName: "MYSTERY CHARGE",
        name: "Mystery Charge",
        amount: 1000,
        normalizedAmount: -1000,
        pfcPrimary: null,
        pfcDetailed: null,
      })
      .run();

    categorizeSyncedTransactions("item-1", "hh-1", db);

    const txn = db
      .select({ categoryId: transactions.categoryId })
      .from(transactions)
      .where(eq(transactions.id, "txn-null"))
      .get();

    expect(txn?.categoryId).toBeNull();
  });

  it("isolates PFC resolution between households", () => {
    db.insert(households).values({ id: "hh-2", name: "Household Two" }).run();
    seedDefaultCategories(db, "hh-2");

    db.insert(accounts)
      .values({
        id: "acc-2",
        householdId: "hh-2",
        name: "Checking 2",
        type: "checking",
        plaidItemId: "item-2",
      })
      .run();

    db.insert(plaidItems)
      .values({
        id: "item-2",
        householdId: "hh-2",
        institutionId: "ins_2",
        institutionName: "Test Bank 2",
        accessToken: "encrypted-token-2",
        status: "active",
      })
      .run();

    // Same PFC code, different households
    db.insert(transactions)
      .values([
        {
          id: "txn-hh1",
          accountId: "acc-1",
          householdId: "hh-1",
          date: "2026-01-15",
          originalName: "STARBUCKS",
          name: "Starbucks",
          amount: 500,
          normalizedAmount: -500,
          pfcDetailed: "FOOD_AND_DRINK_COFFEE",
        },
        {
          id: "txn-hh2",
          accountId: "acc-2",
          householdId: "hh-2",
          date: "2026-01-15",
          originalName: "STARBUCKS",
          name: "Starbucks",
          amount: 500,
          normalizedAmount: -500,
          pfcDetailed: "FOOD_AND_DRINK_COFFEE",
        },
      ])
      .run();

    categorizeSyncedTransactions("item-1", "hh-1", db);
    categorizeSyncedTransactions("item-2", "hh-2", db);

    const txn1 = db
      .select({ categoryId: transactions.categoryId })
      .from(transactions)
      .where(eq(transactions.id, "txn-hh1"))
      .get();
    const txn2 = db
      .select({ categoryId: transactions.categoryId })
      .from(transactions)
      .where(eq(transactions.id, "txn-hh2"))
      .get();

    // Both should be categorized but to different category IDs (different households)
    expect(txn1?.categoryId).not.toBeNull();
    expect(txn2?.categoryId).not.toBeNull();
    expect(txn1?.categoryId).not.toBe(txn2?.categoryId);

    // Both should resolve to "Coffee Shops" in their respective households
    const coffee1 = db
      .select({ id: categories.id })
      .from(categories)
      .where(
        and(
          eq(categories.householdId, "hh-1"),
          eq(categories.name, "Coffee Shops"),
        ),
      )
      .get();
    const coffee2 = db
      .select({ id: categories.id })
      .from(categories)
      .where(
        and(
          eq(categories.householdId, "hh-2"),
          eq(categories.name, "Coffee Shops"),
        ),
      )
      .get();

    expect(txn1?.categoryId).toBe(coffee1?.id);
    expect(txn2?.categoryId).toBe(coffee2?.id);
  });
});
```

- [ ] **Step 2: Run the integration test**

Run: `pnpm test tests/integration/categorization.test.ts`

Expected: PASS — all 3 tests green. If any fail, check that the schema migration includes `pfcDetailed` and `categorySource` columns, and that the orchestrator changes from Task 5 are correct.

- [ ] **Step 3: Commit**

```bash
git add tests/integration/categorization.test.ts
git commit -m "test(pfc): add integration tests for PFC categorization pipeline"
```

---

### Task 8: Final verification — Full test suite and typecheck

**Files:** None (verification only)

- [ ] **Step 1: Run typecheck**

Run: `pnpm typecheck`

Expected: PASS

- [ ] **Step 2: Run full test suite**

Run: `pnpm test`

Expected: PASS — all existing tests pass, all new tests pass.

- [ ] **Step 3: Run linter**

Run: `pnpm lint`

Expected: PASS (or only pre-existing warnings)

- [ ] **Step 4: Final commit if any lint fixes were needed**

```bash
git add -A
git commit -m "chore(pfc): lint fixes"
```
