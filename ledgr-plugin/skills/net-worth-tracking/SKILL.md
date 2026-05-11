---
name: ledgr:net-worth-tracking
description: Analyze net worth trends, break down by asset type, and highlight largest changes
version: 1.0.0
tools:
  - get_account_summary
  - get_dashboard_summary
  - list_accounts
  - show_financial_dashboard
---

# Net Worth Tracking

## When to use

Use when the user asks about net worth, wealth tracking, asset breakdown, or financial progress over time. Trigger phrases: "net worth", "how much am I worth", "asset breakdown", "financial progress".

## Steps

1. **Get account summary.** Call `get_account_summary` for aggregate totals (assets, liabilities, net worth).

2. **Get dashboard summary.** Call `get_dashboard_summary` for monthly income/expense context.

3. **Get account details.** Call `list_accounts` to break down by account type and institution.

4. **Group accounts by type:**
   - Liquid (checking, savings)
   - Investments (investment, brokerage, retirement)
   - Property (if any)
   - Liabilities (credit card, loan, mortgage)

5. **Calculate composition:**
   - Each group's total and percentage of gross assets or total liabilities
   - Largest single account contribution

6. **Show the visual.** Call `show_financial_dashboard` with `view: "net-worth-trend"`.

7. **Present the summary.** Structure:
   - Net worth: [amountDisplay]
   - Assets: [amountDisplay] | Liabilities: [amountDisplay]
   - Breakdown by type group with percentages
   - Monthly context: "Earning [incomeDisplay], spending [expensesDisplay], saving [netDisplay]/month"
   - Largest accounts by balance

## Important

- Always use `amountDisplay` fields for presenting money to the user.
- Do not store or cache any financial data beyond this conversation.
- Net worth can be negative — handle this gracefully in the narrative.
