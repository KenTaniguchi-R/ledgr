# Reports & Analytics — Competitive Research

Research across 9 major finance apps to inform Ledgr's reports and analytics feature design.

---

## App-by-App Breakdown

### 1. Monarch Money

**Report types:**
- Spending by category, group, or merchant
- Income by category, group, or merchant
- Cash flow (income vs. expenses)
- Net worth over time (assets, liabilities, net worth)
- Sankey diagram ("Household Flows") showing money flow from income to expenses
- Monthly Progress Report (automated)
- Weekly AI Recap
- Investment performance tracking

**Chart types:**
- Donut chart (Breakdown view)
- Horizontal bar chart (Breakdown view)
- Grouped bar chart (Trends view)
- Stacked bar chart (Trends view)
- Sankey diagram (flow visualization)
- Line chart (net worth over time)

**Time controls:**
- Preset relative ranges: "This month," "Last year," "Last 2 quarters," etc.
- Custom date range picker
- Ranges update dynamically when a saved report is loaded

**Filtering & drill-down:**
- Filter by account, category, merchant, tag, amount
- Click chart elements to drill down to underlying transactions
- Saved reports with bookmarked filter combinations

**Comparison features:**
- Month-over-month trends via Trends view
- Year-over-year via date range selection
- Budget progress bars with visual indicators

**Export/sharing:**
- Download report charts as images
- CSV export for transactions and account history

**Dashboard/overview:**
- Fully customizable drag-and-drop widget dashboard
- Widgets: net worth, recent transactions, investment performance, budget progress, recurring bills, cash flow summary
- AI Insights button on dashboard widgets

**Unique/standout features:**
- **Sankey diagram** — fan favorite, rare in the category. Shows income → expense flow visually
- **AI Assistant, AI Insights, Weekly AI Recap** — spending drivers, subscription changes, net worth shifts
- **Saved Reports** — persist filter + chart configurations for quick access
- **Household/multi-user support** with per-person Sankey views

---

### 2. Copilot Money (iOS/Mac/Web)

**Report types:**
- Income vs. spending (net income)
- Spending by category (stacked bar)
- Cash flow analysis (income, spending, net income cards)
- Net worth over time
- Investment performance with benchmark comparison
- Month in Review and Year in Review (shareable slide decks)
- Recurring transaction detection

**Chart types:**
- Stacked bar chart (spending by category over time)
- Line chart (net worth trend)
- Bar chart (income vs. spending comparison)
- Investment performance charts with benchmark overlay

**Time controls:**
- Month-to-date, Year-to-date presets
- Week-over-week, month-over-month comparison
- Custom time frame selection

**Filtering & drill-down:**
- Filter by account, category, date, recurring status, review status, tag, type
- Multiple simultaneous filters
- Drill from category-level to transaction-level details
- Sort by date or amount after filtering

**Comparison features:**
- Current month vs. previous month-to-date comparison on dashboard
- Month-over-month and year-over-year spending breakdowns
- Investment performance benchmarked against market indexes (e.g., S&P 500)

**Export/sharing:**
- CSV export of transactions (filtered or all) on macOS and iPad
- Month/Year in Review slides can be shared socially

**Dashboard/overview:**
- "Net This Month" summary card showing income vs. spend
- Spending card with category breakdown
- Investment dashboard with customizable widgets
- iOS widgets, Apple Watch glances, Siri shortcuts

**Unique/standout features:**
- **Month/Year in Review as shareable visual slides** — social/gamification element
- AI-powered automatic transaction categorization via ML
- Accessible color palettes designed for colorblindness
- **Investment benchmarking** against market indexes

---

### 3. YNAB (You Need A Budget)

**Report types:**
- Spending Breakdown (totals by category as percentage of overall spend)
- Spending Trends (month-by-month bar graph with trendline)
- Income vs. Expense (income and expenses mapped month by month with averages and totals per category)
- Net Worth (assets and debts month by month)
- Age of Money (unique metric: average days between earning and spending)
- Reflect tab (behavioral insights on budgeting and saving)

