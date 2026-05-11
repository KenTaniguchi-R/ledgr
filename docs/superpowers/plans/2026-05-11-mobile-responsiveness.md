# Mobile Responsiveness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Ledgr usable on mobile devices — collapsible sidebar, responsive grids, scrollable tables, touch-friendly controls.

**Architecture:** Replace custom sidebar with shadcn Sidebar (auto mobile Sheet/drawer). Extract a `DashboardShell` client component to bridge the server layout's auth check with client-side SidebarProvider. Apply mobile-first Tailwind breakpoints to all page grids. Wrap data tables in horizontal scroll containers. Fix touch targets and hover-only elements.

**Tech Stack:** Next.js 16 App Router, shadcn/ui v4 Sidebar, Tailwind v4 responsive utilities

**Spec:** `docs/superpowers/specs/2026-05-11-mobile-responsiveness-design.md`

---

## PR 1: Sidebar Migration (Sections 1 + 5)

### Task 1: Install shadcn Sidebar Component

**Files:**
- Create: `src/components/ui/sidebar.tsx` (via shadcn CLI)
- Verify: `src/app/globals.css` (CSS variables preserved)

- [ ] **Step 1: Snapshot existing sidebar CSS variables**

```bash
grep -n 'sidebar' src/app/globals.css
```

Save the output — you need to compare after install.

- [ ] **Step 2: Install shadcn sidebar**

```bash
pnpm dlx shadcn@latest add sidebar
```

- [ ] **Step 3: Verify CSS variables were not overwritten**

```bash
grep -n 'sidebar' src/app/globals.css
```

Compare with Step 1 output. If any custom `oklch(...)` values for `--sidebar`, `--sidebar-foreground`, `--sidebar-accent`, `--sidebar-primary`, `--sidebar-border`, `--sidebar-ring`, `--sidebar-accent-foreground`, `--sidebar-primary-foreground` were replaced with different values, restore the original values from the Step 1 snapshot.

- [ ] **Step 4: Verify sidebar.tsx was created**

```bash
ls -la src/components/ui/sidebar.tsx
```

Expected: file exists.

- [ ] **Step 5: Type-check**

```bash
pnpm typecheck
```

Expected: PASS (no type errors introduced).

- [ ] **Step 6: Commit**

```bash
git add src/components/ui/sidebar.tsx src/app/globals.css
git commit -m "feat: install shadcn sidebar component"
```

---

### Task 2: Rewrite sidebar-nav.tsx with shadcn Sidebar Primitives

**Files:**
- Modify: `src/components/organisms/sidebar-nav.tsx`

The rewritten component uses shadcn Sidebar primitives and auto-closes on mobile navigation. It no longer renders the `<aside>` or the outer Sidebar/SidebarProvider — those will be in DashboardShell (Task 3). This component renders the *contents* that go inside the Sidebar.

- [ ] **Step 1: Rewrite sidebar-nav.tsx**

Replace the entire contents of `src/components/organisms/sidebar-nav.tsx` with:

