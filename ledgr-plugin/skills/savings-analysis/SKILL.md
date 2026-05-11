---
name: ledgr:savings-analysis
description: Calculate savings rate, identify top discretionary spending, and model what-if scenarios
version: 1.0.0
tools:
  - get_income_vs_expense
  - get_spending_report
  - show_financial_dashboard
---

# Savings Analysis

## When to use

Use when the user asks about savings, savings rate, how to save more, or wants spending reduction scenarios. Trigger phrases: "savings rate", "how much am I saving", "how to save more", "what if I cut spending".

## Steps

1. **Get income vs expense history.** Call `get_income_vs_expense` with the last 3 months:
   - `dateFrom`: 3 months ago, first day (YYYY-MM-01)
   - `dateTo`: today (YYYY-MM-DD)

2. **Calculate savings rate for each month:**
   - Savings = income - expenses (both in cents)
   - Rate = savings / income * 100
   - Average across the 3 months

3. **Get current month's spending breakdown.** Call `get_spending_report` for the current month.

4. **Identify top discretionary categories.** Discretionary = categories NOT in these groups: "Housing", "Utilities", "Insurance", "Debt Payments". Sort remaining by total descending.

5. **Model what-if scenarios.** For the top 3 discretionary categories:
   - "If you cut [category] by 20%: save [amountDisplay]/month, [annualDisplay]/year"
   - "If you cut [category] by 50%: save [amountDisplay]/month, [annualDisplay]/year"

6. **Show the visual.** Call `show_financial_dashboard` with `view: "net-worth-trend"` to show the income vs expense trend.

7. **Present the summary.** Structure:
   - Savings rate: [X%] average over 3 months (trending [up/down])
   - Monthly savings: [amountDisplay] average
   - Top 3 discretionary spending categories
   - What-if scenarios
   - Benchmark context: "A common target is saving 20% of income"

## Important

- Always use `amountDisplay` fields for presenting money to the user.
- Do not store or cache any financial data beyond this conversation.
- The discretionary vs non-discretionary classification is approximate. Don't be dogmatic about it.