**Chart types:**
- Pie/circle chart (Spending Breakdown — color-coded segments showing percentage)
- Bar graph with trendline (Spending Trends)
- Stacked bar chart (Income vs. Expense)
- Bar chart with blue/red coloring (Net Worth — assets vs. debts)

**Time controls:**
- Filter by timeframe across all reports
- Monthly granularity for most reports
- Custom date range selection

**Filtering & drill-down:**
- Filter by category groups, timeframe, accounts
- Click pie chart segment to drill into subcategories
- Click subcategory to see all underlying transactions
- Hover on bar chart segments for totals and percentages

**Comparison features:**
- Income vs. Expense report inherently compares the two
- Month-by-month trend visualization with averages
- Budget vs. actual is the core YNAB philosophy (budget column vs. activity column)

**Export/sharing:**
- Export Reflection data from web app
- Export full budget including transactions
- CSV export of plan data

**Dashboard/overview:**
- Budget view is the primary interface (not a traditional dashboard)
- Age of Money metric prominently displayed
- Budget categories show assigned, activity, and available columns

**Unique/standout features:**
- **Age of Money** — unique to YNAB, measures financial buffer (average days between earning and spending)
- Zero-based envelope budgeting philosophy baked into all reporting
- **Reflect tab** for behavioral finance insights
- Strong **drill-down from chart → subcategory → individual transactions**
- Reports are budget-centric rather than account-centric

---

### 4. Lunch Money

**Report types:**
- Spending by category, merchant, or tag
- Income vs. expenses
- Net worth over time (monthly snapshots)
- Custom analytics via Query Tool (build-your-own reports)
- Stats page (summary statistics)
- Trends page (time-series visualizations)

**Chart types:**
- Pie chart (category breakdown)
- Stacked bar graph (spending over time)
- Line graph (net worth by account, each account a separate line)
- Color-coded bar charts (trends)
- Tabular/list view for stats

**Time controls:**
- Filter by date range
- Monthly snapshots for net worth
- Custom period selection in Query Tool

**Filtering & drill-down:**
- Filter by category, merchant, account, tag, notes, payee
- Exclude specific payees or categories
- Save frequently used filter configurations
- Load saved queries in two clicks

**Comparison features:**
- Compare datasets in the Query Tool
- Account-by-account net worth comparison (multiple line graphs)
- Percentage change from previous month vs. allocation percentage toggle

**Export/sharing:**
- Developer-friendly API for custom reporting
- CSV export

**Dashboard/overview:**
- Overview page with budget tracking
- Calendar view with transaction details
- Net worth tracker with monthly balance snapshots

**Unique/standout features:**
- **Query Tool** — SQL-like custom report builder with advanced filtering, saved queries, and multiple visualization options. Unique and very developer-friendly
- **Full API access** for building custom dashboards and reports
- Crypto portfolio tracking in net worth
- Tags as first-class organizational concept alongside categories

---

### 5. Tiller Money

**Report types:**
- Category spending breakdown (any time period)
- Balance history by date
- Budget vs. actual (via spreadsheet formulas)
- Year-to-date spending comparison
- Weekly analysis by category
- Estimated quarterly tax planner
- Net worth tracker
- Debt snowball tracker
- Completely custom — users build any report they want in Google Sheets/Excel

**Chart types:**
- Any chart Google Sheets or Excel supports (bar, line, pie, area, scatter, combo, etc.)
- Users create their own visualizations
- Community templates include pre-built charts

**Time controls:**
- Completely flexible — any time period via spreadsheet formulas
- Daily transaction-level granularity
- Users define their own date ranges and comparison periods

**Filtering & drill-down:**
- Up to 200 custom categories
- Spreadsheet filtering and pivot tables for unlimited drill-down
- Any column can be used as a filter dimension

**Comparison features:**
- Year-to-date vs. prior year (community template)
- Budget vs. actual (built into Foundation Template)
- Any comparison achievable via spreadsheet formulas

**Export/sharing:**
- Native Google Sheets/Excel sharing
- PDF export via Google Sheets print
- Share entire spreadsheet or specific sheets with collaborators
- Full data ownership

