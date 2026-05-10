# PFC → Category Mapping Design

**Date:** 2026-05-10
**Status:** Approved
**Approach:** C — Static map + new PFC tier in categorization engine

## Problem

Plaid sends `personal_finance_category.detailed` (e.g., `FOOD_AND_DRINK_RESTAURANTS`) on every synced transaction. We store `pfcPrimary` but never use it. Merchants are created with `categoryId = null`, so the categorization engine's "merchant default" fallback is effectively dead code. Transactions fall through to AI or stay uncategorized.

## Solution

Add a new categorization tier in the engine that maps Plaid's PFC detailed codes to our internal seed categories. The pipeline becomes:

1. **User rules** — pattern matching (existing, highest priority)
2. **Merchant default** — if `merchant.categoryId` is set by user (existing)
3. **PFC map** — if transaction has `pfcDetailed` and it maps to a known category (new)
4. **AI fallback** — LLM categorization for remaining uncategorized (existing)
5. Uncategorized — flagged for manual review

## Design Decisions

- **Always assign** — no confidence gating. If we have a PFC→category mapping, use it. User rules and merchant defaults already override as higher-priority tiers.
- **Capture pfcDetailed** — store the granular code (e.g., `FOOD_AND_DRINK_RESTAURANTS`) on transactions, not just the primary. This enables precise mapping (groceries vs restaurants vs coffee shops). The field is optional — Plaid does not guarantee `detailed` on all transactions (pending txns, older institutions).
- **PFC sets initial only** — merchant.categoryId remains user-set only. PFC mapping applies per-transaction in the engine, not by mutating merchant defaults.
- **Name-based resolution** — the static map points to seed category names (e.g., `"Restaurants"`). The orchestrator resolves names to household-scoped UUIDs at runtime.
- **Track category source** — add a `categorySource` column to transactions (`"rule" | "merchant_default" | "pfc" | "ai" | "manual"`) so the system can distinguish auto-assigned categories from user-set ones. This enables: (a) re-categorization when Plaid corrects a PFC code, (b) future UI indicators showing how a category was assigned, (c) analytics on categorization accuracy.
- **Request PFC v2** — explicitly pass `personal_finance_category_version: "2.0"` in the transactionsSync request to ensure we receive v2 taxonomy codes matching our static map.

## Architecture

### New File: `src/lib/categorization/pfc-map.ts`

Static `Record<string, string>` mapping Plaid PFC detailed codes to seed category names, plus a pure lookup function.

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
  RENT_AND_UTILITIES_GAS: "Electric",         // Natural gas — no dedicated category, closest match
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

Unmapped PFC codes return `null` — the transaction falls through to AI/manual. The map covers ~70 Plaid PFC v2 detailed codes that align with our 30 seed categories.

**Deliberately unmapped codes:** `TRANSFER_IN_*`, `TRANSFER_OUT_*`, and `BANK_FEES_*` codes are not mapped because we have no corresponding seed categories. These fall through to AI/manual. Transfers in particular are high-frequency but represent internal money movement, not spending categories.

**Approximations:** `RENT_AND_UTILITIES_GAS` (natural gas utility) maps to `"Electric"` because we lack a dedicated gas utility category. `TRANSPORTATION_TOLLS` maps to `"Parking"` as the closest driving-related non-fuel category. These are documented trade-offs of our 30-category seed set.

### Modified: `src/db/schema/transactions.ts`

Add two columns:

```ts
pfcDetailed: text("pfc_detailed"),
categorySource: text("category_source"),  // "rule" | "merchant_default" | "pfc" | "ai" | "manual"
```

`categorySource` is set alongside `categoryId` by whichever system assigns the category. When a user manually changes a category, set `categorySource = "manual"`. This enables re-categorization of PFC-assigned categories when Plaid corrects a classification.

### Modified: `src/lib/plaid/schemas.ts`

Extend the `personal_finance_category` Zod object to capture `detailed`. Note: `detailed` must be `.optional()` — Plaid does not guarantee it on all transactions (pending txns, older institutions):

```ts
personal_finance_category: z.object({
  primary: z.string(),
  detailed: z.string().optional(),  // new — not always present
  confidence_level: z.string().optional(),
}).nullable().optional(),
```

### Modified: `src/lib/plaid/sync.ts`

- `TransactionRow` gains `pfcDetailed: string | null`
- `toRow()` extracts `txn.personal_finance_category?.detailed ?? null`
- Transaction inserts/upserts in `applyToDb()` write `pfcDetailed` to DB (both the insert block at ~line 317 and the upsert-insert fallback at ~line 379)
- Add `options: { personal_finance_category_version: "2.0" }` to the `transactionsSync` request body in `fetchAllPages()` to ensure we receive PFC v2 codes

No categorization logic changes in sync.

### Modified: `src/lib/categorization/engine.ts`

**Types:**

```ts
export interface CategorizableTransaction {
  id: string;
  name: string;
  merchantId: string | null;
  merchantName: string | null;
  merchantCategoryId: string | null;
  pfcDetailed: string | null;  // new
}

export type CategorySource = "rule" | "merchant_default" | "pfc";  // extended

export interface CategoryAssignment {
  transactionId: string;
  categoryId: string;
  source: CategorySource;
}
```

**Pure function** — new signature (third param is optional to avoid breaking existing callers/tests):