```tsx
"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Building2,
  ArrowLeftRight,
  TrendingUp,
  Wallet,
  BarChart3,
  Receipt,
  LogOut,
  Upload,
  Settings,
} from "lucide-react";
import { authClient } from "@/lib/auth/client";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

interface SidebarNavProps {
  userName: string;
  userEmail: string;
}

const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/accounts", label: "Accounts", icon: Building2 },
  { href: "/investments", label: "Investments", icon: TrendingUp },
  { href: "/transactions", label: "Transactions", icon: ArrowLeftRight },
  { href: "/budgets", label: "Budgets", icon: Wallet },
  { href: "/bills", label: "Bills", icon: Receipt },
  { href: "/reports", label: "Reports", icon: BarChart3 },
  { href: "/import", label: "Import", icon: Upload },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function SidebarNav({ userName, userEmail }: SidebarNavProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { setOpenMobile } = useSidebar();

  async function handleSignOut() {
    await authClient.signOut();
    router.push("/login");
  }

  return (
    <Sidebar variant="inset" collapsible="offcanvas">
      <SidebarHeader className="px-4 py-4">
        <Link href="/" className="text-lg font-bold tracking-tight">
          Ledgr
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            {NAV_ITEMS.map((item) => {
              const isActive =
                item.href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(item.href);
              return (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    asChild
                    isActive={isActive}
                    tooltip={item.label}
                  >
                    <Link
                      href={item.href}
                      onClick={() => setOpenMobile(false)}
                    >
                      <item.icon />
                      <span>{item.label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="pb-[env(safe-area-inset-bottom)]">
        <div className="flex items-center justify-between px-2">
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{userName}</p>
            <p className="text-xs text-sidebar-foreground/60 truncate">
              {userEmail}
            </p>
          </div>
          <button
            onClick={handleSignOut}
            aria-label="Sign out"
            className="text-sidebar-foreground/60 hover:text-sidebar-foreground p-1.5 rounded-md hover:bg-sidebar-accent transition-colors"
          >
            <LogOut className="size-4" />
          </button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
pnpm typecheck
```

Expected: Will fail because `SidebarNav` now requires `useSidebar()` which needs `SidebarProvider` as an ancestor. That's expected — Task 3 adds the provider.

- [ ] **Step 3: Commit**

```bash
git add src/components/organisms/sidebar-nav.tsx
git commit -m "refactor: rewrite sidebar-nav with shadcn Sidebar primitives"
```

---

### Task 3: Extract DashboardShell and Refactor Dashboard Layout

**Files:**
- Create: `src/components/organisms/dashboard-shell.tsx`
- Modify: `src/app/(dashboard)/layout.tsx`

The server layout keeps its auth check and passes props to a new `DashboardShell` client component. `DashboardShell` renders `SidebarProvider` + `SidebarNav` + `SidebarInset` (with mobile header). `ChatPanelLoader` stays **outside** `SidebarProvider` as a sibling at the fragment level.

- [ ] **Step 1: Create dashboard-shell.tsx**

Create `src/components/organisms/dashboard-shell.tsx`:

```tsx
"use client";

import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { SidebarNav } from "@/components/organisms/sidebar-nav";

interface DashboardShellProps {
  userName: string;
  userEmail: string;
  children: React.ReactNode;
}

export function DashboardShell({ userName, userEmail, children }: DashboardShellProps) {
  return (
    <SidebarProvider defaultOpen>
      <SidebarNav userName={userName} userEmail={userEmail} />
      <SidebarInset>
        <header className="flex h-12 items-center gap-2 border-b px-4 pt-[env(safe-area-inset-top)] bg-background/95 backdrop-blur-sm md:hidden">
          <SidebarTrigger className="h-11 w-11" />
          <span className="text-sm font-semibold">Ledgr</span>
        </header>
        <main className="flex-1 overflow-auto px-4 py-4 md:px-6 md:py-6 lg:px-8">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
```

- [ ] **Step 2: Refactor layout.tsx to use DashboardShell**

Replace `src/app/(dashboard)/layout.tsx` with:

```tsx
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getUserAiSettings } from "@/queries/settings";
import { DashboardShell } from "@/components/organisms/dashboard-shell";
import { ChatPanelLoader } from "@/components/organisms/chat-panel-loader";
import { seedDemoHousehold } from "@/db/seed/demo";

seedDemoHousehold().catch((e) => console.error("[demo] seed failed:", e));

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const aiSettings = await getUserAiSettings(session.user.id);
  const hasAiConfigured = !!(aiSettings?.hasKey && aiSettings?.aiProvider);

  return (
    <>
      <DashboardShell
        userName={session.user?.name ?? "User"}
        userEmail={session.user?.email ?? ""}
      >
        {children}
      </DashboardShell>
      <ChatPanelLoader hasAiConfigured={hasAiConfigured} />
    </>
  );
}
```

- [ ] **Step 3: Type-check**