**Dashboard/overview:**
- Foundation Template serves as the primary dashboard
- Community Solutions add-on provides additional dashboard templates
- Fully customizable layout

**Unique/standout features:**
- **Full spreadsheet power** — unlimited customization for power users
- **Tiller Money Labs** community library of templates and tools
- Daily automatic data feed into Google Sheets (21,000+ banks)
- Complete data ownership and portability
- Niche community templates (holiday gift planner, quarterly tax planner, debt snowball)

---

### 6. Mint (Historical Reference — Shut Down March 2024)

**Report types:**
- Spending by category
- Income over time
- Net income (income minus expenses)
- Assets and debts
- Net worth over time
- Annual growth projections

**Chart types:**
- Pie chart (spending by category — the iconic Mint visualization)
- Segmented bar graph (budget progress)
- Bar chart (income and spending over time)
- Line chart (net worth trend)

**Time controls:**
- Current month view
- Custom time period selection
- Month-over-month comparison
- Historical trend viewing

**Filtering & drill-down:**
- Filter by category, tag, or merchant
- Click pie chart segment to drill into subcategories (e.g., "Food & Dining" → restaurants, groceries, etc.)

**Comparison features:**
- Month-over-month trends
- Income vs. spending comparison
- Historical trend comparison

**Export/sharing:**
- Excel/CSV data download

**Dashboard/overview:**
- Overview page with account balances, budget progress, and spending summary
- Real-time net worth calculation
- Credit score monitoring
- Bill reminders

**Unique/standout features (historical):**
- Free tier with massive user base — set the standard for personal finance apps
- **Pioneered the category pie chart drill-down pattern** that many apps now copy
- Credit score monitoring integration
- Annual growth projection for net worth

---

### 7. Rocket Money

**Report types:**
- Monthly spending summary
- Top spending categories
- Top merchants
- Income vs. expenses
- Net worth (assets minus debts)
- Subscription/recurring bill tracking
- Bill calendar with payday view

**Chart types:**
- Pie chart (spending by category)
- Bar chart (monthly spend vs. previous months)
- Calendar view (bills and due dates)

**Time controls:**
- Month-over-month comparison (current vs. previous)
- Monthly view for spending insights

**Filtering & drill-down:**
- Automatic transaction categorization
- Category-level spending breakdown
- Limited drill-down compared to competitors

**Comparison features:**
- Current month vs. previous month spending
- Category budget tracking (over/under)

**Export/sharing:**
- Limited export functionality

**Dashboard/overview:**
- Spending insights dashboard with visual charts
- Subscription tracker (auto-detected recurring charges)
- Bill calendar with due date notifications
- **"Safe to spend"** calculation after recurring bills
- **Payday view** showing bills alongside income

**Unique/standout features:**
- **"Safe to spend"** — after recurring bills and subscriptions, shows disposable income remaining
- **Payday view** — calendar aligned to paydays, not calendar months
- Focus on actionable savings rather than deep analytics
- Bill negotiation and subscription cancellation as primary differentiators

---

### 8. Empower Personal Dashboard (formerly Personal Capital)

**Report types:**
- Net worth over time (primary focus)
- Spending by category
- Income vs. expenses (cash flow)
- **Investment Checkup** (asset allocation analysis)
- **Retirement Fee Analyzer** (expense ratio analysis)
- **Retirement Planner** (Monte Carlo simulation)
- Savings Planner
- Education Planner (529 plan analysis)
- Portfolio analysis with Smart Weighting recommendations

**Chart types:**
- Pie chart (asset allocation, spending breakdown)
- Bar graph (income vs. spending by month, budget progress)
- Line chart (net worth progression over time)
- Area chart (investment portfolio growth)
- Monte Carlo probability distribution (retirement planner)

**Time controls:**
- Monthly view for spending
- Historical net worth with full timeline
- Adjustable time frames for spending analysis

**Filtering & drill-down:**
- Filter spending by category
- View by account type
- Investment filtering by asset class

