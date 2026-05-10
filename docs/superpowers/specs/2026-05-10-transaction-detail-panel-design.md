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

- Transition: `transition-[grid-template-columns] duration-200 ease-out`
- Panel has `border-l` separator and `overflow-y-auto` with viewport-matching height
- Panel content uses staggered fade-in: `animate-in fade-in slide-in-from-right-2`
- Mobile (<768px): panel renders as full-width absolute overlay instead of push layout (via `useIsMobile` hook)
- Selected row gets `bg-muted` highlight
- `TransactionRow` must be wrapped in `React.memo` to prevent 50+ unnecessary re-renders on panel open/close
- `TRANSACTION_GRID_COLS` uses `overflow-hidden` on the row container — fixed pixel columns truncate naturally in the narrower 3fr column

### Panel + Bulk Action Interaction

When the bulk action bar is active (items selected), close the detail panel. The `router.refresh()` in `handleBulkComplete` would evict panel state. Simplest solution: clear `selectedId` when `selectedIds.size > 0`.

## Panel Structure

Top to bottom:

### Header (sticky)
- Close button (X icon, top-right)
- Escape key closes the panel (`useEffect` keydown listener)
- **Focus management**: on open, move focus to panel heading (`<h2>` with `tabIndex={-1}`). On close, return focus to the previously selected row via `ref`.

### Identity Section
- EntityAvatar (merchant logo/initials) + editable merchant name
- Account name (read-only)
- Editable date + pending badge if applicable
- **Date editability**: for Plaid-synced transactions, date is **read-only**. Plaid's sync overwrites dates on each sync cycle. Only manually-entered transactions allow date editing. Show a tooltip "Date is managed by your bank" on hover for synced transactions.

### Amount Section
- Large amount display: `text-2xl font-semibold tabular-nums` centered — visual anchor of the panel
- Transaction type dropdown: expense / income / transfer
- **Transfer cascade**: changing type away from "transfer" clears `transferPairId` and `isTransfer` on **both** the current transaction and its pair in a single DB transaction

### Category Section
- CategoryPill (reused from list row) — hidden when splits > 0
- "Add Split" button below — clicking creates first split and moves category control to per-split rows

### Splits Section (visible when splits exist)
- List of editable split rows in a subtle `bg-muted/30 rounded-lg p-3` container
- Each row: compact grid `[1fr_100px_32px]` — category picker, amount input, delete button
- Notes as expandable optional row below each split
- Remaining balance display: green when $0.00, red/destructive when nonzero
- "Add Split" button at bottom — **disabled while any draft row has null category**
- **Draft split indicator**: inline error text "Select a category" on rows with null `categoryId`
- **Split amounts**: always stored as positive cents regardless of transaction direction (income or expense). The remaining balance formula `abs(transaction.normalizedAmount) - sum(splits.amount)` is correct for both directions.

### Notes Section
- Textarea, auto-resize, blur-to-save

### Reviewed Toggle
- Toggle with label "Mark as Reviewed"

### Metadata Section (collapsed by default)
- Original bank description
- Category source (Manual / AI / Rule / Plaid)
- Plaid transaction ID
- Transfer pair link (clickable — calls `useSelectedTransaction.select(transferPairId)`)
- Section separators use `Separator` component, not heavy borders

## Accessibility

- **Panel role**: `role="complementary"` with `aria-label="Transaction details"`
- **Live region**: visually hidden `aria-live="polite"` in `TransactionList` announces "Transaction details opened" when panel mounts
- **Focus on open**: move to panel heading `<h2 tabIndex={-1}>`
- **Focus on close**: return to the row that was selected (via stored ref)
- **Escape to close**: keydown listener on panel container
- **Row keyboard access**: `TransactionRow` gets `role="button"`, `tabIndex={0}`, `onKeyDown` for Enter/Space to open panel

## Editable Text Pattern

The `editable-text` molecule renders as **plain text by default** with a subtle hover indicator (faint underline or edit icon). On click, transitions to a focused `<input>` with `autoFocus`. This preserves:
- Natural text selection/copy via double-click
- Clean screen reader experience (not announcing every field as editable on panel open)
- Blur-to-save with guard: only fires server action when `value !== savedRef.current`

## Component Architecture

### New Components