```bash
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 4: Lint**

```bash
pnpm lint
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/organisms/dashboard-shell.tsx src/app/\(dashboard\)/layout.tsx
git commit -m "feat: extract DashboardShell with SidebarProvider and mobile header"
```

---

### Task 4: Manual Verification — Sidebar on Desktop and Mobile

- [ ] **Step 1: Start dev server**

```bash
pnpm dev
```

- [ ] **Step 2: Desktop check (1280px+)**

Open the app in a browser. Verify:
- Sidebar renders as a fixed panel on the left
- All 9 nav items are visible with icons and labels
- Active state highlights the current route
- "Ledgr" branding is in the sidebar header
- User name/email and sign-out button are in the footer
- Clicking nav items navigates correctly
- ChatPanelLoader (AI chat FAB) is visible and floats above sidebar content

- [ ] **Step 3: Mobile check (375px via DevTools)**

Open Chrome DevTools, toggle device toolbar, select iPhone SE (375px). Verify:
- Sidebar is NOT visible — replaced by a thin header with hamburger icon
- Mobile header shows hamburger + "Ledgr" text
- Tapping hamburger opens a Sheet/drawer overlay from the left
- All 9 nav items are visible in the drawer
- Tapping a nav item navigates AND auto-closes the drawer
- Sign-out button is accessible at the bottom of the drawer
- ChatPanelLoader FAB is visible and NOT trapped behind the Sheet overlay
- Main content has tighter padding (`px-4 py-4`)

- [ ] **Step 4: Commit verification checkpoint**

```bash
git log --oneline -5
```

Expected: 3 commits from Tasks 1-3.

---

## PR 2: Responsive Grids, Tables, Filters, Touch Fixes (Sections 2 + 3 + 3b + 4)

### Task 5: Responsive Page Grids

**Files:**
- Modify: `src/app/(dashboard)/accounts/page.tsx:26`
- Modify: `src/components/organisms/widgets/dashboard-summary-cards.tsx:12`
- Modify: `src/app/(dashboard)/loading.tsx:8-10`

- [ ] **Step 1: Update accounts page summary card grid spacing**

In `src/app/(dashboard)/accounts/page.tsx`, change line 26:

```tsx
// OLD:
<div className="grid grid-cols-3 gap-4">

// NEW:
<div className="grid grid-cols-3 gap-2 sm:gap-4">
```

- [ ] **Step 2: Add overflow safety to dashboard summary cards**

In `src/components/organisms/widgets/dashboard-summary-cards.tsx`, change line 12:

```tsx
// OLD:
<div className="grid grid-cols-2 gap-3 h-full">

// NEW:
<div className="grid grid-cols-2 gap-3 h-full overflow-y-auto">
```

- [ ] **Step 3: Make loading skeleton responsive**

Replace `src/app/(dashboard)/loading.tsx` with:

```tsx
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export default function DashboardLoading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-48" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i} className={i % 3 === 0 ? "sm:col-span-2 sm:row-span-2" : "sm:col-span-1"}>
            <CardHeader className="pb-2 pt-3 px-4">
              <Skeleton className="h-4 w-24" />
            </CardHeader>
            <CardContent className="pb-3 px-4">
              <Skeleton className="h-full min-h-[120px] w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Type-check**

```bash
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/\(dashboard\)/accounts/page.tsx src/components/organisms/widgets/dashboard-summary-cards.tsx src/app/\(dashboard\)/loading.tsx
git commit -m "feat: add responsive grid breakpoints to page layouts"
```

---

### Task 6: Responsive Transaction Grid Template

**Files:**
- Modify: `src/components/molecules/transaction-row.tsx:14-15, 45, 49-57`
- Modify: `src/components/organisms/transaction-list.tsx:83-90`

The `TRANSACTION_GRID_COLS` constant is shared between the row and the header. Both must use the same responsive template. On mobile, the checkbox column is hidden and the amount column shrinks.

- [ ] **Step 1: Update TRANSACTION_GRID_COLS in transaction-row.tsx**

In `src/components/molecules/transaction-row.tsx`, replace line 14-15:

```tsx
// OLD:
export const TRANSACTION_GRID_COLS =
  "grid-cols-[24px_32px_1fr_auto_100px]" as const;

// NEW:
export const TRANSACTION_GRID_COLS =
  "grid-cols-[24px_minmax(0,1fr)_auto_80px] sm:grid-cols-[24px_32px_minmax(0,1fr)_auto_100px]" as const;
```

- [ ] **Step 2: Update transaction row height for mobile touch targets**

In `src/components/molecules/transaction-row.tsx`, on line 45 change the className:

```tsx
// OLD:
`group/row grid ${TRANSACTION_GRID_COLS} items-center h-9 px-2 border-b border-border/50 text-sm hover:bg-muted/30 transition-colors cursor-pointer`,

// NEW:
`group/row grid ${TRANSACTION_GRID_COLS} items-center h-11 sm:h-9 px-2 border-b border-border/50 text-sm hover:bg-muted/30 transition-colors cursor-pointer`,
```

- [ ] **Step 3: Hide checkbox column on mobile**

In `src/components/molecules/transaction-row.tsx`, change the checkbox container div (line 54):

```tsx
// OLD:
<div className="flex items-center justify-center" onClick={handleCheckboxClick}>

// NEW:
<div className="hidden sm:flex items-center justify-center" onClick={handleCheckboxClick}>
```

- [ ] **Step 4: Update header row in transaction-list.tsx**

In `src/components/organisms/transaction-list.tsx`, replace the header row (line 83-90):

```tsx
// OLD:
<div className={`grid ${TRANSACTION_GRID_COLS} items-center h-8 px-2 border-b text-xs font-medium text-muted-foreground`}>
  <div />
  <div className="flex items-center justify-center">
    <Checkbox
      checked={selected.size > 0 && selected.size === rows.length}
      indeterminate={selected.size > 0 && selected.size < rows.length}
      onCheckedChange={handleSelectAll}
    />
  </div>
  <span>Description</span>
  <span>Category</span>
  <span className="text-right">Amount</span>
</div>

// NEW:
<div className={`grid ${TRANSACTION_GRID_COLS} items-center h-8 px-2 border-b text-xs font-medium text-muted-foreground`}>
  <div />
  <div className="hidden sm:flex items-center justify-center">
    <Checkbox
      checked={selected.size > 0 && selected.size === rows.length}
      indeterminate={selected.size > 0 && selected.size < rows.length}
      onCheckedChange={handleSelectAll}
    />
  </div>
  <span>Description</span>
  <span>Category</span>
  <span className="text-right">Amount</span>
</div>
```

- [ ] **Step 5: Type-check**

```bash
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/molecules/transaction-row.tsx src/components/organisms/transaction-list.tsx
git commit -m "feat: responsive transaction grid — hide checkbox, enlarge rows on mobile"
```

---

### Task 7: Horizontal Scroll Wrappers for Data Tables

**Files:**
- Modify: `src/components/organisms/holdings-table.tsx:60-70`
- Modify: `src/components/molecules/income-expense-category-table.tsx:14-18`
- Modify: `src/components/organisms/budget-group-section.tsx:38-49`

- [ ] **Step 1: Wrap holdings table in scroll container**

In `src/components/organisms/holdings-table.tsx`, wrap the `<div className="border rounded-lg overflow-hidden">` (line 60) and its closing `</div>` (line 70):

```tsx
// OLD (line 60-70):
      <div className="border rounded-lg overflow-hidden">
        <div className="grid grid-cols-[minmax(80px,1fr)_2fr_80px_80px_100px_100px_100px_90px] gap-2 items-center h-8 px-3 text-xs font-medium text-muted-foreground bg-muted/30 border-b">
          ...
        </div>
        {sorted.map((h, i) => (
          ...
        ))}
        ...
      </div>

// NEW:
      <div className="overflow-x-auto [mask-image:linear-gradient(to_right,black_calc(100%-24px),transparent)]">
        <div className="min-w-[700px]">
          <div className="border rounded-lg overflow-hidden">
            <div className="grid grid-cols-[minmax(80px,1fr)_2fr_80px_80px_100px_100px_100px_90px] gap-2 items-center h-8 px-3 text-xs font-medium text-muted-foreground bg-muted/30 border-b">
              ...
            </div>
            {sorted.map((h, i) => (
              ...
            ))}
            ...
          </div>
        </div>
      </div>
```