**Comparison features:**
- Current vs. recommended asset allocation (Smart Weighting)
- Actual fees vs. alternative fund fees
- Retirement readiness probability scoring
- Income vs. expenses monthly comparison

**Export/sharing:**
- Limited export for free dashboard
- Data stays within the platform

**Dashboard/overview:**
- Aggregate view of all linked accounts
- Net worth summary card (prominently featured)
- Investment portfolio summary with allocation breakdown
- Cash flow planner
- Retirement readiness score

**Unique/standout features:**
- **Investment Checkup with Smart Weighting** — compares your allocation to an optimized target
- **Retirement Fee Analyzer** — calculates total fee drag across all accounts, shows cost over time
- **Retirement Planner** with 5,000+ Monte Carlo simulations
- **Education Planner** with college cost comparison and 529 projections
- Free investment-grade tools that rival paid advisors
- Best-in-class for investment-heavy users and retirement planning

---

### 9. PocketSmith

**Report types:**
- Income & Expense report (personal P&L statement)
- Net worth report
- Cash flow statement
- Spending pie chart (by category, weekly or monthly)
- Trends page (category and budget patterns over time)
- Digest (series of charts summarizing earning and spending)
- **Forecast graph** (projected balances up to 60 years out)

**Chart types:**
- Pie chart (spending by category)
- Sankey diagram (money flow from income to expense categories, parent to child)
- Line chart (forecast balance projections)
- Bar chart (income vs. expense)
- Calendar visualization (daily projected balances)

**Time controls:**
- Custom date range for all reports
- Daily, weekly, monthly budget periods
- **Forecast up to 60 years into the future**
- Hover on any future date to see projected balance

**Filtering & drill-down:**
- Drill down on Trends page to spot patterns in categories and budgets
- Click pie chart segments to see underlying transactions
- Drill into parent categories to child categories
- Saved searches for repeated filtering

**Comparison features:**
- **What-if scenarios** — toggle multiple scenarios on/off to compare outcomes
- Budget vs. actual via forecast graph
- Percentage change from previous month vs. allocation percentage toggle

**Export/sharing:**
- Download Income & Expense report as spreadsheet/CSV
- Export Cash flow statement as CSV
- Share downloaded reports

**Dashboard/overview:**
- Customizable dashboards — create multiple dashboards for different aspects of life or household members
- Sankey diagram widget on dashboard
- Spending pie chart widget
- Forecast balance widget
- Calendar with scheduled budgets and projected balances

**Unique/standout features:**
- **What-if scenarios** — model multiple financial futures (e.g., work less, change expenses) and toggle on/off. Unique in the market
- **60-year forecast** — longest projection horizon of any personal finance app
- **Calendar-based budgeting** — schedule bills and budgets on a calendar, see daily projected balances
- Sankey diagram on dashboard
- **Multiple dashboards per user** (personal, business, per family member)
- Financial advisor mode with client account setup

---

## Summary Comparison

### Best Report Types by Category

| Report Type | Best Implementation | Notes |
|---|---|---|
| Spending by category | **Monarch** (donut + bar + Sankey) | Multiple visualization options for same data |
| Income vs. expenses | **YNAB** (month-by-month with averages) | Clean stacked bars with trendline |
| Net worth over time | **Empower** (investment-grade) | Full timeline with asset/liability breakdown |
| Cash flow | **Monarch** (Sankey), **PocketSmith** (calendar-based) | Sankey for overview, calendar for daily granularity |
| Category trends | **Monarch** (grouped/stacked bar) | Toggle between grouped and stacked views |
| Investment performance | **Empower** (fee analysis, allocation, Monte Carlo) | Far ahead of all competitors |
| Forecast/projections | **PocketSmith** (60-year, what-if scenarios) | Unmatched — no competitor comes close |
| Custom reports | **Lunch Money** (Query Tool), **Tiller** (spreadsheet) | Developer-friendly vs. spreadsheet power |

### Chart Types Used Across Apps

