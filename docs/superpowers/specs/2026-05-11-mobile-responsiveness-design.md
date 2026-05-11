# Mobile Responsiveness Design

**Date:** 2026-05-11
**Status:** Approved
**Approach:** B — Clean Foundation

## Context

Ledgr's UI was built desktop-first. The sidebar never collapses, grids use fixed column counts, tables have rigid fixed-width columns, and filter inputs have hardcoded pixel widths. The app is unusable on mobile devices.

**Primary mobile use case:** Quick glance — check balances, recent transactions, budget status on the go. No heavy editing on mobile.

**Design principles:**
- Mobile-first CSS (base = mobile, scale up with `md:` / `lg:`)
- Adopt shadcn/ui patterns where they exist (Sidebar component)
- Horizontal scroll for data-heavy tables (no card-view overengineering)
- No new abstraction layers — Tailwind classes and existing atomic design hierarchy
- YAGNI: no bottom tab bar, no mobile-specific dashboard widgets, no responsive-table component

## Stack Context

- Next.js 16 App Router
- shadcn/ui v4 + Tailwind v4
- Existing atomic design: atoms (20) / molecules (49) / organisms (36 + 12 widgets) / ui (28 shadcn)
- Existing `useIsMobile()` hook at 768px breakpoint
- Dashboard grid already uses react-grid-layout with sm/md/lg breakpoints

## Section 1: Sidebar Migration to shadcn Sidebar

### Problem

Custom `sidebar-nav.tsx` is a fixed `w-60` aside with no mobile collapse. Dashboard layout uses `flex h-screen overflow-hidden` with sidebar always visible.

### Solution

Replace with shadcn's built-in Sidebar component, which automatically renders as a Sheet (drawer overlay) on mobile and a collapsible panel on desktop.

### New Component Structure

```
<> (Fragment — keeps ChatPanelLoader outside SidebarProvider)
├── SidebarProvider (defaultOpen={true})
│   ├── Sidebar (variant="inset", collapsible="offcanvas")
│   │   ├── SidebarHeader
│   │   │   └── "Ledgr" branding (Link to /)
│   │   ├── SidebarContent
│   │   │   └── SidebarGroup
│   │   │       └── SidebarMenu
│   │   │           └── SidebarMenuItem x 9
│   │   │               └── SidebarMenuButton (with icon + label)
│   │   └── SidebarFooter
│   │       └── User info (name, email) + sign out button
│   └── SidebarInset
│       ├── header (mobile only: SidebarTrigger hamburger)
│       └── main ({children} with responsive padding)
└── ChatPanelLoader (MUST be outside SidebarProvider — SidebarInset may use CSS transform which creates a stacking context and traps z-50 elements)
```

### Client/Server Boundary

The current `layout.tsx` is an async Server Component (calls `await getSession()`). `SidebarProvider` is a client component. Solution: extract a `DashboardShell` client component that receives `children`, `userName`, `userEmail` as props and renders the SidebarProvider + Sidebar + SidebarInset structure. The server layout passes props down after the auth check.

### Auto-Close on Navigation

The mobile sidebar Sheet must close when a nav link is clicked. Use `useSidebar().setOpenMobile(false)` in the `SidebarMenuButton` `onClick` handler (or wrap nav items in a component that calls it on click).

### Behavior

| Viewport | Sidebar rendering | Trigger |
|---|---|---|
| < 768px (mobile) | Sheet overlay, slides from left | Hamburger icon in mobile header |
| >= 768px (desktop) | Fixed panel, collapsible offcanvas | SidebarTrigger button |

### Files Modified

- `src/components/organisms/sidebar-nav.tsx` — rewrite using shadcn Sidebar primitives (SidebarHeader, SidebarContent, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarFooter)
- `src/app/(dashboard)/layout.tsx` — extract `DashboardShell` client component, wrap children in `SidebarProvider` + `SidebarInset`, keep ChatPanelLoader outside

### What Stays the Same

- `NAV_ITEMS` array (same 9 items, same icons, same hrefs)
- Active state logic (`usePathname()` comparison)
- Auth check in layout (redirect if not authenticated)
- User info display (name, email, sign out)

### New Dependency

**Prerequisite:** `src/components/ui/sidebar.tsx` does not currently exist. Run `npx shadcn@latest add sidebar` as the first implementation step. This adds `SidebarProvider`, `Sidebar`, `SidebarContent`, `SidebarHeader`, `SidebarFooter`, `SidebarMenu`, `SidebarMenuItem`, `SidebarMenuButton`, `SidebarTrigger`, `SidebarInset`, and the `useSidebar` hook. After install, verify that existing sidebar CSS variables in `globals.css` (`--sidebar`, `--sidebar-foreground`, `--sidebar-accent`, etc.) were not overwritten with defaults — restore custom values if so.

