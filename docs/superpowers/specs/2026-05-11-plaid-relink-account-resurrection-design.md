# Plaid Re-Link Account Resurrection — Design Spec

**Date:** 2026-05-11
**Status:** Reviewed
**Scope:** Fix data orphaning when users disconnect and re-link a Plaid institution. Preserve user-edited transaction data across re-links.

---

## Problem

When a user disconnects a Plaid institution and re-links the same bank:

1. `disconnectPlaidItem()` soft-deletes accounts (`deletedAt` set), **clears `plaidAccountId`**, and hard-deletes the `plaidItems` row
2. `exchangeAndStoreAccounts()` creates brand new accounts with new UUIDs
3. Old data — transactions (with manual categories, notes, splits), holdings, balance history — stays orphaned on deleted account IDs
4. The new accounts start empty; the next sync fetches only new transactions (no backfill of old ones)

**Root cause:** Line 228 of `src/actions/plaid.ts` sets `plaidAccountId: null` during disconnect, destroying the stable Plaid identity needed to match old accounts on re-link.

---

## Approach: Resurrect on Re-Link

Instead of creating new accounts when a matching soft-deleted account exists, reactivate the old account. Child data (transactions, holdings, etc.) automatically comes back because the `accounts.id` foreign key is unchanged.

### Key Plaid API Guarantee

Plaid's `account_id` is persistent for the same underlying bank account across re-links (documented behavior). This gives us a reliable matching key. Edge case: some OAuth institutions may rotate IDs — in that case, the match fails gracefully and we fall through to creating a new account (same as today).

---

## Changes

### 1. Disconnect Flow — Preserve `plaidAccountId`

**File:** `src/actions/plaid.ts`, `disconnectPlaidItem()`

Change the account update from:
```typescript
.set({ deletedAt: now, plaidItemId: null, plaidAccountId: null })
```
To:
```typescript
.set({ deletedAt: now, plaidItemId: null })
```

`plaidItemId` is correctly cleared (the item row is hard-deleted). `plaidAccountId` is preserved for future matching.

### 2. Exchange Flow — Match-or-Create Accounts

**File:** `src/actions/plaid.ts`, `exchangeAndStoreAccounts()`

Replace the current INSERT-only loop with match-or-create logic:

```
For each Plaid account returned by /accounts/get:
  1. Query: SELECT * FROM accounts
     WHERE plaid_account_id = :plaidAccountId
       AND household_id = :householdId
       AND deleted_at IS NOT NULL
     LIMIT 1

  2a. If match found → UPDATE:
      - Clear deletedAt (reactivate)
      - Set new plaidItemId
      - Refresh name, officialName, type, subtype, balances, currency
      - Use the existing accounts.id for balance history insert

  2b. If no match → INSERT new account (current behavior)

  3. Upsert balance history snapshot (either case)
     Use onConflictDoUpdate on `uq_balance_account_date` — a same-day re-link
     would otherwise violate the unique constraint on (accountId, date).
```

The match query is scoped to `deletedAt IS NOT NULL` so it only finds soft-deleted accounts — never accidentally matches an active account.

Add a log line for each resurrected account vs. each newly created account for observability.

### 3. Transaction Sync — Filter Deleted Accounts

**File:** `src/lib/plaid/sync.ts`, `applyToDb()` function (line 258)

Add `isNull(accounts.deletedAt)` to the account lookup query. Currently the query at lines 255-263 doesn't filter deleted accounts, so during a sync, transactions could theoretically be mapped to a soft-deleted account.

```typescript
// Before
.where(and(eq(accounts.householdId, householdId), eq(accounts.plaidItemId, itemId)))

// After
.where(and(eq(accounts.householdId, householdId), eq(accounts.plaidItemId, itemId), isNull(accounts.deletedAt)))
```

**Also in `sync.ts`:** The `accountTypeMap` builder (lines 563-574) has the same missing filter. Add `isNull(accounts.deletedAt)` to that query as well.

Note: `investments-sync.ts` and `investments-apply.ts` already have this filter (fixed in a prior commit).

### 4. One-Time Migration for Existing Orphans

A migration script to fix accounts that were already disconnected with the old code (which cleared `plaidAccountId`). This is a one-time operation.

**Strategy:** Match by `name`, `type`, and `householdId` between soft-deleted and active accounts. For each match:

1. Re-point all child table FKs from old account ID → active account ID:
   - `transactions.accountId` (child `transactionSplits` moves automatically via transactions FK cascade)
   - `investmentHoldings.accountId`
   - `holdingsHistory.accountId` — use upsert to handle overlapping `(accountId, plaidSecurityId, date)` unique constraint
   - `investmentTransactions.accountId`
   - `balanceHistory.accountId` — use upsert to handle overlapping `(accountId, date)` unique constraint
   - `recurringTransactions.accountId` (if matched)
2. Hard-delete the old soft-deleted account row

**Unique constraint conflicts:** When re-pointing `balanceHistory` and `holdingsHistory`, the active account may already have rows for the same dates. Strategy: for each conflicting row, keep the active account's row (it's more recent) and discard the orphan's duplicate. Run a DELETE of conflicting orphan rows before the UPDATE.

**Safety:** Run inside a transaction. Log each migration for audit. Only match within the same household. Skip ambiguous matches (e.g., two checking accounts with same name). Support `--dry-run` flag that logs what would change without committing.

**File:** `src/db/seed/migrate-orphaned-accounts.ts` (one-time script, not part of normal app flow)

---

### 5. Database Index for Match Query

Add a partial index to make the resurrection match query fast:

```sql
CREATE INDEX idx_accounts_resurrection
  ON accounts (plaid_account_id, household_id)
  WHERE deleted_at IS NOT NULL;
```

In Drizzle schema (`src/db/schema/accounts.ts`), add this as a filtered index.

---

## Files Changed

| File | Change |
|------|--------|
| `src/actions/plaid.ts` | Preserve `plaidAccountId` on disconnect; match-or-create with upsert on exchange |
| `src/lib/plaid/sync.ts` | Add `isNull(deletedAt)` filter to `applyToDb` account lookup AND `accountTypeMap` builder |
| `src/db/schema/accounts.ts` | Add partial index `idx_accounts_resurrection` |
| `src/db/seed/migrate-orphaned-accounts.ts` | New: one-time migration script with `--dry-run` support |
| `tests/integration/plaid-exchange.test.ts` | Add re-link resurrection test, duplicate plaidAccountId test |
| `tests/integration/plaid-disconnect.test.ts` | New: verify `plaidAccountId` preserved on disconnect |

---

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| Re-link same institution, same accounts | Old accounts reactivated, all data preserved |
| Re-link same institution, user closed one account at bank | Closed account stays soft-deleted (Plaid doesn't return it). Other accounts reactivated. |
| Re-link same institution, user opened new account at bank | New account gets INSERT, existing accounts reactivated |
| OAuth institution rotates `account_id` | Match fails, new accounts created (same as today) |
| User has two deleted accounts with same `plaidAccountId` | Query uses LIMIT 1 + most recent (ORDER BY deletedAt DESC) |
| Same-day disconnect + re-link | Balance history upsert handles `uq_balance_account_date` conflict |
| Migration: overlapping balance/holdings dates | Conflicting orphan rows deleted before FK re-point |

---

## Non-Goals

- Merging duplicate active accounts
- UI for "disconnected" account state (Approach C territory)
- Handling cross-household account matching
- Automatic backfill of transactions missed during disconnected period (Plaid sync handles this naturally on next sync)