| Chart Type | Apps Using It | Best For |
|---|---|---|
| Donut/pie chart | Monarch, YNAB, Lunch Money, Mint, Rocket Money, PocketSmith | Spending breakdown by category |
| Stacked bar chart | Monarch, Copilot, YNAB, Lunch Money | Spending trends over time |
| Grouped bar chart | Monarch | Category comparison across periods |
| Line chart | Monarch, Copilot, Empower, Lunch Money, PocketSmith | Net worth over time, forecasts |
| Horizontal bar chart | Monarch | Ranked spending by category/merchant |
| Sankey diagram | Monarch, PocketSmith | Money flow (income → expenses) |
| Area chart | Empower | Investment portfolio growth |
| Calendar view | PocketSmith, Rocket Money | Daily balance projections, bill due dates |
| Monte Carlo distribution | Empower | Retirement probability |

---

## Current Implementation Status (as of 2026-05-10)

### Architecture

- **Page:** `src/app/(dashboard)/reports/page.tsx` — Server Component, reads search params, lazy-loads data per active tab (5 tabs)
- **Queries:** `src/queries/reports.ts` (~300 lines) — report aggregation, split-transaction aware via shared helpers
- **Shared helpers:** `src/lib/spending-helpers.ts` — extracted spending aggregation (used by reports + dashboard)
- **Query helpers:** `src/lib/query-helpers.ts` — `getIncomeCategoryIds()` shared across queries
- **Dashboard queries:** `src/queries/dashboard.ts` — summary, net worth, monthly spending, cash flow (now uses shared helpers)
- **Tabs:** Spending, Income vs Expense, Cash Flow, Trends, Net Worth — managed via `ReportTabs` client component
- **Filter bar:** Date presets + custom range, account multi-select, category multi-select — URL-driven state
- **Saved reports:** Save/load/delete via dropdown menu + dialog, persisted in `saved_reports` table
- **Charts:** Recharts (ComposedChart for mixed bar+line), d3-sankey for Sankey diagram, custom SVG rendering
- **Drill-down:** Chart-to-transaction drill-down on all report tabs via `DrillDownSheet` organism + `getDrillDownTransactions` server action

### Implementation Status by Feature

| # | Feature | Status | Implementation Details |
|---|---------|--------|----------------------|
| 1 | Spending by category | **Done** | Donut + horizontal bar toggle, top-8 with "Other" bucketing, legend with percentages, comparison badges, chart-to-transaction drill-down, filtered totals via ReportSummaryBar |
| 2 | Income vs. expenses | **Done** | ReportSummaryBar (income/expenses/net) + ComposedChart with optional trendline + per-category table (IncomeExpenseCategoryTable) with spark bars, monthly avg, % of total. Category filter bug fixed. Drill-down on chart + table rows |
| 3 | Net worth over time | **Done** | Multi-line (assets/liabilities/net worth) with area fill + gradient, custom tooltip. Supports single-line portfolio mode. ReportSummaryBar with change % |
| 4 | Cash flow | **Done** | Sankey diagram (d3-sankey + React SVG) + ComposedChart bar chart with trendline + Safe to Spend calculation + ReportSummaryBar. Drill-down on Sankey nodes |
| 5 | Sankey diagram | **Done** | d3-sankey layout with gradient links, colored nodes (income=green, expense=red, savings=blue), hover tooltips, click-to-drill-down |
| 6 | Saved reports | **Done** | Save/load/delete with name, stores tab + filters as JSON |
| 7 | AI weekly recap | **Not started** | — |
| 8 | Spending by merchant | **Not started** | — |
| 9 | Category trends | **Done** | Multi-line chart with interactive checkbox selection (up to 10 categories), ReportSummaryBar, drill-down |
| 10 | Month/Year in Review | **Not started** | — |
| 11 | What-if scenarios | **Not started** | — |
| 12 | Forecast/projections | **Not started** | — |
| 13 | Budget vs. actual | **Not started** | Depends on budgets feature (Phase 7) |
| 14 | Age of Money | **Not started** | — |
| 15 | Query Tool | **Not started** | — |

### Cross-Cutting Gaps

