# Entity Logos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Display institution logos on bank account headers and merchant logos on transaction rows, using Plaid's built-in logo data with a three-tier fallback waterfall.

**Architecture:** Logo resolution is centralized in a pure utility (`src/lib/logos.ts`), consumed by a single `EntityAvatar` atom. Data flows through schema → query → organism → molecule → atom → lib. Institution logos are stored in a separate `institution_logos` table to avoid bloating the `plaid_items` page cache. Merchant logos are already stored and joined — only the UI render is new. PFC primary codes are persisted on transactions to enable category icon URL derivation.

**Tech Stack:** Drizzle ORM (SQLite), Next.js 16 Server/Client Components, Tailwind v4, Vitest

---

### Task 1: Schema — Add `institution_logos` table, `plaid_items.primaryColor`, `transactions.pfcPrimary`

**Files:**
- Modify: `src/db/schema/plaid.ts`
- Modify: `src/db/schema/transactions.ts`

- [ ] **Step 1: Add `institution_logos` table and `primaryColor` column to `src/db/schema/plaid.ts`**

After the existing `plaidItems` table definition, add the new table. Also add `primaryColor` column to `plaidItems`:

```ts
// In the plaidItems column definitions, after errorCode:
primaryColor: text("primary_color"),
```

```ts
// After the syncLog table definition:
export const institutionLogos = sqliteTable("institution_logos", {
  id: text("id").primaryKey(),
  plaidItemId: text("plaid_item_id")
    .notNull()
    .references(() => plaidItems.id, { onDelete: "cascade" }),
  logo: text("logo").notNull(),
}, (table) => [
  uniqueIndex("idx_institution_logos_plaid_item").on(table.plaidItemId),
]);
```

