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
SidebarProvider (defaultOpen={true})
├── Sidebar (variant="inset", collapsible="offcanvas")
│   ├── SidebarHeader
│   │   └── "Ledgr" branding (Link to /)
│   ├── SidebarContent
│   │   └── SidebarGroup
│   │       └── SidebarMenu
│   │           └── SidebarMenuItem x 9
│   │               └── SidebarMenuButton (with icon + label)
│   └── SidebarFooter
│       └── User info (name, email) + sign out button
└── SidebarInset
    ├── header (mobile only: SidebarTrigger hamburger)
    └── main ({children} with responsive padding)
```

### Behavior

| Viewport | Sidebar rendering | Trigger |
|---|---|---|
| < 768px (mobile) | Sheet overlay, slides from left | Hamburger icon in mobile header |
| >= 768px (desktop) | Fixed panel, collapsible offcanvas | SidebarTrigger button |

### Files Modified

- `src/components/organisms/sidebar-nav.tsx` — rewrite using shadcn Sidebar primitives (SidebarHeader, SidebarContent, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarFooter)
- `src/app/(dashboard)/layout.tsx` — wrap children in `SidebarProvider` + `SidebarInset`, remove manual flex layout

### What Stays the Same

- `NAV_ITEMS` array (same 9 items, same icons, same hrefs)
- Active state logic (`usePathname()` comparison)
- Auth check in layout (redirect if not authenticated)
- User info display (name, email, sign out)

### New Dependency

Check if `src/components/ui/sidebar.tsx` exists. If not, run `npx shadcn@latest add sidebar`. This adds `SidebarProvider`, `Sidebar`, `SidebarContent`, `SidebarHeader`, `SidebarFooter`, `SidebarMenu`, `SidebarMenuItem`, `SidebarMenuButton`, `SidebarTrigger`, `SidebarInset`, and the `useSidebar` hook.

## Section 2: Page Grid Responsiveness

### Convention

Mobile-first: base styles = mobile (1 column), scale up with breakpoints.

### Changes

| Page/Component | File | Current | New |
|---|---|---|---|
| Accounts grid | `src/app/(dashboard)/accounts/page.tsx` | `grid-cols-3` | `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3` |
| Dashboard summary cards | `src/components/organisms/widgets/dashboard-summary-cards.tsx` | `grid-cols-2` | `grid-cols-1 sm:grid-cols-2` |
| Loading skeleton | `src/app/(dashboard)/loading.tsx` | `grid-cols-4` | `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4` |

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
| Holdings table | `src/components/organisms/holdings-table.tsx` | `<div className="overflow-x-auto"><div className="min-w-[700px]">` around the grid |
| Income/expense table | `src/components/molecules/income-expense-category-table.tsx` | `<div className="overflow-x-auto"><div className="min-w-[500px]">` around the table |
| Budget group table | `src/components/organisms/budget-group-section.tsx` | `<div className="overflow-x-auto">` around the budget table |
| Import preview | `src/components/molecules/import-preview.tsx` | Already has `overflow-x-auto` — verify it works |

### Transaction Row

The `transaction-row.tsx` grid (`grid-cols-[24px_32px_1fr_auto_100px]`) works at mobile widths because `1fr` absorbs compression. Minor tweak: hide checkbox column on mobile with `hidden sm:block` on the checkbox cell, adjusting grid template accordingly.

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
<header className="flex h-12 items-center gap-2 border-b px-4 md:hidden">
  <SidebarTrigger />
  {/* Optional: page title or breadcrumb */}
</header>
```

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
| `src/components/organisms/sidebar-nav.tsx` | Rewrite (shadcn Sidebar) |
| `src/app/(dashboard)/layout.tsx` | Refactor (SidebarProvider + SidebarInset) |
| `src/app/(dashboard)/accounts/page.tsx` | Grid breakpoints |
| `src/components/organisms/widgets/dashboard-summary-cards.tsx` | Grid breakpoints |
| `src/app/(dashboard)/loading.tsx` | Grid breakpoints |
| `src/components/organisms/holdings-table.tsx` | overflow-x-auto wrapper |
| `src/components/molecules/income-expense-category-table.tsx` | overflow-x-auto wrapper |
| `src/components/organisms/budget-group-section.tsx` | overflow-x-auto wrapper |
| `src/components/organisms/transaction-filters.tsx` | Responsive widths + stack |
| `src/components/molecules/transaction-row.tsx` | Hide checkbox on mobile |

## Testing

- Manual browser testing at 375px (iPhone SE), 390px (iPhone 14), 768px (iPad), and 1280px+ (desktop)
- Verify sidebar drawer opens/closes on mobile
- Verify all pages render without horizontal page-level overflow
- Verify data tables scroll horizontally within their containers
- Verify transaction filters stack properly on mobile
- Run `pnpm typecheck` and `pnpm lint` after all changes