| Gap | Priority | Notes |
|-----|----------|-------|
| ~~**Chart-to-transaction drill-down**~~ | ~~**High**~~ | **DONE** — DrillDownSheet on all 5 report tabs |
| ~~**Filtered totals on spending tab**~~ | ~~**High**~~ | **DONE** — ReportSummaryBar on all tabs |
| **CSV/image export** | **Medium** | No export functionality anywhere |
| **Tag filter** | **Medium** | Filter bar has accounts + categories but no tags |
| **Transaction type filter** | **Medium** | No income/expense/transfer toggle in filter bar |
| **Merchant filter** | **Medium** | Recommended in filter bar best practices, not implemented |
| ~~**Empty state for spending chart**~~ | ~~**Low**~~ | **DONE** — SpendingChart now has proper empty state |
| **Color palette limit** | **Low** | 8 colors, wraps with modulo for trends (up to 10 lines) — possible duplicate colors |

### Known Code Issues

1. ~~**`getIncomeVsExpense` ignores `categoryIds` filter**~~ — **FIXED** — categoryIds filter now applied
2. **`getReportNetWorthHistory` doesn't scope `balanceHistory`** — scopes `accounts` table but queries `balanceHistory` without household scoping (relies on filtered account IDs being correct, which works but is inconsistent with the pattern)
3. ~~**`SpendingChart` dual-type input**~~ — **FIXED** — normalized to single `SpendingChartItem[]` type
4. ~~**`deleteReport` TOCTOU vulnerability**~~ — **FIXED** — collapsed to atomic scoped DELETE

### File Inventory

| Layer | File | Purpose |
|-------|------|---------|
| Page | `src/app/(dashboard)/reports/page.tsx` | Server Component, data fetching, filter parsing (5 tabs) |
| Queries | `src/queries/reports.ts` | Spending, income/expense, trends, net worth, Sankey, safe-to-spend |
| Queries | `src/queries/dashboard.ts` | Dashboard summary, net worth, monthly spending, cash flow |
| Queries | `src/queries/saved-reports.ts` | Saved report CRUD |
| Actions | `src/actions/reports.ts` | Save/delete report + getDrillDownTransactions server actions |
| Schema | `src/db/schema/reports.ts` | `saved_reports` table definition |
| Helpers | `src/lib/spending-helpers.ts` | Shared spending aggregation (reports + dashboard) |
| Helpers | `src/lib/query-helpers.ts` | getIncomeCategoryIds shared helper |
| Organism | `src/components/organisms/report-tabs.tsx` | 5-tab container with mobile scroll |
| Organism | `src/components/organisms/report-spending.tsx` | Spending chart + table + drill-down + summary bar |
| Organism | `src/components/organisms/report-income-expense.tsx` | Summary bar + ComposedChart + category table + drill-down |
| Organism | `src/components/organisms/report-cash-flow.tsx` | Sankey + bar chart + safe-to-spend + drill-down |
| Organism | `src/components/organisms/report-trends.tsx` | Trend line chart + checkboxes + summary bar + drill-down |
| Organism | `src/components/organisms/report-net-worth.tsx` | Net worth area chart + summary bar with change % |
| Organism | `src/components/organisms/drill-down-sheet.tsx` | Sheet with async transaction loading via useTransition |
| Organism | `src/components/organisms/saved-report-picker.tsx` | Saved report dropdown + save dialog |
| Molecule | `src/components/molecules/report-filter-bar.tsx` | Date, account, category filters |
| Molecule | `src/components/molecules/sankey-chart.tsx` | d3-sankey layout + React SVG with gradients |
| Molecule | `src/components/molecules/income-expense-category-table.tsx` | Two-section table with spark bars |
| Molecule | `src/components/molecules/transaction-list-panel.tsx` | Read-only date-grouped transaction list |
| Atom | `src/components/atoms/spending-chart.tsx` | Donut/bar spending (normalized SpendingChartItem) |
| Atom | `src/components/atoms/cash-flow-bar-chart.tsx` | ComposedChart with optional trendline |
| Atom | `src/components/atoms/net-worth-area-chart.tsx` | Multi-line area chart (assets/liabilities/net) |
| Atom | `src/components/atoms/trend-line-chart.tsx` | Multi-category line chart |
| Atom | `src/components/atoms/report-summary-bar.tsx` | Dynamic summary bar with color-coded values |
| Atom | `src/components/atoms/chart-view-toggle.tsx` | Donut/bar toggle button |
| Util | `src/lib/chart-colors.ts` | 8-color palette + income/expense/primary colors |
| API | `src/app/api/dashboard/net-worth/route.ts` | GET net worth history |
| API | `src/app/api/dashboard/spending/route.ts` | GET monthly spending by category |
| Test | `tests/integration/reports-actions.test.ts` | Security + CRUD tests for report actions |