Add the `uniqueIndex` import to the existing import from `drizzle-orm/sqlite-core` (it's already imported in this file).

- [ ] **Step 2: Add `pfcPrimary` column to `src/db/schema/transactions.ts`**

Add to the `transactions` table column definitions, after `aiCategorizationAttemptedAt`:

```ts
pfcPrimary: text("pfc_primary"),
```

- [ ] **Step 3: Export `institutionLogos` from schema barrel**

The barrel at `src/db/schema/index.ts` already re-exports `* from "./plaid"`, so `institutionLogos` will be automatically exported. No change needed here — verify by checking the export list.

- [ ] **Step 4: Generate Drizzle migration**

Run: `pnpm db:generate`

Expected: A new migration file is created in the migrations directory with `ALTER TABLE` statements adding `primary_color` to `plaid_items`, `pfc_primary` to `transactions`, and `CREATE TABLE institution_logos`.

- [ ] **Step 5: Run migration**

Run: `pnpm db:migrate`

Expected: Migration applies successfully.

- [ ] **Step 6: Verify with typecheck**

Run: `pnpm typecheck`

Expected: No type errors.

- [ ] **Step 7: Commit**

```bash
git add src/db/schema/plaid.ts src/db/schema/transactions.ts drizzle/
git commit -m "feat(logos): add institution_logos table, primaryColor and pfcPrimary columns"
```

---

### Task 2: Logo service — `src/lib/logos.ts` (TDD)

**Files:**
- Create: `src/lib/logos.ts`
- Create: `src/lib/logos.test.ts`

- [ ] **Step 1: Write all 5 failing tests in `src/lib/logos.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { resolveEntityLogo, getCategoryIconUrl } from "./logos";

describe("resolveEntityLogo", () => {
  it("returns image with logoUrl when provided (merchant path)", () => {
    const result = resolveEntityLogo({
      logoUrl: "https://plaid-merchant-logos.plaid.com/walmart_1100.png",
      name: "Walmart",
    });
    expect(result).toEqual({
      type: "image",
      src: "https://plaid-merchant-logos.plaid.com/walmart_1100.png",
    });
  });

  it("returns image with base64 data URI when logoBase64 provided", () => {
    const result = resolveEntityLogo({
      logoBase64: "iVBORw0KGgo=",
      name: "Chase",
    });
    expect(result).toEqual({
      type: "image",
      src: "data:image/png;base64,iVBORw0KGgo=",
    });
  });

  it("returns category icon URL when pfcPrimary provided", () => {
    const result = resolveEntityLogo({
      pfcPrimary: "FOOD_AND_DRINK",
      name: "Unknown Merchant",
    });
    expect(result).toEqual({
      type: "image",
      src: "https://plaid-category-icons.plaid.com/PFC_FOOD_AND_DRINK.png",
    });
  });

  it("returns initials with deterministic color when nothing else available", () => {
    const result = resolveEntityLogo({ name: "Walmart" });
    expect(result.type).toBe("initials");
    if (result.type === "initials") {
      expect(result.initial).toBe("W");
      expect(result.backgroundColor).toMatch(/^#[0-9a-fA-F]{6}$/);
    }

    // Same name should produce same color
    const result2 = resolveEntityLogo({ name: "Walmart" });
    expect(result).toEqual(result2);
  });

  it("uses primaryColor for initials background when provided", () => {
    const result = resolveEntityLogo({
      name: "Chase",
      primaryColor: "#004977",
    });
    expect(result).toEqual({
      type: "initials",
      initial: "C",
      backgroundColor: "#004977",
    });
  });

  it("prefers logoUrl over logoBase64 over pfcPrimary", () => {
    const result = resolveEntityLogo({
      logoUrl: "https://example.com/logo.png",
      logoBase64: "iVBORw0KGgo=",
      pfcPrimary: "FOOD_AND_DRINK",
      name: "Test",
    });
    expect(result).toEqual({
      type: "image",
      src: "https://example.com/logo.png",
    });
  });
});

describe("getCategoryIconUrl", () => {
  it("produces correct Plaid category icon URL", () => {
    expect(getCategoryIconUrl("FOOD_AND_DRINK")).toBe(
      "https://plaid-category-icons.plaid.com/PFC_FOOD_AND_DRINK.png"
    );
    expect(getCategoryIconUrl("GENERAL_MERCHANDISE")).toBe(
      "https://plaid-category-icons.plaid.com/PFC_GENERAL_MERCHANDISE.png"
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/lib/logos.test.ts`

Expected: All tests FAIL with "Cannot find module './logos'" or similar import error.

- [ ] **Step 3: Implement `src/lib/logos.ts`**

```ts
export interface ResolveLogoOptions {
  logoUrl?: string | null;
  logoBase64?: string | null;
  name: string;
  primaryColor?: string | null;
  pfcPrimary?: string | null;
}

export type LogoProps =
  | { type: "image"; src: string }
  | { type: "initials"; initial: string; backgroundColor: string };

const PALETTE = [
  "#E57373", "#F06292", "#BA68C8", "#9575CD",
  "#7986CB", "#64B5F6", "#4FC3F7", "#4DD0E1",
  "#4DB6AC", "#81C784", "#AED581", "#FF8A65",
] as const;

export function resolveEntityLogo(options: ResolveLogoOptions): LogoProps {
  if (options.logoUrl) {
    return { type: "image", src: options.logoUrl };
  }
  if (options.logoBase64) {
    return { type: "image", src: `data:image/png;base64,${options.logoBase64}` };
  }
  if (options.pfcPrimary) {
    return { type: "image", src: getCategoryIconUrl(options.pfcPrimary) };
  }
  const initial = options.name.charAt(0).toUpperCase() || "?";
  const backgroundColor =
    options.primaryColor || PALETTE[options.name.charCodeAt(0) % PALETTE.length];
  return { type: "initials", initial, backgroundColor };
}

export function getCategoryIconUrl(pfcPrimary: string): string {
  return `https://plaid-category-icons.plaid.com/PFC_${pfcPrimary}.png`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/lib/logos.test.ts`

Expected: All 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/logos.ts src/lib/logos.test.ts
git commit -m "feat(logos): add logo resolution service with tests"
```

---

### Task 3: Sync — Persist institution logo + color during Plaid Link

**Files:**
- Modify: `src/actions/plaid.ts`

- [ ] **Step 1: Add imports for `institutionLogos` and `uuid`**

`uuid` is already imported. Add `institutionLogos` to the schema import:

```ts
// Change this line:
import { plaidItems, accounts, balanceHistory } from "@/db/schema";
// To:
import { plaidItems, accounts, balanceHistory, institutionLogos } from "@/db/schema";
```

- [ ] **Step 2: Update `institutionsGetById` call to request optional metadata**

In `exchangeAndStoreAccounts()`, change the `institutionsGetById` call (around line 61):

```ts
// Replace:
        const instRes = await getPlaidClient().institutionsGetById({
          institution_id: institutionId,
          country_codes: [CountryCode.Us],
        });
        institutionName = instRes.data.institution.name;
// With:
        const instRes = await getPlaidClient().institutionsGetById({
          institution_id: institutionId,
          country_codes: [CountryCode.Us],
          options: { include_optional_metadata: true },
        });
        institutionName = instRes.data.institution.name;
        institutionLogo = instRes.data.institution.logo ?? null;
        institutionPrimaryColor = instRes.data.institution.primary_color ?? null;
```

- [ ] **Step 3: Declare the variables before the `if (institutionId)` block**

Add before the `if (institutionId)` block (around line 58):

```ts
    let institutionName = "Unknown Institution";
    let institutionLogo: string | null = null;
    let institutionPrimaryColor: string | null = null;
```

Remove the existing `let institutionName = "Unknown Institution";` that's currently at line 58.

- [ ] **Step 4: Save `primaryColor` in the `plaidItems` insert and `logo` in `institutionLogos`**

In the `db.transaction()` block, update the `plaidItems` insert to include `primaryColor`:

```ts
      tx.insert(plaidItems)
        .values({
          id: plaidItemId,
          householdId,
          accessToken: encrypt(accessToken),
          plaidInstitutionId: institutionId,
          plaidItemId: itemRes.data.item.item_id,
          institutionName,
          primaryColor: institutionPrimaryColor,
          status: "active",
        })
        .run();

      if (institutionLogo) {
        tx.insert(institutionLogos)
          .values({
            id: uuid(),
            plaidItemId: plaidItemId,
            logo: institutionLogo,
          })
          .run();
      }
```

- [ ] **Step 5: Verify typecheck**

Run: `pnpm typecheck`

Expected: No type errors.

- [ ] **Step 6: Commit**

```bash
git add src/actions/plaid.ts
git commit -m "feat(logos): persist institution logo and primary color during Plaid Link"
```

---

### Task 4: Sync — Persist PFC primary code during transaction sync

**Files:**
- Modify: `src/lib/plaid/sync.ts`

- [ ] **Step 1: Add `pfcPrimary` to the internal `TransactionRow` interface**

In `src/lib/plaid/sync.ts`, add to the `TransactionRow` interface (around line 59):

```ts
// After logoUrl: string | null;
pfcPrimary: string | null;
```

- [ ] **Step 2: Extract PFC primary in `toRow()` function**

In the `toRow()` function inside `processBatch()` (around line 159), add:

```ts
// After logoUrl: txn.logo_url ?? null,
pfcPrimary: txn.personal_finance_category?.primary ?? null,
```

- [ ] **Step 3: Persist `pfcPrimary` in `applyToDb()` inserts and upserts**

In `applyToDb()`, add `pfcPrimary` to both the insert (around line 315) and upsert (around line 360) `.values()` calls:

For inserts (inside the `for (const row of processed.inserts)` loop):
```ts
// Add to the tx.insert(transactions).values({...}):
pfcPrimary: row.pfcPrimary,
```

For upserts — in the `if (existingTxn)` update `.set()` call:
```ts
// Add to the tx.update(transactions).set({...}):
pfcPrimary: row.pfcPrimary,
```

And in the `else` branch insert for upserts:
```ts
// Add to the tx.insert(transactions).values({...}):
pfcPrimary: row.pfcPrimary,
```

- [ ] **Step 4: Verify typecheck**

Run: `pnpm typecheck`

Expected: No type errors.

- [ ] **Step 5: Run existing sync tests**

Run: `pnpm vitest run tests/integration/`

Expected: Existing tests still pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/plaid/sync.ts
git commit -m "feat(logos): persist PFC primary category code during transaction sync"
```

---

### Task 5: Queries — Add logo data to `InstitutionGroup` and `TransactionRow`

**Files:**
- Modify: `src/queries/accounts.ts`
- Modify: `src/queries/transactions.ts`

- [ ] **Step 1: Update `InstitutionGroup` interface and query in `src/queries/accounts.ts`**

Add the import for `institutionLogos`:

```ts
import { accounts, plaidItems, institutionLogos, ACCOUNT_TYPES, type PlaidItemStatus } from "@/db/schema";
```

Add fields to the `InstitutionGroup` interface:

```ts
export interface InstitutionGroup {
  institutionName: string;
  plaidItemId: string | null;
  status: PlaidItemStatus | null;
  lastSyncedAt: string | null;
  logoBase64: string | null;
  primaryColor: string | null;
  accounts: AccountRow[];
}
```

Update `getAccountsByInstitution()` to load logos. After the `items` query (around line 39-43), add a query for logos:

```ts
  const logos = db
    .select()
    .from(institutionLogos)
    .all();
  const logoMap = new Map(logos.map((l) => [l.plaidItemId, l.logo]));
```

Update the group creation inside the `for (const account of allAccounts)` loop to include logo data:

```ts
        groups.set(key, {
          institutionName: item?.institutionName ?? "Unknown Institution",
          plaidItemId: account.plaidItemId,
          status: (item?.status as InstitutionGroup["status"]) ?? null,
          lastSyncedAt: item?.updatedAt ?? null,
          logoBase64: logoMap.get(account.plaidItemId!) ?? null,
          primaryColor: item?.primaryColor ?? null,
          accounts: [],
        });
```

Update the manual accounts group to include the new fields:

```ts
        groups.set(key, {
          institutionName: "Manual Accounts",
          plaidItemId: null,
          status: null,
          lastSyncedAt: null,
          logoBase64: null,
          primaryColor: null,
          accounts: [],
        });
```

- [ ] **Step 2: Add `pfcPrimary` to `TransactionRow` in `src/queries/transactions.ts`**

Add `pfcPrimary` to the `TransactionRow` interface:

```ts
// After categoryIcon: string | null;
pfcPrimary: string | null;
```

Add to `transactionSelectFields`:

```ts
// After categoryIcon: categories.icon,
pfcPrimary: transactions.pfcPrimary,
```

- [ ] **Step 3: Verify typecheck**

Run: `pnpm typecheck`

Expected: Type errors in `account-list.tsx` and `transaction-row.tsx` — the components don't pass the new props yet. These will be fixed in Tasks 7 and 8. Verify the errors are only about the missing props in the components, not structural issues.

Actually, `InstitutionGroup` is consumed in `AccountList` which just spreads the data — the type errors will appear in the query consumers. Let's verify:

Run: `pnpm typecheck 2>&1 | head -30`

Note down which files have errors. They should only be in the component files that will be updated in later tasks.

- [ ] **Step 4: Commit**

```bash
git add src/queries/accounts.ts src/queries/transactions.ts
git commit -m "feat(logos): add logo data to InstitutionGroup and TransactionRow queries"
```

---

### Task 6: Component — `EntityAvatar` atom

**Files:**
- Create: `src/components/atoms/entity-avatar.tsx`

- [ ] **Step 1: Create the `EntityAvatar` component**

```tsx
"use client";

import { useState } from "react";
import { resolveEntityLogo } from "@/lib/logos";
import { cn } from "@/lib/utils";

interface EntityAvatarProps {
  logoUrl?: string | null;
  logoBase64?: string | null;
  name: string;
  primaryColor?: string | null;
  pfcPrimary?: string | null;
  size?: "sm" | "md";
}

const sizeClasses = {
  sm: "size-6 text-[10px]",
  md: "size-8 text-xs",
} as const;

export function EntityAvatar({
  logoUrl,
  logoBase64,
  name,
  primaryColor,
  pfcPrimary,
  size = "md",
}: EntityAvatarProps) {
  const resolved = resolveEntityLogo({ logoUrl, logoBase64, name, primaryColor, pfcPrimary });
  const [imgError, setImgError] = useState(false);

  const fallback = resolveEntityLogo({ name, primaryColor });
  const initials = fallback.type === "initials" ? fallback : { initial: name.charAt(0).toUpperCase() || "?", backgroundColor: "#9CA3AF" };

  if (resolved.type === "image" && !imgError) {
    return (
      <img
        src={resolved.src}
        alt=""
        onError={() => setImgError(true)}
        className={cn("rounded-full bg-white object-cover shrink-0", sizeClasses[size])}
      />
    );
  }

  return (
    <div
      aria-hidden="true"
      className={cn("rounded-full flex items-center justify-center font-medium text-white shrink-0", sizeClasses[size])}
      style={{ backgroundColor: initials.backgroundColor }}
    >
      {initials.initial}
    </div>
  );
}
```

- [ ] **Step 2: Verify typecheck**

Run: `pnpm typecheck`

Expected: No new errors from this file.

- [ ] **Step 3: Commit**

```bash
git add src/components/atoms/entity-avatar.tsx
git commit -m "feat(logos): add EntityAvatar atom component"
```

---

### Task 7: Component — Wire `EntityAvatar` into `InstitutionHeader` and `AccountList`

**Files:**
- Modify: `src/components/molecules/institution-header.tsx`
- Modify: `src/components/organisms/account-list.tsx`

- [ ] **Step 1: Add `logo` prop and `EntityAvatar` to `InstitutionHeader`**

Add import at the top of `src/components/molecules/institution-header.tsx`:

```ts
import { EntityAvatar } from "@/components/atoms/entity-avatar";
```

Add to `InstitutionHeaderProps` interface:

```ts
logo?: { base64: string; primaryColor: string | null } | null;
```

Add `logo` to the destructured props in the function signature.

Render `EntityAvatar` inside the `<div className="flex items-center gap-3">` container, before the inner `<div>` that contains the `<h3>`:

```tsx
        <div className="flex items-center gap-3">
          <EntityAvatar
            logoBase64={logo?.base64}
            name={institutionName}
            primaryColor={logo?.primaryColor}
            size="md"
          />
          <div>
            <h3 className="text-sm font-semibold">{institutionName}</h3>
```

- [ ] **Step 2: Pass `logo` from `AccountList` to `InstitutionHeader`**

In `src/components/organisms/account-list.tsx`, update the `<InstitutionHeader>` call (around line 117) to pass the logo prop:

```tsx
              <InstitutionHeader
                institutionName={group.institutionName}
                status={group.status}
                accountCount={group.accounts.length}
                plaidItemId={group.plaidItemId}
                lastSyncedAt={group.lastSyncedAt}
                logo={group.logoBase64 ? { base64: group.logoBase64, primaryColor: group.primaryColor } : null}
                syncStatus={state.status}
                // ...rest of props unchanged
```

- [ ] **Step 3: Verify typecheck**

Run: `pnpm typecheck`

Expected: No type errors related to these files.

- [ ] **Step 4: Commit**

```bash
git add src/components/molecules/institution-header.tsx src/components/organisms/account-list.tsx
git commit -m "feat(logos): wire EntityAvatar into InstitutionHeader"
```

---

### Task 8: Component — Wire `EntityAvatar` into `TransactionRow`

**Files:**
- Modify: `src/components/molecules/transaction-row.tsx`

- [ ] **Step 1: Add import**

```ts
import { EntityAvatar } from "@/components/atoms/entity-avatar";
```

- [ ] **Step 2: Restructure the name cell and add `EntityAvatar`**

Replace the current name cell (around line 47-54):

```tsx
      {/* Current: */}
      <div className="truncate pr-2">
        <span className="font-medium">{txn.name}</span>
        {txn.originalName !== txn.name && (
          <span className="text-xs text-muted-foreground ml-1 hidden group-hover/row:inline">
            ({txn.originalName})
          </span>
        )}
      </div>
```

With:

```tsx
      <div className="flex items-center gap-1.5 pr-2 min-w-0">
        <EntityAvatar
          logoUrl={txn.merchantLogoUrl}
          name={txn.merchantName ?? txn.name}
          pfcPrimary={txn.pfcPrimary}
          size="sm"
        />
        <div className="truncate">
          <span className="font-medium">{txn.name}</span>
          {txn.originalName !== txn.name && (
            <span className="text-xs text-muted-foreground ml-1 hidden group-hover/row:inline">
              ({txn.originalName})
            </span>
          )}
        </div>
      </div>
```

Key changes:
- Outer `div` changes from `truncate pr-2` to `flex items-center gap-1.5 pr-2 min-w-0`
- `truncate` moves to the inner text `div`
- `min-w-0` on the flex container allows truncation to work inside a grid cell
- `EntityAvatar` uses `shrink-0` (built into the atom) so it doesn't compress

- [ ] **Step 3: Verify typecheck**

Run: `pnpm typecheck`

Expected: No type errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/molecules/transaction-row.tsx
git commit -m "feat(logos): wire EntityAvatar into TransactionRow"
```

---

### Task 9: Final verification

**Files:** None (verification only)

- [ ] **Step 1: Run full typecheck**

Run: `pnpm typecheck`

Expected: Zero errors.

- [ ] **Step 2: Run all tests**

Run: `pnpm test`

Expected: All tests pass, including the new `logos.test.ts`.

- [ ] **Step 3: Run linting**

Run: `pnpm lint`

Expected: No lint errors.

- [ ] **Step 4: Start dev server and visually verify**

Run: `pnpm dev`

Check:
- `/accounts` page — institution headers should show logos (or initials for institutions without logos)
- `/transactions` page — each transaction row should show a merchant logo (or PFC category icon, or initials)
- Dark mode — institution logos should have white background chip, initials should be readable
- Narrow viewport — transaction names should still truncate properly with avatar

- [ ] **Step 5: Final commit if any adjustments were needed**

```bash
git add -A
git commit -m "feat(logos): final adjustments after visual verification"
```