```
organisms/
  transaction-detail-panel.tsx    — Main panel: layout, data loading, edit orchestration
                                    Props: transactionId, initialData (TransactionRow | null),
                                    categories, onClose, onTransactionUpdated
                                    When initialData is null (URL deeplink to unloaded row),
                                    renders skeleton and fetches everything via fetchTransactionDetail

molecules/
  transaction-split-row.tsx       — One split row: category picker + amount + notes + delete
                                    Props: split, categories, onUpdate, onDelete
                                    Manages own optimistic state with useTransition

  transaction-metadata.tsx        — Collapsible read-only metadata section
                                    Props: metadata object (originalName, categorySource, etc.)

  editable-text.tsx               — Reusable inline-edit text field
                                    Props: value, onSave, placeholder, inputType
                                    Text-on-render, input-on-click, blur-to-save
                                    Optimistic with useRef rollback
                                    Guards save: skips server call if value === savedRef.current

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
                                    Find selectedRow from existing rows array (null if not loaded)
                                    Close panel when bulk selection is active
                                    Store row ref for focus restoration on panel close

molecules/
  transaction-row.tsx             — Add onClick prop (fires select)
                                    Add isActive prop (bg-muted when selected)
                                    Add role="button", tabIndex={0}, onKeyDown (Enter/Space)
                                    stopPropagation on checkbox click
                                    Wrap in React.memo for performance
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
                                         Detects soft-deleted transactions (pending→posted replacement)
                                         Returns { error: "deleted" } for soft-deleted rows
    updateTransactionFields(id, data)  — Partial update: { name?, notes?, date?, isTransfer? }
                                         Zod validated: date as YYYY-MM-DD regex, name max 255, notes max 2000
                                         Date update blocked for Plaid-synced transactions (has plaidTransactionId)
                                         Transfer type change cascades to paired transaction in db.transaction()
    upsertSplit(txnId, splitId, data)  — Create or update a split row
                                         Wrapped in db.transaction()
                                         Sets categorySource = "manual" on parent when creating first split
                                         Server-side validation: SUM(splits) must not exceed abs(normalizedAmount)
                                         Returns { error: "exceeds" } if validation fails
    deleteSplit(splitId, txnId)        — Delete split, clear hasSplits if last
                                         Wrapped in db.transaction()
                                         Derives transactionId from DB (not client-supplied) for ownership check
                                         Checks COUNT after delete to sync hasSplits on parent

queries/
  transactions.ts                 — Add:
    TransactionDetail interface        — Extends TransactionRow with splits[], isTransfer,
                                         transferPairId, categorySource, plaidTransactionId
    getTransactionDetail(hid, id, db)  — Single-transaction fetch with splits join
```

## Data Flow

### Panel Open
1. Row click → `useSelectedTransaction.select(id)` → pushes `?txn=id` to URL
2. `TransactionList` reads `selectedId` from `useSearchParams`, stores row ref for focus restore
3. Grid animates to `3fr/2fr`
4. `TransactionDetailPanel` mounts:
   - If `initialData` exists (row found in loaded `rows`): render immediately, fetch splits async
   - If `initialData` is null (URL deeplink, row not loaded): render skeleton, fetch everything
5. Focus moves to panel heading
6. `useEffect` calls `fetchTransactionDetail(id)` — returns splits + metadata
7. If response is `{ error: "deleted" }` (pending→posted), show "This transaction was updated by your bank" message and close panel
8. Splits section + metadata section render (were skeleton placeholders)

### Field Edit
1. User clicks text field → transitions to input with autoFocus
2. User edits → local state updates
3. On blur: if `value === savedRef.current`, skip. Otherwise:
4. `startTransition` → `updateTransactionFields(id, { name: newName })`
5. On success → call `onTransactionUpdated(patchedRow)` → list patches that row in state
6. On error → rollback local state via `useRef` saved value
7. **Date edge case**: if date change moves transaction outside active filter range, remove row from list state and close panel after save

### Split Operations
1. **Add**: Append draft row `{ tempId, categoryId: null, amount: 0 }` — show inline "Select a category" error, disable save
2. **Save**: On category select + amount blur → `upsertSplit(txnId, null, { categoryId, amount, notes })` in `db.transaction()`. Server validates sum doesn't exceed parent amount. Returns real ID → replace tempId. Sets `categorySource = "manual"` on parent if first split.
3. **Edit**: Same optimistic pattern — update local, fire action, rollback on error
4. **Delete**: Optimistic remove → `deleteSplit(splitId, txnId)` in `db.transaction()`. Server derives `transactionId` from DB for ownership check. If last split, clears `hasSplits` on parent.
5. **Remaining balance**: Pure local math: `abs(transaction.normalizedAmount) - sum(splits.amount)` — red if nonzero, green if zero. Split amounts always stored as positive cents.

### Panel Close
1. `onClose()` (via X button, Escape key, or bulk selection activating) → `useSelectedTransaction.clear()` → removes `?txn` from URL
2. Grid animates back to `1fr`
3. Focus returns to previously selected row
4. Panel unmounts

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
| `updateTransactionFields` partial update + Zod validation | Integration | Partial update, ownership, date regex, field limits |
| `upsertSplit` create + server-side sum validation | Integration | Split creation, sum check, categorySource cascade |
| `deleteSplit` atomicity + hasSplits sync | Integration | db.transaction wrapping, ownership via DB-derived txnId |
| `currency-input` parseToCents roundtrip | Unit | Handles "$", ",", decimals, edge cases |
| Split remaining balance math | Property (fast-check) | `sum(splits) + remaining === abs(amount)` for arbitrary splits |

No tests for: layout CSS, panel animations, component rendering (visual — covered by Playwright E2E later).

## File Summary

| Action | File | Description |
|--------|------|-------------|
| Create | `src/hooks/use-selected-transaction.ts` | URL ?txn= management |
| Create | `src/components/atoms/currency-input.tsx` | Controlled cents input |
| Create | `src/components/molecules/editable-text.tsx` | Text-to-input inline edit with blur-to-save |
| Create | `src/components/molecules/transaction-split-row.tsx` | Split row with category + amount + delete |
| Create | `src/components/molecules/transaction-metadata.tsx` | Collapsible metadata section |
| Create | `src/components/organisms/transaction-detail-panel.tsx` | Main detail panel with focus management |
| Create | `src/actions/transaction-detail.ts` | Server actions with db.transaction + Zod validation |
| Modify | `src/queries/transactions.ts` | Add TransactionDetail type + getTransactionDetail |
| Modify | `src/components/organisms/transaction-list.tsx` | Push layout, selected state, bulk/panel interaction |
| Modify | `src/components/molecules/transaction-row.tsx` | onClick, isActive, keyboard access, React.memo |
| Modify | `src/actions/transactions.ts` | Bug fixes: revalidatePath, reviewed logic |