---

## Best Patterns for Ledgr

### Must-Have (Core Reports)

1. **Spending by category** (Monarch pattern) — **COMPLETE**
   - ~~Donut chart showing percentage breakdown~~ Done
   - ~~Horizontal bar chart showing ranked categories by amount~~ Done
   - ~~Toggle between Breakdown (single period) and Trends (over time) views~~ Done (separate Trends tab)
   - ~~Click any segment to drill down to transactions~~ Done (DrillDownSheet)
   - ~~Filtered totals~~ Done (ReportSummaryBar)

2. **Income vs. expenses** (YNAB pattern) — **COMPLETE**
   - ~~Stacked bar chart with monthly bars~~ Done (side-by-side bars via ComposedChart)
   - ~~Income bars above zero line, expense bars below (or side-by-side)~~ Done
   - ~~Trendline showing direction~~ Done (optional net trendline via ComposedChart)
   - ~~Averages and totals per category in a companion table~~ Done (IncomeExpenseCategoryTable with spark bars, monthly avg, % of total)
   - ~~Category filter bug~~ Fixed (categoryIds now applied in query)

3. **Net worth over time** — **COMPLETE**
   - ~~Line chart from balance_history~~ Done
   - ~~Assets line, liabilities line, net worth line~~ Done
   - ~~Monthly granularity with daily option~~ Done (daily from balance_history)
   - ~~Summary bar with change %~~ Done (ReportSummaryBar)

4. **Cash flow** (Monarch Sankey + traditional) — **COMPLETE**
   - ~~Traditional: monthly income - expenses bar chart~~ Done (ComposedChart with trendline)
   - ~~Advanced: Sankey diagram showing income sources → expense categories~~ Done (d3-sankey + React SVG)
   - ~~"Safe to spend" calculation (Rocket Money pattern)~~ Done (actual-before-projected with recurring awareness)

### High Value (Differentiators)

5. **Sankey diagram** (Monarch/PocketSmith) — **COMPLETE**
   - ~~Income sources on left → expense categories on right~~ Done
   - ~~Flow width proportional to amount~~ Done (proportional income→expense links with implicit Savings node)
   - ~~Interactive — hover for amounts, click to drill down~~ Done (tooltip + click-to-drill-down)
   - Implementation: `d3-sankey` for layout + custom React SVG rendering with gradient links

6. **Saved reports** (Monarch pattern) — **IMPLEMENTED**
   - ~~Bookmark filter + chart + date range configurations~~ Done
   - ~~Quick-load saved reports from a sidebar/dropdown~~ Done

7. **AI weekly recap** (Monarch pattern) — **NOT STARTED**
   - Automated summary: top spending categories, unusual charges, net worth change, subscription changes
   - Delivered in-app or via notification

8. **Spending trends by merchant** (Monarch pattern) — **NOT STARTED**
   - Top merchants ranked by total spend
   - Month-over-month merchant spending comparison
   - Useful for identifying where money actually goes beyond category level

9. **Category trends over time** (Monarch/YNAB pattern) — **IMPLEMENTED**
   - ~~Grouped or stacked bar chart showing each category's spending per month~~ Done (line chart)
   - Highlight categories trending up or down — **TODO**
   - Average line for historical context — **TODO**

### Nice-to-Have (Polish)

10. **Month/Year in Review** (Copilot pattern) — **NOT STARTED**
    - Auto-generated visual summary of financial highlights
    - Shareable slides showing top categories, biggest merchants, savings rate, net worth change

