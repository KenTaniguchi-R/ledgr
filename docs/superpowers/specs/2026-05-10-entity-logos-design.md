# Entity Logos Design Spec

Add institution logos (bank accounts) and merchant logos (transactions) to the Ledgr UI using Plaid's built-in logo data.

## Current State

- **Merchant logos already flow end-to-end:** Plaid sync extracts `logo_url` from transaction objects → stores in `merchants.logo_url` → joined as `TransactionRow.merchantLogoUrl` in query layer. The UI does not render it yet.
- **Institution logos are fetched but discarded:** `exchangeAndStoreAccounts()` calls `institutionsGetById` but only saves `institution.name`. The `logo` (base64 PNG) and `primary_color` fields are silently dropped.
- **No avatar/image component exists** in the component library.
- **Category codes not stored:** Plaid returns `personal_finance_category.primary` (e.g. `FOOD_AND_DRINK`) on transactions, but this raw PFC code is not persisted — only the mapped local category name is stored.

## Architecture: Approach B (Logo Service Layer)

Centralizes fallback logic in a pure utility module, consistent with the existing `money.ts` and `encryption.ts` patterns.

## Data Layer

### Schema: `institution_logos` — new table

Separate table to avoid bloating `plaid_items` page cache. Institution logos are 10-27KB base64 each; storing them inline in `plaid_items` would poison every query that touches that table.

```sql
institution_logos (
  id             TEXT PRIMARY KEY,
  plaid_item_id  TEXT NOT NULL REFERENCES plaid_items(id) ON DELETE CASCADE,
  logo           TEXT NOT NULL,       -- base64-encoded 152x152 PNG
  UNIQUE(plaid_item_id)
)
```

### Schema: `plaid_items` — 1 new column

| Column | Type | Description |
|--------|------|-------------|
| `primary_color` | TEXT, nullable | Hex color string (e.g. `#004977`) — small, fine inline |

### Schema: `transactions` — 1 new column

| Column | Type | Description |
|--------|------|-------------|
| `pfc_primary` | TEXT, nullable | Plaid's raw personal finance category primary code (e.g. `FOOD_AND_DRINK`) |

This enables deriving Plaid's category icon URLs without a mapping table. Stored during transaction sync from `txn.personal_finance_category.primary`.

### Sync: `exchangeAndStoreAccounts()` (`src/actions/plaid.ts`)

**Critical:** The `institutionsGetById` call must pass `options.include_optional_metadata: true` inside the `options` object — not as a top-level parameter:

```ts
const instRes = await getPlaidClient().institutionsGetById({
  institution_id: institutionId,
  country_codes: [CountryCode.Us],
  options: { include_optional_metadata: true },
});
```

Save `institution.logo` to `institution_logos` table and `institution.primary_color` to `plaidItems.primaryColor`.

### Sync: Transaction sync (`src/lib/plaid/sync.ts`)

During `processBatch()`, extract `txn.personal_finance_category?.primary` and persist to the new `transactions.pfc_primary` column.

### Query: `InstitutionGroup` (`src/queries/accounts.ts`)

Add two fields — `logoBase64` via a left join to `institution_logos`, `primaryColor` from `plaidItems`:

```ts
interface InstitutionGroup {
  // ...existing fields
  logoBase64: string | null;   // from institution_logos.logo
  primaryColor: string | null; // from plaidItems.primaryColor
}
```

### Query: `TransactionRow` (`src/queries/transactions.ts`)

Add one field to `TransactionRow`:

```ts
pfcPrimary: string | null; // from transactions.pfc_primary
```

### Merchant logos — no changes

`merchants.logo_url` is already populated. `TransactionRow.merchantLogoUrl` is already joined. Only the UI render is missing.

## Logo Service Layer: `src/lib/logos.ts`

Pure utility module, no React, no DB access.

### `resolveEntityLogo(options) → LogoProps`

```ts
interface ResolveLogoOptions {
  logoUrl?: string | null;
  logoBase64?: string | null;
  name: string;
  primaryColor?: string | null;
  pfcPrimary?: string | null;
}

type LogoProps =
  | { type: 'image'; src: string }
  | { type: 'initials'; initial: string; backgroundColor: string };
```

Waterfall:
1. `logoUrl` → `{ type: 'image', src: logoUrl }`
2. `logoBase64` → `{ type: 'image', src: 'data:image/png;base64,${logoBase64}' }`
3. `pfcPrimary` → `{ type: 'image', src: getCategoryIconUrl(pfcPrimary) }`
4. Fallback → `{ type: 'initials', initial: name[0].toUpperCase(), backgroundColor }` using `primaryColor` if provided, otherwise a deterministic color from a fixed palette indexed by `name.charCodeAt(0) % PALETTE.length`

### `getCategoryIconUrl(pfcPrimary: string) → string`

Maps raw PFC primary codes to Plaid's hosted icon URLs:
`FOOD_AND_DRINK` → `https://plaid-category-icons.plaid.com/PFC_FOOD_AND_DRINK.png`

