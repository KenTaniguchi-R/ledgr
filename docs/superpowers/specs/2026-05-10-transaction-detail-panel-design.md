# Transaction Detail Panel — Design Spec

Phase 2 of the transaction UI must-have features. Adds a push-layout detail panel that opens on row click, keeps the transaction list visible, and supports inline editing of all transaction fields plus split transactions.

## Approach

**Consolidated Detail Action + Hybrid Data Loading.** One `updateTransactionFields` server action accepts partial updates. The panel renders immediately from list row data (already in memory), then fetches splits + metadata async on mount. URL state (`?txn=<id>`) via a dedicated hook. Surgical list updates via callback — no `router.refresh()`.

## Layout Architecture

Push layout lives inside `TransactionList` (organism). When a transaction is selected, the container switches from single-column to two-column CSS grid with an animated transition.

```
No selection:  grid-cols-[1fr]
With selection: grid-cols-[minmax(0,3fr)_minmax(0,2fr)]
```

- Transition: `transition-[grid-template-columns] duration-200`
- Panel has `border-l` separator and `overflow-y-auto` with viewport-matching height
- Mobile (<768px): panel renders as full-width absolute overlay instead of push layout (via `useIsMobile` hook)
- Selected row gets `bg-muted` highlight
- Existing list rows truncate naturally in the narrower column — no grid column changes needed

## Panel Structure

Top to bottom:

### Header (sticky)
- Close button (X icon, top-right)

### Identity Section
- EntityAvatar (merchant logo/initials) + editable merchant name (inline text, blur-to-save)
- Account name (read-only)
- Editable date (date input, blur-to-save) + pending badge if applicable

### Amount Section
- Large amount display (AmountDisplay atom, centered)
- Transaction type dropdown: expense / income / transfer

### Category Section
- CategoryPill (reused from list row) — hidden when splits > 0
- "Add Split" button below — clicking creates first split and moves category control to per-split rows

### Splits Section (visible when splits exist)
- List of editable split rows, each with: category picker, amount input, optional note, delete button
- Remaining balance display: green when $0.00, red when nonzero
- "Add Split" button at bottom

### Notes Section
- Textarea, auto-resize, blur-to-save

### Reviewed Toggle
- Toggle with label "Mark as Reviewed"

### Metadata Section (collapsed by default)
- Original bank description
- Category source (Manual / AI / Rule / Plaid)
- Plaid transaction ID
- Transfer pair link (if applicable)

## Component Architecture

### New Components

```
organisms/
  transaction-detail-panel.tsx    — Main panel: layout, data loading, edit orchestration
                                    Props: transactionId, initialData (TransactionRow),
                                    categories, onClose, onTransactionUpdated

molecules/
  transaction-split-row.tsx       — One split row: category picker + amount + notes + delete
                                    Props: split, categories, onUpdate, onDelete
                                    Manages own optimistic state with useTransition

  transaction-metadata.tsx        — Collapsible read-only metadata section
                                    Props: metadata object (originalName, categorySource, etc.)

  editable-text.tsx               — Reusable inline-edit text field
                                    Props: value, onSave, placeholder, inputType
                                    Always renders as input with subtle/borderless styling
                                    Blur-to-save, optimistic with useRef rollback

atoms/
  currency-input.tsx              — Controlled cents input
                                    Props: value (cents), onChange, onBlur, disabled
                                    Wraps parseToCents / centsToInputDisplay from lib/money.ts
```

### Modified Components

```
organisms/
  transaction-list.tsx            — Add CSS grid push layout
                                    Use useSelectedTransaction hook for ?txn= state
                                    Pass onTransactionUpdated callback to panel
                                    Find selectedRow from existing rows array

molecules/
  transaction-row.tsx             — Add onClick prop (fires select)
                                    Add isActive prop (bg-muted when selected)
                                    stopPropagation on checkbox click
```

### New Hook

```
hooks/
  use-selected-transaction.ts     — Manages ?txn=<id> URL param
                                    Exports: { selectedId, select(id), clear() }
                                    Keeps txn param separate from filter params
                                    Does NOT use useSearchParamFilters (avoids list key reset)
```

### New Server-Side