11. **What-if scenarios** (PocketSmith pattern) — **NOT STARTED**
    - Model hypothetical changes: "what if I cancel this subscription?", "what if I get a raise?"
    - Toggle scenarios on/off to see impact on projected balances
    - Requires forecast infrastructure

12. **Forecast/projections** (PocketSmith pattern) — **NOT STARTED**
    - Project future balances based on recurring income/expenses
    - Calendar view showing daily projected balances
    - Variable-length forecast (3 months, 1 year, 5 years)

13. **Budget vs. actual** (YNAB pattern) — **NOT STARTED**
    - Per-category progress bars: budgeted amount vs. spent
    - Color-coded: green (under), yellow (approaching), red (over)
    - Complements the budgets feature (Phase 7)

14. **Age of Money** (YNAB pattern) — **NOT STARTED**
    - Average days between earning and spending
    - Simple to compute, meaningful behavioral metric
    - Measures financial buffer/runway

15. **Query Tool** (Lunch Money pattern) — **NOT STARTED**
    - Power-user custom report builder
    - Advanced filtering, grouping, and visualization selection
    - Saved queries for repeated analysis
    - Appeals to the self-hosted/developer audience Ledgr targets

### Out of Scope (Investment-Specific)

- Investment Checkup / Smart Weighting (Empower) — requires portfolio analysis engine
- Retirement Planner / Monte Carlo simulation (Empower) — requires financial planning models
- Education Planner / 529 analysis (Empower) — niche
- Fee Analyzer (Empower) — requires fund data

---

## Time Controls Best Practices

Every app offers these preset ranges (implement all):

| Preset | Range |
|--------|-------|
| This month | Current month to date |
| Last month | Previous full month |
| Last 3 months | Rolling 3 months |
| Last 6 months | Rolling 6 months |
| YTD | January 1 to today |
| Last 12 months | Rolling 12 months |
| This year | Current calendar year |
| Last year | Previous calendar year |
| All time | Earliest transaction to today |
| Custom | User-defined date range |

---

## Filter Bar Best Practices

Consistent filter bar across all report pages:

| Filter | Type | Notes |
|--------|------|-------|
| Date range | Preset + custom picker | Always present |
| Account | Multi-select dropdown | Filter to specific accounts |
| Category | Multi-select dropdown with groups | Include/exclude categories |
| Merchant | Search + multi-select | Top merchants + search |
| Tag | Multi-select | Cross-category filtering |
| Transaction type | Toggle | Income / expense / transfer |

Show **filtered totals** (total spent, total income, net) at top of every report.

---

## Recommended Chart Library Notes (Recharts v3)

Recharts v3 (via shadcn Chart) natively supports:
- Bar chart (vertical, horizontal, stacked, grouped)
- Line chart
- Area chart (stacked)
- Pie / donut chart
- Radar chart
- Radial bar chart

**Not natively supported — needs additional library:**
- Sankey diagram → use `d3-sankey` + custom SVG rendering, or `recharts-sankey` wrapper
- Calendar heatmap → custom component or `react-calendar-heatmap`
- Waterfall chart → custom implementation with stacked bars

---

## Key Design Principles Observed

1. **Presets over custom** — one-click preset date ranges are used 90% of the time. Custom range is secondary.
2. **Progressive disclosure** — summary card at top → chart in middle → transaction list at bottom. Drill down = reveal more detail.
3. **Breakdown + Trends toggle** — same data, two perspectives. Breakdown for "where did money go?" Trends for "how is it changing?"
4. **Filter bar consistency** — same filter bar on every report page. Users learn once, apply everywhere.
5. **Filtered totals** — always show aggregate numbers (total, average, count) for the current filter state.
6. **Chart-to-transaction drill-down** — clicking any chart element should reveal the underlying transactions. This is the single most important interactivity pattern.
7. **Mobile-first but desktop-rich** — charts are touch-friendly on mobile, power features (Sankey, query tool, what-if) are desktop experiences.
8. **Export is table-stakes** — CSV export of underlying data is expected. Chart image download is a nice-to-have.