## Section 2: Page Grid Responsiveness

### Convention

Mobile-first: base styles = mobile (1 column), scale up with breakpoints.

### Changes

| Page/Component | File | Current | New |
|---|---|---|---|
| Accounts summary cards | `src/app/(dashboard)/accounts/page.tsx` | `grid-cols-3` | Keep `grid-cols-3` — these 3 compact summary cards (Net Worth/Assets/Debts) should stay side-by-side even on mobile. Add `gap-2 sm:gap-4` for tighter mobile spacing and `text-xs sm:text-sm` for summary values. |
| Dashboard summary cards | `src/components/organisms/widgets/dashboard-summary-cards.tsx` | `grid-cols-2` | `grid-cols-2` (keep 2-col — these are compact stat cards). Add `overflow-y-auto` to the widget container as a safety valve since the cards may exceed react-grid-layout's fixed `rowHeight` on narrow viewports with wrapped text. |
| Loading skeleton | `src/app/(dashboard)/loading.tsx` | `grid-cols-4` with `col-span-2` | `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4` — also update spans to `sm:col-span-2` and `sm:row-span-2` so they only apply when there are enough columns |

### No Changes Needed

- `dashboard-grid.tsx` — already uses react-grid-layout with `cols: { sm: 1, md: 2, lg: 2 }` breakpoints
- `investment-page-layout.tsx` — already `grid-cols-1 lg:grid-cols-2`
- Transaction and budget pages — already vertical `space-y-*` layouts

### Responsive Spacing Convention

- Main content padding (in SidebarInset): `px-4 py-4 md:px-6 md:py-6 lg:px-8`
- Page header gaps: `gap-4 md:gap-6`

## Section 3: Data Tables — Horizontal Scroll

### Pattern

Wrap fixed-width grid/table components in `overflow-x-auto` with a `min-w-[Xpx]` inner div to prevent column collapse.

### Changes

| Component | File | Wrapper |
|---|---|---|
| Holdings table | `src/components/organisms/holdings-table.tsx` | Wrap the outer `<div className="border rounded-lg overflow-hidden">` container (which contains both header and all HoldingRow children) in `<div className="overflow-x-auto"><div className="min-w-[700px]">` |
| Income/expense table | `src/components/molecules/income-expense-category-table.tsx` | `<div className="overflow-x-auto"><div className="min-w-[500px]">` around the table |
| Budget group table | `src/components/organisms/budget-group-section.tsx` | `<div className="overflow-x-auto">` around the budget table |
| Import preview | `src/components/molecules/import-preview.tsx` | Already has `overflow-x-auto` — verify it works |

### Transaction Row

The `TRANSACTION_GRID_COLS` constant in `transaction-row.tsx` is exported and shared with the header row in `transaction-list.tsx`. Both must use the same responsive template.

**Change:** Replace the single constant with a responsive class string:
- Mobile: `grid-cols-[24px_minmax(0,1fr)_auto_80px]` — drops checkbox column, shrinks amount to 80px, ensures `1fr` has room for merchant name
- Desktop: `sm:grid-cols-[24px_32px_minmax(0,1fr)_auto_100px]` — full layout with checkbox

Both `transaction-row.tsx` and `transaction-list.tsx` (header row) must use this updated constant. The checkbox cell itself gets `hidden sm:block`.

**Files:** `src/components/molecules/transaction-row.tsx`, `src/components/organisms/transaction-list.tsx`

## Section 3b: Touch Accessibility Fixes

### Hover-Only Elements

`account-card.tsx`: The edit button uses `opacity-0 group-hover/card:opacity-100` — invisible on touchscreens. Fix: `sm:opacity-0 sm:group-hover/card:opacity-100` (always visible on mobile, hover-reveal on desktop).

### Touch Target Sizes

- **Transaction rows:** `h-9` (36px) is below the 44px minimum. Change to `h-11 sm:h-9` for comfortable mobile tapping.
- **Filter toggle button:** `size="xs"` (~28px). Change to `size="sm"` or add `min-h-[44px] min-w-[44px]` on mobile.
- **SidebarTrigger:** shadcn default is 36px. Add `className="h-11 w-11"` for the mobile header trigger.

### Horizontal Scroll Hint

Add a subtle right-edge fade to scrollable table containers so users discover the scroll:
```
className="overflow-x-auto [mask-image:linear-gradient(to_right,black_calc(100%-24px),transparent)]"
```

**Files:** `src/components/molecules/account-card.tsx`, `src/components/molecules/transaction-row.tsx`, `src/components/organisms/transaction-filters.tsx`

