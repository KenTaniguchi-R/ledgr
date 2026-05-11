---
name: ledgr:monthly-review
description: Review monthly spending patterns and compare to previous months using Ledgr financial data
version: 1.0.0
tools:
  - get_dashboard_summary
  - get_spending_report
  - show_financial_dashboard
---

# Monthly Spending Review

## When to use

Use when the user asks to review their spending, see a monthly summary, understand where their money went, or compare spending to previous months. Trigger phrases: "review my spending", "monthly summary", "where did my money go", "spending breakdown".

## Steps

1. **Get the overview first.** Call `get_dashboard_summary` to get net worth, monthly income, expenses, and net.

2. **Get category breakdown.** Call `get_spending_report` with the current month's date range:
   - `dateFrom`: first day of current month (YYYY-MM-01)
   - `dateTo`: today's date (YYYY-MM-DD)

3. **Get previous month for comparison.** Call `get_spending_report` with the previous month's full date range for delta calculation.

4. **Calculate deltas.** For each category present in both months, compute:
   - Absolute change: current - previous (in cents)
   - Percentage change: ((current - previous) / previous) * 100
   - Sort by absolute change descending

5. **Show the visual.** Call `show_financial_dashboard` with `view: "spending-breakdown"` to render the interactive chart.

6. **Present the summary.** Format using `amountDisplay` values (never raw cents). Structure:
   - One-line overview: "You spent [totalDisplay] this month, [up/down X%] from last month"
   - Top 3 categories by spending amount
   - Top 3 categories with largest increase from previous month
   - Top 3 categories with largest decrease

## Important

- Always use `amountDisplay` fields for presenting money to the user, never raw cent values.
- Do not store or cache any financial data beyond this conversation.
- If the user has no transactions for the current month, say so clearly rather than showing empty data.