```ts
export function categorizeTransactions(
  transactions: CategorizableTransaction[],
  rules: CategoryRule[],
  pfcCategoryMap: Map<string, string> = new Map(),  // pfcDetailed → categoryId
): CategoryAssignment[]
```

New tier after merchant_default check:

```ts
// Tier 3: PFC mapping
if (!matched && txn.pfcDetailed) {
  const pfcCategoryId = pfcCategoryMap.get(txn.pfcDetailed);
  if (pfcCategoryId) {
    assignments.push({
      transactionId: txn.id,
      categoryId: pfcCategoryId,
      source: "pfc",
    });
    matched = true;
  }
}
```

**Orchestrator** — `categorizeSyncedTransactions()` builds the PFC map:

```ts
import { PFC_DETAILED_TO_CATEGORY, pfcToCategoryName } from "./pfc-map";

// Fetch household categories (name → id)
const allCategories = db.select({ id: categories.id, name: categories.name })
  .from(categories)
  .where(eq(categories.householdId, householdId))
  .all();
const catNameToId = new Map(allCategories.map(c => [c.name, c.id]));

// Build resolved PFC map (pfcDetailed → categoryId)
const pfcCategoryMap = new Map<string, string>();
for (const [pfcCode, catName] of Object.entries(PFC_DETAILED_TO_CATEGORY)) {
  const catId = catNameToId.get(catName);
  if (catId) pfcCategoryMap.set(pfcCode, catId);
}
```

Also fetches `pfcDetailed` from the uncategorized transactions query.

## Files Touched

| File | Action |
|------|--------|
| `src/db/schema/transactions.ts` | Add `pfcDetailed` and `categorySource` columns |
| `src/lib/plaid/schemas.ts` | Add `detailed` (optional) to PFC Zod object |
| `src/lib/plaid/sync.ts` | Extract + store `pfcDetailed` in `toRow()` and both insert blocks in `applyToDb()`; add PFC v2 version to sync request |
| `src/lib/categorization/pfc-map.ts` | **New** — static map + `pfcToCategoryName()` |
| `src/lib/categorization/engine.ts` | Add PFC tier (optional 3rd param), update types, build PFC map in orchestrator, write `categorySource` on assignments |
| `src/actions/transactions.ts` | Set `categorySource: "manual"` when user manually categorizes |
| `src/lib/ai/categorize.ts` | Set `categorySource: "ai"` when AI categorizes |
| `src/lib/categorization/pfc-map.test.ts` | **New** — unit + property-based tests for map coverage |
| `src/lib/categorization/engine.test.ts` | Update `makeTxn()` factory to include `pfcDetailed: null`; add PFC tier tests |
| `tests/integration/categorization.test.ts` | **New** — integration test for full pipeline |

## Testing Strategy

**Unit: `pfc-map.test.ts`**
- Property-based test (fast-check): every key in `PFC_DETAILED_TO_CATEGORY` maps to a name that exists in `DEFAULT_CATEGORIES`
- Unknown codes return null
- Snapshot test of map keys for drift detection

**Unit: `engine.test.ts`**
- Update existing `makeTxn()` factory to include `pfcDetailed: null` (existing tests unchanged due to optional 3rd param)
- PFC tier categorizes transactions when map has a matching entry
- Rules take priority over PFC
- Merchant default takes priority over PFC
- Transactions without pfcDetailed are unaffected
- Empty PFC map (default) means no PFC assignments — backward compatible

**Integration: `categorization.test.ts`**
- Use `seedDefaultCategories(db, householdId)` to seed categories
- Create transactions with known pfcDetailed values
- Run `categorizeSyncedTransactions`, assert correct categoryIds and categorySource values
- Test migration path: transactions with `pfcDetailed = null` pass through without error
- Test cross-household isolation: two households with same PFC codes resolve to their own category IDs

## UI Considerations

The PFC tier is invisible to end users — they just see fewer "Uncategorized" transactions. No immediate UI changes are required.

**Future opportunity (not in scope):** The `categorySource` column enables showing a subtle indicator in the transaction row (e.g., tooltip on the category dropdown: "Auto-categorized by Plaid" vs "Matched by rule" vs "Set manually"). This can be added later without any architectural changes — the data is already tracked. The existing `transaction-type-badge.tsx` atom provides a precedent pattern for source indicators.

## Re-categorization on PFC Update

When Plaid sends a `modified` transaction with a different `pfcDetailed`:
- If `categorySource == "pfc"`: the engine can safely re-categorize (the user didn't manually set it)
- If `categorySource == "manual"` or `"rule"` or `"merchant_default"`: preserve the existing category
- This is handled naturally by the engine: it only processes transactions with `categoryId IS NULL`. For re-categorization of PFC-sourced categories on modification, the orchestrator should clear `categoryId` when `categorySource == "pfc"` and the `pfcDetailed` value changed. This is a minor enhancement to `applyToDb()` in the upsert path.

## Name Fragility Mitigation

The static map references seed category names (e.g., `"Restaurants"`). If a user renames a seed category, the name lookup silently returns no match and the transaction falls through to AI/manual. This is acceptable because:

1. Seed categories are marked `isSystem: true` — future UI can prevent renaming system categories
2. The fallback chain (AI → manual) catches anything the PFC map misses
3. For a mid-size side project, the alternative (stable slugs or a mapping table) adds complexity without proportional benefit