## Component Architecture

### New atom: `EntityAvatar` (`src/components/atoms/entity-avatar.tsx`)

**Must include `"use client"` directive** — `onError` handler requires client-side state.

Renders the output of `resolveEntityLogo()`.

```ts
interface EntityAvatarProps {
  logoUrl?: string | null;
  logoBase64?: string | null;
  name: string;
  primaryColor?: string | null;
  pfcPrimary?: string | null;
  size?: 'sm' | 'md';  // sm=24px (size-6), md=32px (size-8)
}
```

- **Image mode:** `<img>` with `rounded-full bg-white` styling (white chip prevents dark mode issues with bank logo PNGs), `onError` fallback to initials via `useState`
- **Initials mode:** colored circle with a single letter
- **Accessibility:** `alt=""` on logo images (decorative — name is rendered as adjacent text), `aria-hidden="true"` on initials div
- No shadcn `avatar` dependency — ~25 lines, avoids unnecessary Radix overhead

### Modified molecules

| Component | File | Change |
|-----------|------|--------|
| `InstitutionHeader` | `src/components/molecules/institution-header.tsx` | Add `logo?: { base64: string; primaryColor: string \| null } \| null` prop (grouped to avoid prop bloat on already-10-prop component). Render `<EntityAvatar size="md">` left of `<h3>` in the existing `flex items-center gap-3` container. |
| `TransactionRow` | `src/components/molecules/transaction-row.tsx` | Restructure name cell from `<div class="truncate pr-2">` to `<div class="flex items-center gap-1.5 pr-2">` with `truncate` moved to inner `<span>` only. Render `<EntityAvatar size="sm">` before name text. Uses `txn.merchantLogoUrl` and `txn.pfcPrimary`. No grid column changes — avatar fits inside the `1fr` column. |

### Modified organism

| Component | File | Change |
|-----------|------|--------|
| `AccountList` | `src/components/organisms/account-list.tsx` | Pass `logo` object from `InstitutionGroup` data to `InstitutionHeader`. |

### Unchanged components

- `AccountCard` — keeps Lucide type icons via `AccountTypeIcon`
- `AccountTypeIcon` — no changes, logos are at institution and transaction level

## Testing

5 unit tests for `src/lib/logos.ts` (pure functions, no DB):

1. Returns image with `logoUrl` when provided (merchant path)
2. Returns image with base64 data URI when `logoBase64` provided (institution path)
3. Returns category icon URL when `pfcPrimary` provided (fallback path)
4. Returns initials with deterministic color when nothing else available
5. `getCategoryIconUrl` produces correct URL pattern

No tests for declarative UI components or schema changes.

## Files Changed

| File | Action |
|------|--------|
| `src/db/schema/plaid.ts` | Add `institution_logos` table, add `primaryColor` column to `plaid_items` |
| `src/db/schema/transactions.ts` | Add `pfc_primary` column to `transactions` |
| `src/actions/plaid.ts` | Save institution logo + color during exchange (with correct `options` wrapper) |
| `src/lib/plaid/sync.ts` | Extract and persist `personal_finance_category.primary` during transaction sync |
| `src/queries/accounts.ts` | Add `logoBase64`, `primaryColor` to `InstitutionGroup` via join to `institution_logos` |
| `src/queries/transactions.ts` | Add `pfcPrimary` to `TransactionRow` |
| `src/lib/logos.ts` | **New** — logo resolution service |
| `src/lib/logos.test.ts` | **New** — unit tests |
| `src/components/atoms/entity-avatar.tsx` | **New** — avatar atom (`"use client"`) |
| `src/components/molecules/institution-header.tsx` | Add `logo` prop + `EntityAvatar` |
| `src/components/molecules/transaction-row.tsx` | Restructure name cell to flex + add `EntityAvatar` |
| `src/components/organisms/account-list.tsx` | Pass logo data to `InstitutionHeader` |
| Drizzle migration | Generated via `pnpm db:generate` |

## Review Findings Incorporated

Issues surfaced by staff engineer, Plaid engineer, frontend reviewer, and architecture reviewer:

1. **Separate logos table** — avoids bloating `plaid_items` page cache (staff engineer)
2. **`options.include_optional_metadata`** — must be inside `options` object, not top-level (Plaid engineer)
3. **PFC primary codes** — stored raw on transactions to enable category icon URL derivation (Plaid engineer)
4. **Transaction row flex restructure** — `truncate` moved to inner span to prevent avatar clipping (frontend)
5. **Dark mode `bg-white` chip** — prevents white-background bank logos looking like white rectangles (frontend)
6. **`"use client"` directive** — required for `onError` + `useState` in EntityAvatar (frontend + architect)
7. **`alt=""` accessibility** — logos are decorative, name is rendered as adjacent text (frontend)
8. **Grouped `logo` prop** — avoids adding 2 more props to InstitutionHeader's 10-prop signature (architect)
