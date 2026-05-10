# Entity Logos Design Spec

Add institution logos (bank accounts) and merchant logos (transactions) to the Ledgr UI using Plaid's built-in logo data.

## Current State

- **Merchant logos already flow end-to-end:** Plaid sync extracts `logo_url` from counterparties → stores in `merchants.logo_url` → joined as `TransactionRow.merchantLogoUrl` in query layer. The UI does not render it yet.
- **Institution logos are fetched but discarded:** `exchangeAndStoreAccounts()` calls `institutionsGetById` but only saves `institution.name`. The `logo` (base64 PNG) and `primary_color` fields are silently dropped.
- **No avatar/image component exists** in the component library.

## Architecture: Approach B (Logo Service Layer)

Centralizes fallback logic in a pure utility module, consistent with the existing `money.ts` and `encryption.ts` patterns.

## Data Layer

### Schema: `plaid_items` — 2 new columns

| Column | Type | Description |
|--------|------|-------------|
| `logo` | TEXT, nullable | Base64-encoded 152x152 PNG from Plaid |
| `primary_color` | TEXT, nullable | Hex color string (e.g. `#004977`) |

### Sync: `exchangeAndStoreAccounts()` (`src/actions/plaid.ts`)

Pass `include_optional_metadata: true` to the existing `institutionsGetById` call (line 61). Save `institution.logo` and `institution.primary_color` alongside `institution.name` in the `plaidItems` insert (line 96).

### Query: `InstitutionGroup` (`src/queries/accounts.ts`)

Add two fields sourced from the `plaidItems` row already in `itemMap`:

```ts
interface InstitutionGroup {
  // ...existing fields
  logoBase64: string | null;   // from plaidItems.logo
  primaryColor: string | null; // from plaidItems.primaryColor
}
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
  categoryCode?: string | null;
}

type LogoProps =
  | { type: 'image'; src: string }
  | { type: 'initials'; initial: string; backgroundColor: string };
```

Waterfall:
1. `logoUrl` → `{ type: 'image', src: logoUrl }`
2. `logoBase64` → `{ type: 'image', src: 'data:image/png;base64,${logoBase64}' }`
3. `categoryCode` → `{ type: 'image', src: getCategoryIconUrl(categoryCode) }`
4. Fallback → `{ type: 'initials', initial: name[0].toUpperCase(), backgroundColor }` using `primaryColor` if provided, otherwise a deterministic color from a fixed palette indexed by `name.charCodeAt(0) % PALETTE.length`

### `getCategoryIconUrl(categoryCode: string) → string`

Maps personal finance category codes to Plaid's hosted icon URLs:
`FOOD_AND_DRINK` → `https://plaid-category-icons.plaid.com/PFC_FOOD_AND_DRINK.png`

## Component Architecture

### New atom: `EntityAvatar` (`src/components/atoms/entity-avatar.tsx`)

Renders the output of `resolveEntityLogo()`.

```ts
interface EntityAvatarProps {
  logoUrl?: string | null;
  logoBase64?: string | null;
  name: string;
  primaryColor?: string | null;
  categoryCode?: string | null;
  size?: 'sm' | 'md';  // sm=24px, md=32px
}
```

- **Image mode:** `<img>` with rounded styling, `onError` fallback to initials
- **Initials mode:** colored circle with a single letter
- No shadcn `avatar` dependency — ~20 lines, avoids unnecessary Radix overhead

### Modified molecules

| Component | File | Change |
|-----------|------|--------|
| `InstitutionHeader` | `src/components/molecules/institution-header.tsx` | Add `logoBase64?: string \| null` and `primaryColor?: string \| null` props. Render `<EntityAvatar size="md">` left of `<h3>` in the existing `flex items-center gap-3` container. |
| `TransactionRow` | `src/components/molecules/transaction-row.tsx` | Render `<EntityAvatar size="sm">` inline before `txn.name` inside the `1fr` name column. Uses `txn.merchantLogoUrl` and `txn.categoryGroupName`. No grid column changes. |

### Modified organism

| Component | File | Change |
|-----------|------|--------|
| `AccountList` | `src/components/organisms/account-list.tsx` | Pass `logoBase64` and `primaryColor` from `InstitutionGroup` through to `InstitutionHeader`. |

### Unchanged components

- `AccountCard` — keeps Lucide type icons via `AccountTypeIcon`
- `AccountTypeIcon` — no changes, logos are at institution and transaction level

## Testing

5 unit tests for `src/lib/logos.ts` (pure functions, no DB):

1. Returns image with `logoUrl` when provided (merchant path)
2. Returns image with base64 data URI when `logoBase64` provided (institution path)
3. Returns category icon URL when `categoryCode` provided (fallback path)
4. Returns initials with deterministic color when nothing else available
5. `getCategoryIconUrl` produces correct URL pattern

No tests for declarative UI components or schema changes.

## Files Changed

| File | Action |
|------|--------|
| `src/db/schema/plaid.ts` | Add `logo`, `primaryColor` columns |
| `src/actions/plaid.ts` | Save institution logo + color during exchange |
| `src/queries/accounts.ts` | Add `logoBase64`, `primaryColor` to `InstitutionGroup` |
| `src/lib/logos.ts` | **New** — logo resolution service |
| `src/lib/logos.test.ts` | **New** — unit tests |
| `src/components/atoms/entity-avatar.tsx` | **New** — avatar atom |
| `src/components/molecules/institution-header.tsx` | Add logo prop + `EntityAvatar` |
| `src/components/molecules/transaction-row.tsx` | Add `EntityAvatar` in name cell |
| `src/components/organisms/account-list.tsx` | Pass logo data to `InstitutionHeader` |
| Drizzle migration | Generated via `pnpm db:generate` |