Concretely, add these two opening divs before line 60:

```tsx
      <div className="overflow-x-auto [mask-image:linear-gradient(to_right,black_calc(100%-24px),transparent)]">
        <div className="min-w-[700px]">
```

And close them after the matching `</div>` at line 70:

```tsx
        </div>
      </div>
```

- [ ] **Step 2: Wrap income/expense category table**

In `src/components/molecules/income-expense-category-table.tsx`, wrap the root `<div className="border rounded-lg">` (line 14):

```tsx
// OLD (line 14-18):
    <div className="border rounded-lg">
      <Section label="Income Sources" rows={incomeRows} onCategoryClick={onCategoryClick} />
      <div className="border-t" />
      <Section label="Expense Categories" rows={expenseRows} onCategoryClick={onCategoryClick} />
    </div>

// NEW:
    <div className="overflow-x-auto [mask-image:linear-gradient(to_right,black_calc(100%-24px),transparent)]">
      <div className="min-w-[500px]">
        <div className="border rounded-lg">
          <Section label="Income Sources" rows={incomeRows} onCategoryClick={onCategoryClick} />
          <div className="border-t" />
          <Section label="Expense Categories" rows={expenseRows} onCategoryClick={onCategoryClick} />
        </div>
      </div>
    </div>
```

- [ ] **Step 3: Wrap budget group table**

In `src/components/organisms/budget-group-section.tsx`, wrap the `<table>` element (line 38-48):

```tsx
// OLD (line 38-48):
        <table className="w-full">
          <tbody>
            {categories.map((cat) => (
              ...
            ))}
          </tbody>
        </table>

// NEW:
        <div className="overflow-x-auto">
          <table className="w-full">
            <tbody>
              {categories.map((cat) => (
                ...
              ))}
            </tbody>
          </table>
        </div>
```

- [ ] **Step 4: Type-check**

```bash
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/organisms/holdings-table.tsx src/components/molecules/income-expense-category-table.tsx src/components/organisms/budget-group-section.tsx
git commit -m "feat: add horizontal scroll wrappers to data tables"
```

---

### Task 8: Touch Accessibility — Account Card and Filter Button

**Files:**
- Modify: `src/components/molecules/account-card.tsx:31`
- Modify: `src/components/organisms/transaction-filters.tsx:76, 96-97, 100, 110, 119, 133, 138, 144, 150`

- [ ] **Step 1: Fix hover-only edit button on account card**

In `src/components/molecules/account-card.tsx`, change line 31:

```tsx
// OLD:
className="opacity-0 group-hover/card:opacity-100 group-focus-within/card:opacity-100 transition-opacity h-7 w-7 p-0"

// NEW:
className="sm:opacity-0 sm:group-hover/card:opacity-100 group-focus-within/card:opacity-100 transition-opacity h-7 w-7 p-0"
```

- [ ] **Step 2: Fix filter toggle button touch target**

In `src/components/organisms/transaction-filters.tsx`, change line 76:

```tsx
// OLD:
          size="xs"
          className="text-xs md:hidden"

// NEW:
          size="sm"
          className="text-xs md:hidden min-h-[44px]"
```

- [ ] **Step 3: Make filter container stack on mobile**

In `src/components/organisms/transaction-filters.tsx`, change line 96-97:

```tsx
// OLD:
        "flex flex-wrap items-center gap-2",
        !filtersExpanded && "hidden md:flex",

// NEW:
        "flex flex-col sm:flex-row sm:flex-wrap items-start sm:items-center gap-2",
        !filtersExpanded && "hidden md:flex",
```

- [ ] **Step 4: Make search input responsive width**

In `src/components/organisms/transaction-filters.tsx`, change line 71:

```tsx
// OLD:
className="h-8 w-[180px] pl-7 text-sm"

// NEW:
className="h-8 w-full sm:w-[180px] pl-7 text-sm"
```

- [ ] **Step 5: Make filter select widths responsive**

In `src/components/organisms/transaction-filters.tsx`:

Line 100 — Account select:
```tsx
// OLD:
<SelectTrigger className="h-8 w-[160px] text-xs">
// NEW:
<SelectTrigger className="h-8 w-full sm:w-[160px] text-xs">
```

Line 110 — Category select:
```tsx
// OLD:
<SelectTrigger className="h-8 w-[160px] text-xs">
// NEW:
<SelectTrigger className="h-8 w-full sm:w-[160px] text-xs">
```

Line 119 — Type select:
```tsx
// OLD:
<SelectTrigger className="h-8 w-[120px] text-xs">
// NEW:
<SelectTrigger className="h-8 w-full sm:w-[120px] text-xs">
```

- [ ] **Step 6: Make date input widths responsive**

In `src/components/organisms/transaction-filters.tsx`:

Line 144 — From date:
```tsx
// OLD:
className="h-8 w-[130px] text-xs"
// NEW:
className="h-8 w-full sm:w-[130px] text-xs"
```

Line 150 — To date:
```tsx
// OLD:
className="h-8 w-[130px] text-xs"
// NEW:
className="h-8 w-full sm:w-[130px] text-xs"
```

- [ ] **Step 7: Type-check and lint**

```bash
pnpm typecheck && pnpm lint
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/components/molecules/account-card.tsx src/components/organisms/transaction-filters.tsx
git commit -m "feat: fix touch targets and responsive filter widths for mobile"
```

---

### Task 9: Manual Verification — All Responsive Changes

- [ ] **Step 1: Start dev server**

```bash
pnpm dev
```

- [ ] **Step 2: Desktop check (1280px+)**

Verify all pages render correctly at desktop width — no visual regressions:
- Dashboard: summary cards 2-column, dashboard grid 2-column
- Accounts: 3-column summary cards, account list with edit button on hover
- Transactions: full 5-column grid with checkbox, all filter inputs horizontal
- Investments: holdings table renders normally
- Budgets: budget tables render normally
- Reports: income/expense table renders normally

- [ ] **Step 3: Mobile check (375px)**

Test each page at 375px viewport width:

**Dashboard:**
- Loading skeleton stacks to 1 column
- Dashboard grid stacks to 1 column
- Summary cards stay 2-column but don't overflow their container

**Accounts:**
- Summary cards (Net Worth/Assets/Debts) stay 3-column with tighter gap
- Account card edit button is visible (not hidden behind hover)

**Transactions:**
- Grid uses 4-column template (no checkbox column)
- Rows are 44px tall (h-11) for touch
- Header row hides the checkbox column
- "Filters" button is at least 44px tall
- Tapping "Filters" shows filter panel stacked vertically
- Filter inputs are full-width

**Investments:**
- Holdings table scrolls horizontally
- Right-edge fade hint is visible

**Budgets:**
- Budget tables scroll if needed

**Reports:**
- Income/expense table scrolls horizontally with fade hint

- [ ] **Step 4: Tablet check (768px)**

Verify the transition point:
- Sidebar switches from drawer (767px) to fixed panel (768px+)
- Transaction grid shows checkbox column at 640px+ (`sm:`)
- Filter inputs switch from full-width to fixed-width at 640px+

---

### Task 10: Final Type-check, Lint, and Commit Verification

- [ ] **Step 1: Run full checks**

```bash
pnpm typecheck && pnpm lint
```

Expected: PASS.

- [ ] **Step 2: Run tests**

```bash
pnpm test
```

Expected: PASS (all changes are CSS-only in PR 2, no logic changes).

- [ ] **Step 3: Verify commit history**

```bash
git log --oneline -10
```

Expected: ~7 commits covering Tasks 1-8.

- [ ] **Step 4: Verify no untracked files**

```bash
git status
```

Expected: clean working tree (or only the plan/spec docs which are gitignored).
