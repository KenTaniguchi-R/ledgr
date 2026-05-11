---
name: ledgr:subscription-audit
description: Audit recurring charges to find subscriptions, estimate total cost, and identify savings opportunities
version: 1.0.0
tools:
  - get_upcoming_bills
---

# Subscription Audit

## When to use

Use when the user asks about subscriptions, recurring charges, or wants to find things to cancel. Trigger phrases: "what subscriptions do I have", "recurring charges", "what am I paying for monthly", "cancel subscriptions".

## Steps

1. **Get all recurring transactions.** Call `get_upcoming_bills` with `limit: 100`.

2. **Filter to expenses only.** Exclude items where `isIncome: true`.

3. **Group by frequency:**
   - Monthly
   - Annual (divide by 12 for monthly equivalent)
   - Weekly (multiply by 4.33 for monthly equivalent)

4. **Calculate total monthly recurring cost.** Sum all monthly-equivalent amounts.

5. **Flag potential issues:**
   - **Duplicates:** Two bills with the same category and similar amounts (within 10%)
   - **Inactive:** Bills with `status: "inactive"` — might be cancelled but worth confirming
   - **Large:** Any single subscription >5% of monthly income (if available from dashboard summary)

6. **Present the summary.** Structure:
   - Total monthly recurring: [amountDisplay]
   - Total annual recurring: [amountDisplay]
   - Breakdown by frequency group
   - Flagged items (duplicates, inactive, large)
   - "Which of these would you like to look into further?"

## Important

- Always use `amountDisplay` fields for presenting money to the user.
- Do not store or cache any financial data beyond this conversation.
- Do not make assumptions about which subscriptions the user should cancel — present the data and let them decide.