## Section 4: Transaction Filters — Mobile Stack

### Current State

Horizontal `flex flex-wrap` with 8+ fixed-width inputs. Partially handled: "Filters" button with `md:hidden` toggles visibility.

### Changes

| Element | Current | New |
|---|---|---|
| Search input | `w-[180px]` | `w-full sm:w-[180px]` |
| Select dropdowns | `w-[160px]` | `w-full sm:w-[160px]` |
| Date inputs | `w-[130px]` | `w-full sm:w-[130px]` |
| Amount inputs | `w-[80px]` | Keep as-is (group in `grid grid-cols-2 gap-2`) |
| Filter container | `flex flex-wrap` | `flex flex-col sm:flex-row sm:flex-wrap` |
| Sort selects | `w-[120px]` | `w-full sm:w-[120px]` |

File: `src/components/organisms/transaction-filters.tsx`

## Section 5: Mobile Header Bar

### New Element

A thin header inside `SidebarInset` visible only on mobile, providing access to the sidebar drawer.

```tsx
<header className="flex h-12 items-center gap-2 border-b px-4 pt-[env(safe-area-inset-top)] bg-background/95 backdrop-blur-sm md:hidden">
  <SidebarTrigger className="h-11 w-11" />
  {/* Optional: page title or breadcrumb */}
</header>
```

Safe area insets (`env(safe-area-inset-*)`) handle iPhone notch/Dynamic Island. The sidebar Sheet footer (sign-out button) should also use `pb-[env(safe-area-inset-bottom)]` for the home indicator area.

This is part of the dashboard layout refactor in Section 1. Not a new component — just a `<header>` element inside the SidebarInset markup.

## Out of Scope (YAGNI)

- Bottom tab bar navigation
- Card-view alternatives for tables on mobile
- New `responsive-table` molecule component
- Mobile-specific dashboard widget arrangement
- Changes to dashboard-grid layout (already responsive)
- `useIsMobile` hook changes (768px matches shadcn and Tailwind `md`)

## Files Changed Summary

| File | Change Type |
|---|---|
| `src/components/ui/sidebar.tsx` | New (shadcn install) |
| `src/components/organisms/sidebar-nav.tsx` | Rewrite (shadcn Sidebar primitives) |
| `src/app/(dashboard)/layout.tsx` | Refactor (extract DashboardShell client component, SidebarProvider + SidebarInset) |
| `src/app/(dashboard)/accounts/page.tsx` | Responsive spacing on summary cards |
| `src/components/organisms/widgets/dashboard-summary-cards.tsx` | overflow-y-auto safety valve |
| `src/app/(dashboard)/loading.tsx` | Responsive grid + responsive spans |
| `src/components/organisms/holdings-table.tsx` | overflow-x-auto wrapper with scroll hint |
| `src/components/molecules/income-expense-category-table.tsx` | overflow-x-auto wrapper |
| `src/components/organisms/budget-group-section.tsx` | overflow-x-auto wrapper |
| `src/components/organisms/transaction-filters.tsx` | Responsive widths + stack + touch targets |
| `src/components/molecules/transaction-row.tsx` | Responsive grid template (drop checkbox on mobile) |
| `src/components/organisms/transaction-list.tsx` | Updated header row to match responsive grid template |
| `src/components/molecules/account-card.tsx` | Fix hover-only edit button for touch |
| `src/app/globals.css` | Verify sidebar CSS vars after shadcn install |

### Suggested PR Split

- **PR 1 (Sidebar):** Sections 1 + 5 — sidebar-nav rewrite + layout refactor + mobile header. Independent, zero risk to other components.
- **PR 2 (Responsive):** Sections 2 + 3 + 3b + 4 — grids, tables, filters, touch fixes. All additive CSS changes.

### Known Caveats

- `useIsMobile()` returns `false` on SSR/first render — components using it for layout (TransactionList) will flash desktop layout on mobile. Out of scope for this PR, tracked as follow-up.
- `defaultOpen` on SidebarProvider only affects desktop sidebar state (mobile always starts closed).
- Do not use `useIsMobile` inside the new sidebar — shadcn's `useSidebar().isMobile` handles this internally.
- Tailwind v4 container queries (`@container`) could improve dashboard widget responsiveness — deferred to follow-up.

## Testing

- Manual browser testing at 375px (iPhone SE), 390px (iPhone 14), 768px (iPad), and 1280px+ (desktop)
- Verify sidebar drawer opens/closes on mobile
- Verify all pages render without horizontal page-level overflow
- Verify data tables scroll horizontally within their containers
- Verify transaction filters stack properly on mobile
- Run `pnpm typecheck` and `pnpm lint` after all changes