```
actions/
  transaction-detail.ts           — New file, 4 actions:
    fetchTransactionDetail(id)         — Returns TransactionDetail (fields + splits)
    updateTransactionFields(id, data)  — Partial update: { name?, notes?, date?, isTransfer? }
    upsertSplit(txnId, splitId, data)  — Create or update a split row
    deleteSplit(splitId, txnId)        — Delete split, clear hasSplits if last

queries/
  transactions.ts                 — Add:
    TransactionDetail interface        — Extends TransactionRow with splits[], isTransfer,
                                         transferPairId, categorySource, plaidTransactionId
    getTransactionDetail(hid, id, db)  — Single-transaction fetch with splits join
```

## Data Flow

### Panel Open
1. Row click → `useSelectedTransaction.select(id)` → pushes `?txn=id` to URL
2. `TransactionList` reads `selectedId` from `useSearchParams`
3. Grid animates to `3fr/2fr`
4. `TransactionDetailPanel` mounts with `initialData` from list row (instant render, no loading)
5. `useEffect` calls `fetchTransactionDetail(id)` — returns splits + metadata
6. Splits section + metadata section render (were skeleton placeholders)

### Field Edit
1. User edits field (e.g., merchant name) → local state updates immediately (optimistic)
2. `startTransition` → `updateTransactionFields(id, { name: newName })`
3. On success → call `onTransactionUpdated(patchedRow)` → list patches that row in state
4. On error → rollback local state via `useRef` saved value

### Split Operations
1. **Add**: Append draft row `{ tempId, categoryId: null, amount: 0 }` — save blocked until category selected (schema NOT NULL constraint)
2. **Save**: On blur → `upsertSplit(txnId, null, { categoryId, amount, notes })` → server returns real ID → replace tempId
3. **Edit**: Same optimistic pattern — update local, fire action, rollback on error
4. **Delete**: Optimistic remove → `deleteSplit(splitId, txnId)` → if last split, server clears hasSplits on parent
5. **Remaining balance**: Pure local math: `abs(transaction.normalizedAmount) - sum(splits.amount)` — red if nonzero, green if zero

### Panel Close
1. `onClose()` → `useSelectedTransaction.clear()` → removes `?txn` from URL
2. Grid animates back to `1fr`
3. Panel unmounts

## Bug Fixes (Included in This Work)

1. **`updateTransactionCategory`**: Add `revalidatePath("/transactions")` — currently missing, causes stale data on navigation
2. **`toggleReviewed`**: Add `revalidatePath("/transactions")` — same issue
3. **`updateTransactionCategory`**: Set `reviewed = false` when `categoryId` is explicitly null — semantic correctness for review workflow
4. **`transactionSelectFields`**: Add `isTransfer`, `transferPairId`, `categorySource` — needed by detail panel, useful for list display too

## Testing Strategy

Test budget: 5 behavioral tests + 1 property-based test.

| Test | Type | What It Verifies |
|------|------|------------------|
| `getTransactionDetail` returns splits with category names | Integration | Query correctness, joins, scoping |
| `updateTransactionFields` partial update | Integration | Partial update, ownership check, field persistence |
| `upsertSplit` create + update | Integration | Split creation, ID generation, NOT NULL enforcement |
| `deleteSplit` clears hasSplits on last delete | Integration | Cascading state sync between splits and parent |
| `currency-input` parseToCents roundtrip | Unit | Handles "$", ",", decimals, edge cases |
| Split remaining balance math | Property (fast-check) | `sum(splits) + remaining === abs(amount)` for arbitrary splits |

No tests for: layout CSS, panel animations, component rendering (visual — covered by Playwright E2E later).

## File Summary

| Action | File | Description |
|--------|------|-------------|
| Create | `src/hooks/use-selected-transaction.ts` | URL ?txn= management |
| Create | `src/components/atoms/currency-input.tsx` | Controlled cents input |
| Create | `src/components/molecules/editable-text.tsx` | Inline edit with blur-to-save |
| Create | `src/components/molecules/transaction-split-row.tsx` | Split row with category + amount + delete |
| Create | `src/components/molecules/transaction-metadata.tsx` | Collapsible metadata section |
| Create | `src/components/organisms/transaction-detail-panel.tsx` | Main detail panel |
| Create | `src/actions/transaction-detail.ts` | Server actions for detail + splits |
| Modify | `src/queries/transactions.ts` | Add TransactionDetail type + getTransactionDetail |
| Modify | `src/components/organisms/transaction-list.tsx` | Push layout grid, selected state |
| Modify | `src/components/molecules/transaction-row.tsx` | onClick, isActive props |
| Modify | `src/actions/transactions.ts` | Bug fixes: revalidatePath, reviewed logic |
